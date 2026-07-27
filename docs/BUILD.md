# Building Tiddlui from source (Linux)

Tiddlui is a [Tauri 2](https://tauri.app) app: a SvelteKit frontend, a thin Rust shell, and a
Python "engine" sidecar (wrapping [`tiddl`](https://github.com/oskvr37/tiddl)) compiled to a
single-file executable with PyInstaller. This guide covers building on Linux; for Windows see
the root [`README.md`](../README.md).

## 1. Install build dependencies

You need Node 20+, Rust (stable), Python 3.13+, ffmpeg, plus the WebKitGTK/GStreamer stack Tauri
renders and plays audio through.

### Arch / Manjaro

```bash
sudo pacman -S --needed nodejs npm rust python python-pip ffmpeg \
    webkit2gtk-4.1 base-devel \
    gst-plugins-base gst-plugins-good gst-plugins-bad gst-libav
```

### Debian / Ubuntu

```bash
sudo apt update
sudo apt install -y nodejs npm cargo rustc python3 python3-venv python3-pip ffmpeg \
    libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev \
    libgtk-3-dev librsvg2-dev \
    gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad gstreamer1.0-libav
```

> **`gst-plugins-bad` / `gstreamer1.0-plugins-bad` is required** for M4A/AAC playback (Tidal's
> primary format). Without it the in-app player silently fails to play downloaded tracks.

If your distro's Rust is too old for Tauri, install the current toolchain with
[`rustup`](https://rustup.rs) instead.

## 2. Build the engine sidecar

A virtualenv is recommended (and required on distros with PEP 668 externally-managed Python,
such as Arch and recent Debian/Ubuntu):

```bash
cd sidecar
python -m venv .venv
.venv/bin/pip install -r requirements.txt pyinstaller
bash build.sh
cd ..
```

`build.sh` produces `src-tauri/binaries/tiddl-engine-<target-triple>` (e.g.
`tiddl-engine-x86_64-unknown-linux-gnu`), which Tauri picks up as an `externalBin` sidecar.

Quick sanity check:

```bash
printf '{"cmd":"ping"}\n' | ./src-tauri/binaries/tiddl-engine-x86_64-unknown-linux-gnu
# → {"type": "ready"} ... {"type": "pong"}
```

## 3. Build / run the app

```bash
npm install
npm run tauri dev            # hot-reloading dev build
# or a release build with installers:
npm run tauri build
```

`npm run tauri build` emits Linux packages under
`src-tauri/target/release/bundle/`:

- `deb/tiddlui_<version>_amd64.deb`
- `appimage/tiddlui_<version>_amd64.AppImage`
- `rpm/tiddlui-<version>-1.x86_64.rpm`

See [`LINUX.md`](LINUX.md) for runtime notes (Wayland, keyring, codecs) and
[`PACKAGING.md`](PACKAGING.md) for AUR / release details.
