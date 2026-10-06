use std::fs;
use std::path::Path;

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
        if from.exists() {
            let _ = fs::copy(from, dest.join(dest_name));
        }
    }
}

fn main() {
    ensure_sqlite_addons();
    tauri_build::build();
}
