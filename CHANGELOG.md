# Changelog

## 1.6.1

### Changed
- New logo and app icon. The wordmark in the header and in Settings is drawn
  from a single monochrome asset tinted with the current text colour, so it
  flips between black and white with the theme instead of shipping two files.
- The spinning disc in the header is gone; the wordmark stands alone.
- README uses the light or dark wordmark to match the reader's GitHub theme,
  and gained release, downloads, build, platform and licence badges.
- Dropdowns open with a short rollout anchored to the trigger edge, with the
  rows trailing slightly behind the panel, and sit closer to their trigger with
  the facing corners squared off so the two read as one surface.
- Dropdowns cast a heavier shadow so they no longer blend into whatever they
  open over.
- Settings and Library open and close on a longer, softer curve instead of
  appearing instantly.

### Fixed
- Dialogs and dropdowns had no open or close animation at all. The stylesheet
  matched an attribute the component library does not set, so every one of
  those rules was dead.
- A dropdown trigger resized the moment a value was picked, a fraction of a
  second before the new label faded in, so a longer label briefly overflowed
  the button. The box now holds the wider of the two labels until the swap
  finishes.

### Internal
- The release workflow stamps the AUR `PKGBUILD` with the tag version and the
  real source checksums and attaches it to the release, so publishing to the
  AUR no longer needs a manual version bump or `updpkgsums`. The `pkgver` in
  the repo had been stuck at 1.5.0 since that release.

## 1.6.0

### Added
- Download progress shows on the taskbar icon.
- `tiddlui://` links open in the running app, and only one copy runs at a time.
- Search your whole library from the Library window, grouped by kind.
- Sort the library by recently added (recently followed for artists), title or
  artist.
- Playlist folders are browsable — Tidal lets you file playlists into folders
  and the flat favourites list hid that entirely.
- An Animations setting, forced off when your system asks for reduced motion.

### Changed
- Albums and playlists start downloading far sooner: the metadata each track
  needs is fetched in parallel rather than one album at a time (1784ms -> 275ms
  on a 25-track playlist).
- Album art is fetched once per album instead of once per track.
- The waveform is sharper (400 points, peak rather than average) and much
  cheaper to compute (137ms -> 17ms), and it draws itself in instead of popping
  into place. A placeholder shows while it is still decoding.
- Play sits at the far left of a track row and Download at the far right, so
  they can't be hit by accident.
- The quality slider tracks the pointer exactly instead of easing behind it.
- The library list keeps a fixed size, and fetches more as you reach the bottom
  rather than making you click.

### Fixed
- Stream URLs were cached permanently. They are signed and short-lived, so
  previewing or downloading a track fetched weeks earlier used a dead link.
- The HTTP cache never expired and was never pruned — 15 MB of responses, the
  oldest three months old, and an edited playlist kept returning its old
  contents. Metadata now expires after six hours and signing out clears it.
- Playlist cover art opened an empty lightbox: Tidal serves playlist images up
  to 1080, not the 1280 used for albums.
- Hovering a library row added a horizontal scrollbar and clipped the row.
- Turning animations off left several things still moving.
- Analysing a downloaded track's waveform decoded the whole file at full rate,
  using roughly 127 MB for a six-minute track and far more for Hi-Res.

## 1.5.0

### Added
- Albums and playlists download several tracks at once (3 by default, set it
  under Settings → Simultaneous downloads).
- The queue and history survive a restart. Downloads interrupted by closing the
  app come back marked as interrupted so they can be retried.
- Retry buttons: re-run a failed download, retry only the tracks that failed
  inside an album, or retry everything failed at once.
- **Linux support** (Arch and Debian/Ubuntu). `npm run tauri build` now produces
  `.deb`, `.AppImage`, and `.rpm` packages; the release workflow builds and
  attaches the Linux packages alongside the Windows installer. An AUR `PKGBUILD`
  is provided under `packaging/aur/`.
- Linux build/runtime/packaging docs under `docs/` (`BUILD.md`, `LINUX.md`,
  `PACKAGING.md`) and a Linux-aware Install section in the README.

### Fixed
- An album whose tracks all failed reported itself as complete. It now reports
  the failure, and a partly-failed album shows how many tracks failed.
- A duplicate-file prompt could be lost when two tracks hit one at the same time.
- On Linux, downloaded tracks now play and seek correctly. WebKitGTK's GStreamer
  pipeline rejects Tauri's `asset://` scheme and errors on large `blob:` URLs, so
  the app streams local files from a tiny loopback HTTP server with range support,
  guarded by a per-run token and an allowlist of the files the app opened
  (Windows/macOS keep playing `asset://` directly, unchanged).
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
