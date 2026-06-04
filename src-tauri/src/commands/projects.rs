use crate::db::Database;
use rusqlite::Result;

fn map_project_row(row: &rusqlite::Row) -> rusqlite::Result<serde_json::Value> {
    Ok(serde_json::json!({
        "id": row.get::<_, Option<String>>(0)?,
        "name": row.get::<_, Option<String>>(1)?,
        "mainRepoPath": row.get::<_, Option<String>>(2)?,
        "color": row.get::<_, Option<String>>(3)?,
        "tabOrder": row.get::<_, Option<i64>>(4)?,
        "defaultBranch": row.get::<_, Option<String>>(5)?,
        "createdAt": row.get::<_, Option<i64>>(6)?,
        "spaceId": row.get::<_, Option<String>>(7)?,
        "hideImage": row.get::<_, Option<i64>>(8).map(|v| v.unwrap_or(0) != 0).unwrap_or(false),
        "iconUrl": row.get::<_, Option<String>>(9)?,
        "defaultApp": row.get::<_, Option<String>>(10)?,
    }))
}

const PROJECT_COLS: &str = "id, name, main_repo_path, color, tab_order, default_branch, created_at, space_id, hide_image, icon_url, default_app";

pub fn get(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let sql = format!("SELECT {} FROM projects WHERE id = ?1", PROJECT_COLS);
    let row = db.conn.query_row(
        &sql,
        rusqlite::params![id],
        map_project_row,
    );
    match row {
        Ok(v) => Ok(v),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(serde_json::Value::Null),
        Err(e) => Err(e),
    }
}

pub fn get_default_app(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let project_id = input.get("projectId").and_then(|v| v.as_str()).unwrap_or("");
    let result = db.conn.query_row(
        "SELECT default_app FROM projects WHERE id = ?1",
        rusqlite::params![project_id],
        |row| row.get::<_, Option<String>>(0),
    );
    match result {
        Ok(Some(app)) if !app.is_empty() => Ok(serde_json::Value::String(app)),
        _ => {
            let fallback = db.conn.query_row(
                "SELECT default_editor FROM settings WHERE id = 1",
                [],
                |row| row.get::<_, Option<String>>(0),
            );
            match fallback {
                Ok(Some(editor)) if !editor.is_empty() => Ok(serde_json::Value::String(editor)),
                _ => Ok(serde_json::Value::Null),
            }
        }
    }
}

pub fn get_recents(db: &Database) -> Result<serde_json::Value> {
    let sql = format!("SELECT {} FROM projects ORDER BY created_at DESC LIMIT 20", PROJECT_COLS);
    let mut stmt = db.conn.prepare(&sql)?;
    let rows = stmt.query_map([], map_project_row)?.collect::<Result<Vec<_>>>()?;
    Ok(serde_json::to_value(rows).unwrap())
}

pub fn get_branches_local(_db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let path = input.get("path").and_then(|v| v.as_str()).unwrap_or("");
    let output = std::process::Command::new("git")
        .args(["branch", "--list", "--no-color"])
        .current_dir(path)
        .output();

    match output {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            let branches: Vec<serde_json::Value> = stdout.lines()
                .map(|l| l.trim().trim_start_matches("* "))
                .filter(|l| !l.is_empty())
                .map(|l| serde_json::Value::String(l.to_string()))
                .collect();
            Ok(serde_json::to_value(branches).unwrap())
        }
        Err(_) => Ok(serde_json::json!([])),
    }
}

pub fn get_branches(_db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    get_branches_local(_db, input)
}

pub fn update(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if let Some(name) = input.get("name").and_then(|v| v.as_str()) {
        db.conn.execute("UPDATE projects SET name = ?1 WHERE id = ?2", rusqlite::params![name, id])?;
    }
    if let Some(space_id) = input.get("spaceId").and_then(|v| v.as_str()) {
        db.conn.execute("UPDATE projects SET space_id = ?1 WHERE id = ?2", rusqlite::params![space_id, id])?;
    }
    if let Some(default_app) = input.get("defaultApp").and_then(|v| v.as_str()) {
        db.conn.execute("UPDATE projects SET default_app = ?1 WHERE id = ?2", rusqlite::params![default_app, id])?;
    }
    Ok(serde_json::Value::Null)
}

pub fn reorder(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    if let Some(ids) = input.get("ids").and_then(|v| v.as_array()) {
        for (i, id) in ids.iter().enumerate() {
            if let Some(id_str) = id.as_str() {
                db.conn.execute("UPDATE projects SET tab_order = ?1 WHERE id = ?2", rusqlite::params![i as i64, id_str])?;
            }
        }
    }
    Ok(serde_json::Value::Null)
}

pub fn close(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("");
    db.conn.execute("DELETE FROM projects WHERE id = ?1", rusqlite::params![id])?;
    Ok(serde_json::Value::Null)
}

pub fn get_git_author(input: serde_json::Value) -> Result<serde_json::Value> {
    let path = input.get("path").and_then(|v| v.as_str()).unwrap_or(".");
    let name = std::process::Command::new("git")
        .args(["config", "user.name"])
        .current_dir(path)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();
    let email = std::process::Command::new("git")
        .args(["config", "user.email"])
        .current_dir(path)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();

    Ok(serde_json::json!({ "name": name, "email": email }))
}

// Stubs for complex operations
pub fn select_directory() -> Result<serde_json::Value> { Ok(serde_json::Value::Null) }
pub fn open_new(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> { Ok(serde_json::Value::Null) }
pub fn open_from_path(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> { Ok(serde_json::Value::Null) }
pub fn init_git_and_open(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> { Ok(serde_json::Value::Null) }
pub fn clone_repo(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> { Ok(serde_json::Value::Null) }
pub fn create_empty_repo(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> { Ok(serde_json::Value::Null) }
pub fn refresh_default_branch(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> { Ok(serde_json::Value::Null) }
pub fn link_to_neon(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> { Ok(serde_json::Value::Null) }
pub fn trigger_favicon_discovery(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> { Ok(serde_json::Value::Null) }
pub fn set_project_icon(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> { Ok(serde_json::Value::Null) }
