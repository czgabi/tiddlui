"""Convert tiddl.core API models into plain dicts for the frontend.

Keeps the JSON protocol decoupled from tiddl's pydantic models and centralizes
cover-URL construction and the GUI→tiddl quality mapping.
"""

from __future__ import annotations

from typing import Any, Optional

# GUI quality tiers (spec slider) → tiddl TrackQuality literals.
QUALITY_MAP = {
    "LOW": "LOW",            # 96 kbps m4a
    "NORMAL": "HIGH",        # 320 kbps m4a
    "HIGH": "LOSSLESS",      # 16-bit FLAC
    "MAX": "HI_RES_LOSSLESS",  # up to 24-bit/192kHz
}

# tiddl's lowercase config literal used by track_qualities / templating.
QUALITY_TO_CLI = {"LOW": "low", "NORMAL": "normal", "HIGH": "high", "MAX": "max"}


def cover_url(uid: Optional[str], size: int = 320) -> Optional[str]:
    if not uid:
        return None
    return f"https://resources.tidal.com/images/{uid.replace('-', '/')}/{size}x{size}.jpg"


def _artist_name(item: Any) -> str:
    if getattr(item, "artist", None):
        return item.artist.name
    artists = getattr(item, "artists", None) or []
    return artists[0].name if artists else ""


def track_to_dict(track: Any) -> dict:
    return {
        "kind": "track",
        "id": track.id,
        "title": track.title,
        "version": track.version,
        "duration": track.duration,
        "artist": _artist_name(track),
        "artists": [a.name for a in (track.artists or [])],
        "album": {
            "id": track.album.id,
            "title": track.album.title,
            "cover_url": cover_url(track.album.cover),
        },
        "cover_url": cover_url(track.album.cover),
        "explicit": getattr(track, "explicit", False),
        "audio_quality": track.audioQuality,
        "track_number": track.trackNumber,
        "copyright": getattr(track, "copyright", None),
        "isrc": getattr(track, "isrc", None),
        "bpm": getattr(track, "bpm", None),
        "popularity": getattr(track, "popularity", None),
    }


def album_to_dict(album: Any) -> dict:
    year = album.releaseDate.year if getattr(album, "releaseDate", None) else None
    return {
        "kind": "album",
        "id": album.id,
        "title": album.title,
        "artist": _artist_name(album),
        "duration": album.duration,
        "cover_url": cover_url(album.cover),
        "number_of_tracks": album.numberOfTracks,
        "explicit": getattr(album, "explicit", False),
        "audio_quality": getattr(album, "audioQuality", None),
        "year": year,
    }


def playlist_to_dict(pl: Any) -> dict:
    return {
        "kind": "playlist",
        "id": pl.uuid,
        "title": pl.title,
        "artist": "Playlist",
        "duration": pl.duration,
        "cover_url": cover_url(pl.squareImage or pl.image),
        "number_of_tracks": pl.numberOfTracks,
    }


def artist_to_dict(ar: Any) -> dict:
    return {
        "kind": "artist",
        "id": ar.id,
        "title": ar.name,
        "artist": "Artist",
        "cover_url": cover_url(getattr(ar, "picture", None)),
    }


def search_to_dict(search: Any) -> dict:
    top = None
    if search.topHit is not None:
        top = {
            "type": search.topHit.type.rstrip("S").lower(),
        }
    return {
        "tracks": [track_to_dict(t) for t in search.tracks.items],
        "albums": [album_to_dict(a) for a in search.albums.items],
        "playlists": [playlist_to_dict(p) for p in search.playlists.items],
        "artists": [artist_to_dict(a) for a in search.artists.items],
        "top_hit": top,
    }
