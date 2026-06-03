

fn read_ui_state() -> serde_json::Value {
    let path = dirs::home_dir()
        .expect("Could not determine home directory")
        .join(".superset")
        .join("ui-state.json");

    if let Ok(content) = std::fs::read_to_string(&path) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        serde_json::json!({})
    }
}

fn write_ui_state(state: &serde_json::Value) {
    let path = dirs::home_dir()
        .expect("Could not determine home directory")
        .join(".superset")
        .join("ui-state.json");

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    std::fs::write(&path, serde_json::to_string_pretty(state).unwrap()).ok();
}

pub fn tabs_get() -> rusqlite::Result<serde_json::Value> {
    let state = read_ui_state();
    Ok(state.get("tabs").cloned().unwrap_or(serde_json::Value::Null))
}

pub fn tabs_set(input: serde_json::Value) -> rusqlite::Result<serde_json::Value> {
    let mut state = read_ui_state();
    state.as_object_mut().unwrap().insert("tabs".to_string(), input);
    write_ui_state(&state);
    Ok(serde_json::Value::Null)
}

pub fn theme_get() -> rusqlite::Result<serde_json::Value> {
    let state = read_ui_state();
    let theme = state
        .get("theme")
        .cloned()
        .unwrap_or(serde_json::json!({"mode": "dark"}));
    Ok(theme)
}

pub fn theme_set(input: serde_json::Value) -> rusqlite::Result<serde_json::Value> {
    let mut state = read_ui_state();
    state.as_object_mut().unwrap().insert("theme".to_string(), input);
    write_ui_state(&state);
    Ok(serde_json::Value::Null)
}

pub fn hotkeys_get() -> rusqlite::Result<serde_json::Value> {
    let state = read_ui_state();
    Ok(state.get("hotkeys").cloned().unwrap_or(serde_json::json!({
        "version": 1,
        "byPlatform": { "darwin": {}, "win32": {}, "linux": {} }
    })))
}

pub fn hotkeys_set(input: serde_json::Value) -> rusqlite::Result<serde_json::Value> {
    let mut state = read_ui_state();
    state.as_object_mut().unwrap().insert("hotkeys".to_string(), input);
    write_ui_state(&state);
    Ok(serde_json::Value::Null)
}
