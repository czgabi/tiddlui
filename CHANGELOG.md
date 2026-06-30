# Changelog

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
