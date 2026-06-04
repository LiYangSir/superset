use serde_json::json;

pub fn preview(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("");
    #[cfg(target_os = "macos")]
    {
        if let Ok(resource_dir) = std::env::current_exe().and_then(|p| Ok(p.parent().unwrap().join("../Resources/sounds"))) {
            let path = resource_dir.join(format!("{}.mp3", id));
            if path.exists() {
                let _ = std::process::Command::new("afplay")
                    .arg(path)
                    .spawn();
            }
        }
    }
    let _ = id;
    Ok(serde_json::Value::Null)
}

pub fn stop() -> Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("killall")
            .arg("afplay")
            .output();
    }
    Ok(serde_json::Value::Null)
}

pub fn get_custom() -> Result<serde_json::Value, String> {
    Ok(json!([]))
}

pub fn import_custom(_input: serde_json::Value) -> Result<serde_json::Value, String> {
    Ok(serde_json::Value::Null)
}
