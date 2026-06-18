"""Tiddl GUI engine — stdio command loop.

Reads JSON commands on stdin, drives tiddl.core, emits JSON events on stdout.
A single download worker processes one queue item (group) at a time; each group
may expand to many tracks. Progress is reported at the group level so it maps
directly onto the GUI queue.
"""

from __future__ import annotations

import asyncio
import threading
from typing import Any

import downloader
import ffmpeg
from protocol import emit, log, read_commands
from resolver import do_search, expand_jobs, resolve_summary, track_listing
from serialize import cover_url
from session import ApiError, Session


class Engine:
    def __init__(self) -> None:
        self.session = Session()
        self.loop = asyncio.get_running_loop()
        self.commands: asyncio.Queue[dict] = asyncio.Queue()
        self.jobs: asyncio.Queue[dict] = asyncio.Queue()
        self.cancelled: set[str] = set()
        self.ffmpeg_ready = threading.Event()

    # ---- lifecycle -------------------------------------------------------
    async def run(self) -> None:
        threading.Thread(target=self._ensure_ffmpeg, daemon=True).start()
        threading.Thread(target=self._stdin_reader, daemon=True).start()
        worker = asyncio.create_task(self._download_worker())

        emit("ready")
        self.session.emit_status()

        while True:
            cmd = await self.commands.get()
            if cmd is None:  # EOF sentinel
                break
            await self._dispatch(cmd)

        worker.cancel()

    def _ensure_ffmpeg(self) -> None:
        try:
            ffmpeg.ensure_ffmpeg()
        finally:
            self.ffmpeg_ready.set()

    def _stdin_reader(self) -> None:
        for cmd in read_commands():
            asyncio.run_coroutine_threadsafe(self.commands.put(cmd), self.loop)
        asyncio.run_coroutine_threadsafe(self.commands.put(None), self.loop)

    # ---- command dispatch ------------------------------------------------
    async def _dispatch(self, cmd: dict) -> None:
        name = cmd.get("cmd")
        try:
            if name == "ping":
                emit("pong")
            elif name == "auth_status":
                self.session.emit_status()
            elif name == "login":
                threading.Thread(target=self.session.login, daemon=True).start()
            elif name == "logout":
                self.session.logout()
            elif name == "search":
                await self._search(cmd)
            elif name == "resolve":
                await self._resolve(cmd)
            elif name == "tracklist":
                await self._tracklist(cmd)
            elif name == "enqueue":
                await self._enqueue(cmd)
            elif name == "cancel":
                self.cancelled.add(cmd.get("job_id", ""))
            else:
                log(f"unknown command: {name}", level="warning")
        except ApiError as exc:
            emit("error", request_id=cmd.get("request_id"),
                 message=getattr(exc, "user_message", str(exc)))
        except Exception as exc:  # noqa: BLE001
            emit("error", request_id=cmd.get("request_id"), message=str(exc))

    async def _search(self, cmd: dict) -> None:
        results = await asyncio.to_thread(do_search, self.session.api(), cmd["query"])
        emit("search_results", request_id=cmd.get("request_id"), **results)

    async def _resolve(self, cmd: dict) -> None:
        summary = await asyncio.to_thread(resolve_summary, self.session.api(), cmd["url"])
        emit("resolved", request_id=cmd.get("request_id"), resource=summary)

    async def _tracklist(self, cmd: dict) -> None:
        tracks = await asyncio.to_thread(track_listing, self.session.api(), cmd["url"])
        emit("tracklist", request_id=cmd.get("request_id"), url=cmd["url"], tracks=tracks)

    async def _enqueue(self, cmd: dict) -> None:
        job_id = cmd["job_id"]
        # Lightweight summary so the queue can render immediately.
        try:
            summary = await asyncio.to_thread(
                resolve_summary, self.session.api(), cmd["url"]
            )
        except Exception:  # noqa: BLE001
            summary = {"title": cmd["url"], "artist": ""}
        emit("job_update", job_id=job_id, status="queued", resource=summary)
        await self.jobs.put(cmd)

    # ---- download worker -------------------------------------------------
    async def _download_worker(self) -> None:
        while True:
            cmd = await self.jobs.get()
            try:
                await self._process_group(cmd)
            except ApiError as exc:
                emit("job_update", job_id=cmd.get("job_id"), status="error",
                     message=getattr(exc, "user_message", str(exc)))
            except Exception as exc:  # noqa: BLE001
                emit("job_update", job_id=cmd.get("job_id"), status="error",
                     message=str(exc))

    async def _process_group(self, cmd: dict) -> None:
        job_id = cmd["job_id"]
        if job_id in self.cancelled:
            emit("job_update", job_id=job_id, status="cancelled")
            return

        self.ffmpeg_ready.wait()
        api = self.session.api()

        emit("job_update", job_id=job_id, status="resolving")
        tracks = await asyncio.to_thread(expand_jobs, api, cmd["url"])
        total = len(tracks)
        if total == 0:
            emit("job_update", job_id=job_id, status="error", message="nothing to download")
            return

        paths: list[str] = []
        for index, tj in enumerate(tracks):
            if job_id in self.cancelled:
                emit("job_update", job_id=job_id, status="cancelled")
                return

            def relay(event_type: str, **f: Any) -> None:
                if event_type != "job_update":
                    return
                status = f.get("status")
                if status in ("downloading", "processing"):
                    track_progress = f.get("progress", 0.0)
                    emit("job_update", job_id=job_id, status="downloading",
                         progress=round((index + track_progress) / total, 4),
                         completed=index, total=total,
                         current_title=tj.track.title,
                         current_artist=tj.track.artist.name if tj.track.artist else "",
                         cover_url=cover_url(tj.track.album.cover),
                         speed_bps=f.get("speed_bps", 0),
                         quality_label=f.get("quality_label"))
                elif status == "complete" and f.get("path"):
                    paths.append(f["path"])
                elif status == "error":
                    log(f"track failed: {tj.track.title}: {f.get('message')}", "error")

            await downloader.download_job(
                api, tj, cmd["quality"], cmd["output_path"], cmd["template"],
                job_id, relay, lambda: job_id in self.cancelled,
            )

        # Keep the original resource summary; just attach the final file path so
        # the queue row can reveal it. (path = last file for albums/playlists.)
        emit("job_update", job_id=job_id, status="complete", progress=1.0,
             completed=total, total=total,
             path=paths[-1] if paths else cmd.get("output_path"))


async def _amain() -> None:
    engine = Engine()
    await engine.run()


if __name__ == "__main__":
    try:
        asyncio.run(_amain())
    except KeyboardInterrupt:
        pass
