# Linux runtime notes

Tiddlui runs on Linux via [Tauri](https://tauri.app), which renders through **WebKitGTK** and
plays audio through **GStreamer**. A few platform specifics are worth knowing.

## Runtime dependencies

Installed automatically as dependencies of the `.deb` / AUR package; needed manually only for
AppImage or from-source runs:

| Purpose            | Package (Arch)                | Package (Debian/Ubuntu)              |
| ------------------ | ----------------------------- | ------------------------------------ |
| Web view           | `webkit2gtk-4.1`              | `libwebkit2gtk-4.1-0`                |
| Audio playback     | `gst-plugins-base/good`      | `gstreamer1.0-plugins-base/good`     |
| **M4A/AAC codecs** | `gst-plugins-bad`, `gst-libav` | `gstreamer1.0-plugins-bad`, `gstreamer1.0-libav` |
| Audio conversion   | `ffmpeg`                     | `ffmpeg`                             |
| Token storage      | `gnome-keyring` *or* `kwallet` | `gnome-keyring` *or* `kwalletmanager` |

## ffmpeg

Unlike Windows (where Tiddlui downloads a static build on first run), on Linux **ffmpeg is a
system package**. If it is missing, the app shows an install hint instead of downloading it:

```
sudo pacman -S ffmpeg        # Arch/Manjaro
sudo apt install ffmpeg      # Debian/Ubuntu
```

## Audio playback (WebKitGTK)

WebKitGTK's GStreamer media pipeline can't play downloaded tracks the way the other platforms
do: it rejects Tauri's `asset://` custom scheme outright and errors partway through large
`blob:` URLs ("Internal data stream error"). It *does* play an ordinary HTTP source that honours
range requests. So on Linux the app runs a tiny loopback HTTP server
(`src-tauri/src/audio_server.rs`, bound to `127.0.0.1` on a random port, guarded by a per-run
token) and points the `<audio>` element at it. This is automatic; no user action is needed.
Windows/macOS still play `asset://` directly.

If a downloaded **M4A/AAC** track loads but won't play, you are almost certainly missing
`gst-plugins-bad` / `gstreamer1.0-plugins-bad` (see the table above).

## Wayland

WebKitGTK has a known compositing issue on some Wayland compositors. If the app crashes on
launch with `Error 71 (Protocol error)`, run it with compositing disabled:

```bash
WEBKIT_DISABLE_COMPOSITING_MODE=1 tiddlui
```

The bundled `.desktop` entry ([`packaging/aur/tiddlui.desktop`](../packaging/aur/tiddlui.desktop))
already sets this, so launching from your application menu works out of the box.

## Auth token storage (keyring)

Auth tokens are stored via the freedesktop **Secret Service API** (`keyring` selects the
`SecretService` backend on Linux) — never in plaintext, same guarantee as the Windows build.
A Secret Service provider must be running:

- GNOME / most desktops: `gnome-keyring`
- KDE Plasma: `kwallet` (with the KWallet Secret Service integration enabled)

If no provider is available, login can't persist and you'll be asked to sign in again on each
launch. The non-secret HTTP cache lives under `~/.tiddl-gui/`.
