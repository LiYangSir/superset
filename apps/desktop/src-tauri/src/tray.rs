use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

const TRAY_ICON_BYTES: &[u8] = include_bytes!("../icons/tray-icon.png");

fn show_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let open = MenuItem::with_id(app, "open", "Open Superset", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&open, &settings, &quit])?;

    let icon = Image::from_bytes(TRAY_ICON_BYTES)?;

    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .icon_as_template(true)
        .tooltip("Superset")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_window(app),
            "settings" => {
                show_window(app);
                let _ = app.emit("open-settings", ());
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click { .. } = event {
                show_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}
