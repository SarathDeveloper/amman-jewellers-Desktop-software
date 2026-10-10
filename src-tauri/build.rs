use std::fs;
use std::path::Path;

/// Copy only when the addon is missing or the prebuild is newer.
/// An unconditional copy updates the file time, and `tauri dev` watches
/// `binaries/`, so that rewrite starts a second `cargo` run while the first
/// is still copying the sidecar exe (Windows error 5, access denied).
fn addon_needs_copy(from: &Path, to: &Path) -> bool {
    let Ok(src) = fs::metadata(from) else {
        return false;
    };
    let Ok(dst) = fs::metadata(to) else {
        return true;
    };
    if src.len() != dst.len() {
        return true;
    }
    match (src.modified(), dst.modified()) {
        (Ok(src_modified), Ok(dst_modified)) => src_modified > dst_modified,
        _ => false,
    }
}

fn ensure_sqlite_addons() {
    let prebuilds = Path::new("../node_modules/better-sqlite3/prebuilds");
    let dest = Path::new("binaries");
    let _ = fs::create_dir_all(dest);
    let addons = [
        ("win32-x64.node", "better-sqlite3-win32-x64.node"),
        ("darwin-arm64.node", "better-sqlite3-darwin-arm64.node"),
        ("darwin-x64.node", "better-sqlite3-darwin-x64.node"),
        ("linux-x64.node", "better-sqlite3-linux-x64.node"),
    ];
    for (source_name, dest_name) in addons {
        let from = prebuilds.join(source_name);
        let to = dest.join(dest_name);
        if from.exists() && addon_needs_copy(&from, &to) {
            let _ = fs::copy(from, to);
        }
    }
}

fn main() {
    ensure_sqlite_addons();
    tauri_build::build();
}
