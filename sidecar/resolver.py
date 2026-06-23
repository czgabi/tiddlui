"""Search + resolve Tidal URLs into downloadable track jobs.

A "job" pairs a Track with the full Album it belongs to (needed for output
templating) and optional playlist context.
"""

from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import urlparse

from ranking import content_tokens, rank
from serialize import (
    album_to_dict,
    cover_url,
    playlist_to_dict,
    search_to_dict,
    track_to_dict,
)

RESOURCE_TYPES = {"track", "video", "album", "playlist", "artist", "mix"}
_PAGE = 100

# Search recall tuning.
SEARCH_LIMIT = 20      # candidates pulled per query (Tidal default is small)
MAX_VARIANTS = 5       # cap concurrent queries per search
MERGE_CAP = 24         # max items kept per category after merge (client ranks + slices)
_CATEGORIES = ("tracks", "albums", "playlists", "artists")


@dataclass
class TrackJob:
    track: Any
    album: Any
    playlist: Optional[Any] = None
    playlist_index: int = 0


def parse_resource(text: str) -> tuple[str, str]:
    """Extract (type, id) from a full Tidal URL or `type/id` shorthand."""
    segments = [s for s in urlparse(text).path.split("/") if s]
    # also handle bare shorthand without scheme (urlparse puts it in path)
    if not segments and "/" in text:
        segments = [s for s in text.split("/") if s]
    rtype = next((s for s in segments if s in RESOURCE_TYPES), None)
    if not rtype:
        raise ValueError(f"unrecognized Tidal resource: {text!r}")
    try:
        rid = segments[segments.index(rtype) + 1]
    except IndexError as exc:
        raise ValueError(f"no id in resource: {text!r}") from exc
    return rtype, rid


def _raw_search(api: Any, query: str) -> Any:
    """One Tidal search call, pulling more candidates than the default page.

    Falls back to the plain wrapper if tiddl's internals shift under us.
    """
    try:
        from requests_cache import DO_NOT_CACHE
        from tiddl.core.api.models.base import Search

        return api.client.fetch(
            Search,
            "search",
            {"countryCode": api.country_code, "query": query, "limit": SEARCH_LIMIT},
            expire_after=DO_NOT_CACHE,
        )
    except Exception:
        return api.get_search(query)


def _query_variants(query: str) -> list[str]:
    """Build query variants to widen recall.

    Tidal's search wants near-exact phrasing and trips over extra/filler words or
    odd token order (e.g. an artist name appended to a title). We always try what
    the user typed, then add leave-one-out variants over the *meaningful* words
    (filler like "the" stripped) so dropping a stray word surfaces the track. The
    merged pool is then ranked by relevance + popularity downstream.
    """
    variants = [query]
    base = content_tokens(query)
    if len(base) >= 3:
        for i in range(len(base)):
            v = " ".join(base[:i] + base[i + 1 :]).strip()
            if v and v not in variants:
                variants.append(v)
    elif len(base) == 2 and " ".join(base) != query.strip().lower():
        # two real words wrapped in filler — also try just those words
        variants.append(" ".join(base))
    return variants[:MAX_VARIANTS]


def _merge_results(dicts: list[dict]) -> dict:
    """Union per-category items across variant results, de-duped by id.

    No truncation here — the whole pool is kept so ranking sees every candidate
    and the best match can't be cut before it's scored.
    """
    out: dict[str, Any] = {c: [] for c in _CATEGORIES}
    seen: dict[str, set] = {c: set() for c in _CATEGORIES}
    for d in dicts:
        for c in _CATEGORIES:
            for item in d.get(c, []):
                key = item.get("id")
                if key in seen[c]:
                    continue
                seen[c].add(key)
                out[c].append(item)
    out["top_hit"] = dicts[0].get("top_hit") if dicts else None
    return out


def do_search(api: Any, query: str) -> dict:
    variants = _query_variants(query)
    if len(variants) == 1:
        merged = search_to_dict(_raw_search(api, query))
    else:
        with ThreadPoolExecutor(max_workers=len(variants)) as pool:
            raw = list(pool.map(lambda v: _raw_search(api, v), variants))
        merged = _merge_results([search_to_dict(r) for r in raw if r is not None])
    # Rank the full pool by relevance + popularity, then keep the top slice.
    for category in _CATEGORIES:
        merged[category] = rank(query, merged.get(category, []))[:MERGE_CAP]
    return merged


def get_stream_url(api: Any, track_id: Any, quality: str = "HIGH") -> dict:
    """Resolve a directly-playable stream URL for in-app preview (no download).

    LOW/HIGH come back as a single unencrypted AAC (audio/mp4) URL the WebView
    can play as-is — ideal for previewing before deciding to download.
    """
    import base64
    import json

    try:
        stream = api.get_track_stream(track_id, quality)
        manifest = json.loads(base64.b64decode(stream.manifest))
        urls = manifest.get("urls") or []
        return {"track_id": track_id, "url": urls[0] if urls else None,
                "mime": manifest.get("mimeType")}
    except Exception as exc:  # noqa: BLE001
        return {"track_id": track_id, "url": None, "error": str(exc)}


def resolve_summary(api: Any, text: str) -> dict:
    """Lightweight metadata for the AlbumCard when a URL/result is selected."""
    rtype, rid = parse_resource(text)
    if rtype == "track":
        track = api.get_track(rid)
        data = track_to_dict(track)
        try:  # enrich with release year from the full album (cached)
            album = api.get_album(track.album.id)
            data["year"] = album.releaseDate.year if album.releaseDate else None
        except Exception:  # noqa: BLE001
            pass
        return data
    if rtype == "album":
        data = album_to_dict(api.get_album(rid))
        try:  # editorial review (optional, not all albums have one)
            rv = api.get_album_review(rid)
            data["review"] = _clean_markup(getattr(rv, "text", None) or getattr(rv, "summary", None))
        except Exception:  # noqa: BLE001
            pass
        return data
    if rtype == "playlist":
        return playlist_to_dict(api.get_playlist(rid))
    if rtype == "artist":
        return _artist_summary(api, rid)
    raise ValueError(f"unsupported resource type: {rtype}")


# ---- artist detail (raw endpoints; tiddl's get_artist model is broken) -------

_WIMP_RE = re.compile(r"\[/?wimpLink[^\]]*\]")


def _raw_get(api: Any, path: str, params: Optional[dict] = None) -> dict:
    """GET a raw Tidal v1 endpoint and return parsed JSON (bypasses pydantic)."""
    import tiddl.core.api.client as _client

    query = {"countryCode": api.country_code}
    if params:
        query.update(params)
    return api.client.session.get(f"{_client.API_URL}/{path}", params=query).json()


def _clean_markup(text: Optional[str]) -> Optional[str]:
    """Strip Tidal's [wimpLink …]…[/wimpLink] markup, keeping the inner words.

    Used for both artist bios and album reviews (same markup format).
    """
    if not text:
        return None
    cleaned = _WIMP_RE.sub("", text).replace("\r\n", "\n").strip()
    return cleaned or None


def _raw_track_to_dict(d: dict) -> dict:
    """Map a raw track JSON (artist toptracks) into our track dict shape."""
    album = d.get("album") or {}
    artists = d.get("artists") or []
    primary = (d.get("artist") or {}).get("name") or (artists[0]["name"] if artists else "")
    return {
        "kind": "track",
        "id": d.get("id"),
        "title": d.get("title"),
        "version": d.get("version"),
        "duration": d.get("duration"),
        "artist": primary,
        "artists": [a.get("name") for a in artists],
        "album": {
            "id": album.get("id"),
            "title": album.get("title"),
            "cover_url": cover_url(album.get("cover")),
        },
        "cover_url": cover_url(album.get("cover")),
        "explicit": d.get("explicit", False),
        "audio_quality": d.get("audioQuality"),
        "track_number": d.get("trackNumber"),
        "copyright": d.get("copyright"),
        "isrc": d.get("isrc"),
        "bpm": d.get("bpm"),
        "popularity": d.get("popularity"),
    }


def _artist_summary(api: Any, rid: str) -> dict:
    info = _raw_get(api, f"artists/{rid}")
    bio = None
    try:
        b = _raw_get(api, f"artists/{rid}/bio")
        bio = _clean_markup(b.get("text") or b.get("summary"))
    except Exception:  # noqa: BLE001
        pass
    top: list[dict] = []
    try:
        tt = _raw_get(api, f"artists/{rid}/toptracks", {"limit": 10})
        top = [_raw_track_to_dict(t) for t in tt.get("items", [])]
    except Exception:  # noqa: BLE001
        pass
    albums: list[dict] = []
    try:
        aa = api.get_artist_albums(rid)
        albums = [album_to_dict(a) for a in (getattr(aa, "items", None) or [])]
    except Exception:  # noqa: BLE001
        pass
    return {
        "kind": "artist",
        "id": info.get("id", rid),
        "title": info.get("name", ""),
        "artist": "Artist",
        "cover_url": cover_url(info.get("picture")),
        "popularity": info.get("popularity"),
        "bio": bio,
        "top_tracks": top,
        "albums": albums,
    }


# ---- favorites / library (raw paginated endpoints return full objects) -------

def _raw_album_to_dict(d: dict) -> dict:
    rd = d.get("releaseDate") or ""
    year = int(rd[:4]) if isinstance(rd, str) and rd[:4].isdigit() else None
    artists = d.get("artists") or []
    primary = (d.get("artist") or {}).get("name") or (artists[0]["name"] if artists else "")
    return {
        "kind": "album",
        "id": d.get("id"),
        "title": d.get("title"),
        "artist": primary,
        "duration": d.get("duration"),
        "cover_url": cover_url(d.get("cover")),
        "number_of_tracks": d.get("numberOfTracks"),
        "explicit": d.get("explicit", False),
        "audio_quality": d.get("audioQuality"),
        "year": year,
    }


def _raw_artist_to_dict(d: dict) -> dict:
    return {
        "kind": "artist",
        "id": d.get("id"),
        "title": d.get("name"),
        "artist": "Artist",
        "cover_url": cover_url(d.get("picture")),
        "popularity": d.get("popularity"),
    }


def _raw_playlist_to_dict(d: dict) -> dict:
    return {
        "kind": "playlist",
        "id": d.get("uuid"),
        "title": d.get("title"),
        "artist": "Playlist",
        "duration": d.get("duration"),
        "cover_url": cover_url(d.get("squareImage") or d.get("image")),
        "number_of_tracks": d.get("numberOfTracks"),
    }


_FAV_MAPPERS = {
    "tracks": _raw_track_to_dict,
    "albums": _raw_album_to_dict,
    "artists": _raw_artist_to_dict,
    "playlists": _raw_playlist_to_dict,
}


def favorites(api: Any, kind: str, offset: int = 0, limit: int = 50) -> dict:
    """One page of the user's Tidal favorites for a given kind."""
    mapper = _FAV_MAPPERS.get(kind)
    if mapper is None:
        return {"kind": kind, "items": [], "total": 0, "offset": offset}
    data = _raw_get(
        api,
        f"users/{api.user_id}/favorites/{kind}",
        {"limit": limit, "offset": offset, "order": "DATE", "orderDirection": "DESC"},
    )
    items = [mapper(e.get("item") or {}) for e in data.get("items", [])]
    return {
        "kind": kind,
        "items": items,
        "total": data.get("totalNumberOfItems", len(items)),
        "offset": offset,
    }


def track_listing(api: Any, text: str, limit: int = 60) -> list[dict]:
    """Serialized track list for an album/playlist/mix (for the metadata panel)."""
    rtype, rid = parse_resource(text)
    tracks: list = []
    if rtype == "album":
        tracks = _album_tracks(api, rid)
    elif rtype == "playlist":
        tracks = _playlist_tracks(api, rid)
    elif rtype == "mix":
        page = api.get_mix_items(rid, limit=_PAGE)
        tracks = [it.item for it in page.items]
    else:
        return []
    return [track_to_dict(t) for t in tracks[:limit]]


def _full_album(api: Any, album_id: Any, cache: dict) -> Any:
    if album_id not in cache:
        cache[album_id] = api.get_album(album_id)
    return cache[album_id]


def _album_tracks(api: Any, album_id: Any) -> list:
    items, offset = [], 0
    while True:
        page = api.get_album_items(album_id, limit=_PAGE, offset=offset)
        items.extend(page.items)
        offset += _PAGE
        if offset >= page.totalNumberOfItems:
            break
    return [it.item for it in items if getattr(it, "type", "track") == "track"]


def _playlist_tracks(api: Any, uuid: str) -> list:
    items, offset = [], 0
    while True:
        page = api.get_playlist_items(uuid, limit=_PAGE, offset=offset)
        items.extend(page.items)
        offset += _PAGE
        if offset >= page.totalNumberOfItems:
            break
    return [it.item for it in items if getattr(it, "type", "track") == "track"]


def expand_jobs(api: Any, text: str) -> list[TrackJob]:
    """Resolve a URL into the concrete list of track download jobs."""
    rtype, rid = parse_resource(text)
    album_cache: dict = {}
    jobs: list[TrackJob] = []

    if rtype == "track":
        track = api.get_track(rid)
        jobs.append(TrackJob(track, _full_album(api, track.album.id, album_cache)))

    elif rtype == "album":
        album = _full_album(api, rid, album_cache)
        for track in _album_tracks(api, rid):
            jobs.append(TrackJob(track, album))

    elif rtype == "playlist":
        playlist = api.get_playlist(rid)
        for idx, track in enumerate(_playlist_tracks(api, rid)):
            album = _full_album(api, track.album.id, album_cache)
            jobs.append(TrackJob(track, album, playlist, idx))

    elif rtype == "mix":
        page = api.get_mix_items(rid, limit=_PAGE)
        for it in page.items:
            track = it.item
            jobs.append(TrackJob(track, _full_album(api, track.album.id, album_cache)))

    elif rtype == "artist":
        albums = api.get_artist_albums(rid, limit=_PAGE)
        for album_stub in albums.items:
            album = _full_album(api, album_stub.id, album_cache)
            for track in _album_tracks(api, album_stub.id):
                jobs.append(TrackJob(track, album))

    else:
        raise ValueError(f"unsupported resource type: {rtype}")

    return jobs
