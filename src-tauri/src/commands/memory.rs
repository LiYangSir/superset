use crate::db::Database;
use rusqlite::Result;
use serde::Deserialize;
use std::time::{SystemTime, UNIX_EPOCH};

fn now_millis() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64
}

pub fn list(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let scope = input.get("scope").and_then(|v| v.as_str()).unwrap_or("global");
    let project_id = input.get("projectId").and_then(|v| v.as_str());

    let (sql, result) = if let Some(pid) = project_id {
        let mut stmt = db.conn.prepare(
            "SELECT id, content, scope, project_id, category, created_at, updated_at FROM memories WHERE scope = ?1 AND project_id = ?2 ORDER BY updated_at DESC"
        )?;
        let rows = stmt.query_map(rusqlite::params![scope, pid], map_memory_row)?.collect::<Result<Vec<_>>>()?;
        (true, rows)
    } else {
        let mut stmt = db.conn.prepare(
            "SELECT id, content, scope, project_id, category, created_at, updated_at FROM memories WHERE scope = ?1 ORDER BY updated_at DESC"
        )?;
        let rows = stmt.query_map(rusqlite::params![scope], map_memory_row)?.collect::<Result<Vec<_>>>()?;
        (true, rows)
    };
    let _ = sql;

    Ok(serde_json::to_value(result).unwrap())
}

fn map_memory_row(row: &rusqlite::Row) -> rusqlite::Result<serde_json::Value> {
    Ok(serde_json::json!({
        "id": row.get::<_, String>(0)?,
        "content": row.get::<_, String>(1)?,
        "scope": row.get::<_, String>(2)?,
        "projectId": row.get::<_, Option<String>>(3)?,
        "category": row.get::<_, Option<String>>(4)?,
        "createdAt": row.get::<_, i64>(5)?,
        "updatedAt": row.get::<_, i64>(6)?,
    }))
}

pub fn get(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let row = db.conn.query_row(
        "SELECT id, content, scope, project_id, category, created_at, updated_at FROM memories WHERE id = ?1",
        rusqlite::params![id],
        map_memory_row,
    );
    match row {
        Ok(v) => Ok(v),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(serde_json::Value::Null),
        Err(e) => Err(e),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateMemoryInput {
    content: String,
    #[serde(default = "default_scope")]
    scope: String,
    project_id: Option<String>,
    category: Option<String>,
}

fn default_scope() -> String { "global".to_string() }

pub fn create(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let params: CreateMemoryInput = serde_json::from_value(input)
        .map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = now_millis();

    db.conn.execute(
        "INSERT INTO memories (id, content, scope, project_id, category, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, params.content, params.scope, params.project_id, params.category, now, now],
    )?;

    Ok(serde_json::json!({
        "id": id,
        "content": params.content,
        "scope": params.scope,
        "projectId": params.project_id,
        "category": params.category,
        "createdAt": now,
        "updatedAt": now,
    }))
}

pub fn update(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let now = now_millis();

    if let Some(content) = input.get("content").and_then(|v| v.as_str()) {
        db.conn.execute(
            "UPDATE memories SET content = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![content, now, id],
        )?;
    }
    if let Some(category) = input.get("category") {
        let cat = category.as_str();
        db.conn.execute(
            "UPDATE memories SET category = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![cat, now, id],
        )?;
    }

    get(db, serde_json::json!({"id": id}))
}

pub fn delete(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("");
    db.conn.execute("DELETE FROM memories WHERE id = ?1", rusqlite::params![id])?;
    Ok(serde_json::Value::Null)
}

pub fn get_for_session(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let project_id = input.get("projectId").and_then(|v| v.as_str());
    let mut stmt = db.conn.prepare(
        "SELECT id, content, scope, project_id, category, created_at, updated_at FROM memories WHERE scope = 'global' OR project_id = ?1 ORDER BY updated_at DESC"
    )?;
    let pid = project_id.unwrap_or("");
    let rows = stmt.query_map(rusqlite::params![pid], map_memory_row)?.collect::<Result<Vec<_>>>()?;
    Ok(serde_json::to_value(rows).unwrap())
}

pub fn regenerate_files(_db: &Database) -> Result<serde_json::Value> {
    Ok(serde_json::Value::Null)
}

pub fn consolidate(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> {
    Ok(serde_json::Value::Null)
}

pub fn summarize_session(_db: &Database, _input: serde_json::Value) -> Result<serde_json::Value> {
    Ok(serde_json::Value::Null)
}
