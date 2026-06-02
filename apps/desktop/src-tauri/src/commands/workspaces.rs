use crate::db::Database;
use rusqlite::Result;
use std::time::{SystemTime, UNIX_EPOCH};

fn now_millis() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64
}

fn map_workspace_row(row: &rusqlite::Row) -> rusqlite::Result<serde_json::Value> {
    Ok(serde_json::json!({
        "id": row.get::<_, Option<String>>(0)?,
        "projectId": row.get::<_, Option<String>>(1)?,
        "worktreeId": row.get::<_, Option<String>>(2)?,
        "type": row.get::<_, Option<String>>(3)?,
        "branch": row.get::<_, Option<String>>(4)?,
        "name": row.get::<_, Option<String>>(5)?,
        "tabOrder": row.get::<_, Option<i64>>(6)?,
        "createdAt": row.get::<_, Option<i64>>(7)?,
        "updatedAt": row.get::<_, Option<i64>>(8)?,
        "lastOpenedAt": row.get::<_, Option<i64>>(9)?,
        "isUnread": row.get::<_, Option<i64>>(10).map(|v| v.unwrap_or(0) != 0).unwrap_or(false),
        "deletingAt": row.get::<_, Option<i64>>(11)?,
        "portBase": row.get::<_, Option<i64>>(12)?,
        "isUnnamed": row.get::<_, Option<i64>>(13).map(|v| v.unwrap_or(0) != 0).unwrap_or(false),
        "sectionId": row.get::<_, Option<String>>(14)?,
    }))
}

const WORKSPACE_COLS: &str = "id, project_id, worktree_id, type, branch, name, tab_order, created_at, updated_at, last_opened_at, is_unread, deleting_at, port_base, is_unnamed, section_id";

pub fn get(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let sql = format!("SELECT {} FROM workspaces WHERE id = ?1", WORKSPACE_COLS);
    let row = db.conn.query_row(&sql, rusqlite::params![id], map_workspace_row);
    match row {
        Ok(v) => Ok(v),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(serde_json::Value::Null),
        Err(e) => Err(e),
    }
}

pub fn get_all(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let project_id = input.get("projectId").and_then(|v| v.as_str()).unwrap_or("");
    let sql = format!("SELECT {} FROM workspaces WHERE project_id = ?1 AND deleting_at IS NULL ORDER BY tab_order", WORKSPACE_COLS);
    let mut stmt = db.conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params![project_id], map_workspace_row)?.collect::<Result<Vec<_>>>()?;
    Ok(serde_json::to_value(rows).unwrap())
}

pub fn get_all_grouped(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let project_id = input.get("projectId").and_then(|v| v.as_str()).unwrap_or("");

    // Get sections
    let mut sect_stmt = db.conn.prepare(
        "SELECT id, project_id, name, tab_order, is_collapsed, color, created_at FROM workspace_sections WHERE project_id = ?1 ORDER BY tab_order"
    )?;
    let sections: Vec<serde_json::Value> = sect_stmt.query_map(rusqlite::params![project_id], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, String>(0)?,
            "projectId": row.get::<_, String>(1)?,
            "name": row.get::<_, String>(2)?,
            "tabOrder": row.get::<_, i64>(3)?,
            "isCollapsed": row.get::<_, Option<i64>>(4).map(|v| v.unwrap_or(0) != 0).unwrap_or(false),
            "color": row.get::<_, Option<String>>(5)?,
            "createdAt": row.get::<_, i64>(6)?,
        }))
    })?.collect::<Result<Vec<_>>>()?;

    // Get workspaces
    let sql = format!("SELECT {} FROM workspaces WHERE project_id = ?1 AND deleting_at IS NULL ORDER BY tab_order", WORKSPACE_COLS);
    let mut ws_stmt = db.conn.prepare(&sql)?;
    let workspaces: Vec<serde_json::Value> = ws_stmt.query_map(rusqlite::params![project_id], map_workspace_row)?.collect::<Result<Vec<_>>>()?;

    Ok(serde_json::json!({
        "sections": sections,
        "workspaces": workspaces,
    }))
}

pub fn get_previous_workspace(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let project_id = input.get("projectId").and_then(|v| v.as_str()).unwrap_or("");
    let current_id = input.get("currentId").and_then(|v| v.as_str()).unwrap_or("");
    let sql = format!(
        "SELECT {} FROM workspaces WHERE project_id = ?1 AND deleting_at IS NULL AND tab_order < (SELECT tab_order FROM workspaces WHERE id = ?2) ORDER BY tab_order DESC LIMIT 1",
        WORKSPACE_COLS
    );
    let row = db.conn.query_row(&sql, rusqlite::params![project_id, current_id], map_workspace_row);
    match row {
        Ok(v) => Ok(v),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(serde_json::Value::Null),
        Err(e) => Err(e),
    }
}

pub fn get_next_workspace(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let project_id = input.get("projectId").and_then(|v| v.as_str()).unwrap_or("");
    let current_id = input.get("currentId").and_then(|v| v.as_str()).unwrap_or("");
    let sql = format!(
        "SELECT {} FROM workspaces WHERE project_id = ?1 AND deleting_at IS NULL AND tab_order > (SELECT tab_order FROM workspaces WHERE id = ?2) ORDER BY tab_order ASC LIMIT 1",
        WORKSPACE_COLS
    );
    let row = db.conn.query_row(&sql, rusqlite::params![project_id, current_id], map_workspace_row);
    match row {
        Ok(v) => Ok(v),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(serde_json::Value::Null),
        Err(e) => Err(e),
    }
}

pub fn create(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let project_id = input.get("projectId").and_then(|v| v.as_str()).unwrap_or("");
    let branch = input.get("branch").and_then(|v| v.as_str()).unwrap_or("main");
    let name = input.get("name").and_then(|v| v.as_str()).unwrap_or("New Workspace");
    let ws_type = input.get("type").and_then(|v| v.as_str()).unwrap_or("branch");
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_millis();

    let max_order: i64 = db.conn.query_row(
        "SELECT COALESCE(MAX(tab_order), -1) FROM workspaces WHERE project_id = ?1",
        rusqlite::params![project_id],
        |row| row.get(0),
    ).unwrap_or(-1);

    db.conn.execute(
        "INSERT INTO workspaces (id, project_id, type, branch, name, tab_order, created_at, updated_at, last_opened_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![id, project_id, ws_type, branch, name, max_order + 1, now, now, now],
    )?;

    get(db, serde_json::json!({"id": id}))
}

pub fn update(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let now = now_millis();

    if let Some(patch) = input.get("patch") {
        if let Some(name) = patch.get("name").and_then(|v| v.as_str()) {
            db.conn.execute("UPDATE workspaces SET name = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![name, now, id])?;
        }
        if let Some(branch) = patch.get("branch").and_then(|v| v.as_str()) {
            db.conn.execute("UPDATE workspaces SET branch = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![branch, now, id])?;
        }
        if let Some(section_id) = patch.get("sectionId") {
            let sid = section_id.as_str();
            db.conn.execute("UPDATE workspaces SET section_id = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![sid, now, id])?;
        }
    }
    Ok(serde_json::Value::Null)
}

pub fn delete(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("");
    db.conn.execute("DELETE FROM workspaces WHERE id = ?1", rusqlite::params![id])?;
    Ok(serde_json::Value::Null)
}

pub fn close(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    delete(db, input)
}

pub fn can_delete(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> {
    Ok(serde_json::json!({"canDelete": true}))
}

pub fn can_delete_worktree(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> {
    Ok(serde_json::json!({"canDelete": true}))
}

pub fn delete_worktree(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> {
    Ok(serde_json::Value::Null)
}

pub fn set_unread(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let is_unread = input.get("isUnread").and_then(|v| v.as_bool()).unwrap_or(false);
    db.conn.execute("UPDATE workspaces SET is_unread = ?1 WHERE id = ?2", rusqlite::params![is_unread as i64, id])?;
    Ok(serde_json::Value::Null)
}

pub fn set_active(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let now = now_millis();
    db.conn.execute("UPDATE workspaces SET last_opened_at = ?1 WHERE id = ?2", rusqlite::params![now, id])?;
    db.conn.execute(
        "INSERT INTO settings (id, last_active_workspace_id) VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET last_active_workspace_id = ?1",
        rusqlite::params![id],
    )?;
    Ok(serde_json::Value::Null)
}

pub fn reorder(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    if let Some(ids) = input.get("ids").and_then(|v| v.as_array()) {
        for (i, id) in ids.iter().enumerate() {
            if let Some(id_str) = id.as_str() {
                db.conn.execute("UPDATE workspaces SET tab_order = ?1 WHERE id = ?2", rusqlite::params![i as i64, id_str])?;
            }
        }
    }
    Ok(serde_json::Value::Null)
}

pub fn reorder_project_children(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    reorder(db, input)
}

pub fn sync_branch(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> {
    Ok(serde_json::Value::Null)
}

// Git status stubs
pub fn refresh_git_status(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> { Ok(serde_json::Value::Null) }
pub fn get_ahead_behind(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> { Ok(serde_json::json!({"ahead": 0, "behind": 0})) }
pub fn get_github_status(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> { Ok(serde_json::Value::Null) }
pub fn get_worktree_info(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> { Ok(serde_json::Value::Null) }
pub fn get_worktrees_by_project(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> { Ok(serde_json::json!([])) }
pub fn get_external_worktrees(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> { Ok(serde_json::json!([])) }

// Create stubs
pub fn open_main_repo_workspace(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> { Ok(serde_json::Value::Null) }
pub fn open_worktree(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> { Ok(serde_json::Value::Null) }
pub fn open_external_worktree(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> { Ok(serde_json::Value::Null) }
pub fn create_from_pr(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> { Ok(serde_json::Value::Null) }
pub fn import_all_worktrees(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> { Ok(serde_json::Value::Null) }

// Init stubs
pub fn retry_init(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> { Ok(serde_json::Value::Null) }
pub fn get_init_progress(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> { Ok(serde_json::json!({"status": "ready", "progress": 100})) }
pub fn get_setup_commands(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> { Ok(serde_json::json!([])) }

// Section procedures
pub fn create_section(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let project_id = input.get("projectId").and_then(|v| v.as_str()).unwrap_or("");
    let name = input.get("name").and_then(|v| v.as_str()).unwrap_or("New Section");
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_millis();

    let max_order: i64 = db.conn.query_row(
        "SELECT COALESCE(MAX(tab_order), -1) FROM workspace_sections WHERE project_id = ?1",
        rusqlite::params![project_id],
        |row| row.get(0),
    ).unwrap_or(-1);

    db.conn.execute(
        "INSERT INTO workspace_sections (id, project_id, name, tab_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, project_id, name, max_order + 1, now],
    )?;

    Ok(serde_json::json!({"id": id, "projectId": project_id, "name": name, "tabOrder": max_order + 1}))
}

pub fn set_section_color(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let color = input.get("color").and_then(|v| v.as_str());
    db.conn.execute("UPDATE workspace_sections SET color = ?1 WHERE id = ?2", rusqlite::params![color, id])?;
    Ok(serde_json::Value::Null)
}

pub fn rename_section(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let name = input.get("name").and_then(|v| v.as_str()).unwrap_or("");
    db.conn.execute("UPDATE workspace_sections SET name = ?1 WHERE id = ?2", rusqlite::params![name, id])?;
    Ok(serde_json::Value::Null)
}

pub fn delete_section(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("");
    db.conn.execute("UPDATE workspaces SET section_id = NULL WHERE section_id = ?1", rusqlite::params![id])?;
    db.conn.execute("DELETE FROM workspace_sections WHERE id = ?1", rusqlite::params![id])?;
    Ok(serde_json::Value::Null)
}

pub fn reorder_sections(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    if let Some(ids) = input.get("ids").and_then(|v| v.as_array()) {
        for (i, id) in ids.iter().enumerate() {
            if let Some(id_str) = id.as_str() {
                db.conn.execute("UPDATE workspace_sections SET tab_order = ?1 WHERE id = ?2", rusqlite::params![i as i64, id_str])?;
            }
        }
    }
    Ok(serde_json::Value::Null)
}

pub fn toggle_section_collapsed(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("");
    db.conn.execute("UPDATE workspace_sections SET is_collapsed = CASE WHEN is_collapsed = 1 THEN 0 ELSE 1 END WHERE id = ?1", rusqlite::params![id])?;
    Ok(serde_json::Value::Null)
}

pub fn reorder_workspaces_in_section(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    reorder(db, input)
}

pub fn move_workspaces_to_section(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let section_id = input.get("sectionId").and_then(|v| v.as_str());
    if let Some(ids) = input.get("workspaceIds").and_then(|v| v.as_array()) {
        for id in ids {
            if let Some(id_str) = id.as_str() {
                db.conn.execute("UPDATE workspaces SET section_id = ?1 WHERE id = ?2", rusqlite::params![section_id, id_str])?;
            }
        }
    }
    Ok(serde_json::Value::Null)
}

pub fn move_workspace_to_section(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let section_id = input.get("sectionId").and_then(|v| v.as_str());
    db.conn.execute("UPDATE workspaces SET section_id = ?1 WHERE id = ?2", rusqlite::params![section_id, id])?;
    Ok(serde_json::Value::Null)
}
