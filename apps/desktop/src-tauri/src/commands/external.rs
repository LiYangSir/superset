use serde::Deserialize;
use std::process::Command;

#[derive(Deserialize)]
pub struct UrlInput {
    pub url: String,
}

pub fn open_url(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let params: UrlInput = serde_json::from_value(input).map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    Command::new("open")
        .arg(&params.url)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    Command::new("xdg-open")
        .arg(&params.url)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    Command::new("cmd")
        .args(["/c", "start", &params.url])
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(serde_json::Value::Null)
}

#[derive(Deserialize)]
pub struct PathInput {
    pub path: String,
}

pub fn open_in_finder(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let params: PathInput = serde_json::from_value(input).map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    Command::new("open")
        .arg("-R")
        .arg(&params.path)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    Command::new("xdg-open")
        .arg(
            std::path::Path::new(&params.path)
                .parent()
                .unwrap_or(std::path::Path::new("/")),
        )
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(serde_json::Value::Null)
}

pub fn open_in_app(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let params: PathInput = serde_json::from_value(input).map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    Command::new("open")
        .arg(&params.path)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(serde_json::Value::Null)
}

/// Stub: clipboard is handled via Tauri plugin. Will be implemented later.
pub fn copy_path(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let _params: PathInput = serde_json::from_value(input).map_err(|e| e.to_string())?;
    Ok(serde_json::Value::Null)
}

/// Stub: opens file in default editor. Will be implemented later.
pub fn open_file_in_editor(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let _params: PathInput = serde_json::from_value(input).map_err(|e| e.to_string())?;
    Ok(serde_json::Value::Null)
}
