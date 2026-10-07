//! Keeps the window usable when something the web layer cannot see dies.
//!
//! Two failures end with a blank window and nothing in the logs unless they are
//! handled deliberately:
//!
//! * reloading the window on every renderer crash and clearing the retry
//!   counter whenever a page finishes loading means a page that crashes on load
//!   reloads and crashes forever;
//! * nothing watching the API sidecar means an exit leaves a window that has
//!   lost everything it was served from.
//!
//! Here the reload budget only decays with time, an unrecoverable failure stops
//! looping and shows the reference ID, and the sidecar exit is logged and
//! reported instead of being swallowed.

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, WebviewWindow};

use crate::host_log;

/// Reloads allowed inside [`FAILURE_DECAY`] before the app gives up.
const MAX_AUTO_RELOADS: u32 = 3;
/// A crash-free run this long forgets earlier failures.
const FAILURE_DECAY: Duration = Duration::from_secs(300);
const RELOAD_DELAY: Duration = Duration::from_millis(1500);

#[derive(Default)]
struct GuardState {
    consecutive_failures: u32,
    last_failure: Option<Instant>,
}

/// Remembers how often the renderer had to be recovered recently.
#[derive(Default)]
pub struct RendererGuard(Mutex<GuardState>);

impl RendererGuard {
    #[cfg_attr(not(target_os = "windows"), allow(dead_code))]
    fn register_failure(&self) -> u32 {
        let mut state = match self.0.lock() {
            Ok(state) => state,
            Err(poisoned) => poisoned.into_inner(),
        };
        if state
            .last_failure
            .is_some_and(|at| at.elapsed() >= FAILURE_DECAY)
        {
            state.consecutive_failures = 0;
        }
        state.last_failure = Some(Instant::now());
        state.consecutive_failures += 1;
        state.consecutive_failures
    }
}

/// A dialog the user can act on, used instead of leaving a blank window.
pub fn error_dialog(app: &AppHandle, message: &str) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

    app.dialog()
        .message(message)
        .title("JewelTrackerPro")
        .kind(MessageDialogKind::Error)
        .blocking_show();
}

/// Logs a host failure, preferring the API so it gets a `JTP-ERR-…` reference ID.
fn report(
    api_port: Option<u16>,
    message: &str,
    detail: &str,
    fatal: bool,
) -> String {
    if let Some(port) = api_port {
        if let Some(ack) = host_log::report_to_api(port, message, detail, fatal) {
            return ack.reference_id;
        }
    }
    // The API is down too, so nothing else can log this.
    let data_dir = crate::resolve_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    host_log::log_host_crash(&data_dir, &format!("{message} — {detail}"))
}

/// Watches the WebView2 processes behind the main window.
pub fn attach_renderer_guard(app: &AppHandle, window: &WebviewWindow, api_port: Option<u16>) {
    #[cfg(target_os = "windows")]
    attach_webview2_guard(app, window, api_port);

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, window, api_port);
    }
}

#[cfg(target_os = "windows")]
fn attach_webview2_guard(app: &AppHandle, window: &WebviewWindow, api_port: Option<u16>) {
    use webview2_com::ProcessFailedEventHandler;

    let handle = app.clone();
    let watcher = window.with_webview(move |webview| {
        let controller = webview.controller();
        let Ok(core) = (unsafe { controller.CoreWebView2() }) else {
            return;
        };

        let handler = ProcessFailedEventHandler::create(Box::new(move |_sender, args| {
            let Some(args) = args else {
                return Ok(());
            };
            let failure = describe_failure(&args);
            let handle = handle.clone();
            // Recovery blocks on HTTP and on the reload delay, so keep it away
            // from the WebView2 UI thread.
            std::thread::spawn(move || handle_failure(&handle, api_port, failure));
            Ok(())
        }));

        let mut token = 0_i64;
        let _ = unsafe { core.add_ProcessFailed(&handler, &mut token) };
    });

    if let Err(error) = watcher {
        eprintln!("Could not watch the WebView2 processes: {error}");
    }
}

/// How the app should react to a WebView2 process failure.
enum Recovery {
    /// The browser process is healthy, so reloading the page can recover.
    Reload,
    /// Log it and change nothing. A renderer that is only unresponsive often
    /// recovers by itself, and reloading would discard the bill being typed.
    Observe,
    /// Nothing can be recovered; the whole WebView2 browser process is gone.
    Abort,
}

#[cfg(target_os = "windows")]
struct Failure {
    message: String,
    detail: String,
    recovery: Recovery,
}

#[cfg(target_os = "windows")]
fn describe_failure(args: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2ProcessFailedEventArgs) -> Failure {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2ProcessFailedEventArgs2, COREWEBVIEW2_PROCESS_FAILED_KIND,
        COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED,
        COREWEBVIEW2_PROCESS_FAILED_KIND_FRAME_RENDER_PROCESS_EXITED,
        COREWEBVIEW2_PROCESS_FAILED_KIND_GPU_PROCESS_EXITED,
        COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED,
        COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE,
        COREWEBVIEW2_PROCESS_FAILED_KIND_SANDBOX_HELPER_PROCESS_EXITED,
        COREWEBVIEW2_PROCESS_FAILED_KIND_UTILITY_PROCESS_EXITED,
        COREWEBVIEW2_PROCESS_FAILED_REASON,
    };
    use windows_core::Interface;

    let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND::default();
    let _ = unsafe { args.ProcessFailedKind(&mut kind) };

    // Reason and exit code live on the second revision of the event args, which
    // any WebView2 runtime from 2021 on provides.
    let mut reason = COREWEBVIEW2_PROCESS_FAILED_REASON::default();
    let mut exit_code = 0_i32;
    let (reason, exit_code) = match args.cast::<ICoreWebView2ProcessFailedEventArgs2>().ok() {
        Some(extended) => {
            let reason = unsafe { extended.Reason(&mut reason) }.ok().map(|()| reason);
            let exit = unsafe { extended.ExitCode(&mut exit_code) }
                .ok()
                .map(|()| exit_code);
            (reason, exit)
        }
        None => (None, None),
    };

    let exit = exit_code.map(|code| format!(" (exit {code})")).unwrap_or_default();
    let label = reason.map(reason_label);

    let (message, recovery) =
        if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED {
            (
                format!("Renderer process gone: {}{exit}", label.unwrap_or("exited")),
                Recovery::Reload,
            )
        } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_FRAME_RENDER_PROCESS_EXITED {
            (
                format!("Frame renderer process gone: {}{exit}", label.unwrap_or("exited")),
                Recovery::Reload,
            )
        } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE {
            ("Renderer became unresponsive".to_string(), Recovery::Observe)
        } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED {
            (format!("WebView2 browser process exited{exit}"), Recovery::Abort)
        } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_GPU_PROCESS_EXITED {
            (format!("WebView2 graphics process exited{exit}"), Recovery::Observe)
        } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_UTILITY_PROCESS_EXITED {
            (format!("WebView2 utility process exited{exit}"), Recovery::Observe)
        } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_SANDBOX_HELPER_PROCESS_EXITED {
            (format!("WebView2 sandbox helper exited{exit}"), Recovery::Observe)
        } else {
            (format!("WebView2 process gone (kind {}){exit}", kind.0), Recovery::Observe)
        };

    let detail = format!(
        "kind={} reason={} exitCode={}",
        kind.0,
        label.unwrap_or("unknown"),
        exit_code
            .map(|code| code.to_string())
            .unwrap_or_else(|| "unknown".to_string()),
    );

    Failure { message, detail, recovery }
}

#[cfg(target_os = "windows")]
fn reason_label(reason: webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_PROCESS_FAILED_REASON) -> &'static str {
    use webview2_com::Microsoft::Web::WebView2::Win32::*;

    if reason == COREWEBVIEW2_PROCESS_FAILED_REASON_CRASHED {
        "crashed"
    } else if reason == COREWEBVIEW2_PROCESS_FAILED_REASON_UNRESPONSIVE {
        "unresponsive"
    } else if reason == COREWEBVIEW2_PROCESS_FAILED_REASON_TERMINATED {
        "terminated"
    } else if reason == COREWEBVIEW2_PROCESS_FAILED_REASON_LAUNCH_FAILED {
        "launch-failed"
    } else if reason == COREWEBVIEW2_PROCESS_FAILED_REASON_OUT_OF_MEMORY {
        "out-of-memory"
    } else if reason == COREWEBVIEW2_PROCESS_FAILED_REASON_PROFILE_DELETED {
        "profile-deleted"
    } else {
        "unexpected"
    }
}

#[cfg(target_os = "windows")]
fn handle_failure(app: &AppHandle, api_port: Option<u16>, failure: Failure) {
    // A window closing tears its processes down; that is not a crash.
    if app.state::<crate::Lifecycle>().is_shutting_down() {
        return;
    }

    match failure.recovery {
        Recovery::Observe => {
            let reference_id = report(api_port, &failure.message, &failure.detail, false);
            eprintln!("{} ({reference_id})", failure.message);
        }
        Recovery::Reload => {
            let attempts = app.state::<RendererGuard>().register_failure();
            let exhausted = attempts > MAX_AUTO_RELOADS;
            // Only an unrecovered crash greets the user on the next launch;
            // a crash that the reload recovered should not nag them.
            let reference_id = report(api_port, &failure.message, &failure.detail, exhausted);
            eprintln!("{} ({reference_id})", failure.message);

            if !exhausted {
                std::thread::sleep(RELOAD_DELAY);
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.reload();
                }
                return;
            }

            error_dialog(
                app,
                &format!(
                    "{}\n\nThe window could not be recovered after {MAX_AUTO_RELOADS} reload attempts.\nReference ID: {reference_id}\n\nClose JewelTrackerPro and start it again. Details are saved in the log folder shown under Settings > Data.",
                    failure.message
                ),
            );
        }
        Recovery::Abort => {
            let reference_id = report(api_port, &failure.message, &failure.detail, true);
            error_dialog(
                app,
                &format!(
                    "{}\n\nJewelTrackerPro has to close.\nReference ID: {reference_id}\n\nStart it again to continue; everything already saved is safe.",
                    failure.message
                ),
            );
            crate::stop_sidecar(app);
            app.exit(1);
        }
    }
}

/// Runs when the API sidecar exits. A stopped sidecar means no data and no
/// logging, so this is reported to the user instead of leaving a blank window.
pub fn report_sidecar_exit(app: &AppHandle, code: Option<i32>) {
    if app.state::<crate::Lifecycle>().is_shutting_down() {
        return;
    }
    let message = match code {
        Some(code) => format!("The local API stopped unexpectedly (exit code {code})."),
        None => "The local API stopped unexpectedly.".to_string(),
    };
    let data_dir = crate::resolve_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let reference_id = host_log::log_host_crash(&data_dir, &message);
    eprintln!("{message} ({reference_id})");

    error_dialog(
        app,
        &format!(
            "{message}\n\nJewelTrackerPro has to close because it cannot read or save data without it.\nReference ID: {reference_id}\n\nStart it again to continue; everything already saved is safe."
        ),
    );
    crate::stop_sidecar(app);
    app.exit(1);
}
