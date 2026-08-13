// Settings and queue persistence.
//
// The frontend owns the *shape* of both; Rust just stores each as a JSON blob
// in the app config directory. Using plain app commands (not the fs plugin)
// keeps the capability surface minimal — app commands are not gated by the ACL.

use std::fs;

use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};

const SETTINGS_FILE: &str = "settings.json";
const QUEUE_FILE: &str = "queue.json";

fn config_file<R: Runtime>(app: &AppHandle<R>, name: &str) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("no config dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("create config dir: {e}"))?;
    Ok(dir.join(name))
}

/// Read a stored blob, or `null` when nothing has been written yet.
fn read_json<R: Runtime>(app: &AppHandle<R>, name: &str) -> Result<Value, String> {
    let path = config_file(app, name)?;
    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).map_err(|e| format!("parse {name}: {e}")),
        Err(_) => Ok(Value::Null),
    }
}

/// Write a blob, pretty-printed for easy inspection.
fn write_json<R: Runtime>(app: &AppHandle<R>, name: &str, value: &Value) -> Result<(), String> {
    let path = config_file(app, name)?;
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    fs::write(&path, text).map_err(|e| format!("write {name}: {e}"))
}

#[tauri::command]
pub fn load_settings<R: Runtime>(app: AppHandle<R>) -> Result<Value, String> {
    read_json(&app, SETTINGS_FILE)
}

#[tauri::command]
pub fn save_settings<R: Runtime>(app: AppHandle<R>, settings: Value) -> Result<(), String> {
    write_json(&app, SETTINGS_FILE, &settings)
}

/// The download queue and history, so they survive a restart.
#[tauri::command]
pub fn load_queue<R: Runtime>(app: AppHandle<R>) -> Result<Value, String> {
    read_json(&app, QUEUE_FILE)
}

#[tauri::command]
pub fn save_queue<R: Runtime>(app: AppHandle<R>, queue: Value) -> Result<(), String> {
    write_json(&app, QUEUE_FILE, &queue)
}
