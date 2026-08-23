# Changelog

## Unreleased

### Added
- **Linux support** (Arch and Debian/Ubuntu). `npm run tauri build` now produces
  `.deb`, `.AppImage`, and `.rpm` packages; the release workflow builds and
  attaches the Linux packages alongside the Windows installer. An AUR `PKGBUILD`
  is provided under `packaging/aur/`.
- Linux build/runtime/packaging docs under `docs/` (`BUILD.md`, `LINUX.md`,
  `PACKAGING.md`) and a Linux-aware Install section in the README.

### Fixed
- On Linux, downloaded tracks now play and seek correctly. WebKitGTK's GStreamer
  pipeline rejects Tauri's `asset://` scheme and errors on large `blob:` URLs, so
  the app streams local files from a tiny token-guarded loopback HTTP server with
  range support (Windows/macOS keep playing `asset://` directly, unchanged).
- On Linux, glass panels (Library, dialogs, banners) no longer render as
  near-transparent — the compositing that `backdrop-filter` needs is disabled by
  the Wayland stability workaround, so those surfaces fall back to opaque fills.
- The engine shows a package-manager install hint when ffmpeg is missing on
  Linux instead of a bare "missing" message.

### Internal
- `sidecar/build.sh` builds the engine sidecar on Linux/macOS (counterpart of
  `build.ps1`), using the keyring SecretService backend.
- Linux audio server in `src-tauri/src/audio_server.rs` (loopback, range support).
- `windows_subsystem` is now scoped to Windows targets in `main.rs`.

## 1.4.0

### Added
- Three themes (Settings → Theme): Aero (a liquid-glass look over the Windows XP
  wallpaper), Cream, and Artsy.
- The download queue shows each track's actual quality (e.g. 24-bit / 96 kHz
  FLAC) and current download speed.

### Fixed
- The download-complete notification was attributed to "Windows PowerShell". It
  now comes from Tiddlui and names the finished track.

### Internal
- The app version is read from package.json and stamped automatically at release
  time instead of being hardcoded in three places.
- Removed unused code in the engine and stylesheet. CI cancels superseded
  release builds.
