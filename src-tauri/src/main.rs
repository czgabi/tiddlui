// Prevents additional console window on Windows in release, DO NOT REMOVE!!
// Scoped to Windows: the `windows` subsystem is a Windows-only concept, so the
// attribute is guarded to keep the intent explicit on Linux/macOS builds.
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

fn main() {
    tiddl_gui_lib::run()
}
