// Linux-only local audio server.
//
// WebKitGTK's GStreamer media pipeline can't play downloaded tracks the way the
// other platforms do: it rejects Tauri's `asset://` custom scheme outright
// (`NotSupportedError`) and errors partway through large `blob:` URLs
// ("Internal data stream error"). It *does*, however, play an ordinary HTTP
// source that honours range requests. So on Linux we serve local files from a
// tiny loopback HTTP server and point the `<audio>` element at it.
//
// The server binds to 127.0.0.1 on an ephemeral port and guards every request
// with a per-run random token, so only this app (which knows the token) can
// read files through it. It only serves existing regular files, GET only.

/// Base URL of the running server, e.g. `http://127.0.0.1:53421/<token>`.
/// Empty when the server is not running (non-Linux, or start-up failed —
/// playback then simply fails, as it did before this existed).
pub struct AudioBase(pub String);

/// Return the base URL so the frontend can build `<base>/<url-encoded-path>`.
#[tauri::command]
pub fn local_audio_base(state: tauri::State<'_, AudioBase>) -> String {
    state.0.clone()
}

/// No-op on platforms where `<audio>` plays `asset://` directly.
#[cfg(not(target_os = "linux"))]
pub fn start() -> Option<String> {
    None
}

#[cfg(target_os = "linux")]
use std::fs::File;
#[cfg(target_os = "linux")]
use std::io::{Read, Seek, SeekFrom};
#[cfg(target_os = "linux")]
use std::path::Path;
#[cfg(target_os = "linux")]
use tiny_http::{Header, Response, Server, StatusCode};

/// Start the server on a background thread. Returns its base URL (or `None`).
#[cfg(target_os = "linux")]
pub fn start() -> Option<String> {
    let server = Server::http("127.0.0.1:0").ok()?;
    let port = server.server_addr().to_ip()?.port();
    let token = random_token();
    let base = format!("http://127.0.0.1:{port}/{token}");

    let expected = token;
    std::thread::Builder::new()
        .name("tiddlui-audio".into())
        .spawn(move || {
            for request in server.incoming_requests() {
                handle(request, &expected);
            }
        })
        .ok()?;

    Some(base)
}

#[cfg(target_os = "linux")]
fn handle(request: tiny_http::Request, token: &str) {
    // URL shape: /<token>/<percent-encoded-absolute-path>
    let url = request.url().to_string();
    let rest = match url.strip_prefix('/').and_then(|u| u.strip_prefix(token)) {
        Some(r) => r.strip_prefix('/').unwrap_or(r),
        None => {
            let _ = request.respond(Response::empty(StatusCode(403)));
            return;
        }
    };
    let path_str = percent_decode(rest.split('?').next().unwrap_or(rest));
    let path = Path::new(&path_str);
    if !path.is_file() {
        let _ = request.respond(Response::empty(StatusCode(404)));
        return;
    }

    let mut file = match File::open(path) {
        Ok(f) => f,
        Err(_) => {
            let _ = request.respond(Response::empty(StatusCode(404)));
            return;
        }
    };
    let total = file.metadata().map(|m| m.len()).unwrap_or(0);
    let ctype = content_type(&path_str);

    let range = request
        .headers()
        .iter()
        .find(|h| h.field.equiv("Range"))
        .and_then(|h| parse_range(h.value.as_str(), total));

    let result = match range {
        Some((start, end)) => {
            // Stream exactly the requested window straight from disk (bounded by
            // `Read::take`) rather than buffering it — an open-ended request like
            // `Range: bytes=0-` covers the whole track, which could be tens of MB.
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
            let resp = Response::new(
                StatusCode(206),
                headers,
                file.take(len),
                Some(len as usize),
                None,
            );
            request.respond(resp)
        }
        None => {
            let resp = Response::from_file(file)
                .with_header(header("Content-Type", &ctype))
                .with_header(header("Accept-Ranges", "bytes"));
            request.respond(resp)
        }
    };
    let _ = result;
}

/// Parse a single `bytes=start-end` range against the known total size.
#[cfg(target_os = "linux")]
fn parse_range(value: &str, total: u64) -> Option<(u64, u64)> {
    if total == 0 {
        return None;
    }
    let spec = value.trim().strip_prefix("bytes=")?;
    let (a, b) = spec.split_once('-')?;
    let start: u64 = if a.is_empty() { 0 } else { a.trim().parse().ok()? };
    let end: u64 = if b.trim().is_empty() {
        total - 1
    } else {
        b.trim().parse().ok()?
    };
    let end = end.min(total - 1);
    if start > end {
        return None;
    }
    Some((start, end))
}

#[cfg(target_os = "linux")]
fn content_type(path: &str) -> String {
    let ext = Path::new(path)
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

#[cfg(target_os = "linux")]
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(byte);
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
        buf[..16].copy_from_slice(&nanos.to_le_bytes());
    }
    buf.iter().map(|b| format!("{b:02x}")).collect()
}
