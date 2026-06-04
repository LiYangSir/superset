use serde_json::json;

pub fn get_status() -> Result<serde_json::Value, String> {
    Ok(json!({
        "fullDiskAccess": true,
        "accessibility": true,
        "microphone": true,
        "appleEvents": true,
        "localNetwork": true,
    }))
}

pub fn request_full_disk_access() -> Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .args(["x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"])
            .spawn();
    }
    Ok(serde_json::Value::Null)
}

pub fn request_accessibility() -> Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .args(["x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"])
            .spawn();
    }
    Ok(serde_json::Value::Null)
}

pub fn request_microphone() -> Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .args(["x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"])
            .spawn();
    }
    Ok(serde_json::Value::Null)
}

pub fn request_apple_events() -> Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .args(["x-apple.systempreferences:com.apple.preference.security?Privacy_Automation"])
            .spawn();
    }
    Ok(serde_json::Value::Null)
}

pub fn request_local_network() -> Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .args(["x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork"])
            .spawn();
    }
    Ok(serde_json::Value::Null)
}
