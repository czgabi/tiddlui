// Tiddl GUI — Tauri entry point.
//
// Responsibilities are split across modules:
//   - sidecar.rs       spawns the Python engine and bridges its line-delimited
//                      JSON protocol to/from the frontend.
//
// Desktop plugins (dialog / notification / fs / opener / process) are driven
// directly from the frontend through their JS counterparts; here we only need
// to register them. Window geometry is persisted by the window-state plugin.

mod audio_server;
mod config;
mod sidecar;

use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        // Must be registered before anything else: a second launch hands its
        // arguments to the running instance and exits. Without it two copies
        // would each spawn an engine and write the same settings/queue files.
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_focus();
                    let _ = window.unminimize();
                }
                // Forward any tiddlui:// URL the second launch carried.
                if let Some(url) = argv.iter().find(|a| a.starts_with("tiddlui://")) {
                    let _ = app.emit("deep-link", url.clone());
                }
            }))
            .plugin(tauri_plugin_deep_link::init())
            .plugin(tauri_plugin_window_state::Builder::default().build());
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
            // The installer registers the tiddlui:// scheme on a real install;
            // a dev build has to claim it itself to be testable. Debug only, so
            // running from source never touches a shipped registration.
            #[cfg(all(desktop, debug_assertions))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Err(err) = app.deep_link().register_all() {
                    eprintln!("[tiddl] deep link scheme not registered: {err}");
                }
            }
            // Linux: local HTTP audio server for downloaded-track playback.
            // Inert on other platforms (they use asset:// directly).
            app.manage(audio_server::start());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            sidecar::engine_send,
            config::load_settings,
            config::save_settings,
            config::load_queue,
            config::save_queue,
            audio_server::local_audio_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
