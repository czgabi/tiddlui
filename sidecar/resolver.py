"""Search + resolve Tidal URLs into downloadable track jobs.

A "job" pairs a Track with the full Album it belongs to (needed for output
templating) and optional playlist context.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import urlparse

from serialize import (
    album_to_dict,
    cover_url,
    playlist_to_dict,
    search_to_dict,
    track_to_dict,
)

RESOURCE_TYPES = {"track", "video", "album", "playlist", "artist", "mix"}
_PAGE = 100


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


def do_search(api: Any, query: str) -> dict:
    return search_to_dict(api.get_search(query))


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
        return album_to_dict(api.get_album(rid))
    if rtype == "playlist":
        return playlist_to_dict(api.get_playlist(rid))
    if rtype == "artist":
        artist = api.get_artist(rid)
        return {
            "kind": "artist",
            "id": artist.id,
            "title": artist.name,
            "artist": "Artist",
            "cover_url": cover_url(getattr(artist, "picture", None)),
        }
    raise ValueError(f"unsupported resource type: {rtype}")


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
