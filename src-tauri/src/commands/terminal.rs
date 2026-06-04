use std::fs::File;
use std::io::{Read, Write};
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
use std::os::unix::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};

use serde_json::json;
use tauri::Emitter;

use crate::AppState;

const SCROLLBACK_BUFFER_CAP: usize = 256 * 1024;

struct ScrollbackBuffer {
    buf: Vec<u8>,
}

impl ScrollbackBuffer {
    fn new() -> Self {
        Self { buf: Vec::with_capacity(32 * 1024) }
    }

    fn push(&mut self, data: &[u8]) {
        self.buf.extend_from_slice(data);
        if self.buf.len() > SCROLLBACK_BUFFER_CAP {
            let excess = self.buf.len() - SCROLLBACK_BUFFER_CAP;
            self.buf.drain(..excess);
        }
    }

    fn snapshot(&self) -> String {
        String::from_utf8_lossy(&self.buf).into_owned()
    }
}

pub(crate) struct TerminalSession {
    writer: File,
    master_fd: OwnedFd,
    pub(crate) child: std::process::Child,
    pub(crate) workspace_id: String,
    scrollback: Arc<Mutex<ScrollbackBuffer>>,
}

fn open_pty(rows: u16, cols: u16) -> std::io::Result<(OwnedFd, OwnedFd)> {
    let mut master: libc::c_int = 0;
    let mut slave: libc::c_int = 0;
    let mut ws = libc::winsize {
        ws_row: rows,
        ws_col: cols,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    let ret = unsafe {
        libc::openpty(
            &mut master,
            &mut slave,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            &mut ws,
        )
    };
    if ret != 0 {
        return Err(std::io::Error::last_os_error());
    }
    unsafe { Ok((OwnedFd::from_raw_fd(master), OwnedFd::from_raw_fd(slave))) }
}

fn resize_pty(fd: &OwnedFd, rows: u16, cols: u16) -> std::io::Result<()> {
    let ws = libc::winsize {
        ws_row: rows,
        ws_col: cols,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    let ret = unsafe { libc::ioctl(fd.as_raw_fd(), libc::TIOCSWINSZ, &ws) };
    if ret != 0 {
        return Err(std::io::Error::last_os_error());
    }
    Ok(())
}

pub fn create_or_attach(
    input: serde_json::Value,
    state: &AppState,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let pane_id = input
        .get("paneId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let workspace_id = input
        .get("workspaceId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let cols = input.get("cols").and_then(|v| v.as_u64()).unwrap_or(80) as u16;
    let rows = input.get("rows").and_then(|v| v.as_u64()).unwrap_or(24) as u16;
    let cwd_input = input
        .get("cwd")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    {
        let sessions = state.terminals.lock().map_err(|e| e.to_string())?;
        if let Some(session) = sessions.get(&pane_id) {
            let _ = resize_pty(&session.master_fd, rows, cols);
            let scrollback = session.scrollback.lock()
                .map(|sb| sb.snapshot())
                .unwrap_or_default();
            return Ok(json!({
                "paneId": pane_id,
                "isNew": false,
                "scrollback": scrollback,
                "wasRecovered": true,
                "isColdRestore": false,
            }));
        }
    }

    let home = dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "/".to_string());

    let cwd = cwd_input
        .or_else(|| resolve_workspace_cwd(state, workspace_id))
        .unwrap_or_else(|| home.clone());

    let cwd = if std::path::Path::new(&cwd).is_dir() {
        cwd
    } else {
        home
    };

    let (master, slave) = open_pty(rows, cols).map_err(|e| format!("openpty: {}", e))?;

    let master_for_read = master.try_clone().map_err(|e| format!("dup master read: {}", e))?;
    let master_for_write = master.try_clone().map_err(|e| format!("dup master write: {}", e))?;

    let slave_stdin = slave.try_clone().map_err(|e| format!("dup slave: {}", e))?;
    let slave_stdout = slave.try_clone().map_err(|e| format!("dup slave: {}", e))?;
    let slave_stderr = slave;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());

    let child = unsafe {
        Command::new(&shell)
            .arg("-l")
            .stdin(Stdio::from(slave_stdin))
            .stdout(Stdio::from(slave_stdout))
            .stderr(Stdio::from(slave_stderr))
            .env("TERM", "xterm-256color")
            .current_dir(&cwd)
            .pre_exec(|| {
                libc::setsid();
                libc::ioctl(0, libc::TIOCSCTTY as libc::c_ulong, 0);
                Ok(())
            })
            .spawn()
            .map_err(|e| format!("spawn shell: {}", e))?
    };

    let scrollback = Arc::new(Mutex::new(ScrollbackBuffer::new()));
    let scrollback_writer = Arc::clone(&scrollback);

    let app_clone = app.clone();
    let pid = pane_id.clone();
    std::thread::spawn(move || {
        let mut reader = File::from(master_for_read);
        read_pty_output(&mut reader, &app_clone, &pid, &scrollback_writer);
    });

    let session = TerminalSession {
        writer: File::from(master_for_write),
        master_fd: master,
        child,
        workspace_id: workspace_id.to_string(),
        scrollback,
    };
    state
        .terminals
        .lock()
        .map_err(|e| e.to_string())?
        .insert(pane_id.clone(), session);

    Ok(json!({
        "paneId": pane_id,
        "isNew": true,
        "scrollback": "",
        "wasRecovered": false,
        "isColdRestore": false,
    }))
}

fn resolve_workspace_cwd(state: &AppState, workspace_id: &str) -> Option<String> {
    if workspace_id.is_empty() {
        return None;
    }
    let db = state.db.lock().ok()?;
    let project_id: String = db
        .conn
        .query_row(
            "SELECT project_id FROM workspaces WHERE id = ?1",
            rusqlite::params![workspace_id],
            |row| row.get(0),
        )
        .ok()?;
    db.conn
        .query_row(
            "SELECT main_repo_path FROM projects WHERE id = ?1",
            rusqlite::params![project_id],
            |row| row.get::<_, Option<String>>(0),
        )
        .ok()
        .flatten()
}

fn utf8_safe_split(buf: &[u8]) -> usize {
    if buf.is_empty() {
        return 0;
    }
    let len = buf.len();
    // Walk backwards up to 3 bytes to find a complete UTF-8 boundary
    for i in 1..=3.min(len) {
        let byte = buf[len - i];
        if byte < 0x80 {
            return len;
        }
        // Leading byte of a multi-byte sequence
        if byte >= 0xC0 {
            let expected_len = if byte < 0xE0 {
                2
            } else if byte < 0xF0 {
                3
            } else {
                4
            };
            if i < expected_len {
                // Incomplete sequence at end — split before it
                return len - i;
            }
            return len;
        }
        // Continuation byte (0x80..0xBF) — keep walking back
    }
    len
}

fn flush_batch(
    batch: &mut Vec<u8>,
    app: &tauri::AppHandle,
    event_name: &str,
    scrollback: &Arc<Mutex<ScrollbackBuffer>>,
) {
    let safe_end = utf8_safe_split(batch);
    if safe_end == 0 {
        return;
    }
    if let Ok(mut sb) = scrollback.lock() {
        sb.push(&batch[..safe_end]);
    }
    let data = String::from_utf8_lossy(&batch[..safe_end]).into_owned();
    let _ = app.emit(event_name, json!({"type": "data", "data": data}));
    // Keep incomplete trailing bytes for next batch
    if safe_end < batch.len() {
        let remainder = batch[safe_end..].to_vec();
        batch.clear();
        batch.extend_from_slice(&remainder);
    } else {
        batch.clear();
    }
}

fn read_pty_output(
    reader: &mut File,
    app: &tauri::AppHandle,
    pane_id: &str,
    scrollback: &Arc<Mutex<ScrollbackBuffer>>,
) {
    use std::io::ErrorKind;
    use std::sync::mpsc;
    use std::time::{Duration, Instant};

    const FLUSH_INTERVAL: Duration = Duration::from_millis(16);
    const MAX_BATCH_BYTES: usize = 128 * 1024;

    let event_name = format!("trpc_sub:terminal/stream:{}", pane_id);

    let (tx, rx) = mpsc::channel::<Vec<u8>>();

    let app_clone = app.clone();
    let event_name_clone = event_name.clone();
    let scrollback_clone = Arc::clone(scrollback);
    std::thread::spawn(move || {
        let mut batch = Vec::with_capacity(MAX_BATCH_BYTES);
        let mut last_flush = Instant::now();

        loop {
            let timeout = FLUSH_INTERVAL.saturating_sub(last_flush.elapsed());
            match rx.recv_timeout(timeout) {
                Ok(chunk) => {
                    if chunk.is_empty() {
                        if !batch.is_empty() {
                            if let Ok(mut sb) = scrollback_clone.lock() {
                                sb.push(&batch);
                            }
                            let data = String::from_utf8_lossy(&batch).into_owned();
                            batch.clear();
                            let _ = app_clone.emit(
                                &event_name_clone,
                                json!({"type": "data", "data": data}),
                            );
                        }
                        let _ = app_clone.emit(
                            &event_name_clone,
                            json!({"type": "exit", "exitCode": 0, "reason": "exited"}),
                        );
                        break;
                    }
                    batch.extend_from_slice(&chunk);
                    if batch.len() >= MAX_BATCH_BYTES {
                        flush_batch(&mut batch, &app_clone, &event_name_clone, &scrollback_clone);
                        last_flush = Instant::now();
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    if !batch.is_empty() {
                        flush_batch(&mut batch, &app_clone, &event_name_clone, &scrollback_clone);
                    }
                    last_flush = Instant::now();
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    if !batch.is_empty() {
                        if let Ok(mut sb) = scrollback_clone.lock() {
                            sb.push(&batch);
                        }
                        let data = String::from_utf8_lossy(&batch).into_owned();
                        batch.clear();
                        let _ = app_clone.emit(
                            &event_name_clone,
                            json!({"type": "data", "data": data}),
                        );
                    }
                    break;
                }
            }
        }
    });

    let mut buf = [0u8; 32768];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => {
                let _ = tx.send(Vec::new());
                break;
            }
            Ok(n) => {
                let _ = tx.send(buf[..n].to_vec());
            }
            Err(e) => {
                if e.kind() == ErrorKind::Other || e.raw_os_error() == Some(5) {
                    let _ = tx.send(Vec::new());
                } else {
                    log::error!("PTY read error ({}): {}", pane_id, e);
                    let _ = app.emit(
                        &event_name,
                        json!({"type": "error", "error": e.to_string()}),
                    );
                }
                break;
            }
        }
    }
}

pub fn write(input: serde_json::Value, state: &AppState) -> Result<serde_json::Value, String> {
    let pane_id = input
        .get("paneId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let data = input.get("data").and_then(|v| v.as_str()).unwrap_or("");

    let mut sessions = state.terminals.lock().map_err(|e| e.to_string())?;
    if let Some(session) = sessions.get_mut(pane_id) {
        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
        session.writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(serde_json::Value::Null)
}

pub fn ack_cold_restore(_input: serde_json::Value) -> Result<serde_json::Value, String> {
    Ok(serde_json::Value::Null)
}

pub fn resize(input: serde_json::Value, state: &AppState) -> Result<serde_json::Value, String> {
    let pane_id = input
        .get("paneId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let cols = input.get("cols").and_then(|v| v.as_u64()).unwrap_or(80) as u16;
    let rows = input.get("rows").and_then(|v| v.as_u64()).unwrap_or(24) as u16;

    let sessions = state.terminals.lock().map_err(|e| e.to_string())?;
    if let Some(session) = sessions.get(pane_id) {
        resize_pty(&session.master_fd, rows, cols).map_err(|e| e.to_string())?;
    }
    Ok(serde_json::Value::Null)
}

pub fn signal(
    _input: serde_json::Value,
    _state: &AppState,
) -> Result<serde_json::Value, String> {
    Ok(serde_json::Value::Null)
}

pub fn kill(input: serde_json::Value, state: &AppState) -> Result<serde_json::Value, String> {
    let pane_id = input
        .get("paneId")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let mut sessions = state.terminals.lock().map_err(|e| e.to_string())?;
    if let Some(mut session) = sessions.remove(pane_id) {
        let _ = session.child.kill();
    }
    Ok(serde_json::Value::Null)
}

pub fn detach(
    _input: serde_json::Value,
    _state: &AppState,
) -> Result<serde_json::Value, String> {
    Ok(serde_json::Value::Null)
}

pub fn clear_scrollback(input: serde_json::Value, state: &AppState) -> Result<serde_json::Value, String> {
    let pane_id = input
        .get("paneId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let sessions = state.terminals.lock().map_err(|e| e.to_string())?;
    if let Some(session) = sessions.get(pane_id) {
        if let Ok(mut sb) = session.scrollback.lock() {
            sb.buf.clear();
        }
    }
    Ok(serde_json::Value::Null)
}

pub fn list_daemon_sessions() -> Result<serde_json::Value, String> {
    Ok(json!({"sessions": []}))
}

pub fn kill_all_daemon_sessions() -> Result<serde_json::Value, String> {
    Ok(json!({"killedCount": 0, "remainingCount": 0}))
}

pub fn kill_daemon_sessions_for_workspace(
    _input: serde_json::Value,
) -> Result<serde_json::Value, String> {
    Ok(json!({"killedCount": 0}))
}

pub fn clear_terminal_history() -> Result<serde_json::Value, String> {
    Ok(json!({"success": true}))
}

pub fn restart_daemon() -> Result<serde_json::Value, String> {
    Ok(serde_json::Value::Null)
}

pub fn get_session(
    input: serde_json::Value,
    state: &AppState,
) -> Result<serde_json::Value, String> {
    let pane_id = input
        .as_str()
        .or_else(|| input.get("paneId").and_then(|v| v.as_str()))
        .unwrap_or("");

    let sessions = state.terminals.lock().map_err(|e| e.to_string())?;
    if sessions.contains_key(pane_id) {
        Ok(json!({"paneId": pane_id, "alive": true}))
    } else {
        Ok(serde_json::Value::Null)
    }
}

pub fn get_workspace_cwd(
    input: serde_json::Value,
    state: &AppState,
) -> Result<serde_json::Value, String> {
    let workspace_id = input.as_str().unwrap_or("");
    match resolve_workspace_cwd(state, workspace_id) {
        Some(path) => Ok(serde_json::Value::String(path)),
        None => Ok(serde_json::Value::Null),
    }
}
