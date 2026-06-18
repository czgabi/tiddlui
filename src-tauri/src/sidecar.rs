// Bridge to the bundled Python engine (`tiddl-engine`).
//
// Protocol: line-delimited JSON, both directions.
//   frontend  --engine_send-->  Rust  --stdin line-->   engine
//   engine    --stdout line-->  Rust  --"engine" event--> frontend
//
// The bridge is intentionally generic: every stdout line is parsed as JSON and
// forwarded verbatim on the "engine" Tauri event. The frontend dispatches on
// the payload's `type` field. This keeps the Rust layer stable regardless of
// how the protocol's message set evolves.

use std::sync::Mutex;

use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Holds the running engine's stdin handle so commands can be written to it.
#[derive(Default)]
pub struct EngineState {
    child: Mutex<Option<CommandChild>>,
}

/// Spawn the engine sidecar and start pumping its output to the frontend.
/// Assumes `EngineState` is already managed by the app.
pub fn start<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let sidecar = app
        .shell()
        .sidecar("tiddl-engine")
        .map_err(|e| format!("sidecar lookup failed: {e}"))?;

    let (mut rx, child) = sidecar
        .spawn()
        .map_err(|e| format!("sidecar spawn failed: {e}"))?;

    {
        let state = app.state::<EngineState>();
        *state.child.lock().map_err(|e| e.to_string())? = Some(child);
    }

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        // Reassemble line-delimited JSON across stdout chunks.
        let mut buffer = String::new();
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    buffer.push_str(&String::from_utf8_lossy(&bytes));
                    drain_lines(&app_handle, &mut buffer);
                }
                CommandEvent::Stderr(bytes) => {
                    let text = String::from_utf8_lossy(&bytes).to_string();
                    let _ = app_handle.emit("engine-log", text);
                }
                CommandEvent::Error(err) => {
                    let _ = app_handle.emit("engine-log", format!("[error] {err}"));
                }
                CommandEvent::Terminated(payload) => {
                    let _ = app_handle.emit("engine-exit", payload.code);
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

/// Emit every complete line currently buffered; keep any trailing partial line.
fn drain_lines<R: Runtime>(app: &AppHandle<R>, buffer: &mut String) {
    while let Some(idx) = buffer.find('\n') {
        let line: String = buffer.drain(..=idx).collect();
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        match serde_json::from_str::<Value>(line) {
            Ok(value) => {
                let _ = app.emit("engine", value);
            }
            Err(_) => {
                // Non-JSON output (stray prints) routed to the log channel.
                let _ = app.emit("engine-log", line.to_string());
            }
        }
    }
}

/// Send a command object to the engine as a single JSON line on its stdin.
#[tauri::command]
pub fn engine_send(state: State<'_, EngineState>, payload: Value) -> Result<(), String> {
    let mut line = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    line.push('\n');

    let mut guard = state.child.lock().map_err(|e| e.to_string())?;
    let child = guard
        .as_mut()
        .ok_or_else(|| "engine is not running".to_string())?;

    child
        .write(line.as_bytes())
        .map_err(|e| format!("failed to write to engine: {e}"))
}
