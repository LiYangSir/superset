use std::collections::HashMap;

use serde_json::json;
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

use crate::AppState;

fn collect_process_tree(sys: &System, root_pid: Pid) -> (f64, u64) {
    let mut cpu = 0.0f64;
    let mut mem = 0u64;

    if let Some(process) = sys.process(root_pid) {
        cpu += process.cpu_usage() as f64;
        mem += process.memory();
    }

    for (_pid, process) in sys.processes() {
        if process.parent() == Some(root_pid) {
            let (child_cpu, child_mem) = collect_process_tree(sys, process.pid());
            cpu += child_cpu;
            mem += child_mem;
        }
    }

    (cpu, mem)
}

pub fn get_snapshot(state: &AppState) -> Result<serde_json::Value, String> {
    let mut sys = System::new_all();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::everything(),
    );

    let total_memory = sys.total_memory();
    let free_memory = sys.free_memory();
    let used_memory = total_memory.saturating_sub(free_memory);
    let cpu_count = sys.cpus().len().max(1);
    let load_avg = System::load_average();

    let app_pid = Pid::from_u32(std::process::id());
    let (app_cpu, app_memory) = collect_process_tree(&sys, app_pid);

    let mut workspace_map: HashMap<String, (Vec<serde_json::Value>, f64, u64)> = HashMap::new();

    if let Ok(sessions) = state.terminals.lock() {
        for (pane_id, session) in sessions.iter() {
            let pid = session.child.id();
            let (sess_cpu, sess_mem) = collect_process_tree(&sys, Pid::from_u32(pid));

            let workspace_id = if session.workspace_id.is_empty() {
                "unknown".to_string()
            } else {
                session.workspace_id.clone()
            };

            let entry = workspace_map
                .entry(workspace_id.clone())
                .or_insert_with(|| (Vec::new(), 0.0, 0));
            entry.0.push(json!({
                "sessionId": pane_id,
                "paneId": pane_id,
                "pid": pid,
                "cpu": sess_cpu,
                "memory": sess_mem
            }));
            entry.1 += sess_cpu;
            entry.2 += sess_mem;
        }
    }

    let mut workspaces = Vec::new();
    for (workspace_id, (sessions, ws_cpu, ws_mem)) in &workspace_map {
        let (project_id, project_name, workspace_name) =
            resolve_workspace_info(state, workspace_id);

        workspaces.push(json!({
            "workspaceId": workspace_id,
            "projectId": project_id,
            "projectName": project_name,
            "workspaceName": workspace_name,
            "cpu": ws_cpu,
            "memory": ws_mem,
            "sessions": sessions
        }));
    }

    let workspace_cpu_total: f64 = workspace_map.values().map(|(_, c, _)| c).sum();
    let workspace_mem_total: u64 = workspace_map.values().map(|(_, _, m)| m).sum();

    let total_cpu = app_cpu + workspace_cpu_total;
    let total_mem = app_memory + workspace_mem_total;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;

    Ok(json!({
        "app": {
            "cpu": app_cpu,
            "memory": app_memory,
            "main": { "cpu": app_cpu, "memory": app_memory },
            "renderer": { "cpu": 0, "memory": 0 },
            "other": { "cpu": 0, "memory": 0 }
        },
        "workspaces": workspaces,
        "host": {
            "totalMemory": total_memory,
            "freeMemory": free_memory,
            "usedMemory": used_memory,
            "memoryUsagePercent": if total_memory > 0 { used_memory as f64 / total_memory as f64 * 100.0 } else { 0.0 },
            "cpuCoreCount": cpu_count,
            "loadAverage1m": load_avg.one
        },
        "totalCpu": total_cpu,
        "totalMemory": total_mem,
        "collectedAt": now
    }))
}

fn resolve_workspace_info(state: &AppState, workspace_id: &str) -> (String, String, String) {
    if workspace_id == "unknown" || workspace_id.is_empty() {
        return (
            "unknown".to_string(),
            "Unknown Project".to_string(),
            "Unknown Workspace".to_string(),
        );
    }

    let db = match state.db.lock() {
        Ok(db) => db,
        Err(_) => {
            return (
                "unknown".to_string(),
                "Unknown Project".to_string(),
                "Unknown Workspace".to_string(),
            )
        }
    };

    let result: Option<(String, String, String)> = db
        .conn
        .query_row(
            "SELECT w.project_id, COALESCE(p.name, 'Unknown Project'), COALESCE(w.name, 'Unknown Workspace')
             FROM workspaces w
             LEFT JOIN projects p ON p.id = w.project_id
             WHERE w.id = ?1",
            rusqlite::params![workspace_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .ok();

    result.unwrap_or_else(|| {
        (
            "unknown".to_string(),
            "Unknown Project".to_string(),
            "Unknown Workspace".to_string(),
        )
    })
}
