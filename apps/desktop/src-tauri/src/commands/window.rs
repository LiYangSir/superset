pub fn minimize(window: &tauri::WebviewWindow) -> Result<serde_json::Value, String> {
    window.minimize().map_err(|e| e.to_string())?;
    Ok(serde_json::Value::Null)
}

pub fn maximize(window: &tauri::WebviewWindow) -> Result<serde_json::Value, String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())?;
    } else {
        window.maximize().map_err(|e| e.to_string())?;
    }
    Ok(serde_json::Value::Null)
}

pub fn close(window: &tauri::WebviewWindow) -> Result<serde_json::Value, String> {
    window.close().map_err(|e| e.to_string())?;
    Ok(serde_json::Value::Null)
}

pub fn is_maximized(window: &tauri::WebviewWindow) -> Result<serde_json::Value, String> {
    let maximized = window.is_maximized().unwrap_or(false);
    Ok(serde_json::Value::Bool(maximized))
}

pub fn get_platform() -> Result<serde_json::Value, String> {
    let platform = match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        other => other,
    };
    Ok(serde_json::Value::String(platform.to_string()))
}

pub fn get_home_dir() -> Result<serde_json::Value, String> {
    let home = dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    Ok(serde_json::Value::String(home))
}

/// Stub: requires Tauri dialog plugin (async). Will be implemented later.
pub fn select_directory() -> Result<serde_json::Value, String> {
    Ok(serde_json::Value::Null)
}

/// Stub: requires Tauri dialog plugin (async). Will be implemented later.
pub fn select_image_file() -> Result<serde_json::Value, String> {
    Ok(serde_json::Value::Null)
}
