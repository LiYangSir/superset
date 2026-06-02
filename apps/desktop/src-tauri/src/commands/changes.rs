use serde_json::json;

fn run_git(path: &str, args: &[&str]) -> Result<String, String> {
    let output = std::process::Command::new("git")
        .args(args)
        .current_dir(path)
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

fn get_path(input: &serde_json::Value) -> &str {
    input.get("worktreePath").and_then(|v| v.as_str())
        .or_else(|| input.get("path").and_then(|v| v.as_str()))
        .or_else(|| input.get("cwd").and_then(|v| v.as_str()))
        .unwrap_or(".")
}

// Branches
pub fn get_branches(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    let output = run_git(path, &["branch", "-a", "--no-color"])?;
    let branches: Vec<serde_json::Value> = output.lines()
        .map(|l| {
            let trimmed = l.trim();
            let is_current = trimmed.starts_with("* ");
            let name = trimmed.trim_start_matches("* ").to_string();
            json!({"name": name, "isCurrent": is_current})
        })
        .filter(|b| !b["name"].as_str().unwrap_or("").is_empty())
        .collect();
    Ok(json!(branches))
}

pub fn switch_branch(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    let branch = input.get("branch").and_then(|v| v.as_str()).unwrap_or("main");
    run_git(path, &["checkout", branch])?;
    Ok(serde_json::Value::Null)
}

pub fn update_base_branch(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let _path = get_path(&input);
    Ok(serde_json::Value::Null)
}

// Status
pub fn get_status(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    let output = run_git(path, &["status", "--porcelain=v1", "-uall", "--no-optional-locks"])?;
    let files: Vec<serde_json::Value> = output.lines()
        .filter(|l| l.len() >= 3)
        .map(|l| {
            let staging = &l[0..1];
            let working = &l[1..2];
            let file_path = l[3..].to_string();
            json!({
                "path": file_path,
                "staging": staging.trim(),
                "working": working.trim(),
            })
        })
        .collect();

    let branch = run_git(path, &["branch", "--show-current"])
        .unwrap_or_default().trim().to_string();

    Ok(json!({
        "files": files,
        "branch": branch,
    }))
}

pub fn get_commit_files(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    let commit = input.get("commit").and_then(|v| v.as_str()).unwrap_or("HEAD");
    let output = run_git(path, &["diff-tree", "--no-commit-id", "-r", "--name-status", commit])?;
    let files: Vec<serde_json::Value> = output.lines()
        .filter_map(|l| {
            let parts: Vec<&str> = l.splitn(2, '\t').collect();
            if parts.len() == 2 {
                Some(json!({"status": parts[0], "path": parts[1]}))
            } else {
                None
            }
        })
        .collect();
    Ok(json!(files))
}

// File contents
pub fn get_file_contents(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    let file = input.get("file").and_then(|v| v.as_str()).unwrap_or("");
    let ref_name = input.get("ref").and_then(|v| v.as_str()).unwrap_or("HEAD");
    let spec = format!("{}:{}", ref_name, file);
    match run_git(path, &["show", &spec]) {
        Ok(content) => Ok(json!(content)),
        Err(_) => Ok(serde_json::Value::Null),
    }
}

pub fn save_file(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let file_path = input.get("filePath").and_then(|v| v.as_str()).unwrap_or("");
    let content = input.get("content").and_then(|v| v.as_str()).unwrap_or("");
    std::fs::write(file_path, content).map_err(|e| e.to_string())?;
    Ok(serde_json::Value::Null)
}

pub fn read_working_file(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    let file = input.get("file").and_then(|v| v.as_str()).unwrap_or("");
    let full_path = std::path::Path::new(path).join(file);
    match std::fs::read_to_string(&full_path) {
        Ok(content) => Ok(json!(content)),
        Err(_) => Ok(serde_json::Value::Null),
    }
}

pub fn read_working_file_image(input: serde_json::Value) -> Result<serde_json::Value, String> {
    use base64::Engine;
    let path = get_path(&input);
    let file = input.get("file").and_then(|v| v.as_str()).unwrap_or("");
    let full_path = std::path::Path::new(path).join(file);
    match std::fs::read(&full_path) {
        Ok(bytes) => {
            let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
            Ok(json!({"base64": encoded}))
        }
        Err(_) => Ok(serde_json::Value::Null),
    }
}

// Staging
pub fn stage_file(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    let file = input.get("file").and_then(|v| v.as_str()).unwrap_or("");
    run_git(path, &["add", file])?;
    Ok(serde_json::Value::Null)
}

pub fn unstage_file(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    let file = input.get("file").and_then(|v| v.as_str()).unwrap_or("");
    run_git(path, &["reset", "HEAD", file])?;
    Ok(serde_json::Value::Null)
}

pub fn discard_changes(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    let file = input.get("file").and_then(|v| v.as_str()).unwrap_or("");
    run_git(path, &["checkout", "--", file])?;
    Ok(serde_json::Value::Null)
}

pub fn stage_files(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    if let Some(files) = input.get("files").and_then(|v| v.as_array()) {
        for f in files {
            if let Some(file) = f.as_str() {
                let _ = run_git(path, &["add", file]);
            }
        }
    }
    Ok(serde_json::Value::Null)
}

pub fn unstage_files(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    if let Some(files) = input.get("files").and_then(|v| v.as_array()) {
        for f in files {
            if let Some(file) = f.as_str() {
                let _ = run_git(path, &["reset", "HEAD", file]);
            }
        }
    }
    Ok(serde_json::Value::Null)
}

pub fn stage_all(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    run_git(path, &["add", "-A"])?;
    Ok(serde_json::Value::Null)
}

pub fn unstage_all(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    run_git(path, &["reset", "HEAD"])?;
    Ok(serde_json::Value::Null)
}

pub fn delete_untracked(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    let file = input.get("file").and_then(|v| v.as_str()).unwrap_or("");
    if file.is_empty() {
        return Err("file path required".to_string());
    }
    let full_path = std::path::Path::new(path).join(file);
    if full_path.is_dir() {
        std::fs::remove_dir_all(&full_path).map_err(|e| e.to_string())?;
    } else {
        std::fs::remove_file(&full_path).map_err(|e| e.to_string())?;
    }
    Ok(serde_json::Value::Null)
}

pub fn discard_all_unstaged(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    run_git(path, &["checkout", "--", "."])?;
    Ok(serde_json::Value::Null)
}

pub fn discard_all_staged(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    run_git(path, &["reset", "HEAD", "--", "."])?;
    run_git(path, &["checkout", "--", "."])?;
    Ok(serde_json::Value::Null)
}

pub fn stash(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    run_git(path, &["stash"])?;
    Ok(serde_json::Value::Null)
}

pub fn stash_include_untracked(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    run_git(path, &["stash", "--include-untracked"])?;
    Ok(serde_json::Value::Null)
}

pub fn stash_pop(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    run_git(path, &["stash", "pop"])?;
    Ok(serde_json::Value::Null)
}

// Git operations
pub fn commit(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    let message = input.get("message").and_then(|v| v.as_str()).unwrap_or("");
    run_git(path, &["commit", "-m", message])?;
    Ok(serde_json::Value::Null)
}

pub fn push(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    let force = input.get("force").and_then(|v| v.as_bool()).unwrap_or(false);
    if force {
        run_git(path, &["push", "--force-with-lease"])?;
    } else {
        run_git(path, &["push"])?;
    }
    Ok(serde_json::Value::Null)
}

pub fn pull(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    run_git(path, &["pull"])?;
    Ok(serde_json::Value::Null)
}

pub fn sync(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    let _ = run_git(path, &["pull"]);
    let _ = run_git(path, &["push"]);
    Ok(serde_json::Value::Null)
}

pub fn fetch(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    run_git(path, &["fetch", "--all", "--prune"])?;
    Ok(serde_json::Value::Null)
}

pub fn create_pr(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    let title = input.get("title").and_then(|v| v.as_str()).unwrap_or("");
    let body = input.get("body").and_then(|v| v.as_str()).unwrap_or("");
    let output = std::process::Command::new("gh")
        .args(["pr", "create", "--title", title, "--body", body])
        .current_dir(path)
        .output()
        .map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(json!({"url": stdout.trim()}))
}

pub fn merge_pr(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    let _ = std::process::Command::new("gh")
        .args(["pr", "merge", "--merge"])
        .current_dir(path)
        .output();
    Ok(serde_json::Value::Null)
}
