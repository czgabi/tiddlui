# Tiddl GUI

A modern, glassmorphic desktop app for downloading your Tidal library, built on
the open-source [`tiddl`](https://github.com/oskvr37/tiddl) downloader. Search
or paste a link, pick a quality, and download — with a live waveform player,
collapsible queue/history, keyboard shortcuts, desktop notifications, and
several color themes.

> **For personal use only.** This tool downloads from your own paid Tidal
> account. You are responsible for complying with Tidal's Terms of Service and
> your local copyright laws. Not affiliated with Tidal.

## Features

- **Unified search / link bar** — type to search Tidal; paste a track/album/
  playlist/artist/mix link to load it instantly.
- **Quality** — `LOW` (96 kbps) · `NORMAL` (320 kbps) · `HIGH` (16-bit FLAC) ·
  `MAX` (up to 24-bit Hi-Res).
- **Metadata panel** — cover art, rich track details, album/playlist track
  listings, and an integrated player with a **seekable waveform**.
- **Queue & history** — live progress, cancel, re-download, reveal-in-folder.
- **Output templates** — e.g. `{album.artist}/{album.title}/{item.title}`, with
  a live preview.
- **Color themes** — Aurora, Slate, Ultradark, Aero (frutiger-glass), Paper,
  Citrus.
- **Keyboard shortcuts** — `Ctrl/⌘+K` focus search, `Enter` download,
  `Ctrl/⌘+,` settings, `Ctrl/⌘+H` toggle queue, `Ctrl/⌘+Q` quit.
- Drag-and-drop a Tidal link onto the window; drag a folder to set the output.

## Architecture

```
SvelteKit (Svelte 5 + Tailwind v4 + shadcn-svelte)   ← UI
        │  Tauri commands / events
Rust (Tauri 2)                                        ← window, IPC bridge, config
        │  line-delimited JSON over stdio
Python engine (PyInstaller sidecar, wraps tiddl.core) ← auth, search, downloads
```

The download engine is a small Python program (`sidecar/`) that wraps
`tiddl.core` and speaks a line-delimited JSON protocol over stdio. Rust spawns
it as a bundled Tauri *sidecar* and relays its events to the UI.

## Prerequisites

- **Node.js** 20+ and npm
- **Rust** (stable) via [rustup](https://rustup.rs) + the platform build tools
  (on Windows: Visual Studio C++ build tools + WebView2, both standard)
- **Python ≥ 3.13** (tiddl requires it) — only needed to *build* the sidecar
- **ffmpeg** on `PATH` (used to finalize FLAC/M4A). On Windows: `winget install
  Gyan.FFmpeg`. If missing, the app downloads a static build into
  `~/.tiddl-gui/bin` on first run.

## Build & run

```bash
# 1. Frontend deps
npm install

# 2. Build the engine sidecar (Python 3.13 environment)
cd sidecar
pip install -r requirements.txt
./build.ps1          # → src-tauri/binaries/tiddl-engine-<target-triple>.exe
cd ..

# 3. Run in dev
npm run tauri dev

# …or build a release bundle
npm run tauri build
```

The sidecar binary is a build artifact (git-ignored); run `sidecar/build.ps1`
after cloning or whenever you change the engine.

## Usage

1. Launch the app and **sign in** with the Tidal device flow (a code + link).
2. Search or paste a link, choose a quality and output folder, hit **Download**.
3. Finished tracks land in your template path and load into the waveform player.

Settings (output folder, template, theme, notifications) persist to the app
config directory; auth lives in `~/.tiddl-gui/auth.json`.

## Security notes

- Auth tokens are stored unencrypted in `~/.tiddl-gui/auth.json` (same as the
  `tiddl` CLI). Treat that file as a secret.
- The webview can read local media only within a scoped set of directories
  (home/music/downloads/etc.) via Tauri's asset protocol, and talks to the
  engine exclusively over stdio — no arbitrary command execution from the UI.
- A Content-Security-Policy restricts network/asset origins to Tidal's image
  CDN, the local asset protocol, and the app itself.

## Credits & licenses

- This project: **MIT** (see [LICENSE](./LICENSE)).
- [`tiddl`](https://github.com/oskvr37/tiddl) — Apache-2.0, bundled in the engine.
- [Tauri](https://tauri.app), [SvelteKit](https://svelte.dev),
  [shadcn-svelte](https://shadcn-svelte.com), [Tailwind CSS](https://tailwindcss.com),
  [Lucide](https://lucide.dev) icons, [ffmpeg](https://ffmpeg.org).
