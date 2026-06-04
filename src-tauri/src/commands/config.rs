use crate::db::Database;
use rusqlite::Result;


pub fn should_show_setup_card(db: &Database) -> Result<serde_json::Value> {
    let _exists = db.conn.query_row(
        "SELECT * FROM settings WHERE id = 1",
        [],
        |_row| Ok(()),
    );

    // Return false for now
    Ok(serde_json::Value::Bool(false))
}

pub fn dismiss_setup_card(_db: &Database) -> Result<serde_json::Value> {
    // Noop
    Ok(serde_json::Value::Null)
}

pub fn get_config_file_path() -> Result<serde_json::Value> {
    let path = dirs::home_dir()
        .expect("Could not determine home directory")
        .join(".superset")
        .join("config.json");

    Ok(serde_json::Value::String(path.to_string_lossy().to_string()))
}

pub fn get_config_content() -> Result<serde_json::Value> {
    let path = dirs::home_dir()
        .expect("Could not determine home directory")
        .join(".superset")
        .join("config.json");

    if let Ok(content) = std::fs::read_to_string(&path) {
        Ok(serde_json::from_str(&content).unwrap_or(serde_json::json!({})))
    } else {
        Ok(serde_json::json!({}))
    }
}

pub fn get_setup_onboarding_defaults() -> Result<serde_json::Value> {
    Ok(serde_json::json!({
        "shell": null,
        "editor": null,
        "theme": null
    }))
}

pub fn update_config(input: serde_json::Value) -> Result<serde_json::Value> {
    let content = input.get("content").cloned().unwrap_or(serde_json::json!({}));

    let path = dirs::home_dir()
        .expect("Could not determine home directory")
        .join(".superset")
        .join("config.json");

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    std::fs::write(&path, serde_json::to_string_pretty(&content).unwrap()).ok();

    Ok(serde_json::Value::Null)
}
