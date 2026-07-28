<div align="center">
  <img src="assets/logo.svg" alt="Tiddlui" width="260" />
</div>

Desktop app to download from Tidal. Search or paste a link, pick a quality and download!
Runs on **Windows** and **Linux**.

## Install

### Windows

Download `Tiddlui_x.y.z_x64-setup.exe` from [Releases](../../releases), run it, sign in to Tidal.
(ffmpeg is fetched automatically if you don't already have it.)

### Arch Linux (AUR)

Once the package is on the AUR:

```bash
yay -S tiddlui        # or: paru -S tiddlui
```

> **Not on the AUR yet.** The `PKGBUILD` lives in [`packaging/aur/`](packaging/aur/); it has to
> be published to the AUR by the maintainer (or a co-maintainer) after a release is tagged — see
> [`docs/PACKAGING.md`](docs/PACKAGING.md). Until then, [build from source](#build-from-source).

### Debian / Ubuntu

Download the `.deb` from [Releases](../../releases) and install it:

```bash
sudo apt install ./Tiddlui_x.y.z_amd64.deb
sudo apt install ffmpeg          # required, not bundled on Linux
```

A distro-agnostic `.AppImage` is also attached to each release.

> On Linux, ffmpeg is a system package (install it with your package manager) and
> auth tokens are stored via the Secret Service API — see [`docs/LINUX.md`](docs/LINUX.md)
> for runtime notes (Wayland, keyring, audio codecs).

## Features

- Search Tidal, or paste track / album / playlist / artist links
- Quality: Low · Normal · High (FLAC) · Max (Hi-Res)
- Song player with waveform visualization
- Queue + history, album "Download all", duplicate prevention
- Output templates, optional per-track subfolders
- Downloadable cover-arts and artist profile pictures
- 9 themes, keyboard shortcuts, drag & drop etc.

## Build from source

Needs Node 20+, Rust, Python 3.13+ and ffmpeg.

**Windows:**

```bash
npm install
cd sidecar && pip install -r requirements.txt pyinstaller && ./build.ps1 && cd ..
npm run tauri dev          # or: npm run tauri build
```

**Linux:** see [`docs/BUILD.md`](docs/BUILD.md) for the full walkthrough (Arch & Debian
dependency lists). In short:

```bash
npm install
cd sidecar && python -m venv .venv && .venv/bin/pip install -r requirements.txt pyinstaller && bash build.sh && cd ..
npm run tauri dev          # or: npm run tauri build
```

The engine (`sidecar/`) is a Python program wrapping [`tiddl`](https://github.com/oskvr37/tiddl),
run as a Tauri sidecar. Auth tokens are kept in the OS keychain (Windows Credential Manager /
Linux Secret Service), never in plaintext. Packaging details live in
[`docs/PACKAGING.md`](docs/PACKAGING.md).

## Notes

For personal use with your own Tidal account. Built on `tiddl` (Apache-2.0). MIT licensed.
