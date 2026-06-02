use serde_json::json;

pub fn get_service_info(_input: serde_json::Value) -> Result<serde_json::Value, String> {
    Ok(json!({"status": "ready"}))
}

pub fn read_directory(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = input.get("path").and_then(|v| v.as_str()).unwrap_or(".");
    let dir_path = std::path::Path::new(path);

    let entries = std::fs::read_dir(dir_path).map_err(|e| e.to_string())?;
    let mut items: Vec<serde_json::Value> = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') && !input.get("showHidden").and_then(|v| v.as_bool()).unwrap_or(false) {
            continue;
        }
        items.push(json!({
            "name": name,
            "path": entry.path().to_string_lossy(),
            "isDirectory": metadata.is_dir(),
            "isFile": metadata.is_file(),
            "size": metadata.len(),
        }));
    }

    items.sort_by(|a, b| {
        let a_dir = a["isDirectory"].as_bool().unwrap_or(false);
        let b_dir = b["isDirectory"].as_bool().unwrap_or(false);
        b_dir.cmp(&a_dir).then(a["name"].as_str().unwrap_or("").cmp(b["name"].as_str().unwrap_or("")))
    });

    Ok(json!(items))
}

pub fn search_files(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = input.get("path").and_then(|v| v.as_str()).unwrap_or(".");
    let query = input.get("query").and_then(|v| v.as_str()).unwrap_or("");
    if query.is_empty() {
        return Ok(json!([]));
    }

    let output = std::process::Command::new("find")
        .args([path, "-name", &format!("*{}*", query), "-maxdepth", "5", "-not", "-path", "*/node_modules/*", "-not", "-path", "*/.git/*"])
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let results: Vec<serde_json::Value> = stdout.lines()
        .take(50)
        .map(|l| json!({"path": l, "name": std::path::Path::new(l).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default()}))
        .collect();

    Ok(json!(results))
}

pub fn search_files_multi(input: serde_json::Value) -> Result<serde_json::Value, String> {
    search_files(input)
}

pub fn search_keyword(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = input.get("path").and_then(|v| v.as_str()).unwrap_or(".");
    let query = input.get("query").and_then(|v| v.as_str()).unwrap_or("");
    if query.is_empty() {
        return Ok(json!([]));
    }

    let output = std::process::Command::new("grep")
        .args(["-rn", "--include=*.{ts,tsx,js,jsx,rs,py,go,java,c,cpp,h}", "-l", query, path])
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let results: Vec<serde_json::Value> = stdout.lines()
        .take(50)
        .map(|l| json!({"path": l}))
        .collect();

    Ok(json!(results))
}

pub fn create_file(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = input.get("path").and_then(|v| v.as_str()).unwrap_or("");
    let content = input.get("content").and_then(|v| v.as_str()).unwrap_or("");
    if let Some(parent) = std::path::Path::new(path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(serde_json::Value::Null)
}

pub fn create_directory(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = input.get("path").and_then(|v| v.as_str()).unwrap_or("");
    std::fs::create_dir_all(path).map_err(|e| e.to_string())?;
    Ok(serde_json::Value::Null)
}

pub fn rename(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let from = input.get("from").and_then(|v| v.as_str()).unwrap_or("");
    let to = input.get("to").and_then(|v| v.as_str()).unwrap_or("");
    std::fs::rename(from, to).map_err(|e| e.to_string())?;
    Ok(serde_json::Value::Null)
}

pub fn delete_path(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = input.get("path").and_then(|v| v.as_str()).unwrap_or("");
    let p = std::path::Path::new(path);
    if p.is_dir() {
        std::fs::remove_dir_all(p).map_err(|e| e.to_string())?;
    } else {
        std::fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(serde_json::Value::Null)
}

pub fn move_path(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let from = input.get("from").and_then(|v| v.as_str()).unwrap_or("");
    let to = input.get("to").and_then(|v| v.as_str()).unwrap_or("");
    std::fs::rename(from, to).map_err(|e| e.to_string())?;
    Ok(serde_json::Value::Null)
}

pub fn copy_path(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let from = input.get("from").and_then(|v| v.as_str()).unwrap_or("");
    let to = input.get("to").and_then(|v| v.as_str()).unwrap_or("");
    std::fs::copy(from, to).map_err(|e| e.to_string())?;
    Ok(serde_json::Value::Null)
}

pub fn exists(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = input.get("path").and_then(|v| v.as_str()).unwrap_or("");
    Ok(serde_json::Value::Bool(std::path::Path::new(path).exists()))
}

pub fn stat(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = input.get("path").and_then(|v| v.as_str()).unwrap_or("");
    let metadata = std::fs::metadata(path).map_err(|e| e.to_string())?;
    Ok(json!({
        "isFile": metadata.is_file(),
        "isDirectory": metadata.is_dir(),
        "size": metadata.len(),
    }))
}
