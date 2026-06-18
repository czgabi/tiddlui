"""First-run ffmpeg provisioning.

tiddl converts/extracts audio by shelling out to ``ffmpeg``/``ffprobe`` on PATH.
To keep the app self-contained without bundling a ~80MB binary, we fetch a
static build into the app data dir on first launch and prepend it to PATH for
the process (and any subprocess tiddl spawns).
"""

from __future__ import annotations

import io
import os
import platform
import shutil
import zipfile
from pathlib import Path

import requests

from protocol import emit, log

APP_DIR = Path.home() / ".tiddl-gui"
BIN_DIR = APP_DIR / "bin"

# Windows static "essentials" build (ships ffmpeg.exe + ffprobe.exe).
WINDOWS_FFMPEG_URL = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"


def _exe(name: str) -> str:
    return f"{name}.exe" if os.name == "nt" else name


def _on_path(name: str) -> bool:
    return shutil.which(name) is not None


def _local(name: str) -> Path:
    return BIN_DIR / _exe(name)


def _prepend_path(directory: Path) -> None:
    current = os.environ.get("PATH", "")
    entry = str(directory)
    if entry not in current.split(os.pathsep):
        os.environ["PATH"] = entry + os.pathsep + current


def ensure_ffmpeg() -> bool:
    """Make ffmpeg + ffprobe available on PATH. Returns True if ready."""
    BIN_DIR.mkdir(parents=True, exist_ok=True)
    _prepend_path(BIN_DIR)

    if _on_path("ffmpeg") and _on_path("ffprobe"):
        emit("ffmpeg_status", state="ready")
        return True

    if platform.system() != "Windows":
        emit(
            "ffmpeg_status",
            state="missing",
            message="ffmpeg not found; install it and restart.",
        )
        return False

    try:
        _download_windows_build()
    except Exception as exc:  # noqa: BLE001 — surface any failure to the UI
        log(f"ffmpeg download failed: {exc}", level="error")
        emit("ffmpeg_status", state="missing", message=str(exc))
        return False

    ok = _on_path("ffmpeg") and _on_path("ffprobe")
    emit("ffmpeg_status", state="ready" if ok else "missing")
    return ok


def _download_windows_build() -> None:
    emit("ffmpeg_status", state="downloading", progress=0.0)

    resp = requests.get(WINDOWS_FFMPEG_URL, stream=True, timeout=60)
    resp.raise_for_status()

    total = int(resp.headers.get("Content-Length", 0))
    buf = io.BytesIO()
    got = 0
    for chunk in resp.iter_content(chunk_size=1024 * 256):
        buf.write(chunk)
        got += len(chunk)
        if total:
            emit("ffmpeg_status", state="downloading", progress=round(got / total, 3))

    emit("ffmpeg_status", state="extracting")
    buf.seek(0)
    with zipfile.ZipFile(buf) as zf:
        for member in zf.namelist():
            base = os.path.basename(member)
            if base in (_exe("ffmpeg"), _exe("ffprobe")):
                with zf.open(member) as src, open(BIN_DIR / base, "wb") as dst:
                    shutil.copyfileobj(src, dst)
