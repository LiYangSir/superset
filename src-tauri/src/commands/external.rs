use crate::db::Database;
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

#[derive(Deserialize)]
struct OpenInAppInput {
    path: String,
    app: String,
    #[serde(rename = "projectId")]
    project_id: Option<String>,
}

#[cfg(target_os = "macos")]
fn macos_app_name(app: &str) -> Option<&'static str> {
    match app {
        "vscode" => Some("Visual Studio Code"),
        "vscode-insiders" => Some("Visual Studio Code - Insiders"),
        "cursor" => Some("Cursor"),
        "antigravity" => Some("Antigravity"),
        "windsurf" => Some("Windsurf"),
        "zed" => Some("Zed"),
        "xcode" => Some("Xcode"),
        "iterm" => Some("iTerm"),
        "warp" => Some("Warp"),
        "terminal" => Some("Terminal"),
        "ghostty" => Some("Ghostty"),
        "sublime" => Some("Sublime Text"),
        "webstorm" => Some("WebStorm"),
        "phpstorm" => Some("PhpStorm"),
        "rubymine" => Some("RubyMine"),
        "goland" => Some("GoLand"),
        "clion" => Some("CLion"),
        "rider" => Some("Rider"),
        "datagrip" => Some("DataGrip"),
        "appcode" => Some("AppCode"),
        "fleet" => Some("Fleet"),
        "rustrover" => Some("RustRover"),
        _ => None,
    }
}

#[cfg(target_os = "macos")]
fn macos_bundle_id_candidates(app: &str) -> Option<&'static [&'static str]> {
    match app {
        "intellij" => Some(&["com.jetbrains.intellij", "com.jetbrains.intellij.ce"]),
        "pycharm" => Some(&["com.jetbrains.pycharm", "com.jetbrains.pycharm.ce"]),
        _ => None,
    }
}

#[cfg(target_os = "linux")]
fn linux_cli_command(app: &str) -> Option<&'static str> {
    match app {
        "vscode" => Some("code"),
        "vscode-insiders" => Some("code-insiders"),
        "cursor" => Some("cursor"),
        "antigravity" => Some("antigravity"),
        "windsurf" => Some("windsurf"),
        "zed" => Some("zed"),
        "warp" => Some("warp-terminal"),
        "ghostty" => Some("ghostty"),
        "sublime" => Some("subl"),
        "webstorm" => Some("webstorm"),
        "phpstorm" => Some("phpstorm"),
        "rubymine" => Some("rubymine"),
        "goland" => Some("goland"),
        "clion" => Some("clion"),
        "rider" => Some("rider"),
        "datagrip" => Some("datagrip"),
        "fleet" => Some("fleet"),
        "rustrover" => Some("rustrover"),
        _ => None,
    }
}

#[cfg(target_os = "linux")]
fn linux_cli_candidates(app: &str) -> Option<&'static [&'static str]> {
    match app {
        "intellij" => Some(&["idea", "intellij-idea-ultimate", "intellij-idea-community"]),
        "pycharm" => Some(&["pycharm", "pycharm-professional", "pycharm-community"]),
        _ => None,
    }
}

const NON_EDITOR_APPS: &[&str] = &["finder", "iterm", "warp", "terminal", "ghostty"];

fn persist_default_app(db: &Database, app: &str, project_id: Option<&str>) {
    if let Some(pid) = project_id {
        let _ = db.conn.execute(
            "UPDATE projects SET default_app = ?1 WHERE id = ?2",
            rusqlite::params![app, pid],
        );
    }
    if !NON_EDITOR_APPS.contains(&app) {
        let _ = db.conn.execute(
            "INSERT INTO settings (id, default_editor) VALUES (1, ?1)
             ON CONFLICT(id) DO UPDATE SET default_editor = ?1
             WHERE default_editor IS NULL",
            rusqlite::params![app],
        );
    }
}

pub fn open_in_app(db: &Database, input: serde_json::Value) -> Result<serde_json::Value, String> {
    let params: OpenInAppInput = serde_json::from_value(input).map_err(|e| e.to_string())?;

    if params.app == "finder" {
        let result = open_in_finder(serde_json::json!({ "path": params.path }));
        if result.is_ok() {
            persist_default_app(db, &params.app, params.project_id.as_deref());
        }
        return result;
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(candidates) = macos_bundle_id_candidates(&params.app) {
            let mut last_err = String::new();
            for bundle_id in candidates {
                match Command::new("open")
                    .args(["-b", bundle_id, &params.path])
                    .output()
                {
                    Ok(output) if output.status.success() => {
                        persist_default_app(db, &params.app, params.project_id.as_deref());
                        return Ok(serde_json::Value::Null);
                    }
                    Ok(output) => {
                        last_err = String::from_utf8_lossy(&output.stderr).to_string();
                    }
                    Err(e) => {
                        last_err = e.to_string();
                    }
                }
            }
            return Err(format!("Failed to open {}: {}", params.app, last_err));
        }

        if let Some(app_name) = macos_app_name(&params.app) {
            Command::new("open")
                .args(["-a", app_name, &params.path])
                .spawn()
                .map_err(|e| format!("Failed to open {}: {}", app_name, e))?;
            persist_default_app(db, &params.app, params.project_id.as_deref());
            return Ok(serde_json::Value::Null);
        }

        Command::new("open")
            .arg(&params.path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(candidates) = linux_cli_candidates(&params.app) {
            let mut last_err = String::new();
            for cmd in candidates {
                match Command::new(cmd).arg(&params.path).spawn() {
                    Ok(_) => {
                        persist_default_app(db, &params.app, params.project_id.as_deref());
                        return Ok(serde_json::Value::Null);
                    }
                    Err(e) => {
                        last_err = e.to_string();
                    }
                }
            }
            return Err(format!("Failed to open {}: {}", params.app, last_err));
        }

        if let Some(cmd) = linux_cli_command(&params.app) {
            Command::new(cmd)
                .arg(&params.path)
                .spawn()
                .map_err(|e| format!("Failed to open {}: {}", cmd, e))?;
            persist_default_app(db, &params.app, params.project_id.as_deref());
            return Ok(serde_json::Value::Null);
        }

        Command::new("xdg-open")
            .arg(&params.path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    persist_default_app(db, &params.app, params.project_id.as_deref());
    Ok(serde_json::Value::Null)
}

pub fn copy_path(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let params: PathInput = serde_json::from_value(input).map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    {
        use std::io::Write;
        let mut child = Command::new("pbcopy")
            .stdin(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to copy to clipboard: {}", e))?;
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(params.path.as_bytes())
                .map_err(|e| format!("Failed to write to clipboard: {}", e))?;
        }
        child.wait().map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        use std::io::Write;
        let result = Command::new("xclip")
            .args(["-selection", "clipboard"])
            .stdin(std::process::Stdio::piped())
            .spawn();
        match result {
            Ok(mut child) => {
                if let Some(mut stdin) = child.stdin.take() {
                    let _ = stdin.write_all(params.path.as_bytes());
                }
                let _ = child.wait();
            }
            Err(_) => {
                let mut child = Command::new("xsel")
                    .arg("--clipboard")
                    .stdin(std::process::Stdio::piped())
                    .spawn()
                    .map_err(|e| format!("Failed to copy to clipboard: {}", e))?;
                if let Some(mut stdin) = child.stdin.take() {
                    let _ = stdin.write_all(params.path.as_bytes());
                }
                let _ = child.wait();
            }
        }
    }

    Ok(serde_json::Value::Null)
}

#[derive(Deserialize)]
struct OpenFileInEditorInput {
    path: String,
    #[allow(dead_code)]
    line: Option<u32>,
    #[allow(dead_code)]
    column: Option<u32>,
    #[allow(dead_code)]
    cwd: Option<String>,
    #[serde(rename = "projectId")]
    #[allow(dead_code)]
    project_id: Option<String>,
}

pub fn open_file_in_editor(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let params: OpenFileInEditorInput =
        serde_json::from_value(input).map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    Command::new("open")
        .arg(&params.path)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    Command::new("xdg-open")
        .arg(&params.path)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(serde_json::Value::Null)
}
