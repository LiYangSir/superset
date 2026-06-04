use serde_json::json;

use crate::db::Database;

pub fn get_service_info(_input: serde_json::Value) -> Result<serde_json::Value, String> {
    Ok(json!({"status": "ready"}))
}

fn resolve_workspace_root(db: &Database, input: &serde_json::Value) -> Option<String> {
    let workspace_id = input.get("workspaceId").and_then(|v| v.as_str()).unwrap_or("");
    if workspace_id.is_empty() {
        return None;
    }
    let result: Result<String, _> = db.conn.query_row(
        "SELECT COALESCE(
            (SELECT w2.path FROM worktrees w2 WHERE w2.id = ws.worktree_id),
            (SELECT p.main_repo_path FROM projects p WHERE p.id = ws.project_id)
        ) FROM workspaces ws WHERE ws.id = ?1",
        rusqlite::params![workspace_id],
        |row| row.get(0),
    );
    result.ok().filter(|s| !s.is_empty())
}

pub fn read_directory(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let abs_path = input.get("absolutePath").and_then(|v| v.as_str())
        .or_else(|| input.get("path").and_then(|v| v.as_str()))
        .unwrap_or(".");
    let dir_path = std::path::Path::new(abs_path);

    let entries = std::fs::read_dir(dir_path).map_err(|e| e.to_string())?;
    let mut items: Vec<serde_json::Value> = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let entry_path = entry.path().to_string_lossy().to_string();
        let relative_path = if entry_path.starts_with(abs_path) {
            entry_path[abs_path.len()..].trim_start_matches('/').to_string()
        } else {
            name.clone()
        };
        items.push(json!({
            "id": entry_path,
            "name": name,
            "path": entry_path,
            "relativePath": relative_path,
            "isDirectory": metadata.is_dir(),
        }));
    }

    items.sort_by(|a, b| {
        let a_dir = a["isDirectory"].as_bool().unwrap_or(false);
        let b_dir = b["isDirectory"].as_bool().unwrap_or(false);
        b_dir.cmp(&a_dir).then_with(|| {
            let a_name = a["name"].as_str().unwrap_or("").to_lowercase();
            let b_name = b["name"].as_str().unwrap_or("").to_lowercase();
            a_name.cmp(&b_name)
        })
    });

    Ok(json!(items))
}

pub fn search_files(db: &Database, input: serde_json::Value) -> Result<serde_json::Value, String> {
    let query = input.get("query").and_then(|v| v.as_str()).unwrap_or("");
    let limit = input.get("limit").and_then(|v| v.as_u64()).unwrap_or(200) as usize;
    if query.is_empty() {
        return Ok(json!([]));
    }

    let root_path = resolve_workspace_root(db, &input)
        .ok_or_else(|| "Could not resolve workspace root".to_string())?;

    let output = std::process::Command::new("find")
        .args([
            &root_path, "-iname", &format!("*{}*", query),
            "-maxdepth", "8",
            "-not", "-path", "*/node_modules/*",
            "-not", "-path", "*/.git/*",
            "-not", "-path", "*/dist/*",
            "-not", "-path", "*/.next/*",
            "-not", "-path", "*/target/*",
        ])
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let root_prefix = format!("{}/", root_path.trim_end_matches('/'));

    let results: Vec<serde_json::Value> = stdout.lines()
        .take(limit)
        .filter_map(|l| {
            let abs = l.trim();
            if abs.is_empty() { return None; }
            let name = std::path::Path::new(abs)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            let relative = if abs.starts_with(&root_prefix) {
                abs[root_prefix.len()..].to_string()
            } else {
                abs.to_string()
            };
            Some(json!({
                "id": abs,
                "name": name,
                "path": abs,
                "relativePath": relative,
                "isDirectory": false,
                "score": 1.0,
            }))
        })
        .collect();

    Ok(json!(results))
}

pub fn search_files_multi(_db: &Database, input: serde_json::Value) -> Result<serde_json::Value, String> {
    let query = input.get("query").and_then(|v| v.as_str()).unwrap_or("");
    let limit = input.get("limit").and_then(|v| v.as_u64()).unwrap_or(50) as usize;
    if query.is_empty() {
        return Ok(json!([]));
    }

    let roots = input.get("roots").and_then(|v| v.as_array());
    let roots = match roots {
        Some(r) => r,
        None => return Ok(json!([])),
    };

    let mut all_results: Vec<serde_json::Value> = Vec::new();
    let per_root_limit = std::cmp::max(10, limit / std::cmp::max(1, roots.len()));

    for root in roots {
        let root_path = root.get("rootPath").and_then(|v| v.as_str()).unwrap_or("");
        let workspace_id = root.get("workspaceId").and_then(|v| v.as_str()).unwrap_or("");
        let workspace_name = root.get("workspaceName").and_then(|v| v.as_str()).unwrap_or("");
        if root_path.is_empty() { continue; }

        let output = std::process::Command::new("find")
            .args([
                root_path, "-iname", &format!("*{}*", query),
                "-maxdepth", "8",
                "-not", "-path", "*/node_modules/*",
                "-not", "-path", "*/.git/*",
            ])
            .output();

        if let Ok(output) = output {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let root_prefix = format!("{}/", root_path.trim_end_matches('/'));
            for abs in stdout.lines().take(per_root_limit) {
                let abs = abs.trim();
                if abs.is_empty() { continue; }
                let name = std::path::Path::new(abs)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                let relative = if abs.starts_with(&root_prefix) {
                    abs[root_prefix.len()..].to_string()
                } else {
                    abs.to_string()
                };
                all_results.push(json!({
                    "id": format!("{}:{}", workspace_id, abs),
                    "name": name,
                    "path": abs,
                    "relativePath": relative,
                    "isDirectory": false,
                    "score": 1.0,
                    "workspaceId": workspace_id,
                    "workspaceName": workspace_name,
                }));
            }
        }
    }

    all_results.truncate(limit);
    Ok(json!(all_results))
}

pub fn search_keyword(db: &Database, input: serde_json::Value) -> Result<serde_json::Value, String> {
    let query = input.get("query").and_then(|v| v.as_str()).unwrap_or("");
    let limit = input.get("limit").and_then(|v| v.as_u64()).unwrap_or(200) as usize;
    if query.is_empty() {
        return Ok(json!([]));
    }

    let root_path = resolve_workspace_root(db, &input)
        .ok_or_else(|| "Could not resolve workspace root".to_string())?;

    let output = std::process::Command::new("grep")
        .args(["-rn", "-l", "--include=*.ts", "--include=*.tsx", "--include=*.js",
               "--include=*.jsx", "--include=*.rs", "--include=*.py", "--include=*.go",
               query, &root_path])
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let root_prefix = format!("{}/", root_path.trim_end_matches('/'));

    let results: Vec<serde_json::Value> = stdout.lines()
        .take(limit)
        .filter_map(|l| {
            let abs = l.trim();
            if abs.is_empty() { return None; }
            let name = std::path::Path::new(abs)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            let relative = if abs.starts_with(&root_prefix) {
                abs[root_prefix.len()..].to_string()
            } else {
                abs.to_string()
            };
            Some(json!({
                "path": abs,
                "name": name,
                "relativePath": relative,
            }))
        })
        .collect();

    Ok(json!(results))
}

pub fn create_file(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let parent = input.get("parentAbsolutePath").and_then(|v| v.as_str()).unwrap_or("");
    let name = input.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let content = input.get("content").and_then(|v| v.as_str()).unwrap_or("");

    let full_path = std::path::Path::new(parent).join(name);
    if let Some(dir) = full_path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&full_path, content).map_err(|e| e.to_string())?;
    Ok(json!({ "path": full_path.to_string_lossy() }))
}

pub fn create_directory(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let parent = input.get("parentAbsolutePath").and_then(|v| v.as_str()).unwrap_or("");
    let name = input.get("name").and_then(|v| v.as_str()).unwrap_or("");

    let full_path = std::path::Path::new(parent).join(name);
    std::fs::create_dir_all(&full_path).map_err(|e| e.to_string())?;
    Ok(json!({ "path": full_path.to_string_lossy() }))
}

pub fn rename(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let abs_path = input.get("absolutePath").and_then(|v| v.as_str()).unwrap_or("");
    let new_name = input.get("newName").and_then(|v| v.as_str()).unwrap_or("");

    let old_path = std::path::Path::new(abs_path);
    let new_path = old_path.parent()
        .map(|p| p.join(new_name))
        .ok_or_else(|| "Invalid path".to_string())?;

    std::fs::rename(old_path, &new_path).map_err(|e| e.to_string())?;
    Ok(json!({
        "oldPath": abs_path,
        "newPath": new_path.to_string_lossy(),
    }))
}

pub fn delete_path(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let paths = input.get("absolutePaths").and_then(|v| v.as_array());
    let permanent = input.get("permanent").and_then(|v| v.as_bool()).unwrap_or(false);

    let abs_paths = match paths {
        Some(arr) => arr.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>(),
        None => Vec::new(),
    };

    let mut deleted: Vec<String> = Vec::new();
    let mut errors: Vec<serde_json::Value> = Vec::new();

    for path_str in abs_paths {
        let p = std::path::Path::new(path_str);
        let result = if !permanent {
            move_to_trash(path_str)
        } else if p.is_dir() {
            std::fs::remove_dir_all(p).map_err(|e| e.to_string())
        } else {
            std::fs::remove_file(p).map_err(|e| e.to_string())
        };
        match result {
            Ok(()) => deleted.push(path_str.to_string()),
            Err(e) => errors.push(json!({ "path": path_str, "error": e })),
        }
    }

    Ok(json!({ "deleted": deleted, "errors": errors }))
}

pub fn move_path(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let sources = input.get("sourceAbsolutePaths").and_then(|v| v.as_array());
    let dest = input.get("destinationAbsolutePath").and_then(|v| v.as_str()).unwrap_or("");

    let source_paths = match sources {
        Some(arr) => arr.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>(),
        None => Vec::new(),
    };

    let mut moved: Vec<serde_json::Value> = Vec::new();
    let mut errors: Vec<serde_json::Value> = Vec::new();

    for src in source_paths {
        let src_path = std::path::Path::new(src);
        let name = src_path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let dst_path = std::path::Path::new(dest).join(&name);
        match std::fs::rename(src_path, &dst_path) {
            Ok(()) => moved.push(json!({ "from": src, "to": dst_path.to_string_lossy() })),
            Err(e) => errors.push(json!({ "path": src, "error": e.to_string() })),
        }
    }

    Ok(json!({ "moved": moved, "errors": errors }))
}

pub fn copy_path(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let sources = input.get("sourceAbsolutePaths").and_then(|v| v.as_array());
    let dest = input.get("destinationAbsolutePath").and_then(|v| v.as_str()).unwrap_or("");

    let source_paths = match sources {
        Some(arr) => arr.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>(),
        None => Vec::new(),
    };

    let mut copied: Vec<serde_json::Value> = Vec::new();
    let mut errors: Vec<serde_json::Value> = Vec::new();

    for src in source_paths {
        let src_path = std::path::Path::new(src);
        let name = src_path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let dst_path = std::path::Path::new(dest).join(&name);
        let result = if src_path.is_dir() {
            copy_dir_recursive(src_path, &dst_path)
        } else {
            std::fs::copy(src_path, &dst_path).map(|_| ()).map_err(|e| e.to_string())
        };
        match result {
            Ok(()) => copied.push(json!({ "from": src, "to": dst_path.to_string_lossy() })),
            Err(e) => errors.push(json!({ "path": src, "error": e })),
        }
    }

    Ok(json!({ "copied": copied, "errors": errors }))
}

fn move_to_trash(path: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let script = format!(
            "tell application \"Finder\" to delete POSIX file \"{}\"",
            path.replace('\\', "\\\\").replace('"', "\\\"")
        );
        let output = std::process::Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            let p = std::path::Path::new(path);
            if p.is_dir() {
                std::fs::remove_dir_all(p).map_err(|e| e.to_string())?;
            } else {
                std::fs::remove_file(p).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        let p = std::path::Path::new(path);
        if p.is_dir() {
            std::fs::remove_dir_all(p).map_err(|e| e.to_string())
        } else {
            std::fs::remove_file(p).map_err(|e| e.to_string())
        }
    }
}

fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        let dst_child = dst.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_recursive(&entry.path(), &dst_child)?;
        } else {
            std::fs::copy(entry.path(), &dst_child).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub fn exists(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = input.get("absolutePath").and_then(|v| v.as_str())
        .or_else(|| input.get("path").and_then(|v| v.as_str()))
        .unwrap_or("");
    Ok(serde_json::Value::Bool(std::path::Path::new(path).exists()))
}

pub fn stat(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = input.get("absolutePath").and_then(|v| v.as_str())
        .or_else(|| input.get("path").and_then(|v| v.as_str()))
        .unwrap_or("");
    match std::fs::metadata(path) {
        Ok(metadata) => {
            use std::time::UNIX_EPOCH;
            let modified = metadata.modified().ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            let created = metadata.created().ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            Ok(json!({
                "isFile": metadata.is_file(),
                "isDirectory": metadata.is_dir(),
                "size": metadata.len(),
                "modified": modified,
                "created": created,
            }))
        }
        Err(_) => Ok(serde_json::Value::Null),
    }
}
