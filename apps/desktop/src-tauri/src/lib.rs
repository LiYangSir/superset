mod commands;
mod db;

use std::sync::Mutex;
use tauri::Emitter;

pub struct AppState {
    pub db: Mutex<db::Database>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let database = db::Database::open_default()
        .expect("Failed to open database");
    database.run_migrations()
        .expect("Failed to run database migrations");

    let state = AppState {
        db: Mutex::new(database),
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
        .invoke_handler(tauri::generate_handler![
            commands::trpc_call,
            commands::trpc_subscribe,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
