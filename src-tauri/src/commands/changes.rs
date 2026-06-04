use serde_json::json;

const MAX_FILE_SIZE: u64 = 5 * 1024 * 1024; // 5 MB
const MAX_IMAGE_SIZE: u64 = 10 * 1024 * 1024; // 10 MB
const BINARY_CHECK_SIZE: usize = 8192;

fn run_git(path: &str, args: &[&str]) -> Result<String, String> {
    let output = std::process::Command::new("git")
        .args(args)
        .current_dir(path)
        .output()
        .map_err(|e| {
            log::error!("[changes] git {:?} in {:?} spawn error: {}", args, path, e);
            e.to_string()
        })?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        log::warn!("[changes] git {:?} in {:?} failed: {}", args, path, stderr);
        Err(stderr)
    }
}

fn get_path(input: &serde_json::Value) -> &str {
    input.get("worktreePath").and_then(|v| v.as_str()).filter(|s| !s.is_empty())
        .or_else(|| input.get("path").and_then(|v| v.as_str()).filter(|s| !s.is_empty()))
        .or_else(|| input.get("cwd").and_then(|v| v.as_str()).filter(|s| !s.is_empty()))
        .unwrap_or(".")
}

fn get_file_path(input: &serde_json::Value) -> &str {
    input.get("absolutePath").and_then(|v| v.as_str())
        .or_else(|| input.get("filePath").and_then(|v| v.as_str()))
        .or_else(|| input.get("file").and_then(|v| v.as_str()))
        .unwrap_or("")
}

fn is_binary_content(buf: &[u8]) -> bool {
    let check_len = buf.len().min(BINARY_CHECK_SIZE);
    buf[..check_len].contains(&0)
}

// Branches
pub fn get_branches(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    log::info!("[changes.getBranches] worktreePath={:?}", path);

    let current_branch = run_git(path, &["branch", "--show-current"])
        .unwrap_or_default().trim().to_string();

    let default_branch = detect_default_branch(path);

    let local_output = run_git(path, &["for-each-ref", "--format=%(refname:short)\t%(committerdate:unix)", "refs/heads/"]).unwrap_or_default();
    let local: Vec<serde_json::Value> = local_output.lines()
        .filter_map(|l| {
            let parts: Vec<&str> = l.splitn(2, '\t').collect();
            if parts.len() == 2 {
                let date: i64 = parts[1].parse().unwrap_or(0);
                Some(json!({"branch": parts[0], "lastCommitDate": date * 1000}))
            } else {
                None
            }
        })
        .collect();

    let remote_output = run_git(path, &["branch", "-r", "--no-color"]).unwrap_or_default();
    let remote: Vec<String> = remote_output.lines()
        .map(|l| l.trim().to_string())
        .filter(|b| !b.is_empty() && !b.contains("->"))
        .collect();

    let worktree_output = run_git(path, &["worktree", "list", "--porcelain"]).unwrap_or_default();
    let mut checked_out: serde_json::Map<String, serde_json::Value> = serde_json::Map::new();
    let mut current_wt_path = String::new();
    for line in worktree_output.lines() {
        if let Some(wt_path) = line.strip_prefix("worktree ") {
            current_wt_path = wt_path.to_string();
        } else if let Some(branch_ref) = line.strip_prefix("branch refs/heads/") {
            checked_out.insert(branch_ref.to_string(), json!(current_wt_path));
        }
    }

    Ok(json!({
        "local": local,
        "remote": remote,
        "defaultBranch": default_branch,
        "checkedOutBranches": checked_out,
        "worktreeBaseBranch": serde_json::Value::Null,
        "currentBranch": if current_branch.is_empty() { serde_json::Value::Null } else { json!(current_branch) },
    }))
}

fn detect_default_branch(path: &str) -> String {
    if let Ok(output) = run_git(path, &["symbolic-ref", "refs/remotes/origin/HEAD"]) {
        let trimmed = output.trim();
        if let Some(branch) = trimmed.strip_prefix("refs/remotes/origin/") {
            return branch.to_string();
        }
    }
    for candidate in &["main", "master"] {
        if run_git(path, &["rev-parse", "--verify", &format!("refs/heads/{}", candidate)]).is_ok() {
            return candidate.to_string();
        }
    }
    "main".to_string()
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
    log::info!("[changes.getStatus] worktreePath={:?}", path);
    let default_branch = input.get("defaultBranch").and_then(|v| v.as_str()).unwrap_or("main");

    let branch = run_git(path, &["branch", "--show-current"])
        .unwrap_or_default().trim().to_string();

    let output = match run_git(path, &["status", "--porcelain=v1", "-uall"]) {
        Ok(o) => o,
        Err(e) => {
            log::error!("[changes.getStatus] git status failed for {:?}: {}", path, e);
            return Ok(json!({
                "branch": branch,
                "defaultBranch": default_branch,
                "againstBase": [],
                "commits": [],
                "staged": [],
                "unstaged": [],
                "untracked": [],
                "ahead": 0,
                "behind": 0,
                "pushCount": 0,
                "pullCount": 0,
                "hasUpstream": false,
            }));
        }
    };
    let mut staged: Vec<serde_json::Value> = Vec::new();
    let mut unstaged: Vec<serde_json::Value> = Vec::new();
    let mut untracked: Vec<serde_json::Value> = Vec::new();

    for line in output.lines() {
        if line.len() < 3 { continue; }
        let x = line.as_bytes()[0] as char;
        let y = line.as_bytes()[1] as char;
        let rest = &line[3..];

        let (file_path, old_path) = if rest.contains(" -> ") {
            let parts: Vec<&str> = rest.splitn(2, " -> ").collect();
            (parts[1].to_string(), Some(parts[0].to_string()))
        } else {
            (rest.to_string(), None)
        };

        if x == '?' {
            untracked.push(make_changed_file(&file_path, None, "untracked"));
            continue;
        }

        if x != ' ' && x != '?' {
            let status = match x {
                'A' => "added",
                'M' => "modified",
                'D' => "deleted",
                'R' => "renamed",
                'C' => "copied",
                _ => "modified",
            };
            staged.push(make_changed_file(&file_path, old_path.as_deref(), status));
        }

        if y != ' ' && y != '?' {
            let status = match y {
                'M' => "modified",
                'D' => "deleted",
                _ => "modified",
            };
            unstaged.push(make_changed_file(&file_path, None, status));
        }
    }

    apply_numstat(path, &["diff", "--cached", "--numstat"], &mut staged);
    apply_numstat(path, &["diff", "--numstat"], &mut unstaged);

    let mut against_base: Vec<serde_json::Value> = Vec::new();
    let mut commits: Vec<serde_json::Value> = Vec::new();
    let mut ahead: i64 = 0;
    let mut behind: i64 = 0;

    if !branch.is_empty() && branch != default_branch {
        let merge_base_ref = default_branch.to_string();
        if let Ok(merge_base) = run_git(path, &["merge-base", &merge_base_ref, "HEAD"]) {
            let merge_base = merge_base.trim();
            if !merge_base.is_empty() {
                if let Ok(diff_output) = run_git(path, &["diff", "--name-status", merge_base, "HEAD"]) {
                    against_base = parse_name_status(&diff_output);
                    apply_numstat(path, &["diff", "--numstat", merge_base, "HEAD"], &mut against_base);
                }

                let log_format = format!("{}..HEAD", merge_base);
                if let Ok(log_output) = run_git(path, &["log", "--format=%H\t%h\t%s\t%an\t%aI", &log_format]) {
                    commits = log_output.lines()
                        .filter_map(|l| {
                            let parts: Vec<&str> = l.splitn(5, '\t').collect();
                            if parts.len() == 5 {
                                Some(json!({
                                    "hash": parts[0],
                                    "shortHash": parts[1],
                                    "message": parts[2],
                                    "author": parts[3],
                                    "date": parts[4],
                                    "files": [],
                                }))
                            } else {
                                None
                            }
                        })
                        .collect();
                }

                let rev_list_format = format!("{}...HEAD", merge_base_ref);
                if let Ok(count_output) = run_git(path, &["rev-list", "--left-right", "--count", &rev_list_format]) {
                    let parts: Vec<&str> = count_output.trim().split('\t').collect();
                    if parts.len() == 2 {
                        behind = parts[0].parse().unwrap_or(0);
                        ahead = parts[1].parse().unwrap_or(0);
                    }
                }
            }
        }
    }

    let mut push_count: i64 = 0;
    let mut pull_count: i64 = 0;
    let mut has_upstream = false;

    if let Ok(tracking) = run_git(path, &["rev-list", "--left-right", "--count", "@{upstream}...HEAD"]) {
        has_upstream = true;
        let parts: Vec<&str> = tracking.trim().split('\t').collect();
        if parts.len() == 2 {
            pull_count = parts[0].parse().unwrap_or(0);
            push_count = parts[1].parse().unwrap_or(0);
        }
    }

    Ok(json!({
        "branch": branch,
        "defaultBranch": default_branch,
        "againstBase": against_base,
        "commits": commits,
        "staged": staged,
        "unstaged": unstaged,
        "untracked": untracked,
        "ahead": ahead,
        "behind": behind,
        "pushCount": push_count,
        "pullCount": pull_count,
        "hasUpstream": has_upstream,
    }))
}

fn make_changed_file(path: &str, old_path: Option<&str>, status: &str) -> serde_json::Value {
    let mut file = json!({
        "path": path,
        "status": status,
        "additions": 0,
        "deletions": 0,
    });
    if let Some(old) = old_path {
        file.as_object_mut().unwrap().insert("oldPath".to_string(), json!(old));
    }
    file
}

fn apply_numstat(repo_path: &str, args: &[&str], files: &mut Vec<serde_json::Value>) {
    if files.is_empty() { return; }
    if let Ok(output) = run_git(repo_path, args) {
        let mut stats: std::collections::HashMap<String, (i64, i64)> = std::collections::HashMap::new();
        for line in output.lines() {
            let parts: Vec<&str> = line.splitn(3, '\t').collect();
            if parts.len() == 3 {
                let adds: i64 = parts[0].parse().unwrap_or(0);
                let dels: i64 = parts[1].parse().unwrap_or(0);
                let file_path = parts[2].to_string();
                stats.insert(file_path, (adds, dels));
            }
        }
        for file in files.iter_mut() {
            if let Some(path) = file.get("path").and_then(|v| v.as_str()) {
                if let Some(&(adds, dels)) = stats.get(path) {
                    file.as_object_mut().unwrap().insert("additions".to_string(), json!(adds));
                    file.as_object_mut().unwrap().insert("deletions".to_string(), json!(dels));
                }
            }
        }
    }
}

fn parse_name_status(output: &str) -> Vec<serde_json::Value> {
    output.lines()
        .filter_map(|l| {
            let parts: Vec<&str> = l.split('\t').collect();
            if parts.len() < 2 { return None; }
            let status_code = parts[0];
            let status_char = status_code.chars().next().unwrap_or('M');
            let (file_path, old_path) = if (status_char == 'R' || status_char == 'C') && parts.len() >= 3 {
                (parts[2].to_string(), Some(parts[1].to_string()))
            } else {
                (parts[1].to_string(), None)
            };
            let status = match status_char {
                'A' => "added",
                'M' => "modified",
                'D' => "deleted",
                'R' => "renamed",
                'C' => "copied",
                _ => "modified",
            };
            Some(make_changed_file(&file_path, old_path.as_deref(), status))
        })
        .collect()
}

pub fn get_commit_files(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    let commit = input.get("commitHash").and_then(|v| v.as_str())
        .or_else(|| input.get("commit").and_then(|v| v.as_str()))
        .unwrap_or("HEAD");
    let output = run_git(path, &["diff-tree", "--no-commit-id", "-r", "--name-status", commit])?;
    let mut files = parse_name_status(&output);
    if let Ok(numstat) = run_git(path, &["diff-tree", "--no-commit-id", "-r", "--numstat", commit]) {
        let mut stats: std::collections::HashMap<String, (i64, i64)> = std::collections::HashMap::new();
        for line in numstat.lines() {
            let parts: Vec<&str> = line.splitn(3, '\t').collect();
            if parts.len() == 3 {
                let adds: i64 = parts[0].parse().unwrap_or(0);
                let dels: i64 = parts[1].parse().unwrap_or(0);
                stats.insert(parts[2].to_string(), (adds, dels));
            }
        }
        for file in files.iter_mut() {
            if let Some(p) = file.get("path").and_then(|v| v.as_str()) {
                if let Some(&(adds, dels)) = stats.get(p) {
                    file.as_object_mut().unwrap().insert("additions".to_string(), json!(adds));
                    file.as_object_mut().unwrap().insert("deletions".to_string(), json!(dels));
                }
            }
        }
    }
    Ok(json!(files))
}

// File contents — frontend sends { worktreePath, absolutePath, category, ... }
// Returns { original, modified, language } (FileContents interface)
pub fn get_file_contents(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    let absolute_path = get_file_path(&input);
    let old_absolute_path = input.get("oldAbsolutePath").and_then(|v| v.as_str());
    let category = input.get("category").and_then(|v| v.as_str()).unwrap_or("unstaged");
    let commit_hash = input.get("commitHash").and_then(|v| v.as_str());
    let default_branch = input.get("defaultBranch").and_then(|v| v.as_str()).unwrap_or("main");

    let rel_path = to_relative_path(path, absolute_path);
    let old_rel_path = old_absolute_path.map(|p| to_relative_path(path, p));
    let original_path = old_rel_path.as_deref().unwrap_or(&rel_path);

    let (original, modified) = match category {
        "against-base" => {
            let orig = safe_git_show(path, &format!("origin/{}:{}", default_branch, original_path));
            let modif = safe_git_show(path, &format!("HEAD:{}", rel_path));
            (orig, modif)
        }
        "committed" => {
            let hash = commit_hash.unwrap_or("HEAD");
            let orig = safe_git_show(path, &format!("{}^:{}", hash, original_path));
            let modif = safe_git_show(path, &format!("{}:{}", hash, rel_path));
            (orig, modif)
        }
        "staged" => {
            let orig = safe_git_show(path, &format!("HEAD:{}", original_path));
            let modif = safe_git_show(path, &format!(":0:{}", rel_path));
            (orig, modif)
        }
        _ => {
            // unstaged: original from index, modified from working tree
            let mut orig = safe_git_show(path, &format!(":0:{}", original_path));
            if orig.is_empty() {
                orig = safe_git_show(path, &format!("HEAD:{}", original_path));
            }
            let full = std::path::Path::new(path).join(&rel_path);
            let modif = std::fs::read_to_string(&full).unwrap_or_default();
            (orig, modif)
        }
    };

    let language = detect_language_from_path(absolute_path);

    Ok(json!({
        "original": original,
        "modified": modified,
        "language": language,
    }))
}

fn safe_git_show(repo_path: &str, spec: &str) -> String {
    run_git(repo_path, &["show", spec]).unwrap_or_default()
}

fn detect_language_from_path(file_path: &str) -> String {
    let ext = file_path.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "ts" | "tsx" => "typescript",
        "js" | "jsx" | "mjs" | "cjs" => "javascript",
        "html" | "htm" => "html",
        "css" => "css",
        "scss" => "scss",
        "less" => "less",
        "json" => "json",
        "yaml" | "yml" => "yaml",
        "xml" => "xml",
        "toml" => "toml",
        "md" | "mdx" => "markdown",
        "sh" | "bash" | "zsh" | "fish" => "shell",
        "py" => "python",
        "rb" => "ruby",
        "go" => "go",
        "rs" => "rust",
        "java" => "java",
        "kt" => "kotlin",
        "swift" => "swift",
        "c" | "h" => "c",
        "cpp" | "hpp" => "cpp",
        "cs" => "csharp",
        "php" => "php",
        "sql" => "sql",
        "graphql" | "gql" => "graphql",
        _ => "plaintext",
    }.to_string()
}

fn to_relative_path(worktree_path: &str, absolute_path: &str) -> String {
    let normalized_root = worktree_path.trim_end_matches(|c| c == '/' || c == '\\');
    let normalized_file = absolute_path.replace('\\', "/");
    let normalized_root_fwd = normalized_root.replace('\\', "/");

    if normalized_file.starts_with(&format!("{}/", normalized_root_fwd)) {
        normalized_file[normalized_root_fwd.len() + 1..].to_string()
    } else {
        absolute_path.to_string()
    }
}

pub fn save_file(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let file_path = input.get("filePath").and_then(|v| v.as_str())
        .or_else(|| input.get("absolutePath").and_then(|v| v.as_str()))
        .unwrap_or("");
    let content = input.get("content").and_then(|v| v.as_str()).unwrap_or("");
    std::fs::write(file_path, content).map_err(|e| e.to_string())?;
    Ok(json!({ "status": "saved" }))
}

/// Frontend sends { worktreePath, absolutePath }
/// Expects { ok: true, content, truncated, byteLength } or { ok: false, reason }
pub fn read_working_file(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let absolute_path = get_file_path(&input);

    if absolute_path.is_empty() {
        return Ok(json!({ "ok": false, "reason": "not-found" }));
    }

    let path = std::path::Path::new(absolute_path);
    if !path.exists() {
        return Ok(json!({ "ok": false, "reason": "not-found" }));
    }

    let metadata = std::fs::metadata(path).map_err(|_| "Failed to read file metadata".to_string())?;
    if metadata.len() > MAX_FILE_SIZE {
        return Ok(json!({ "ok": false, "reason": "too-large" }));
    }

    match std::fs::read(path) {
        Ok(bytes) => {
            if is_binary_content(&bytes) {
                return Ok(json!({ "ok": false, "reason": "binary" }));
            }
            let content = String::from_utf8_lossy(&bytes).to_string();
            let byte_length = bytes.len();
            Ok(json!({
                "ok": true,
                "content": content,
                "truncated": false,
                "byteLength": byte_length,
            }))
        }
        Err(_) => Ok(json!({ "ok": false, "reason": "not-found" })),
    }
}

/// Frontend sends { worktreePath, absolutePath }
/// Expects { ok: true, dataUrl, byteLength } or { ok: false, reason }
pub fn read_working_file_image(input: serde_json::Value) -> Result<serde_json::Value, String> {
    use base64::Engine;

    let absolute_path = get_file_path(&input);

    if absolute_path.is_empty() {
        return Ok(json!({ "ok": false, "reason": "not-found" }));
    }

    let path = std::path::Path::new(absolute_path);
    if !path.exists() {
        return Ok(json!({ "ok": false, "reason": "not-found" }));
    }

    let ext = path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let mime_type = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "bmp" => "image/bmp",
        "avif" => "image/avif",
        _ => return Ok(json!({ "ok": false, "reason": "not-image" })),
    };

    let metadata = std::fs::metadata(path).map_err(|_| "metadata".to_string())?;
    if metadata.len() > MAX_IMAGE_SIZE {
        return Ok(json!({ "ok": false, "reason": "too-large" }));
    }

    match std::fs::read(path) {
        Ok(bytes) => {
            let byte_length = bytes.len();
            let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
            let data_url = format!("data:{};base64,{}", mime_type, encoded);
            Ok(json!({
                "ok": true,
                "dataUrl": data_url,
                "byteLength": byte_length,
            }))
        }
        Err(_) => Ok(json!({ "ok": false, "reason": "not-found" })),
    }
}

// Staging — frontend sends { worktreePath, filePath }
pub fn stage_file(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    let file = get_file_path(&input);
    let rel = to_relative_path(path, file);
    run_git(path, &["add", &rel])?;
    Ok(serde_json::Value::Null)
}

pub fn unstage_file(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    let file = get_file_path(&input);
    let rel = to_relative_path(path, file);
    run_git(path, &["reset", "HEAD", &rel])?;
    Ok(serde_json::Value::Null)
}

pub fn discard_changes(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    let file = get_file_path(&input);
    let rel = to_relative_path(path, file);
    run_git(path, &["checkout", "--", &rel])?;
    Ok(serde_json::Value::Null)
}

/// Frontend sends { worktreePath, filePaths: string[] }
pub fn stage_files(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    if let Some(files) = input.get("filePaths").and_then(|v| v.as_array()) {
        for f in files {
            if let Some(file) = f.as_str() {
                let rel = to_relative_path(path, file);
                let _ = run_git(path, &["add", &rel]);
            }
        }
    }
    Ok(serde_json::Value::Null)
}

pub fn unstage_files(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    if let Some(files) = input.get("filePaths").and_then(|v| v.as_array()) {
        for f in files {
            if let Some(file) = f.as_str() {
                let rel = to_relative_path(path, file);
                let _ = run_git(path, &["reset", "HEAD", &rel]);
            }
        }
    }
    Ok(serde_json::Value::Null)
}

pub fn stage_all(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    run_git(path, &["add", "-A"])?;
    Ok(json!({ "success": true }))
}

pub fn unstage_all(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    run_git(path, &["reset", "HEAD"])?;
    Ok(json!({ "success": true }))
}

pub fn delete_untracked(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    let file = get_file_path(&input);
    if file.is_empty() {
        return Err("file path required".to_string());
    }
    let rel = to_relative_path(path, file);
    let full_path = std::path::Path::new(path).join(&rel);
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
    Ok(json!({ "success": true }))
}

pub fn discard_all_staged(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = get_path(&input);
    run_git(path, &["reset", "HEAD", "--", "."])?;
    run_git(path, &["checkout", "--", "."])?;
    Ok(json!({ "success": true }))
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
