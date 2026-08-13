# Changelog

## Unreleased

### Added
- Albums and playlists download several tracks at once (3 by default, set it
  under Settings → Simultaneous downloads).
- The queue and history survive a restart. Downloads interrupted by closing the
  app come back marked as interrupted so they can be retried.
- Retry buttons: re-run a failed download, retry only the tracks that failed
  inside an album, or retry everything failed at once.

### Fixed
- An album whose tracks all failed reported itself as complete. It now reports
  the failure, and a partly-failed album shows how many tracks failed.
- A duplicate-file prompt could be lost when two tracks hit one at the same time.

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
