# JewelTrackerPro

Jewellery shop inventory, billing, gold/silver weight tracking, and customer dues. Ships as a **desktop app** (Windows and macOS) and can still run as a localhost web app.

## Stack

- **Desktop**: Tauri 2 (Windows NSIS installer, macOS DMG) with a Node sidecar for the existing Express API
- **Frontend**: React 19 + Vite + TypeScript + react-router
- **Backend**: Node.js + Express + Zod (localhost web, or packaged as the desktop sidecar)
- **Database**: SQLite via better-sqlite3

## Prerequisites

- Node.js **20+**
- npm **10+**
- **Desktop builds** need [Rust](https://www.rust-lang.org/tools/install) (`cargo` on your PATH) and the Tauri CLI (`npm install` provides `@tauri-apps/cli`). After installing Rust, open a **new** terminal so `cargo` is on PATH. `npm run tauri:dev` also prepends `%USERPROFILE%\\.cargo\\bin` automatically.
- The Windows sidecar is a Node [single executable](https://nodejs.org/api/single-executable-applications.html) (SEA) plus the `better-sqlite3` N-API prebuild. `pkg` is not used.
- **Windows shop PCs** need 64-bit Windows 10 (1809+) and the [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/). The installer can download it if it is missing.
- **Windows PCs** may also need the [Visual C++ Redistributable](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist) (x64) if Windows reports a missing `VCRUNTIME` DLL
- **macOS installer builds** need Xcode command-line tools
- The Windows installer is produced with the NSIS 3.11 toolchain. `npm run nsis:prepare` (included in `npm run desktop:prepare`) caches it in `%LOCALAPPDATA%\tauri\NSIS` before bundling. Tauri downloads the same tools on its own, but on a slow or filtered GitHub connection that download hits its global HTTP timeout and the bundle fails with ``failed to bundle project: `timeout: global` `` after the app binary has already been compiled.

### Cross-compile the Windows installer from macOS

Tauri does not cross-compile Windows as cleanly as the old Electron packager. On the macOS build machine:

```bash
rustup target add x86_64-pc-windows-msvc
cargo install cargo-xwin
brew install nsis
npm run tauri:build:win
```

If `cargo-xwin` or NSIS fails, build on a Windows machine or a Windows CI runner with the same `npm run tauri:build:win` command.

## Development (browser)

```bash
npm install
npm run dev
```

This starts the Vite frontend at `http://localhost:5173` and the Express API at `http://localhost:3000`. Vite proxies `/api` and `/uploads` to the API.

## Development (desktop)

```bash
npm run tauri:dev
```

This opens a Tauri window on the same Vite + Express process as `npm run dev`. WebView2 GPU is disabled on Windows for older Intel HD graphics.

## Packaged desktop app

```bash
npm run tauri:build      # installer for this OS
npm run tauri:build:win  # Windows NSIS .exe (Windows, or macOS with cargo-xwin)
npm run tauri:build:mac  # macOS .dmg
```

Installers land in `src-tauri/target/release/bundle/` (or `src-tauri/target/<triple>/release/bundle/` for a cross target). Shop data (database, uploads, logs, backups) is stored in the OS user-data folder, not next to the program:

- Windows: `%APPDATA%\JewelTrackerPro\`
- macOS: `~/Library/Application Support/JewelTrackerPro/`

## Production (localhost web)

```bash
npm run build
npm start
```

The Express server serves the built SPA from `dist/` plus the JSON API on `http://localhost:3000`.

## Database

- Web/dev SQLite file: `data/jeweltrackerpro.db` (override with `JEWELTRACKERPRO_DATA_DIR`)
- Desktop: same file name inside the OS user-data folder
- Shop images: `uploads/` under the data directory
- Use **Settings → Backup** to download or restore a `.db` file
- A daily backup is written to `backups/` under the data directory

## Project layout

```
src-tauri/  Tauri 2 desktop shell, sidecar binaries, and installer config
server/     Express API, SQLite, migrations
src/        React frontend
shared/     Types, Zod schemas, billing helpers
```

## Testing

```bash
npm run test:integration   # Vitest — API + SQLite
npm run test:e2e           # Build + Playwright web tests
npm test                   # Both suites
npm run test:tauri-e2e     # Live desktop scenarios (requires npm run tauri:dev)
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Vite + Express with reload |
| `npm run tauri:dev` | Desktop window with Vite hot reload |
| `npm run tauri:build` | Desktop installer for this OS |
| `npm run tauri:build:win` | Windows NSIS installer |
| `npm run tauri:build:mac` | macOS DMG |
| `npm run build` | Build the frontend |
| `npm run start` | Serve the built app and API |
| `npm run lint` | ESLint |
| `npm run test` | Integration + E2E tests |

## Printing

Bills open in a print preview (`/print/cash-bill/:id` and `/print/tax-invoice/:id`). Use the system print dialog to print or save as PDF.
