use crate::db::Database;
use rusqlite::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserHistoryEntry {
    pub id: String,
    pub url: String,
    pub title: Option<String>,
    pub favicon_url: Option<String>,
    pub workspace_id: Option<String>,
    pub visited_at: i64,
}

pub fn get_all(db: &Database) -> Result<serde_json::Value> {
    let mut stmt = db.conn.prepare(
        "SELECT id, url, title, favicon_url, workspace_id, visited_at
         FROM browser_history
         ORDER BY visited_at DESC
         LIMIT 100"
    )?;

    let entries: Vec<BrowserHistoryEntry> = stmt.query_map([], |row| {
        Ok(BrowserHistoryEntry {
            id: row.get(0)?,
            url: row.get(1)?,
            title: row.get(2)?,
            favicon_url: row.get(3)?,
            workspace_id: row.get(4)?,
            visited_at: row.get(5)?,
        })
    })?.collect::<Result<Vec<_>>>()?;

    Ok(serde_json::to_value(entries).unwrap())
}

#[derive(Debug, Deserialize)]
pub struct SearchInput {
    pub query: String,
    pub limit: Option<i64>,
}

pub fn search(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let params: SearchInput = serde_json::from_value(input)
        .map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;
    let limit = params.limit.unwrap_or(50);
    let pattern = format!("%{}%", params.query);

    let mut stmt = db.conn.prepare(
        "SELECT id, url, title, favicon_url, workspace_id, visited_at
         FROM browser_history
         WHERE url LIKE ?1 OR title LIKE ?1
         ORDER BY visited_at DESC
         LIMIT ?2"
    )?;

    let entries: Vec<BrowserHistoryEntry> = stmt.query_map(
        rusqlite::params![pattern, limit],
        |row| {
            Ok(BrowserHistoryEntry {
                id: row.get(0)?,
                url: row.get(1)?,
                title: row.get(2)?,
                favicon_url: row.get(3)?,
                workspace_id: row.get(4)?,
                visited_at: row.get(5)?,
            })
        },
    )?.collect::<Result<Vec<_>>>()?;

    Ok(serde_json::to_value(entries).unwrap())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertInput {
    pub url: String,
    pub title: Option<String>,
    pub favicon_url: Option<String>,
    pub workspace_id: Option<String>,
}

pub fn upsert(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let params: UpsertInput = serde_json::from_value(input)
        .map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;

    db.conn.execute(
        "INSERT INTO browser_history (id, url, title, favicon_url, workspace_id, visited_at)
         VALUES (uuid_v4(), ?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(url) DO UPDATE SET
            title = COALESCE(excluded.title, title),
            favicon_url = COALESCE(excluded.favicon_url, favicon_url),
            workspace_id = COALESCE(excluded.workspace_id, workspace_id),
            visited_at = excluded.visited_at",
        rusqlite::params![params.url, params.title, params.favicon_url, params.workspace_id, now],
    )?;

    Ok(serde_json::Value::Null)
}

pub fn clear(db: &Database) -> Result<serde_json::Value> {
    db.conn.execute("DELETE FROM browser_history", [])?;
    Ok(serde_json::Value::Null)
}
