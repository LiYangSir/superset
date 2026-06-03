pub(crate) mod commands;
mod db;
mod tray;

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Emitter;

pub struct AppState {
    pub db: Mutex<db::Database>,
    pub(crate) terminals: Mutex<HashMap<String, commands::terminal::TerminalSession>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let database = db::Database::open_default()
        .expect("Failed to open database");
    database.run_migrations()
        .expect("Failed to run database migrations");

    let state = AppState {
        db: Mutex::new(database),
        terminals: Mutex::new(HashMap::new()),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(url) = args.get(1) {
                if url.starts_with("superset://") {
                    let path = url.strip_prefix("superset://").unwrap_or("");
                    let _ = app.emit("deep-link-navigate", path);
                }
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .setup(|app| {
            tray::setup_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::trpc_call,
            commands::trpc_subscribe,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
