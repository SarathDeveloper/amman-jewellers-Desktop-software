#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod host_log;
mod recovery;

use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, FilePath};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// The running API sidecar.
#[derive(Default)]
struct SidecarState {
    child: Mutex<Option<CommandChild>>,
}

/// Set once the app is on its way out, so an in-flight process exit or renderer
/// failure is not mistaken for a crash.
#[derive(Default)]
struct Lifecycle {
    shutting_down: AtomicBool,
}

impl Lifecycle {
    fn begin_shutdown(&self) {
        self.shutting_down.store(true, Ordering::SeqCst);
    }

    fn is_shutting_down(&self) -> bool {
        self.shutting_down.load(Ordering::SeqCst)
    }
}

/// Stops the API sidecar without reporting it as a failure.
fn stop_sidecar(app: &AppHandle) {
    app.state::<Lifecycle>().begin_shutdown();
    let child = {
        let state = app.state::<SidecarState>();
        let mut slot = match state.child.lock() {
            Ok(slot) => slot,
            Err(poisoned) => poisoned.into_inner(),
        };
        slot.take()
    };
    if let Some(child) = child {
        let _ = child.kill();
    }
}

/// Whether this machine asked for the conservative graphics path.
#[cfg(target_os = "windows")]
fn safe_graphics_requested() -> bool {
    match std::env::var("JEWELTRACKERPRO_SAFE_GRAPHICS") {
        Ok(value) => value.trim() == "1" || value.trim().eq_ignore_ascii_case("true"),
        Err(_) => false,
    }
}

/// Extra WebView2 switches for Windows.
///
/// GPU acceleration is left enabled. Switching off the GPU *and* the software
/// rasterizer removes both accelerators, which is a known way to end up with
/// blank pages and dead renderers, especially on low-end laptops. A machine
/// whose graphics driver misbehaves can opt in with
/// `JEWELTRACKERPRO_SAFE_GRAPHICS=1` instead of penalising every machine.
#[cfg(target_os = "windows")]
fn windows_browser_args() -> String {
    let mut args = String::from("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection");
    if safe_graphics_requested() {
        args.push_str(" --disable-gpu --disable-software-rasterizer");
    }
    args
}

#[derive(Serialize)]
struct DesktopExportResult {
    canceled: bool,
    #[serde(rename = "filePath")]
    file_path: Option<String>,
}

fn parse_api_port(line: &str) -> Option<u16> {
    let marker = "http://127.0.0.1:";
    let start = line.find(marker)? + marker.len();
    let digits: String = line[start..]
        .chars()
        .take_while(|ch| ch.is_ascii_digit())
        .collect();
    digits.parse().ok()
}

fn poll_api_ready(port: u16) -> bool {
    let request = format!(
        "GET /api/version HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    );
    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(800)));
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut buf = [0_u8; 64];
    match stream.read(&mut buf) {
        Ok(n) if n > 0 => String::from_utf8_lossy(&buf[..n]).contains("200"),
        _ => false,
    }
}

fn wait_for_api(port: u16) -> Result<(), String> {
    for _ in 0..40 {
        if poll_api_ready(port) {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    Err(format!(
        "The local API did not become ready on http://127.0.0.1:{port}/api/version"
    ))
}

fn sqlite_addon_name() -> &'static str {
    if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "better-sqlite3-win32-x64.node"
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "better-sqlite3-darwin-arm64.node"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "better-sqlite3-darwin-x64.node"
    } else {
        "better-sqlite3-linux-x64.node"
    }
}

fn resolve_data_dir() -> Result<PathBuf, String> {
    let dir = dirs::data_dir()
        .ok_or_else(|| "Could not resolve the application data directory".to_string())?
        .join("JewelTrackerPro");
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn first_existing(candidates: impl IntoIterator<Item = PathBuf>) -> Option<PathBuf> {
    candidates.into_iter().find(|path| path.exists())
}

fn looks_like_app_root(dir: &PathBuf) -> bool {
    dir.join("package.json").exists() && dir.join("dist").exists()
}

fn resolve_resource_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .resolve("", BaseDirectory::Resource)
        .or_else(|_| app.path().resource_dir())
        .map_err(|error| error.to_string())
}

fn resolve_app_root(resource_dir: &PathBuf) -> Result<PathBuf, String> {
    [resource_dir.clone(), resource_dir.join("resources")]
        .into_iter()
        .find(looks_like_app_root)
        .ok_or_else(|| {
            format!(
                "Packaged app files are missing (package.json + dist) under {}",
                resource_dir.display()
            )
        })
}

fn resolve_migrations_dir(resource_dir: &PathBuf, app_root: &PathBuf) -> Result<PathBuf, String> {
    first_existing([
        app_root.join("migrations"),
        resource_dir.join("migrations"),
        resource_dir.join("resources").join("migrations"),
    ])
    .filter(|dir| dir.join("001_initial.sql").exists())
    .ok_or_else(|| "Packaged SQL migrations are missing".to_string())
}

fn resolve_sqlite_addon(resource_dir: &PathBuf) -> Result<PathBuf, String> {
    let name = sqlite_addon_name();
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(PathBuf::from));
    let mut candidates = vec![
        resource_dir.join(name),
        resource_dir.join("binaries").join(name),
        resource_dir.join("resources").join(name),
    ];
    if let Some(dir) = exe_dir {
        candidates.push(dir.join(name));
        candidates.push(dir.join("resources").join(name));
    }
    first_existing(candidates)
        .ok_or_else(|| format!("SQLite native addon missing ({name})"))
}

fn configure_desktop_env(app: &AppHandle) -> Result<(), String> {
    let data_dir = resolve_data_dir()?;
    let resource_dir = resolve_resource_dir(app)?;
    let app_root = resolve_app_root(&resource_dir)?;
    let migrations = resolve_migrations_dir(&resource_dir, &app_root)?;
    let sqlite_addon = resolve_sqlite_addon(&resource_dir)?;

    std::env::set_var("JEWELTRACKERPRO_SIDECAR", "1");
    std::env::set_var("JEWELTRACKERPRO_DATA_DIR", &data_dir);
    std::env::set_var("JEWELTRACKERPRO_APP_ROOT", &app_root);
    std::env::set_var("JEWELTRACKERPRO_MIGRATIONS_DIR", migrations);
    std::env::set_var("JEWELTRACKERPRO_SQLITE_ADDON", sqlite_addon);
    Ok(())
}

fn sidecar_env_pairs() -> Vec<(String, String)> {
    ["JEWELTRACKERPRO_SIDECAR", "JEWELTRACKERPRO_DATA_DIR", "JEWELTRACKERPRO_APP_ROOT", "JEWELTRACKERPRO_MIGRATIONS_DIR", "JEWELTRACKERPRO_SQLITE_ADDON"]
        .into_iter()
        .filter_map(|key| std::env::var(key).ok().map(|value| (key.to_string(), value)))
        .collect()
}

async fn start_sidecar(app: &AppHandle) -> Result<u16, String> {
    configure_desktop_env(app)?;
    let command = app
        .shell()
        .sidecar("jeweltrackerpro-api")
        .map_err(|error| error.to_string())?
        .envs(sidecar_env_pairs());
    let (mut rx, child) = command.spawn().map_err(|error| error.to_string())?;
    if let Ok(mut slot) = app.state::<SidecarState>().child.lock() {
        *slot = Some(child);
    }

    let mut port = None;
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                let text = String::from_utf8_lossy(&line);
                if port.is_none() {
                    if let Some(found) = parse_api_port(&text) {
                        port = Some(found);
                        break;
                    }
                }
            }
            CommandEvent::Terminated(payload) => {
                return Err(format!(
                    "The local API sidecar exited before it was ready (code {:?})",
                    payload.code
                ));
            }
            CommandEvent::Error(error) => return Err(error),
            _ => {}
        }
    }

    let port = port.ok_or_else(|| "The local API sidecar did not report a port".to_string())?;
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let CommandEvent::Terminated(payload) = event {
                recovery::report_sidecar_exit(&handle, payload.code);
                break;
            }
        }
    });
    wait_for_api(port)?;
    Ok(port)
}

fn open_main_window(app: &AppHandle, url: &str, api_port: Option<u16>) -> Result<(), String> {
    let parsed = url.parse().map_err(|error| format!("{error}"))?;
    let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(parsed))
        .title("JewelTrackerPro")
        .inner_size(1280.0, 840.0)
        .min_inner_size(1024.0, 700.0)
        .visible(false)
        .initialization_script(include_str!("desktop_api.js"));

    #[cfg(target_os = "windows")]
    {
        let args = windows_browser_args();
        builder = builder.additional_browser_args(&args);
    }

    #[cfg(debug_assertions)]
    {
        builder = builder.devtools(true);
    }

    let window = builder.build().map_err(|error| error.to_string())?;
    // Watch the WebView2 processes so a renderer that dies is logged and
    // recovered instead of leaving a blank window.
    recovery::attach_renderer_guard(app, &window, api_port);
    window.show().map_err(|error| error.to_string())?;
    Ok(())
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Increments for each native print window so a reused label never collides.
static PRINT_WINDOW_SEQ: AtomicU32 = AtomicU32::new(0);

#[tauri::command]
fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
async fn choose_backup_folder(app: AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let picked = app.dialog().file().blocking_pick_folder();
        match picked {
            Some(FilePath::Path(path)) => Ok(Some(path.to_string_lossy().into_owned())),
            Some(FilePath::Url(url)) => Ok(Some(url.to_string())),
            None => Ok(None),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn choose_backup_path(
    app: AppHandle,
    default_filename: String,
    filter_name: Option<String>,
    extension: Option<String>,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let filter = filter_name.unwrap_or_else(|| "SQLite database".to_string());
        let ext = extension.unwrap_or_else(|| "db".to_string());
        let picked = app
            .dialog()
            .file()
            .add_filter(&filter, &[ext.as_str()])
            .set_file_name(&default_filename)
            .blocking_save_file();
        match picked {
            Some(FilePath::Path(path)) => Ok(Some(path.to_string_lossy().into_owned())),
            Some(FilePath::Url(url)) => Ok(Some(url.to_string())),
            None => Ok(None),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
fn write_backup_file(path: String, bytes: Vec<u8>) -> Result<DesktopExportResult, String> {
    std::fs::write(&path, bytes).map_err(|error| error.to_string())?;
    Ok(DesktopExportResult {
        canceled: false,
        file_path: Some(path),
    })
}

/// Opens a `/print/*` route in its own native window so it can be printed
/// through the webview's own print panel. macOS (WKWebView) does not reliably
/// honour `iframe.contentWindow.print()`, which the in-app preview relies on.
#[tauri::command]
async fn open_print_window(app: AppHandle, path: String) -> Result<(), String> {
    if !path.starts_with("/print/")
        || path.contains("..")
        || path.contains('\n')
        || path.contains('\r')
    {
        return Err("Invalid print path".to_string());
    }

    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "The main window is not available".to_string())?;
    let origin = main
        .url()
        .map_err(|error| error.to_string())?
        .origin()
        .ascii_serialization();
    let url = format!("{origin}{path}");
    let parsed = url.parse().map_err(|error| format!("{error}"))?;

    // Only one print window at a time; a second Print click replaces it.
    for (label, window) in app.webview_windows() {
        if label.starts_with("print-") {
            let _ = window.close();
        }
    }

    let label = format!("print-{}", PRINT_WINDOW_SEQ.fetch_add(1, Ordering::SeqCst) + 1);
    let script = format!(
        "window.__JTP_DESKTOP_PRINT__ = true;\n{}",
        include_str!("desktop_api.js")
    );
    WebviewWindowBuilder::new(&app, label, WebviewUrl::External(parsed))
        .title("Print")
        .inner_size(1024.0, 800.0)
        .initialization_script(script)
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
}

/// Prints a print window through the native webview print panel.
#[tauri::command]
fn print_webview(window: WebviewWindow) -> Result<(), String> {
    window.print().map_err(|error| error.to_string())
}

fn main() {
    #[cfg(target_os = "windows")]
    {
        // WebView2 applies this variable to every environment it creates, so
        // keep the same policy as the window below and never overwrite a value
        // an operator set deliberately.
        if std::env::var_os("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").is_none() {
            std::env::set_var(
                "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
                windows_browser_args(),
            );
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            focus_main_window(app);
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SidecarState::default())
        .manage(Lifecycle::default())
        .manage(recovery::RendererGuard::default())
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            choose_backup_path,
            choose_backup_folder,
            write_backup_file,
            open_print_window,
            print_webview
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let (url, api_port) = if cfg!(debug_assertions) {
                    ("http://127.0.0.1:5173".to_string(), None)
                } else {
                    match start_sidecar(&handle).await {
                        Ok(port) => (format!("http://127.0.0.1:{port}"), Some(port)),
                        Err(error) => {
                            eprintln!("{error}");
                            let _ = handle.exit(1);
                            return;
                        }
                    }
                };
                if let Err(error) = open_main_window(&handle, &url, api_port) {
                    eprintln!("{error}");
                    let _ = handle.exit(1);
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build JewelTrackerPro")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                stop_sidecar(app);
            }
        });
}
