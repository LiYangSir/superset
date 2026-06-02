use crate::db::Database;
use rusqlite::Result;
use serde::Deserialize;
use std::time::{SystemTime, UNIX_EPOCH};

fn now_millis() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64
}

pub fn list(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let org_id = input.get("organizationId").and_then(|v| v.as_str()).unwrap_or("");
    let include_archived = input.get("includeArchived").and_then(|v| v.as_bool()).unwrap_or(false);

    let sql = if include_archived {
        "SELECT id, slug, title, description, status, status_color, status_type, status_position, priority, organization_id, repository_id, assignee_id, creator_id, estimate, due_date, labels, branch, pr_url, external_provider, external_id, external_key, external_url, last_synced_at, sync_error, started_at, completed_at, deleted_at, created_at, updated_at, archived_at FROM tasks WHERE organization_id = ?1 ORDER BY created_at DESC"
    } else {
        "SELECT id, slug, title, description, status, status_color, status_type, status_position, priority, organization_id, repository_id, assignee_id, creator_id, estimate, due_date, labels, branch, pr_url, external_provider, external_id, external_key, external_url, last_synced_at, sync_error, started_at, completed_at, deleted_at, created_at, updated_at, archived_at FROM tasks WHERE organization_id = ?1 AND archived_at IS NULL ORDER BY created_at DESC"
    };

    let mut stmt = db.conn.prepare(sql)?;
    let rows = stmt.query_map(rusqlite::params![org_id], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, Option<String>>(0)?,
            "slug": row.get::<_, Option<String>>(1)?,
            "title": row.get::<_, Option<String>>(2)?,
            "description": row.get::<_, Option<String>>(3)?,
            "status": row.get::<_, Option<String>>(4)?,
            "statusColor": row.get::<_, Option<String>>(5)?,
            "statusType": row.get::<_, Option<String>>(6)?,
            "statusPosition": row.get::<_, Option<i64>>(7)?,
            "priority": row.get::<_, Option<String>>(8)?,
            "organizationId": row.get::<_, Option<String>>(9)?,
            "repositoryId": row.get::<_, Option<String>>(10)?,
            "assigneeId": row.get::<_, Option<String>>(11)?,
            "creatorId": row.get::<_, Option<String>>(12)?,
            "estimate": row.get::<_, Option<i64>>(13)?,
            "dueDate": row.get::<_, Option<String>>(14)?,
            "labels": row.get::<_, Option<String>>(15)?,
            "branch": row.get::<_, Option<String>>(16)?,
            "prUrl": row.get::<_, Option<String>>(17)?,
            "externalProvider": row.get::<_, Option<String>>(18)?,
            "externalId": row.get::<_, Option<String>>(19)?,
            "externalKey": row.get::<_, Option<String>>(20)?,
            "externalUrl": row.get::<_, Option<String>>(21)?,
            "lastSyncedAt": row.get::<_, Option<String>>(22)?,
            "syncError": row.get::<_, Option<String>>(23)?,
            "startedAt": row.get::<_, Option<String>>(24)?,
            "completedAt": row.get::<_, Option<String>>(25)?,
            "deletedAt": row.get::<_, Option<String>>(26)?,
            "createdAt": row.get::<_, Option<String>>(27)?,
            "updatedAt": row.get::<_, Option<String>>(28)?,
            "archivedAt": row.get::<_, Option<String>>(29)?,
        }))
    })?.collect::<Result<Vec<_>>>()?;

    Ok(serde_json::to_value(rows).unwrap())
}

pub fn subtask_counts(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let org_id = input.get("organizationId").and_then(|v| v.as_str()).unwrap_or("");
    let mut stmt = db.conn.prepare(
        "SELECT t.id, COUNT(s.id) as total, SUM(CASE WHEN s.done = 1 THEN 1 ELSE 0 END) as done
         FROM tasks t LEFT JOIN task_subtasks s ON s.task_id = t.id
         WHERE t.organization_id = ?1 AND t.archived_at IS NULL
         GROUP BY t.id"
    )?;
    let rows = stmt.query_map(rusqlite::params![org_id], |row| {
        Ok(serde_json::json!({
            "taskId": row.get::<_, String>(0)?,
            "total": row.get::<_, i64>(1)?,
            "done": row.get::<_, i64>(2)?,
        }))
    })?.collect::<Result<Vec<_>>>()?;
    Ok(serde_json::to_value(rows).unwrap())
}

pub fn get(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let row = db.conn.query_row(
        "SELECT id, slug, title, description, status, status_color, status_type, status_position, priority, organization_id, repository_id, assignee_id, creator_id, estimate, due_date, labels, branch, pr_url, external_provider, external_id, external_key, external_url, last_synced_at, sync_error, started_at, completed_at, deleted_at, created_at, updated_at, archived_at FROM tasks WHERE id = ?1",
        rusqlite::params![id],
        |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, Option<String>>(0)?,
                "slug": row.get::<_, Option<String>>(1)?,
                "title": row.get::<_, Option<String>>(2)?,
                "description": row.get::<_, Option<String>>(3)?,
                "status": row.get::<_, Option<String>>(4)?,
                "statusColor": row.get::<_, Option<String>>(5)?,
                "statusType": row.get::<_, Option<String>>(6)?,
                "statusPosition": row.get::<_, Option<i64>>(7)?,
                "priority": row.get::<_, Option<String>>(8)?,
                "organizationId": row.get::<_, Option<String>>(9)?,
                "repositoryId": row.get::<_, Option<String>>(10)?,
                "assigneeId": row.get::<_, Option<String>>(11)?,
                "creatorId": row.get::<_, Option<String>>(12)?,
                "estimate": row.get::<_, Option<i64>>(13)?,
                "dueDate": row.get::<_, Option<String>>(14)?,
                "labels": row.get::<_, Option<String>>(15)?,
                "branch": row.get::<_, Option<String>>(16)?,
                "prUrl": row.get::<_, Option<String>>(17)?,
                "externalProvider": row.get::<_, Option<String>>(18)?,
                "externalId": row.get::<_, Option<String>>(19)?,
                "externalKey": row.get::<_, Option<String>>(20)?,
                "externalUrl": row.get::<_, Option<String>>(21)?,
                "lastSyncedAt": row.get::<_, Option<String>>(22)?,
                "syncError": row.get::<_, Option<String>>(23)?,
                "startedAt": row.get::<_, Option<String>>(24)?,
                "completedAt": row.get::<_, Option<String>>(25)?,
                "deletedAt": row.get::<_, Option<String>>(26)?,
                "createdAt": row.get::<_, Option<String>>(27)?,
                "updatedAt": row.get::<_, Option<String>>(28)?,
                "archivedAt": row.get::<_, Option<String>>(29)?,
            }))
        },
    );
    match row {
        Ok(v) => Ok(v),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(serde_json::Value::Null),
        Err(e) => Err(e),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateTaskInput {
    title: String,
    organization_id: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default = "default_status")]
    status: String,
    #[serde(default = "default_priority")]
    priority: String,
    #[serde(default)]
    creator_id: Option<String>,
}

fn default_status() -> String { "todo".to_string() }
fn default_priority() -> String { "none".to_string() }

pub fn create(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let params: CreateTaskInput = serde_json::from_value(input)
        .map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;

    let id = uuid::Uuid::new_v4().to_string();
    let slug = format!("TASK-{}", &id[..8]);
    let now = chrono_now();
    let creator_id = params.creator_id.unwrap_or_else(|| "local".to_string());

    db.conn.execute(
        "INSERT INTO tasks (id, slug, title, description, status, priority, organization_id, creator_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![id, slug, params.title, params.description, params.status, params.priority, params.organization_id, creator_id, now, now],
    )?;

    get(db, serde_json::json!({"id": id}))
}

fn chrono_now() -> String {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();
    format!("{}", now.as_millis())
}

pub fn update(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let now = chrono_now();

    if let Some(title) = input.get("title").and_then(|v| v.as_str()) {
        db.conn.execute("UPDATE tasks SET title = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![title, now, id])?;
    }
    if let Some(desc) = input.get("description") {
        let desc_str = desc.as_str();
        db.conn.execute("UPDATE tasks SET description = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![desc_str, now, id])?;
    }
    if let Some(status) = input.get("status").and_then(|v| v.as_str()) {
        db.conn.execute("UPDATE tasks SET status = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![status, now, id])?;
    }
    if let Some(priority) = input.get("priority").and_then(|v| v.as_str()) {
        db.conn.execute("UPDATE tasks SET priority = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![priority, now, id])?;
    }
    if let Some(branch) = input.get("branch") {
        let branch_str = branch.as_str();
        db.conn.execute("UPDATE tasks SET branch = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![branch_str, now, id])?;
    }
    if let Some(due_date) = input.get("dueDate") {
        let dd = due_date.as_str();
        db.conn.execute("UPDATE tasks SET due_date = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![dd, now, id])?;
    }
    if let Some(labels) = input.get("labels") {
        let l = labels.to_string();
        db.conn.execute("UPDATE tasks SET labels = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![l, now, id])?;
    }

    get(db, serde_json::json!({"id": id}))
}

pub fn delete(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("");
    db.conn.execute("DELETE FROM task_subtasks WHERE task_id = ?1", rusqlite::params![id])?;
    db.conn.execute("DELETE FROM task_comments WHERE task_id = ?1", rusqlite::params![id])?;
    db.conn.execute("DELETE FROM tasks WHERE id = ?1", rusqlite::params![id])?;
    Ok(serde_json::Value::Null)
}

pub fn archive(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let now = chrono_now();
    db.conn.execute("UPDATE tasks SET archived_at = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![now, now, id])?;
    Ok(serde_json::Value::Null)
}

pub fn unarchive(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let now = chrono_now();
    db.conn.execute("UPDATE tasks SET archived_at = NULL, updated_at = ?1 WHERE id = ?2", rusqlite::params![now, id])?;
    Ok(serde_json::Value::Null)
}

pub fn list_archived(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let org_id = input.get("organizationId").and_then(|v| v.as_str()).unwrap_or("");
    let mut stmt = db.conn.prepare(
        "SELECT id, slug, title, status, priority, archived_at FROM tasks WHERE organization_id = ?1 AND archived_at IS NOT NULL ORDER BY archived_at DESC"
    )?;
    let rows = stmt.query_map(rusqlite::params![org_id], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, Option<String>>(0)?,
            "slug": row.get::<_, Option<String>>(1)?,
            "title": row.get::<_, Option<String>>(2)?,
            "status": row.get::<_, Option<String>>(3)?,
            "priority": row.get::<_, Option<String>>(4)?,
            "archivedAt": row.get::<_, Option<String>>(5)?,
        }))
    })?.collect::<Result<Vec<_>>>()?;
    Ok(serde_json::to_value(rows).unwrap())
}

pub fn reorder(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    if let Some(ids) = input.get("ids").and_then(|v| v.as_array()) {
        for (i, id) in ids.iter().enumerate() {
            if let Some(id_str) = id.as_str() {
                db.conn.execute(
                    "UPDATE tasks SET status_position = ?1 WHERE id = ?2",
                    rusqlite::params![i as i64, id_str],
                )?;
            }
        }
    }
    Ok(serde_json::Value::Null)
}

// Subtask procedures
pub fn subtask_create(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let task_id = input.get("taskId").and_then(|v| v.as_str()).unwrap_or("");
    let title = input.get("title").and_then(|v| v.as_str()).unwrap_or("");
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_millis();

    let max_order: i64 = db.conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) FROM task_subtasks WHERE task_id = ?1",
        rusqlite::params![task_id],
        |row| row.get(0),
    ).unwrap_or(-1);

    db.conn.execute(
        "INSERT INTO task_subtasks (id, task_id, title, done, sort_order, created_at) VALUES (?1, ?2, ?3, 0, ?4, ?5)",
        rusqlite::params![id, task_id, title, max_order + 1, now],
    )?;

    Ok(serde_json::json!({"id": id, "taskId": task_id, "title": title, "done": false, "sortOrder": max_order + 1}))
}

pub fn subtask_toggle(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("");
    db.conn.execute("UPDATE task_subtasks SET done = CASE WHEN done = 1 THEN 0 ELSE 1 END WHERE id = ?1", rusqlite::params![id])?;
    Ok(serde_json::Value::Null)
}

pub fn subtask_update(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if let Some(title) = input.get("title").and_then(|v| v.as_str()) {
        db.conn.execute("UPDATE task_subtasks SET title = ?1 WHERE id = ?2", rusqlite::params![title, id])?;
    }
    Ok(serde_json::Value::Null)
}

pub fn subtask_delete(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("");
    db.conn.execute("DELETE FROM task_subtasks WHERE id = ?1", rusqlite::params![id])?;
    Ok(serde_json::Value::Null)
}

// Comment procedures
pub fn comment_create(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let task_id = input.get("taskId").and_then(|v| v.as_str()).unwrap_or("");
    let text = input.get("text").and_then(|v| v.as_str()).unwrap_or("");
    let author = input.get("author").and_then(|v| v.as_str()).unwrap_or("local");
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_millis();

    db.conn.execute(
        "INSERT INTO task_comments (id, task_id, author, text, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, task_id, author, text, now],
    )?;

    Ok(serde_json::json!({"id": id, "taskId": task_id, "author": author, "text": text, "createdAt": now}))
}

// Label procedures
pub fn label_list(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let org_id = input.get("organizationId").and_then(|v| v.as_str()).unwrap_or("");
    let mut stmt = db.conn.prepare(
        "SELECT id, name, color, organization_id, sort_order, created_at FROM task_labels WHERE organization_id = ?1 ORDER BY sort_order"
    )?;
    let rows = stmt.query_map(rusqlite::params![org_id], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, String>(0)?,
            "name": row.get::<_, String>(1)?,
            "color": row.get::<_, String>(2)?,
            "organizationId": row.get::<_, String>(3)?,
            "sortOrder": row.get::<_, i64>(4)?,
            "createdAt": row.get::<_, i64>(5)?,
        }))
    })?.collect::<Result<Vec<_>>>()?;
    Ok(serde_json::to_value(rows).unwrap())
}

pub fn label_create(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let name = input.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let color = input.get("color").and_then(|v| v.as_str()).unwrap_or("#6366f1");
    let org_id = input.get("organizationId").and_then(|v| v.as_str()).unwrap_or("");
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_millis();

    db.conn.execute(
        "INSERT INTO task_labels (id, name, color, organization_id, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, 0, ?5)",
        rusqlite::params![id, name, color, org_id, now],
    )?;

    Ok(serde_json::json!({"id": id, "name": name, "color": color, "organizationId": org_id}))
}

pub fn label_update(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if let Some(name) = input.get("name").and_then(|v| v.as_str()) {
        db.conn.execute("UPDATE task_labels SET name = ?1 WHERE id = ?2", rusqlite::params![name, id])?;
    }
    if let Some(color) = input.get("color").and_then(|v| v.as_str()) {
        db.conn.execute("UPDATE task_labels SET color = ?1 WHERE id = ?2", rusqlite::params![color, id])?;
    }
    Ok(serde_json::Value::Null)
}

pub fn label_delete(db: &Database, input: serde_json::Value) -> Result<serde_json::Value> {
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("");
    db.conn.execute("DELETE FROM task_labels WHERE id = ?1", rusqlite::params![id])?;
    Ok(serde_json::Value::Null)
}
