#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, FilePath};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

struct SidecarState(Mutex<Option<CommandChild>>);

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
    if let Ok(mut slot) = app.state::<SidecarState>().0.lock() {
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
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            if matches!(event, CommandEvent::Terminated(_)) {
                break;
            }
        }
    });
    wait_for_api(port)?;
    Ok(port)
}

fn open_main_window(app: &AppHandle, url: &str) -> Result<(), String> {
    let parsed = url.parse().map_err(|error| format!("{error}"))?;
    let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(parsed))
        .title("JewelTrackerPro")
        .inner_size(1280.0, 840.0)
        .min_inner_size(1024.0, 700.0)
        .visible(false)
        .initialization_script(include_str!("desktop_api.js"));

    #[cfg(target_os = "windows")]
    {
        builder = builder.additional_browser_args(
            "--disable-gpu --disable-software-rasterizer --disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection",
        );
    }

    #[cfg(debug_assertions)]
    {
        builder = builder.devtools(true);
    }

    let window = builder.build().map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;
    Ok(())
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

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

fn main() {
    #[cfg(target_os = "windows")]
    {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--disable-gpu --disable-software-rasterizer",
        );
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            focus_main_window(app);
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SidecarState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            choose_backup_path,
            choose_backup_folder,
            write_backup_file
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let url = if cfg!(debug_assertions) {
                    "http://127.0.0.1:5173".to_string()
                } else {
                    match start_sidecar(&handle).await {
                        Ok(port) => format!("http://127.0.0.1:{port}"),
                        Err(error) => {
                            eprintln!("{error}");
                            let _ = handle.exit(1);
                            return;
                        }
                    }
                };
                if let Err(error) = open_main_window(&handle, &url) {
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
                if let Ok(mut slot) = app.state::<SidecarState>().0.lock() {
                    if let Some(child) = slot.take() {
                        let _ = child.kill();
                    }
                }
            }
        });
}
