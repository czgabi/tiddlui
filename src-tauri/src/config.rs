// Settings persistence.
//
// The frontend owns the settings *shape*; Rust just stores the blob as JSON in
// the app config directory. Using plain app commands (not the fs plugin) keeps
// the capability surface minimal — app commands are not gated by the ACL.

use std::fs;

use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};

const SETTINGS_FILE: &str = "settings.json";

fn settings_path<R: Runtime>(app: &AppHandle<R>) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("no config dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("create config dir: {e}"))?;
    Ok(dir.join(SETTINGS_FILE))
}

/// Load persisted settings, or `null` if none saved yet.
#[tauri::command]
pub fn load_settings<R: Runtime>(app: AppHandle<R>) -> Result<Value, String> {
    let path = settings_path(&app)?;
    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).map_err(|e| format!("parse settings: {e}")),
        Err(_) => Ok(Value::Null),
    }
}

/// Persist the settings blob, pretty-printed for easy inspection.
#[tauri::command]
pub fn save_settings<R: Runtime>(app: AppHandle<R>, settings: Value) -> Result<(), String> {
    let path = settings_path(&app)?;
    let text = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&path, text).map_err(|e| format!("write settings: {e}"))
}
