"""Async single-track download with progress, ffmpeg extraction and tagging.

Mirrors tiddl's CLI Downloader but reports progress through the JSON protocol
instead of Rich, and reuses tiddl.core primitives for everything else.
"""

from __future__ import annotations

import asyncio
import shutil
import time
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, Awaitable, Callable, Optional

import aiohttp
import requests

from tiddl.core.metadata.track import add_track_metadata
from tiddl.core.utils.ffmpeg import extract_flac
from tiddl.core.utils.format import format_template
from tiddl.core.utils.parse import parse_track_stream

from serialize import QUALITY_MAP, cover_url

CHUNK = 1024 * 256
LOSSLESS = {"LOSSLESS", "HI_RES_LOSSLESS"}
EXTS = (".flac", ".m4a")
DuplicateResolver = Callable[[str], Awaitable[str]]  # name -> cancel|replace|version


def quality_label(stream: Any) -> str:
    q = stream.audioQuality
    if q == "LOW":
        return "96 kbps"
    if q == "HIGH":
        return "320 kbps"
    if q in LOSSLESS:
        depth = stream.bitDepth or 16
        rate = (stream.sampleRate or 44100) / 1000
        return f"{depth}-bit / {rate:.1f} kHz FLAC"
    return q


def _existing(base: Path) -> Optional[Path]:
    """Return an already-downloaded file for this base name, if any."""
    for ext in EXTS:
        p = base.parent / f"{base.name}{ext}"
        if p.exists():
            return p
    return None


def _cleanup(base: Path, tmp_name: str) -> None:
    """Remove any partial/temp artifacts for this download."""
    candidates = [Path(tmp_name), base.parent / f"{base.name}.audio",
                  base.parent / f"{base.name}.tmp.flac"]
    for p in candidates:
        try:
            p.unlink(missing_ok=True)
        except OSError:
            pass


async def download_job(
    api: Any,
    job: Any,
    gui_quality: str,
    out_dir: str,
    template: str,
    job_id: str,
    emit: Callable[..., None],
    is_cancelled: Callable[[], bool],
    on_duplicate: Optional[DuplicateResolver] = None,
) -> None:
    track = job.track
    track_quality = QUALITY_MAP.get(gui_quality, "LOSSLESS")

    if not track.allowStreaming:
        emit("job_update", job_id=job_id, status="error",
             message=f"{track.title} is not streamable")
        return

    # 1. Stream descriptor + segment URLs (sync API → thread).
    stream = await asyncio.to_thread(api.get_track_stream, track.id, track_quality)
    urls, _ = await asyncio.to_thread(parse_track_stream, stream)
    should_extract = stream.audioQuality in LOSSLESS and stream.audioMode == "STEREO"
    label = quality_label(stream)

    # 2. Output path from template (extension appended later).
    rel = format_template(
        template, item=track, album=job.album, playlist=job.playlist,
        playlist_index=job.playlist_index, quality=gui_quality, with_asterisk_ext=False,
    )
    base = Path(out_dir) / rel
    base.parent.mkdir(parents=True, exist_ok=True)

    # 3. Duplicate handling — ask the UI what to do if the file already exists.
    existing = _existing(base)
    if existing is not None:
        action = await on_duplicate(existing.name) if on_duplicate else "cancel"
        if action == "cancel":
            # Treat the existing file as the result (already downloaded).
            emit("job_update", job_id=job_id, status="complete",
                 quality_label=label, path=str(existing))
            return
        if action == "replace":
            for ext in EXTS:
                (base.parent / f"{base.name}{ext}").unlink(missing_ok=True)
        elif action == "version":
            n = 1
            while _existing(base.parent / f"{base.name} ({n})"):
                n += 1
            base = base.parent / f"{base.name} ({n})"

    emit("job_update", job_id=job_id, status="downloading", progress=0.0,
         quality_label=label, speed_bps=0)

    # 4. Stream segments to a temp file.
    total_segments = max(len(urls), 1)
    started = time.monotonic()
    downloaded = 0
    last_emit = 0.0
    cancelled = False

    tmp = NamedTemporaryFile("wb", delete=False, dir=base.parent)
    try:
        async with aiohttp.ClientSession(trust_env=True) as session:
            for seg_index, url in enumerate(urls):
                if is_cancelled():
                    cancelled = True
                    break
                async with session.get(url) as resp:
                    seg_total = int(resp.headers.get("Content-Length", 0))
                    seg_done = 0
                    async for chunk in resp.content.iter_chunked(CHUNK):
                        tmp.write(chunk)
                        downloaded += len(chunk)
                        seg_done += len(chunk)
                        now = time.monotonic()
                        if now - last_emit >= 0.1:
                            frac = (seg_done / seg_total) if seg_total else 0.0
                            progress = (seg_index + frac) / total_segments
                            speed = downloaded / max(now - started, 1e-6)
                            emit("job_update", job_id=job_id, status="downloading",
                                 progress=round(min(progress, 0.999), 4),
                                 speed_bps=int(speed), downloaded=downloaded,
                                 quality_label=label)
                            last_emit = now
    finally:
        tmp.close()

    # Cancelled mid-download: clean up silently.
    if cancelled or is_cancelled():
        _cleanup(base, tmp.name)
        emit("job_update", job_id=job_id, status="cancelled")
        return

    # 5. Finalize container / extension, tag metadata. Clean up on any failure.
    emit("job_update", job_id=job_id, status="processing", progress=0.999,
         quality_label=label)
    try:
        if should_extract:
            work = base.parent / f"{base.name}.audio"
            shutil.move(tmp.name, work)
            final = await asyncio.to_thread(extract_flac, work)
        else:
            final = base.parent / f"{base.name}.m4a"
            shutil.move(tmp.name, final)

        cover_data = await asyncio.to_thread(_fetch_cover, track.album.cover)
        date = job.album.releaseDate.isoformat() if getattr(job.album, "releaseDate", None) else ""
        album_artist = job.album.artist.name if job.album.artist else ""
        await asyncio.to_thread(
            add_track_metadata, final, track, date, album_artist, "", cover_data
        )
    except Exception as exc:  # noqa: BLE001 — report + clean partial files
        _cleanup(base, tmp.name)
        emit("job_update", job_id=job_id, status="error", message=str(exc))
        return

    emit("job_update", job_id=job_id, status="complete", progress=1.0,
         quality_label=label, path=str(final))


def _fetch_cover(uid: Any) -> bytes | None:
    url = cover_url(uid, size=1280)
    if not url:
        return None
    try:
        resp = requests.get(url, timeout=30)
        return resp.content if resp.status_code == 200 else None
    except requests.RequestException:
        return None
