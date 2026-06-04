use serde_json::json;

pub fn register(_input: serde_json::Value) -> Result<serde_json::Value, String> { Ok(serde_json::Value::Null) }
pub fn unregister(_input: serde_json::Value) -> Result<serde_json::Value, String> { Ok(serde_json::Value::Null) }
pub fn navigate(_input: serde_json::Value) -> Result<serde_json::Value, String> { Ok(serde_json::Value::Null) }
pub fn go_back(_input: serde_json::Value) -> Result<serde_json::Value, String> { Ok(serde_json::Value::Null) }
pub fn go_forward(_input: serde_json::Value) -> Result<serde_json::Value, String> { Ok(serde_json::Value::Null) }
pub fn reload(_input: serde_json::Value) -> Result<serde_json::Value, String> { Ok(serde_json::Value::Null) }
pub fn screenshot(_input: serde_json::Value) -> Result<serde_json::Value, String> { Ok(serde_json::Value::Null) }
pub fn evaluate_js(_input: serde_json::Value) -> Result<serde_json::Value, String> { Ok(serde_json::Value::Null) }
pub fn get_console_logs(_input: serde_json::Value) -> Result<serde_json::Value, String> { Ok(json!([])) }
pub fn open_dev_tools(_input: serde_json::Value) -> Result<serde_json::Value, String> { Ok(serde_json::Value::Null) }
pub fn get_dev_tools_url(_input: serde_json::Value) -> Result<serde_json::Value, String> { Ok(serde_json::Value::Null) }
pub fn get_page_info(_input: serde_json::Value) -> Result<serde_json::Value, String> { Ok(serde_json::Value::Null) }
pub fn clear_browsing_data(_input: serde_json::Value) -> Result<serde_json::Value, String> { Ok(serde_json::Value::Null) }
