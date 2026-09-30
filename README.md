# JewelTrackerPro

Jewellery shop inventory, billing, gold/silver weight tracking, and customer dues. Ships as a **desktop app** (Windows and macOS) and can still run as a localhost web app.

## Stack

- **Desktop**: Electron (Windows NSIS installer, macOS DMG)
- **Frontend**: React 19 + Vite + TypeScript + react-router
- **Backend**: Node.js + Express + Zod (runs inside Electron)
- **Database**: SQLite via better-sqlite3

## Prerequisites

- Node.js **20+**
- npm **10+**
- **Windows installer builds** need Python and Visual Studio Build Tools (C++ workload) so `better-sqlite3` can compile. Run `npm run electron:build:win` **on a Windows PC** — macOS cannot cross-compile the SQLite native addon.
- **Windows PCs running the installed app** need the [Visual C++ Redistributable](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist) (x64) if Windows reports a missing `VCRUNTIME` DLL
- **macOS installer builds** need Xcode command-line tools

## Development (browser)

```bash
npm install
npm run dev
```

This starts the Vite frontend at `http://localhost:5173` and the Express API at `http://localhost:3000`. Vite proxies `/api` and `/uploads` to the API.

## Development (desktop)

```bash
npm run electron:rebuild   # once: rebuild native SQLite for Electron
npm run electron:dev       # Electron window + Vite hot reload
```

`electron:rebuild` compiles `better-sqlite3` for Electron. After that, `npm run dev` / tests may fail until you restore the Node build:

```bash
npm run rebuild:native
```

## Packaged desktop app

```bash
npm run electron:pack      # unpacked app for this OS (fast local test)
npm run electron:build     # installer for this OS
npm run electron:build:win # Windows NSIS .exe (run on Windows)
npm run electron:build:mac # macOS .dmg
```

Installers land in `release/`. Shop data (database, uploads, logs, backups) is stored in the OS user-data folder, not next to the program:

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
electron/   Electron main process and preload
server/     Express API, SQLite, migrations
src/        React frontend
shared/     Types, Zod schemas, billing helpers
```

## Testing

```bash
npm run test:integration   # Vitest — API + SQLite
npm run test:e2e           # Build + Playwright web tests
npm test                   # Both suites
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Vite + Express with reload |
| `npm run electron:dev` | Desktop window with Vite hot reload |
| `npm run electron:pack` | Unpackaged desktop build for this OS |
| `npm run electron:build` | Desktop installer for this OS |
| `npm run build` | Build the frontend |
| `npm start` | Serve the built app and API |
| `npm run lint` | ESLint |
| `npm run test` | Integration + E2E tests |

## Printing

Bills open in a print window (`/print/cash-bill/:id` and `/print/tax-invoice/:id`). Use the print dialog to print or save as PDF.
