mod input;
mod pty;
mod renderer;
mod terminal;

use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use raw_window_handle::{HasDisplayHandle, HasWindowHandle};
use serde_json::json;
use tauri::Manager;

use self::pty::PtyProcess;
use self::renderer::WgpuRenderer;
use self::terminal::TerminalState;

struct NativeTerminal {
    renderer: Mutex<WgpuRenderer>,
    state: Mutex<TerminalState>,
    pty: Mutex<PtyProcess>,
    dirty: Arc<AtomicBool>,
    #[allow(dead_code)]
    shutdown: Arc<AtomicBool>,
}

static TERMINAL: std::sync::OnceLock<Arc<NativeTerminal>> = std::sync::OnceLock::new();

pub fn open(
    _input: serde_json::Value,
    app: &tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    if TERMINAL.get().is_some() {
        return Ok(json!({"status": "already_open"}));
    }

    let home = dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "/".to_string());

    let resource_path = app
        .path()
        .resolve("resources/terminal.html", tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("resolve resource: {}", e))?;

    let url = format!("file://{}", resource_path.display());

    let window = tauri::WebviewWindowBuilder::new(
        app,
        "native-terminal",
        tauri::WebviewUrl::External(url.parse().map_err(|e| format!("parse url: {}", e))?),
    )
    .title("Terminal — Native GPU")
    .inner_size(900.0, 600.0)
    .min_inner_size(400.0, 200.0)
    .transparent(true)
    .build()
    .map_err(|e| format!("create window: {}", e))?;

    let phys_size = window
        .inner_size()
        .unwrap_or(tauri::PhysicalSize::new(900u32, 600u32));
    let width = phys_size.width;
    let height = phys_size.height;

    let window_handle = window
        .window_handle()
        .map_err(|e| format!("window handle: {}", e))?
        .as_raw();
    let display_handle = window
        .display_handle()
        .map_err(|e| format!("display handle: {}", e))?
        .as_raw();

    let renderer = unsafe { WgpuRenderer::new(window_handle, display_handle, width, height) };

    let (cols, rows) = renderer.grid_size();

    let dirty = Arc::new(AtomicBool::new(true));
    let shutdown = Arc::new(AtomicBool::new(false));

    let state = TerminalState::new(cols, rows, dirty.clone());
    let pty = PtyProcess::spawn(cols, rows, &home).map_err(|e| format!("spawn pty: {}", e))?;

    let reader = pty.take_reader().map_err(|e| format!("pty reader: {}", e))?;

    let terminal = Arc::new(NativeTerminal {
        renderer: Mutex::new(renderer),
        state: Mutex::new(state),
        pty: Mutex::new(pty),
        dirty: dirty.clone(),
        shutdown: shutdown.clone(),
    });

    TERMINAL.set(terminal.clone()).map_err(|_| "already set")?;

    let term_ref = terminal.clone();
    let shutdown_r = shutdown.clone();
    std::thread::Builder::new()
        .name("pty-reader".into())
        .spawn(move || {
            pty_reader_loop(reader, &term_ref, &shutdown_r);
        })
        .map_err(|e| format!("spawn reader: {}", e))?;

    let term_ref = terminal.clone();
    let shutdown_rr = shutdown.clone();
    let dirty_r = dirty.clone();
    std::thread::Builder::new()
        .name("gpu-render".into())
        .spawn(move || {
            render_loop(&term_ref, &dirty_r, &shutdown_rr);
        })
        .map_err(|e| format!("spawn renderer: {}", e))?;

    let shutdown_close = shutdown.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            shutdown_close.store(true, Ordering::Relaxed);
        }
    });

    Ok(json!({"status": "opened", "cols": cols, "rows": rows}))
}

pub fn handle_key(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let terminal = TERMINAL.get().ok_or("no terminal")?;

    let key = input.get("key").and_then(|v| v.as_str()).unwrap_or("");
    let code = input.get("code").and_then(|v| v.as_str()).unwrap_or("");
    let ctrl = input.get("ctrl").and_then(|v| v.as_bool()).unwrap_or(false);
    let alt = input.get("alt").and_then(|v| v.as_bool()).unwrap_or(false);
    let shift = input.get("shift").and_then(|v| v.as_bool()).unwrap_or(false);
    let meta = input.get("meta").and_then(|v| v.as_bool()).unwrap_or(false);

    let effective_ctrl = ctrl || meta;

    if let Some(bytes) = input::key_to_bytes(key, code, effective_ctrl, alt, shift) {
        let mut pty = terminal.pty.lock().map_err(|e| e.to_string())?;
        pty.write_all(&bytes).map_err(|e| e.to_string())?;
    }

    Ok(serde_json::Value::Null)
}

pub fn handle_resize(input: serde_json::Value) -> Result<serde_json::Value, String> {
    let terminal = TERMINAL.get().ok_or("no terminal")?;

    let width = input
        .get("width")
        .and_then(|v| v.as_u64())
        .unwrap_or(900) as u32;
    let height = input
        .get("height")
        .and_then(|v| v.as_u64())
        .unwrap_or(600) as u32;

    let mut renderer = terminal.renderer.lock().map_err(|e| e.to_string())?;
    renderer.resize(width, height);
    let (cols, rows) = renderer.grid_size();
    drop(renderer);

    let mut state = terminal.state.lock().map_err(|e| e.to_string())?;
    state.resize(cols, rows);
    drop(state);

    let pty = terminal.pty.lock().map_err(|e| e.to_string())?;
    let _ = pty.resize(cols, rows);

    terminal.dirty.store(true, Ordering::Relaxed);

    Ok(json!({"cols": cols, "rows": rows}))
}

fn pty_reader_loop(
    mut reader: std::fs::File,
    terminal: &NativeTerminal,
    shutdown: &AtomicBool,
) {
    let mut buf = [0u8; 32768];
    loop {
        if shutdown.load(Ordering::Relaxed) {
            break;
        }
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                if let Ok(mut state) = terminal.state.lock() {
                    state.feed(&buf[..n]);
                }
                terminal.dirty.store(true, Ordering::Relaxed);
            }
            Err(e) => {
                if e.raw_os_error() == Some(5) {
                    break;
                }
                log::error!("PTY read error: {}", e);
                break;
            }
        }
    }
}

fn render_loop(terminal: &NativeTerminal, dirty: &AtomicBool, shutdown: &AtomicBool) {
    loop {
        if shutdown.load(Ordering::Relaxed) {
            break;
        }

        if dirty.swap(false, Ordering::Relaxed) {
            let state = terminal.state.lock();
            let renderer = terminal.renderer.lock();
            if let (Ok(state), Ok(mut renderer)) = (state, renderer) {
                let content = state.renderable_content();
                renderer.render(content);
            }
        }

        std::thread::sleep(std::time::Duration::from_millis(8));
    }
}
