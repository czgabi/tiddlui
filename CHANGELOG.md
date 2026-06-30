# Changelog

## 1.4.0

### New
- Three themes: **Aero** (Frutiger Aero liquid glass over the classic XP
  wallpaper), **Cream** (warm minimal), and **Artsy** (warm-dark with film
  grain). Switch in Settings → Theme.
- The download queue now shows each file's real quality (e.g. 24-bit / 96.0 kHz
  FLAC) and live transfer speed.

### Fixed
- The "download finished" notification now comes from Tiddlui and names the
  track, instead of showing up as "Windows PowerShell".

### Under the hood
- App version comes from a single source and is stamped automatically at release
  time, so the About box always matches the release.
- Dead code removed across the engine and styles; release builds now cancel
  superseded runs.
