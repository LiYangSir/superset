use serde_json::json;

pub fn create_or_attach(_input: serde_json::Value) -> Result<serde_json::Value, String> {
    Ok(json!({"sessionId": null, "status": "stub"}))
}
pub fn write(_input: serde_json::Value) -> Result<serde_json::Value, String> { Ok(serde_json::Value::Null) }
pub fn ack_cold_restore(_input: serde_json::Value) -> Result<serde_json::Value, String> { Ok(serde_json::Value::Null) }
pub fn resize(_input: serde_json::Value) -> Result<serde_json::Value, String> { Ok(serde_json::Value::Null) }
pub fn signal(_input: serde_json::Value) -> Result<serde_json::Value, String> { Ok(serde_json::Value::Null) }
pub fn kill(_input: serde_json::Value) -> Result<serde_json::Value, String> { Ok(serde_json::Value::Null) }
pub fn detach(_input: serde_json::Value) -> Result<serde_json::Value, String> { Ok(serde_json::Value::Null) }
pub fn clear_scrollback(_input: serde_json::Value) -> Result<serde_json::Value, String> { Ok(serde_json::Value::Null) }
pub fn list_daemon_sessions() -> Result<serde_json::Value, String> { Ok(json!([])) }
pub fn kill_all_daemon_sessions() -> Result<serde_json::Value, String> { Ok(serde_json::Value::Null) }
pub fn kill_daemon_sessions_for_workspace(_input: serde_json::Value) -> Result<serde_json::Value, String> { Ok(serde_json::Value::Null) }
pub fn clear_terminal_history() -> Result<serde_json::Value, String> { Ok(serde_json::Value::Null) }
pub fn restart_daemon() -> Result<serde_json::Value, String> { Ok(serde_json::Value::Null) }
pub fn get_session(_input: serde_json::Value) -> Result<serde_json::Value, String> { Ok(serde_json::Value::Null) }
pub fn get_workspace_cwd(_input: serde_json::Value) -> Result<serde_json::Value, String> { Ok(serde_json::Value::Null) }
