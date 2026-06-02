use serde_json::json;

pub fn get_snapshot() -> Result<serde_json::Value, String> {
    let sys = sysinfo::System::new_all();

    let total_memory = sys.total_memory();
    let used_memory = sys.used_memory();
    let cpu_usage: f32 = sys.cpus().iter().map(|c| c.cpu_usage()).sum::<f32>() / sys.cpus().len() as f32;

    Ok(json!({
        "cpu": cpu_usage,
        "memory": {
            "total": total_memory,
            "used": used_memory,
            "percentage": if total_memory > 0 { used_memory as f64 / total_memory as f64 * 100.0 } else { 0.0 }
        },
        "timestamp": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64
    }))
}
