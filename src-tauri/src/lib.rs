// Tiddl GUI — Tauri entry point.
//
// Responsibilities are split across modules:
//   - sidecar.rs       spawns the Python engine and bridges its line-delimited
//                      JSON protocol to/from the frontend.
//
// Desktop plugins (dialog / notification / fs / opener / process) are driven
// directly from the frontend through their JS counterparts; here we only need
// to register them. Window geometry is persisted by the window-state plugin.

mod config;
mod sidecar;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            app.manage(sidecar::EngineState::default());
            // Spawn the bundled engine sidecar and start bridging its output.
            // Tolerant of a missing binary during early scaffolding.
            if let Err(err) = sidecar::start(app.handle()) {
                eprintln!("[tiddl] engine sidecar not started: {err}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            sidecar::engine_send,
            config::load_settings,
            config::save_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
