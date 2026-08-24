#!/usr/bin/env bash
# Builds the Python engine into a single-file executable and places it where
# Tauri's `externalBin` expects it (binaries/tiddl-engine-<target-triple>).
#
# Linux/macOS counterpart of build.ps1. Requires Python >= 3.13 with
# sidecar/requirements.txt installed (a .venv in this directory is used
# automatically if present — recommended on distros with PEP 668 /
# externally-managed Python, e.g. Arch and modern Debian):
#
#   python -m venv .venv
#   .venv/bin/pip install -r requirements.txt pyinstaller
#
# Usage (from the sidecar/ directory):
#   bash build.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Resolve the Rust host target triple (Tauri sidecars are suffixed with it).
TRIPLE="$(rustc -Vv | awk '/^host:/ {print $2}')"
if [[ -z "$TRIPLE" ]]; then
    echo "ERROR: could not determine Rust host target triple (is rustc installed?)" >&2
    exit 1
fi

echo "Building tiddl-engine for $TRIPLE ..."

# Prefer the local virtualenv's Python; fall back to whatever `python` is on PATH.
PYTHON="$SCRIPT_DIR/.venv/bin/python"
[[ -x "$PYTHON" ]] || PYTHON="python"

"$PYTHON" -m PyInstaller --onefile --noconfirm --clean --name tiddl-engine \
    --collect-submodules tiddl.core \
    --copy-metadata tiddl \
    --collect-all keyring \
    --hidden-import=aiohttp --hidden-import=yarl --hidden-import=multidict \
    --hidden-import=keyring.backends.SecretService \
    --hidden-import=keyring.backends.fail \
    --distpath ./dist --workpath ./build_pyi --specpath . \
    engine.py

DEST="../src-tauri/binaries"
mkdir -p "$DEST"
cp -f ./dist/tiddl-engine "$DEST/tiddl-engine-$TRIPLE"
chmod +x "$DEST/tiddl-engine-$TRIPLE"

echo "Done -> $DEST/tiddl-engine-$TRIPLE"
