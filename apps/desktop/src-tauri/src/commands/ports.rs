use serde_json::json;

pub fn get_all() -> Result<serde_json::Value, String> {
    Ok(json!([]))
}

pub fn kill(_input: serde_json::Value) -> Result<serde_json::Value, String> {
    Ok(serde_json::Value::Null)
}
