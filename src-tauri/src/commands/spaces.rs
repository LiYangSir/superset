use crate::db::Database;
use rusqlite::Result;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Space {
    pub id: String,
    pub name: String,
    pub color: String,
    pub is_default: bool,
    pub created_at: i64,
}

pub fn list(db: &Database) -> Result<serde_json::Value> {
    let mut stmt = db.conn.prepare(
        "SELECT id, name, color, is_default, created_at FROM spaces ORDER BY created_at"
    )?;

    let spaces: Vec<Space> = stmt.query_map([], |row| {
        Ok(Space {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            is_default: row.get::<_, i64>(3)? != 0,
            created_at: row.get(4)?,
        })
    })?.collect::<Result<Vec<_>>>()?;

    Ok(serde_json::to_value(spaces).unwrap())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInput {
    pub name: String,
    pub color: Option<String>,
}

pub fn create(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let params: CreateInput = serde_json::from_value(input)
        .map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;

    let id = uuid::Uuid::new_v4().to_string();
    let color = params.color.unwrap_or_else(|| "#6366f1".to_string());
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;

    db.conn.execute(
        "INSERT INTO spaces (id, name, color, is_default, created_at) VALUES (?1, ?2, ?3, 0, ?4)",
        rusqlite::params![id, params.name, color, now],
    )?;

    Ok(serde_json::to_value(Space {
        id,
        name: params.name,
        color,
        is_default: false,
        created_at: now,
    }).unwrap())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInput {
    pub id: String,
    pub name: Option<String>,
    pub color: Option<String>,
}

pub fn update(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let params: UpdateInput = serde_json::from_value(input)
        .map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;

    if let Some(name) = &params.name {
        db.conn.execute(
            "UPDATE spaces SET name = ?1 WHERE id = ?2",
            rusqlite::params![name, params.id],
        )?;
    }
    if let Some(color) = &params.color {
        db.conn.execute(
            "UPDATE spaces SET color = ?1 WHERE id = ?2",
            rusqlite::params![color, params.id],
        )?;
    }

    Ok(serde_json::Value::Null)
}

#[derive(Debug, Deserialize)]
pub struct DeleteInput {
    pub id: String,
}

pub fn delete(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let params: DeleteInput = serde_json::from_value(input)
        .map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;

    db.conn.execute(
        "UPDATE projects SET space_id = (SELECT id FROM spaces WHERE id != ?1 ORDER BY created_at LIMIT 1) WHERE space_id = ?1",
        rusqlite::params![params.id],
    )?;
    db.conn.execute("DELETE FROM spaces WHERE id = ?1", rusqlite::params![params.id])?;

    Ok(serde_json::Value::Null)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCount {
    pub space_id: String,
    pub count: i64,
}

pub fn get_project_counts(db: &Database) -> Result<serde_json::Value> {
    let mut stmt = db.conn.prepare(
        "SELECT space_id, COUNT(*) as count FROM projects WHERE space_id IS NOT NULL GROUP BY space_id"
    )?;

    let counts: Vec<ProjectCount> = stmt.query_map([], |row| {
        Ok(ProjectCount {
            space_id: row.get(0)?,
            count: row.get(1)?,
        })
    })?.collect::<Result<Vec<_>>>()?;

    Ok(serde_json::to_value(counts).unwrap())
}
