import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourceAddon = join(root, 'src-tauri', 'binaries', 'better-sqlite3-win32-x64.node')
const sourceSidecar = join(root, 'src-tauri', 'binaries', 'jeweltrackerpro-api-x86_64-pc-windows-msvc.exe')
const packagedCandidates = [
  join(root, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release', 'better-sqlite3-win32-x64.node'),
  join(root, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release', 'resources', 'better-sqlite3-win32-x64.node'),
  join(root, 'src-tauri', 'target', 'release', 'better-sqlite3-win32-x64.node'),
  join(root, 'src-tauri', 'target', 'release', 'resources', 'better-sqlite3-win32-x64.node'),
]

const mode = process.argv.includes('--packaged') ? 'packaged' : 'source'

function fail(message) {
  console.error(message)
  process.exit(1)
}

function assertWindowsAddon(path, label) {
  if (!existsSync(path)) {
    fail(`${label} is missing:\n  ${path}`)
  }
  const header = readFileSync(path).subarray(0, 2).toString('binary')
  if (header !== 'MZ') {
    fail(
      `${label} is not a Windows PE binary (expected MZ header):\n  ${path}\nRebuild the sidecar so node_modules/better-sqlite3/prebuilds/win32-x64.node is copied.`,
    )
  }
  console.log(`OK ${label}: ${path}`)
}

if (mode === 'source') {
  if (!existsSync(join(root, 'sidecar-dist', 'jeweltrackerpro-api.cjs'))) {
    fail('sidecar-dist/jeweltrackerpro-api.cjs is missing. Run npm run sidecar:build first.')
  }
  assertWindowsAddon(sourceAddon, 'better-sqlite3 win32-x64 sidecar addon')
  if (existsSync(sourceSidecar)) {
    assertWindowsAddon(sourceSidecar, 'Windows sidecar executable')
  }
  process.exit(0)
}

const packagedAddon = packagedCandidates.find((path) => existsSync(path))
if (!packagedAddon) {
  fail(
    `Windows SQLite native addon was not packaged.\nLooked for:\n${packagedCandidates.map((path) => `  ${path}`).join('\n')}`,
  )
}
assertWindowsAddon(packagedAddon, 'packaged Windows SQLite addon')
