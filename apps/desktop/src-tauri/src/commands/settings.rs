use crate::db::Database;
use rusqlite::Result;
use serde_json::json;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONFIRM_ON_QUIT: bool = true;
const DEFAULT_TERMINAL_LINK_BEHAVIOR: &str = "file-viewer";
const DEFAULT_FILE_OPEN_MODE: &str = "split-pane";
const DEFAULT_AUTO_APPLY_DEFAULT_PRESET: bool = true;
const DEFAULT_SHOW_PRESETS_BAR: bool = true;
const DEFAULT_USE_COMPACT_TERMINAL_ADD_BUTTON: bool = true;
const DEFAULT_SHOW_RESOURCE_MONITOR: bool = true;
const DEFAULT_OPEN_LINKS_IN_APP: bool = false;
const DEFAULT_PERSIST_TERMINAL: bool = true;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Ensure the singleton settings row exists and return it as JSON.
fn get_settings_row(db: &Database) -> Result<serde_json::Value> {
    let exists: bool = db
        .conn
        .query_row("SELECT COUNT(*) FROM settings WHERE id = 1", [], |row| {
            row.get::<_, i64>(0)
        })
        .map(|c| c > 0)
        .unwrap_or(false);

    if !exists {
        db.conn.execute("INSERT INTO settings (id) VALUES (1)", [])?;
    }

    let row = db.conn.query_row(
        "SELECT
            last_active_workspace_id,
            terminal_presets,
            terminal_presets_initialized,
            selected_ringtone_id,
            active_organization_id,
            confirm_on_quit,
            terminal_link_behavior,
            persist_terminal,
            auto_apply_default_preset,
            branch_prefix_mode,
            branch_prefix_custom,
            notification_sounds_muted,
            delete_local_branch,
            file_open_mode,
            show_presets_bar,
            terminal_font_family,
            terminal_font_size,
            editor_font_family,
            editor_font_size,
            show_resource_monitor,
            worktree_base_dir,
            open_links_in_app,
            use_compact_terminal_add_button,
            anthropic_api_key,
            anthropic_base_url,
            anthropic_model,
            default_editor
         FROM settings WHERE id = 1",
        [],
        |row| {
            Ok(json!({
                "lastActiveWorkspaceId": row.get::<_, Option<String>>(0)?,
                "terminalPresets": row.get::<_, Option<String>>(1)?,
                "terminalPresetsInitialized": row.get::<_, Option<i64>>(2)?.map(|v| v != 0),
                "selectedRingtoneId": row.get::<_, Option<String>>(3)?,
                "activeOrganizationId": row.get::<_, Option<String>>(4)?,
                "confirmOnQuit": row.get::<_, Option<i64>>(5)?.map(|v| v != 0),
                "terminalLinkBehavior": row.get::<_, Option<String>>(6)?,
                "persistTerminal": row.get::<_, Option<i64>>(7)?.map(|v| v != 0),
                "autoApplyDefaultPreset": row.get::<_, Option<i64>>(8)?.map(|v| v != 0),
                "branchPrefixMode": row.get::<_, Option<String>>(9)?,
                "branchPrefixCustom": row.get::<_, Option<String>>(10)?,
                "notificationSoundsMuted": row.get::<_, Option<i64>>(11)?.map(|v| v != 0),
                "deleteLocalBranch": row.get::<_, Option<i64>>(12)?.map(|v| v != 0),
                "fileOpenMode": row.get::<_, Option<String>>(13)?,
                "showPresetsBar": row.get::<_, Option<i64>>(14)?.map(|v| v != 0),
                "terminalFontFamily": row.get::<_, Option<String>>(15)?,
                "terminalFontSize": row.get::<_, Option<i64>>(16)?,
                "editorFontFamily": row.get::<_, Option<String>>(17)?,
                "editorFontSize": row.get::<_, Option<i64>>(18)?,
                "showResourceMonitor": row.get::<_, Option<i64>>(19)?.map(|v| v != 0),
                "worktreeBaseDir": row.get::<_, Option<String>>(20)?,
                "openLinksInApp": row.get::<_, Option<i64>>(21)?.map(|v| v != 0),
                "useCompactTerminalAddButton": row.get::<_, Option<i64>>(22)?.map(|v| v != 0),
                "anthropicApiKey": row.get::<_, Option<String>>(23)?,
                "anthropicBaseUrl": row.get::<_, Option<String>>(24)?,
                "anthropicModel": row.get::<_, Option<String>>(25)?,
                "defaultEditor": row.get::<_, Option<String>>(26)?,
            }))
        },
    )?;

    Ok(row)
}

/// Read the terminal_presets column and parse as a JSON array.
fn read_terminal_presets(db: &Database) -> Result<Vec<serde_json::Value>> {
    let row = get_settings_row(db)?;
    let raw = row.get("terminalPresets");
    match raw {
        Some(serde_json::Value::String(s)) => {
            Ok(serde_json::from_str(s).unwrap_or_default())
        }
        _ => Ok(Vec::new()),
    }
}

/// Persist a presets array (and optionally mark initialized).
fn save_terminal_presets(
    db: &Database,
    presets: &[serde_json::Value],
    mark_initialized: bool,
) -> Result<()> {
    let json_str = serde_json::to_string(presets).unwrap_or_else(|_| "[]".to_string());
    if mark_initialized {
        db.conn.execute(
            "INSERT INTO settings (id, terminal_presets, terminal_presets_initialized)
             VALUES (1, ?1, 1)
             ON CONFLICT(id) DO UPDATE SET terminal_presets = ?1, terminal_presets_initialized = 1",
            rusqlite::params![json_str],
        )?;
    } else {
        db.conn.execute(
            "INSERT INTO settings (id, terminal_presets) VALUES (1, ?1)
             ON CONFLICT(id) DO UPDATE SET terminal_presets = ?1",
            rusqlite::params![json_str],
        )?;
    }
    Ok(())
}

fn parse_input(input: serde_json::Value) -> serde_json::Value {
    input
}

// ---------------------------------------------------------------------------
// Simple boolean / string getters
// ---------------------------------------------------------------------------

pub fn get_confirm_on_quit(db: &Database) -> Result<serde_json::Value> {
    let row = get_settings_row(db)?;
    let val = row
        .get("confirmOnQuit")
        .and_then(|v| v.as_bool())
        .unwrap_or(DEFAULT_CONFIRM_ON_QUIT);
    Ok(json!(val))
}

pub fn get_terminal_link_behavior(db: &Database) -> Result<serde_json::Value> {
    let row = get_settings_row(db)?;
    let val = row
        .get("terminalLinkBehavior")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| DEFAULT_TERMINAL_LINK_BEHAVIOR.to_string());
    Ok(json!(val))
}

pub fn get_file_open_mode(db: &Database) -> Result<serde_json::Value> {
    let row = get_settings_row(db)?;
    let val = row
        .get("fileOpenMode")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| DEFAULT_FILE_OPEN_MODE.to_string());
    Ok(json!(val))
}

pub fn get_auto_apply_default_preset(db: &Database) -> Result<serde_json::Value> {
    let row = get_settings_row(db)?;
    let val = row
        .get("autoApplyDefaultPreset")
        .and_then(|v| v.as_bool())
        .unwrap_or(DEFAULT_AUTO_APPLY_DEFAULT_PRESET);
    Ok(json!(val))
}

pub fn get_show_presets_bar(db: &Database) -> Result<serde_json::Value> {
    let row = get_settings_row(db)?;
    let val = row
        .get("showPresetsBar")
        .and_then(|v| v.as_bool())
        .unwrap_or(DEFAULT_SHOW_PRESETS_BAR);
    Ok(json!(val))
}

pub fn get_use_compact_terminal_add_button(db: &Database) -> Result<serde_json::Value> {
    let row = get_settings_row(db)?;
    let val = row
        .get("useCompactTerminalAddButton")
        .and_then(|v| v.as_bool())
        .unwrap_or(DEFAULT_USE_COMPACT_TERMINAL_ADD_BUTTON);
    Ok(json!(val))
}

pub fn get_show_resource_monitor(db: &Database) -> Result<serde_json::Value> {
    let row = get_settings_row(db)?;
    let val = row
        .get("showResourceMonitor")
        .and_then(|v| v.as_bool())
        .unwrap_or(DEFAULT_SHOW_RESOURCE_MONITOR);
    Ok(json!(val))
}

pub fn get_open_links_in_app(db: &Database) -> Result<serde_json::Value> {
    let row = get_settings_row(db)?;
    let val = row
        .get("openLinksInApp")
        .and_then(|v| v.as_bool())
        .unwrap_or(DEFAULT_OPEN_LINKS_IN_APP);
    Ok(json!(val))
}

pub fn get_delete_local_branch(db: &Database) -> Result<serde_json::Value> {
    let row = get_settings_row(db)?;
    let val = row
        .get("deleteLocalBranch")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    Ok(json!(val))
}

pub fn get_notification_sounds_muted(db: &Database) -> Result<serde_json::Value> {
    let row = get_settings_row(db)?;
    let val = row
        .get("notificationSoundsMuted")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    Ok(json!(val))
}

pub fn get_persist_terminal(db: &Database) -> Result<serde_json::Value> {
    let row = get_settings_row(db)?;
    let val = row
        .get("persistTerminal")
        .and_then(|v| v.as_bool())
        .unwrap_or(DEFAULT_PERSIST_TERMINAL);
    Ok(json!(val))
}

pub fn get_branch_prefix(db: &Database) -> Result<serde_json::Value> {
    let row = get_settings_row(db)?;
    let mode = row
        .get("branchPrefixMode")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| "none".to_string());
    let custom = row
        .get("branchPrefixCustom")
        .and_then(|v| v.as_str().map(String::from));
    Ok(json!({
        "mode": mode,
        "customPrefix": custom,
    }))
}

pub fn get_worktree_base_dir(db: &Database) -> Result<serde_json::Value> {
    let row = get_settings_row(db)?;
    let val = row
        .get("worktreeBaseDir")
        .and_then(|v| if v.is_null() { None } else { Some(v.clone()) })
        .unwrap_or(serde_json::Value::Null);
    Ok(val)
}

pub fn get_default_editor(db: &Database) -> Result<serde_json::Value> {
    let row = get_settings_row(db)?;
    let val = row
        .get("defaultEditor")
        .and_then(|v| if v.is_null() { None } else { Some(v.clone()) })
        .unwrap_or(serde_json::Value::Null);
    Ok(val)
}

pub fn get_selected_ringtone_id(db: &Database) -> Result<serde_json::Value> {
    let row = get_settings_row(db)?;
    let val = row
        .get("selectedRingtoneId")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| "default".to_string());
    Ok(json!(val))
}

pub fn get_font_settings(db: &Database) -> Result<serde_json::Value> {
    let row = get_settings_row(db)?;
    Ok(json!({
        "terminalFontFamily": row.get("terminalFontFamily").and_then(|v| if v.is_null() { None } else { Some(v.clone()) }).unwrap_or(serde_json::Value::Null),
        "terminalFontSize": row.get("terminalFontSize").and_then(|v| if v.is_null() { None } else { Some(v.clone()) }).unwrap_or(serde_json::Value::Null),
        "editorFontFamily": row.get("editorFontFamily").and_then(|v| if v.is_null() { None } else { Some(v.clone()) }).unwrap_or(serde_json::Value::Null),
        "editorFontSize": row.get("editorFontSize").and_then(|v| if v.is_null() { None } else { Some(v.clone()) }).unwrap_or(serde_json::Value::Null),
    }))
}

pub fn get_telemetry_enabled(_db: &Database) -> Result<serde_json::Value> {
    Ok(json!(true))
}

pub fn get_anthropic_api_key(db: &Database) -> Result<serde_json::Value> {
    let row = get_settings_row(db)?;
    let val = row
        .get("anthropicApiKey")
        .and_then(|v| if v.is_null() { None } else { Some(v.clone()) })
        .unwrap_or(serde_json::Value::Null);
    Ok(val)
}

pub fn get_anthropic_base_url(db: &Database) -> Result<serde_json::Value> {
    let row = get_settings_row(db)?;
    let val = row
        .get("anthropicBaseUrl")
        .and_then(|v| if v.is_null() { None } else { Some(v.clone()) })
        .unwrap_or(serde_json::Value::Null);
    Ok(val)
}

pub fn get_anthropic_model(db: &Database) -> Result<serde_json::Value> {
    let row = get_settings_row(db)?;
    let val = row
        .get("anthropicModel")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| "deepseek-v4-flash".to_string());
    Ok(json!(val))
}

// ---------------------------------------------------------------------------
// Terminal preset getters
// ---------------------------------------------------------------------------

pub fn get_terminal_presets(db: &Database) -> Result<serde_json::Value> {
    let row = get_settings_row(db)?;
    let initialized = row
        .get("terminalPresetsInitialized")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if !initialized {
        // Return empty array and mark initialized (no built-in defaults in Tauri)
        let empty: Vec<serde_json::Value> = Vec::new();
        save_terminal_presets(db, &empty, true)?;
        return Ok(json!(empty));
    }

    let presets = read_terminal_presets(db)?;
    Ok(json!(presets))
}

pub fn get_default_preset(db: &Database) -> Result<serde_json::Value> {
    let presets = read_terminal_presets(db)?;
    let default = presets
        .iter()
        .find(|p| p.get("isDefault").and_then(|v| v.as_bool()).unwrap_or(false));
    Ok(default.cloned().unwrap_or(serde_json::Value::Null))
}

pub fn get_workspace_creation_presets(db: &Database) -> Result<serde_json::Value> {
    let presets = read_terminal_presets(db)?;
    let tagged: Vec<&serde_json::Value> = presets
        .iter()
        .filter(|p| {
            p.get("applyOnWorkspaceCreated")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
        })
        .collect();

    if !tagged.is_empty() {
        return Ok(json!(tagged));
    }

    // Fall back to isDefault preset
    let default = presets
        .iter()
        .find(|p| p.get("isDefault").and_then(|v| v.as_bool()).unwrap_or(false));
    match default {
        Some(d) => Ok(json!([d])),
        None => Ok(json!([])),
    }
}

pub fn get_new_tab_presets(db: &Database) -> Result<serde_json::Value> {
    let presets = read_terminal_presets(db)?;
    let tagged: Vec<&serde_json::Value> = presets
        .iter()
        .filter(|p| {
            p.get("applyOnNewTab")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
        })
        .collect();

    if !tagged.is_empty() {
        return Ok(json!(tagged));
    }

    let default = presets
        .iter()
        .find(|p| p.get("isDefault").and_then(|v| v.as_bool()).unwrap_or(false));
    match default {
        Some(d) => Ok(json!([d])),
        None => Ok(json!([])),
    }
}

pub fn get_git_info(_db: &Database) -> Result<serde_json::Value> {
    let gh_login = std::process::Command::new("gh")
        .args(["api", "user", "--jq", ".login"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());

    let git_name = std::process::Command::new("git")
        .args(["config", "user.name"])
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();

    let git_email = std::process::Command::new("git")
        .args(["config", "user.email"])
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();

    Ok(json!({
        "ghLogin": gh_login,
        "gitName": git_name,
        "gitEmail": git_email,
    }))
}

// ---------------------------------------------------------------------------
// Simple setters
// ---------------------------------------------------------------------------

pub fn set_confirm_on_quit(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let input = parse_input(input);
    let enabled = input
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(DEFAULT_CONFIRM_ON_QUIT);
    db.conn.execute(
        "INSERT INTO settings (id, confirm_on_quit) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET confirm_on_quit = ?1",
        rusqlite::params![enabled],
    )?;
    Ok(json!({ "success": true }))
}

pub fn set_terminal_link_behavior(
    db: &Database,
    input: serde_json::Value,
) -> Result<serde_json::Value> {
    let input = parse_input(input);
    let behavior = input
        .get("behavior")
        .and_then(|v| v.as_str())
        .unwrap_or(DEFAULT_TERMINAL_LINK_BEHAVIOR);
    db.conn.execute(
        "INSERT INTO settings (id, terminal_link_behavior) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET terminal_link_behavior = ?1",
        rusqlite::params![behavior],
    )?;
    Ok(json!({ "success": true }))
}

pub fn set_file_open_mode(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let input = parse_input(input);
    let mode = input
        .get("mode")
        .and_then(|v| v.as_str())
        .unwrap_or(DEFAULT_FILE_OPEN_MODE);
    db.conn.execute(
        "INSERT INTO settings (id, file_open_mode) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET file_open_mode = ?1",
        rusqlite::params![mode],
    )?;
    Ok(json!({ "success": true }))
}

pub fn set_auto_apply_default_preset(
    db: &Database,
    input: serde_json::Value,
) -> Result<serde_json::Value> {
    let input = parse_input(input);
    let enabled = input
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(DEFAULT_AUTO_APPLY_DEFAULT_PRESET);
    db.conn.execute(
        "INSERT INTO settings (id, auto_apply_default_preset) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET auto_apply_default_preset = ?1",
        rusqlite::params![enabled],
    )?;
    Ok(json!({ "success": true }))
}

pub fn set_show_presets_bar(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let input = parse_input(input);
    let enabled = input
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(DEFAULT_SHOW_PRESETS_BAR);
    db.conn.execute(
        "INSERT INTO settings (id, show_presets_bar) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET show_presets_bar = ?1",
        rusqlite::params![enabled],
    )?;
    Ok(json!({ "success": true }))
}

pub fn set_use_compact_terminal_add_button(
    db: &Database,
    input: serde_json::Value,
) -> Result<serde_json::Value> {
    let input = parse_input(input);
    let enabled = input
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(DEFAULT_USE_COMPACT_TERMINAL_ADD_BUTTON);
    db.conn.execute(
        "INSERT INTO settings (id, use_compact_terminal_add_button) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET use_compact_terminal_add_button = ?1",
        rusqlite::params![enabled],
    )?;
    Ok(json!({ "success": true }))
}

pub fn set_show_resource_monitor(
    db: &Database,
    input: serde_json::Value,
) -> Result<serde_json::Value> {
    let input = parse_input(input);
    let enabled = input
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(DEFAULT_SHOW_RESOURCE_MONITOR);
    db.conn.execute(
        "INSERT INTO settings (id, show_resource_monitor) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET show_resource_monitor = ?1",
        rusqlite::params![enabled],
    )?;
    Ok(json!({ "success": true }))
}

pub fn set_open_links_in_app(
    db: &Database,
    input: serde_json::Value,
) -> Result<serde_json::Value> {
    let input = parse_input(input);
    let enabled = input
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(DEFAULT_OPEN_LINKS_IN_APP);
    db.conn.execute(
        "INSERT INTO settings (id, open_links_in_app) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET open_links_in_app = ?1",
        rusqlite::params![enabled],
    )?;
    Ok(json!({ "success": true }))
}

pub fn set_delete_local_branch(
    db: &Database,
    input: serde_json::Value,
) -> Result<serde_json::Value> {
    let input = parse_input(input);
    let enabled = input.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
    db.conn.execute(
        "INSERT INTO settings (id, delete_local_branch) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET delete_local_branch = ?1",
        rusqlite::params![enabled],
    )?;
    Ok(json!({ "success": true }))
}

pub fn set_notification_sounds_muted(
    db: &Database,
    input: serde_json::Value,
) -> Result<serde_json::Value> {
    let input = parse_input(input);
    let muted = input.get("muted").and_then(|v| v.as_bool()).unwrap_or(false);
    db.conn.execute(
        "INSERT INTO settings (id, notification_sounds_muted) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET notification_sounds_muted = ?1",
        rusqlite::params![muted],
    )?;
    Ok(json!({ "success": true }))
}

pub fn set_persist_terminal(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let input = parse_input(input);
    let enabled = input
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(DEFAULT_PERSIST_TERMINAL);
    db.conn.execute(
        "INSERT INTO settings (id, persist_terminal) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET persist_terminal = ?1",
        rusqlite::params![enabled],
    )?;
    Ok(json!({ "success": true }))
}

pub fn set_branch_prefix(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let input = parse_input(input);
    let mode = input.get("mode").and_then(|v| v.as_str()).unwrap_or("none");
    let custom = input
        .get("customPrefix")
        .and_then(|v| if v.is_null() { None } else { v.as_str() });
    db.conn.execute(
        "INSERT INTO settings (id, branch_prefix_mode, branch_prefix_custom) VALUES (1, ?1, ?2)
         ON CONFLICT(id) DO UPDATE SET branch_prefix_mode = ?1, branch_prefix_custom = ?2",
        rusqlite::params![mode, custom],
    )?;
    Ok(json!({ "success": true }))
}

pub fn set_worktree_base_dir(
    db: &Database,
    input: serde_json::Value,
) -> Result<serde_json::Value> {
    let input = parse_input(input);
    let path = input
        .get("path")
        .and_then(|v| if v.is_null() { None } else { v.as_str() });
    db.conn.execute(
        "INSERT INTO settings (id, worktree_base_dir) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET worktree_base_dir = ?1",
        rusqlite::params![path],
    )?;
    Ok(json!({ "success": true }))
}

pub fn set_default_editor(
    db: &Database,
    input: serde_json::Value,
) -> Result<serde_json::Value> {
    let input = parse_input(input);
    let editor = input.get("editor").and_then(|v| v.as_str()).unwrap_or("");
    db.conn.execute(
        "INSERT INTO settings (id, default_editor) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET default_editor = ?1",
        rusqlite::params![editor],
    )?;
    Ok(json!({ "success": true }))
}

pub fn set_selected_ringtone_id(
    db: &Database,
    input: serde_json::Value,
) -> Result<serde_json::Value> {
    let input = parse_input(input);
    let ringtone_id = input
        .get("ringtoneId")
        .and_then(|v| v.as_str())
        .unwrap_or("default");
    db.conn.execute(
        "INSERT INTO settings (id, selected_ringtone_id) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET selected_ringtone_id = ?1",
        rusqlite::params![ringtone_id],
    )?;
    Ok(json!({ "success": true }))
}

pub fn set_font_settings(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let input = parse_input(input);

    if let Some(v) = input.get("terminalFontFamily") {
        let val: Option<&str> = if v.is_null() { None } else { v.as_str() };
        db.conn.execute(
            "INSERT INTO settings (id, terminal_font_family) VALUES (1, ?1)
             ON CONFLICT(id) DO UPDATE SET terminal_font_family = ?1",
            rusqlite::params![val],
        )?;
    }
    if let Some(v) = input.get("terminalFontSize") {
        let val: Option<i64> = if v.is_null() { None } else { v.as_i64() };
        db.conn.execute(
            "INSERT INTO settings (id, terminal_font_size) VALUES (1, ?1)
             ON CONFLICT(id) DO UPDATE SET terminal_font_size = ?1",
            rusqlite::params![val],
        )?;
    }
    if let Some(v) = input.get("editorFontFamily") {
        let val: Option<&str> = if v.is_null() { None } else { v.as_str() };
        db.conn.execute(
            "INSERT INTO settings (id, editor_font_family) VALUES (1, ?1)
             ON CONFLICT(id) DO UPDATE SET editor_font_family = ?1",
            rusqlite::params![val],
        )?;
    }
    if let Some(v) = input.get("editorFontSize") {
        let val: Option<i64> = if v.is_null() { None } else { v.as_i64() };
        db.conn.execute(
            "INSERT INTO settings (id, editor_font_size) VALUES (1, ?1)
             ON CONFLICT(id) DO UPDATE SET editor_font_size = ?1",
            rusqlite::params![val],
        )?;
    }

    Ok(json!({ "success": true }))
}

pub fn set_telemetry_enabled(
    _db: &Database,
    _input: serde_json::Value,
) -> Result<serde_json::Value> {
    // No-op: telemetry is always enabled.
    Ok(json!({ "success": true }))
}

pub fn set_anthropic_api_key(
    db: &Database,
    input: serde_json::Value,
) -> Result<serde_json::Value> {
    let input = parse_input(input);
    let key = input.get("key").and_then(|v| v.as_str()).unwrap_or("");
    let val: Option<&str> = if key.is_empty() { None } else { Some(key) };
    db.conn.execute(
        "INSERT INTO settings (id, anthropic_api_key) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET anthropic_api_key = ?1",
        rusqlite::params![val],
    )?;
    Ok(json!({ "success": true }))
}

pub fn set_anthropic_base_url(
    db: &Database,
    input: serde_json::Value,
) -> Result<serde_json::Value> {
    let input = parse_input(input);
    let url = input.get("url").and_then(|v| v.as_str()).unwrap_or("");
    let val: Option<&str> = if url.is_empty() { None } else { Some(url) };
    db.conn.execute(
        "INSERT INTO settings (id, anthropic_base_url) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET anthropic_base_url = ?1",
        rusqlite::params![val],
    )?;
    Ok(json!({ "success": true }))
}

pub fn set_anthropic_model(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let input = parse_input(input);
    let model = input.get("model").and_then(|v| v.as_str()).unwrap_or("");
    let val: Option<&str> = if model.is_empty() { None } else { Some(model) };
    db.conn.execute(
        "INSERT INTO settings (id, anthropic_model) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET anthropic_model = ?1",
        rusqlite::params![val],
    )?;
    Ok(json!({ "success": true }))
}

// ---------------------------------------------------------------------------
// Terminal preset mutations
// ---------------------------------------------------------------------------

pub fn create_terminal_preset(
    db: &Database,
    input: serde_json::Value,
) -> Result<serde_json::Value> {
    let input = parse_input(input);
    let id = uuid::Uuid::new_v4().to_string();

    let preset = json!({
        "id": id,
        "name": input.get("name").cloned().unwrap_or(json!("")),
        "description": input.get("description").cloned().unwrap_or(serde_json::Value::Null),
        "cwd": input.get("cwd").cloned().unwrap_or(json!("")),
        "commands": input.get("commands").cloned().unwrap_or(json!([])),
        "pinnedToBar": input.get("pinnedToBar").cloned().unwrap_or(serde_json::Value::Null),
        "executionMode": input.get("executionMode").cloned().unwrap_or(json!("split-pane")),
    });

    let mut presets = read_terminal_presets(db)?;
    presets.push(preset.clone());
    save_terminal_presets(db, &presets, false)?;

    Ok(preset)
}

pub fn update_terminal_preset(
    db: &Database,
    input: serde_json::Value,
) -> Result<serde_json::Value> {
    let input = parse_input(input);
    let id = input
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| rusqlite::Error::InvalidParameterName("missing id".to_string()))?;
    let patch = input.get("patch").cloned().unwrap_or(json!({}));

    let mut presets = read_terminal_presets(db)?;
    let preset = presets
        .iter_mut()
        .find(|p| p.get("id").and_then(|v| v.as_str()) == Some(id));

    match preset {
        Some(p) => {
            if let Some(name) = patch.get("name") {
                p["name"] = name.clone();
            }
            if let Some(desc) = patch.get("description") {
                p["description"] = desc.clone();
            }
            if let Some(cwd) = patch.get("cwd") {
                p["cwd"] = cwd.clone();
            }
            if let Some(cmds) = patch.get("commands") {
                p["commands"] = cmds.clone();
            }
            if let Some(pinned) = patch.get("pinnedToBar") {
                p["pinnedToBar"] = pinned.clone();
            }
            if let Some(mode) = patch.get("executionMode") {
                p["executionMode"] = mode.clone();
            }

            save_terminal_presets(db, &presets, false)?;
            Ok(json!({ "success": true }))
        }
        None => Err(rusqlite::Error::InvalidParameterName(format!(
            "Terminal preset {} not found",
            id
        ))),
    }
}

pub fn delete_terminal_preset(
    db: &Database,
    input: serde_json::Value,
) -> Result<serde_json::Value> {
    let input = parse_input(input);
    let id = input
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| rusqlite::Error::InvalidParameterName("missing id".to_string()))?;

    let presets = read_terminal_presets(db)?;
    let filtered: Vec<serde_json::Value> = presets
        .into_iter()
        .filter(|p| p.get("id").and_then(|v| v.as_str()) != Some(id))
        .collect();
    save_terminal_presets(db, &filtered, false)?;

    Ok(json!({ "success": true }))
}

pub fn set_default_preset(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let input = parse_input(input);
    let target_id = input
        .get("id")
        .and_then(|v| if v.is_null() { None } else { v.as_str() });

    let presets = read_terminal_presets(db)?;
    let updated: Vec<serde_json::Value> = presets
        .into_iter()
        .map(|mut p| {
            let pid = p.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if Some(pid) == target_id {
                p["isDefault"] = json!(true);
            } else {
                p.as_object_mut()
                    .map(|obj| obj.remove("isDefault"));
            }
            p
        })
        .collect();
    save_terminal_presets(db, &updated, false)?;

    Ok(json!({ "success": true }))
}

pub fn set_preset_auto_apply(
    db: &Database,
    input: serde_json::Value,
) -> Result<serde_json::Value> {
    let input = parse_input(input);
    let id = input
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| rusqlite::Error::InvalidParameterName("missing id".to_string()))?;
    let field = input
        .get("field")
        .and_then(|v| v.as_str())
        .ok_or_else(|| rusqlite::Error::InvalidParameterName("missing field".to_string()))?;
    let enabled = input
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let presets = read_terminal_presets(db)?;
    let updated: Vec<serde_json::Value> = presets
        .into_iter()
        .map(|mut p| {
            let pid = p.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if pid == id {
                // Migrate legacy isDefault preset to explicit fields on first toggle
                let is_default = p
                    .get("isDefault")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                let has_workspace = p.get("applyOnWorkspaceCreated").is_some();
                let has_new_tab = p.get("applyOnNewTab").is_some();

                if is_default && !has_workspace && !has_new_tab {
                    p.as_object_mut().map(|obj| {
                        obj.remove("isDefault");
                        obj.insert(
                            "applyOnWorkspaceCreated".to_string(),
                            json!(true),
                        );
                        obj.insert("applyOnNewTab".to_string(), json!(true));
                    });
                }

                if enabled {
                    p[field] = json!(true);
                } else {
                    p.as_object_mut().map(|obj| obj.remove(field));
                }
            }
            p
        })
        .collect();
    save_terminal_presets(db, &updated, false)?;

    Ok(json!({ "success": true }))
}

pub fn reorder_terminal_presets(
    db: &Database,
    input: serde_json::Value,
) -> Result<serde_json::Value> {
    let input = parse_input(input);
    let preset_id = input
        .get("presetId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| rusqlite::Error::InvalidParameterName("missing presetId".to_string()))?;
    let target_index = input
        .get("targetIndex")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| {
            rusqlite::Error::InvalidParameterName("missing targetIndex".to_string())
        })? as usize;

    let mut presets = read_terminal_presets(db)?;

    let current_index = presets
        .iter()
        .position(|p| p.get("id").and_then(|v| v.as_str()) == Some(preset_id));

    match current_index {
        None => {
            return Err(rusqlite::Error::InvalidParameterName(
                "Preset not found".to_string(),
            ));
        }
        Some(ci) => {
            if target_index >= presets.len() {
                return Err(rusqlite::Error::InvalidParameterName(
                    "Invalid target index for reordering presets".to_string(),
                ));
            }
            let removed = presets.remove(ci);
            presets.insert(target_index, removed);
        }
    }

    save_terminal_presets(db, &presets, false)?;

    Ok(json!({ "success": true }))
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

pub fn restart_app(_db: &Database) -> Result<serde_json::Value> {
    // In Tauri, app restart is handled at the command level; return null here.
    Ok(serde_json::Value::Null)
}
