// Linux-only local audio server.
//
// WebKitGTK's GStreamer media pipeline can't play downloaded tracks the way the
// other platforms do: it rejects Tauri's `asset://` custom scheme outright
// (`NotSupportedError`) and errors partway through large `blob:` URLs
// ("Internal data stream error"). It *does*, however, play an ordinary HTTP
// source that honours range requests. So on Linux we serve local files from a
// tiny loopback HTTP server and point the `<audio>` element at it.
//
// Two independent guards keep that from becoming a general file-read service:
//
//   1. a per-run random token in the URL path, so another local process can't
//      just guess the address, and
//   2. an allowlist — only paths the app itself passed to `local_audio_url` are
//      served. Without it the server would hand out any file the user can read,
//      which is far broader than the `asset://` scope it stands in for.
//
// Paths are canonicalized on both sides, so a different spelling of the same
// file (symlink, `..`, percent-encoding) can't slip past the allowlist.

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// Base URL of the running server plus the files approved for playback.
/// `base` is empty when the server isn't running (non-Linux, or start-up
/// failed) — playback then falls back to `asset://` as it did before.
pub struct AudioBase {
    base: String,
    allowed: Arc<Mutex<HashSet<PathBuf>>>,
}

/// Approve `path` for playback and return the URL the `<audio>` element should
/// use. Empty string when the server isn't running or the path isn't a readable
/// file; the caller then falls back to `asset://`.
#[tauri::command]
pub fn local_audio_url(state: tauri::State<'_, AudioBase>, path: String) -> String {
    if state.base.is_empty() {
        return String::new();
    }
    let Ok(canonical) = std::fs::canonicalize(&path) else {
        return String::new();
    };
    if !canonical.is_file() {
        return String::new();
    }
    let encoded = encode_component(&canonical.to_string_lossy());
    if state.allowed.lock().map(|mut s| s.insert(canonical)).is_err() {
        return String::new();
    }
    format!("{}/{}", state.base, encoded)
}

/// Percent-encode a path so it survives as a single URL segment.
fn encode_component(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// Start the server (Linux only) and return the state for Tauri to manage.
pub fn start() -> AudioBase {
    let allowed: Arc<Mutex<HashSet<PathBuf>>> = Arc::new(Mutex::new(HashSet::new()));
    let base = serve(allowed.clone()).unwrap_or_default();
    AudioBase { base, allowed }
}

/// No-op on platforms where `<audio>` plays `asset://` directly.
#[cfg(not(target_os = "linux"))]
fn serve(_allowed: Arc<Mutex<HashSet<PathBuf>>>) -> Option<String> {
    None
}

#[cfg(target_os = "linux")]
use std::fs::File;
#[cfg(target_os = "linux")]
use std::io::{Read, Seek, SeekFrom};
#[cfg(target_os = "linux")]
use tiny_http::{Header, Request, Response, Server, StatusCode};

#[cfg(target_os = "linux")]
fn serve(allowed: Arc<Mutex<HashSet<PathBuf>>>) -> Option<String> {
    let server = Server::http("127.0.0.1:0").ok()?;
    let port = server.server_addr().to_ip()?.port();
    let token = random_token();
    let base = format!("http://127.0.0.1:{port}/{token}");

    let expected = token;
    std::thread::Builder::new()
        .name("tiddlui-audio".into())
        .spawn(move || {
            for request in server.incoming_requests() {
                // Drop tokenless requests before spending a thread on them, then
                // serve the rest concurrently: a range response streams for as
                // long as playback lasts, and a sequential loop would make the
                // next request (a seek) wait for it to finish.
                let Some(path) = requested_path(request.url(), &expected) else {
                    let _ = request.respond(Response::empty(StatusCode(403)));
                    continue;
                };
                let allowed = allowed.clone();
                std::thread::spawn(move || serve_file(request, path, &allowed));
            }
        })
        .ok()?;

    Some(base)
}

/// Pull the decoded file path out of `/<token>/<percent-encoded-path>`.
/// `None` when the token doesn't match.
#[cfg(target_os = "linux")]
fn requested_path(url: &str, token: &str) -> Option<String> {
    let rest = url.strip_prefix('/')?.strip_prefix(token)?;
    let rest = rest.strip_prefix('/').unwrap_or(rest);
    Some(percent_decode(rest.split('?').next().unwrap_or(rest)))
}

#[cfg(target_os = "linux")]
fn serve_file(request: Request, path_str: String, allowed: &Mutex<HashSet<PathBuf>>) {
    let approved = std::fs::canonicalize(&path_str)
        .ok()
        .and_then(|c| allowed.lock().ok().map(|s| s.contains(&c)))
        .unwrap_or(false);
    if !approved {
        let _ = request.respond(Response::empty(StatusCode(404)));
        return;
    }

    let Ok(mut file) = File::open(&path_str) else {
        let _ = request.respond(Response::empty(StatusCode(404)));
        return;
    };
    let total = file.metadata().map(|m| m.len()).unwrap_or(0);
    let ctype = content_type(&path_str);

    let range = request
        .headers()
        .iter()
        .find(|h| h.field.equiv("Range"))
        .and_then(|h| parse_range(h.value.as_str(), total));

    let _ = match range {
        Some((start, end)) => {
            // Stream exactly the requested window straight from disk (bounded by
            // `Read::take`) rather than buffering it — an open-ended request like
            // `Range: bytes=0-` covers the whole track, which can be tens of MB.
            let len = end - start + 1;
            if file.seek(SeekFrom::Start(start)).is_err() {
                let _ = request.respond(Response::empty(StatusCode(500)));
                return;
            }
            let headers = vec![
                header("Content-Type", &ctype),
                header("Accept-Ranges", "bytes"),
                header("Content-Range", &format!("bytes {start}-{end}/{total}")),
            ];
            request.respond(Response::new(
                StatusCode(206),
                headers,
                file.take(len),
                Some(len as usize),
                None,
            ))
        }
        None => request.respond(
            Response::from_file(file)
                .with_header(header("Content-Type", &ctype))
                .with_header(header("Accept-Ranges", "bytes")),
        ),
    };
}

/// Parse a single `bytes=` range against the known total size. Handles the
/// `bytes=-N` suffix form (final N bytes), which players use to read trailing
/// metadata.
#[cfg(target_os = "linux")]
fn parse_range(value: &str, total: u64) -> Option<(u64, u64)> {
    if total == 0 {
        return None;
    }
    let spec = value.trim().strip_prefix("bytes=")?;
    let (a, b) = spec.split_once('-')?;
    let (a, b) = (a.trim(), b.trim());

    if a.is_empty() {
        let n: u64 = b.parse().ok()?;
        if n == 0 {
            return None;
        }
        return Some((total.saturating_sub(n), total - 1));
    }

    let start: u64 = a.parse().ok()?;
    let end: u64 = if b.is_empty() { total - 1 } else { b.parse().ok()? };
    let end = end.min(total - 1);
    if start > end {
        return None;
    }
    Some((start, end))
}

#[cfg(target_os = "linux")]
fn content_type(path: &str) -> String {
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "flac" => "audio/flac",
        "m4a" | "aac" => "audio/mp4",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" | "opus" => "audio/ogg",
        _ => "application/octet-stream",
    }
    .to_string()
}

#[cfg(target_os = "linux")]
fn header(field: &str, value: &str) -> Header {
    Header::from_bytes(field.as_bytes(), value.as_bytes())
        .expect("static header is always valid")
}

/// Decode `%XX` escapes. Works on bytes: slicing the `&str` by byte index would
/// panic if a multi-byte character followed a `%`.
#[cfg(target_os = "linux")]
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hi = (bytes[i + 1] as char).to_digit(16);
            let lo = (bytes[i + 2] as char).to_digit(16);
            if let (Some(hi), Some(lo)) = (hi, lo) {
                out.push((hi * 16 + lo) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(target_os = "linux")]
fn random_token() -> String {
    // 16 bytes from the OS RNG, hex-encoded. Best-effort; falls back to a
    // time-derived value if /dev/urandom is unavailable.
    let mut buf = [0u8; 16];
    if File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut buf))
        .is_err()
    {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        buf.copy_from_slice(&nanos.to_le_bytes());
    }
    buf.iter().map(|b| format!("{b:02x}")).collect()
}
