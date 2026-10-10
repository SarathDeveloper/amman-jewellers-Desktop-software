import { spawn, spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, readSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const mode = process.argv.includes('--packaged') ? 'packaged' : 'source'
const isMac = process.argv.includes('--mac')

function fail(message) {
  console.error(message)
  process.exit(1)
}

function readLeadingBytes(path, length) {
  const fd = openSync(path, 'r')
  try {
    const buffer = Buffer.alloc(length)
    readSync(fd, buffer, 0, length, 0)
    return buffer
  } finally {
    closeSync(fd)
  }
}

// --- Windows -----------------------------------------------------------------

const sourceAddon = join(root, 'src-tauri', 'binaries', 'better-sqlite3-win32-x64.node')
const sourceSidecar = join(root, 'src-tauri', 'binaries', 'jeweltrackerpro-api-x86_64-pc-windows-msvc.exe')
// `tauri build` copies `binaries/*.node` resources next to the built app, keeping the
// subdirectory from tauri.conf.json. These mirror resolve_sqlite_addon() in
// src-tauri/src/main.rs, which probes <resource>/binaries, <resource>/resources and the
// executable's own directory, for both the --target and the default output folders.
const packagedCandidates = [
  join(root, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release'),
  join(root, 'src-tauri', 'target', 'release'),
].flatMap((targetDir) => [
  join(targetDir, 'binaries', 'better-sqlite3-win32-x64.node'),
  join(targetDir, 'resources', 'better-sqlite3-win32-x64.node'),
  join(targetDir, 'better-sqlite3-win32-x64.node'),
])

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

// --- macOS (Apple Silicon, ad-hoc signed) ------------------------------------

const macTriple = 'aarch64-apple-darwin'
const macAddonName = 'better-sqlite3-darwin-arm64.node'
const sourceMacSidecar = join(root, 'src-tauri', 'binaries', `jeweltrackerpro-api-${macTriple}`)
const sourceMacAddon = join(root, 'src-tauri', 'binaries', macAddonName)
const macAppBundle = join(
  root,
  'src-tauri',
  'target',
  macTriple,
  'release',
  'bundle',
  'macos',
  'JewelTrackerPro.app',
)

// Thin 64-bit little-endian Mach-O (arm64) and a universal (fat) binary.
const MACHO_MAGIC = new Set(['cffaedfe', 'cafebabe'])

function assertMachO(path, label) {
  if (!existsSync(path)) {
    fail(`${label} is missing:\n  ${path}`)
  }
  const magic = readLeadingBytes(path, 4).toString('hex')
  if (!MACHO_MAGIC.has(magic)) {
    fail(
      `${label} is not a Mach-O binary (expected cffaedfe arm64 or cafebabe universal):\n  ${path}\nMagic: ${magic}`,
    )
  }
  console.log(`OK ${label}: ${path}`)
}

function codesignVerify(target, label, deep) {
  if (process.platform !== 'darwin') {
    console.log(`SKIP ${label}: codesign is macOS-only`)
    return
  }
  const args = ['--verify', '--strict']
  if (deep) {
    args.push('--deep')
  }
  args.push(target)
  const result = spawnSync('codesign', args, { stdio: 'pipe' })
  if (result.status !== 0) {
    const detail = result.stderr?.toString().trim()
    fail(`${label} failed codesign verification${detail ? `:\n${detail}` : ''}\n  ${target}`)
  }
  console.log(`OK ${label}: codesign verified`)
}

async function waitForPort(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      reject(new Error(`timed out after ${timeoutMs}ms waiting for the API port`))
    }, timeoutMs)
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
      const match = stdout.match(/http:\/\/127\.0\.0\.1:(\d+)/)
      if (match) {
        clearTimeout(timer)
        resolve(Number(match[1]))
      }
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('exit', (code, signal) => {
      clearTimeout(timer)
      const suffix = signal ? `, signal ${signal}` : ''
      const detail = stderr.trim() ? `\n${stderr.trim()}` : ''
      reject(new Error(`sidecar exited before it was ready (code ${code}${suffix})${detail}`))
    })
  })
}

function stopChild(child) {
  if (!child || child.exitCode !== null) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    const done = setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL')
      }
      resolve()
    }, 3000)
    child.once('exit', () => {
      clearTimeout(done)
      resolve()
    })
    child.kill('SIGTERM')
  })
}

// Launches the packaged sidecar and speaks to it the way the app does: wait for
// the reported port, require GET /api/version to answer 200, then stop it. This
// is the check that catches a "killed at launch" code-signing failure, which
// otherwise only shows up on the shop Mac.
async function smokeTestSidecar({ label, executable, appRoot, migrationsDir, sqliteAddon }) {
  if (process.platform !== 'darwin') {
    console.log(`SKIP ${label} smoke test: macOS-only`)
    return
  }
  const dataDir = mkdtempSync(join(tmpdir(), 'jtp-mac-verify-'))
  const child = spawn(executable, [], {
    env: {
      ...process.env,
      JEWELTRACKERPRO_SIDECAR: '1',
      JEWELTRACKERPRO_DATA_DIR: dataDir,
      JEWELTRACKERPRO_APP_ROOT: appRoot,
      JEWELTRACKERPRO_MIGRATIONS_DIR: migrationsDir,
      JEWELTRACKERPRO_SQLITE_ADDON: sqliteAddon,
      PORT: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  try {
    const port = await waitForPort(child, 30000)
    const response = await fetch(`http://127.0.0.1:${port}/api/version`)
    if (!response.ok) {
      throw new Error(`GET /api/version returned HTTP ${response.status}`)
    }
    console.log(`OK ${label} smoke test: responds on 127.0.0.1:${port}`)
  } catch (error) {
    await stopChild(child)
    rmSync(dataDir, { recursive: true, force: true })
    fail(`${label} smoke test failed: ${error.message}`)
  }
  await stopChild(child)
  rmSync(dataDir, { recursive: true, force: true })
}

// --- Entry point -------------------------------------------------------------

async function main() {
  if (mode === 'source') {
    if (!existsSync(join(root, 'sidecar-dist', 'jeweltrackerpro-api.cjs'))) {
      fail('sidecar-dist/jeweltrackerpro-api.cjs is missing. Run npm run sidecar:build first.')
    }
    if (isMac) {
      assertMachO(sourceMacSidecar, 'macOS sidecar executable')
      assertMachO(sourceMacAddon, 'better-sqlite3 darwin-arm64 sidecar addon')
      codesignVerify(sourceMacSidecar, 'macOS sidecar executable', false)
    } else if (process.platform === 'win32') {
      assertWindowsAddon(sourceAddon, 'better-sqlite3 win32-x64 sidecar addon')
      if (existsSync(sourceSidecar)) {
        assertWindowsAddon(sourceSidecar, 'Windows sidecar executable')
      }
    }
    return
  }

  if (isMac) {
    if (!existsSync(macAppBundle)) {
      fail(`macOS app bundle is missing:\n  ${macAppBundle}`)
    }
    const macosDir = join(macAppBundle, 'Contents', 'MacOS')
    const resourcesDir = join(macAppBundle, 'Contents', 'Resources')
    const appRoot = join(resourcesDir, 'resources')
    const members = [
      [join(macosDir, 'jeweltrackerpro-api'), 'Packaged macOS sidecar'],
      [join(resourcesDir, 'binaries', macAddonName), 'Packaged macOS SQLite addon'],
      [join(appRoot, 'dist', 'print.html'), 'Packaged print document'],
      [join(appRoot, 'package.json'), 'Packaged app manifest'],
    ]
    for (const [path, label] of members) {
      if (!existsSync(path)) {
        fail(`${label} is missing:\n  ${path}`)
      }
      console.log(`OK ${label}: ${path}`)
    }
    codesignVerify(macAppBundle, 'Packaged macOS app bundle', true)
    await smokeTestSidecar({
      label: 'Packaged macOS sidecar',
      executable: join(macosDir, 'jeweltrackerpro-api'),
      appRoot,
      migrationsDir: join(appRoot, 'migrations'),
      sqliteAddon: join(resourcesDir, 'binaries', macAddonName),
    })
    return
  }

  const packagedAddon = packagedCandidates.find((path) => existsSync(path))
  if (!packagedAddon) {
    fail(
      `Windows SQLite native addon was not packaged.\nLooked for:\n${packagedCandidates.map((path) => `  ${path}`).join('\n')}`,
    )
  }
  assertWindowsAddon(packagedAddon, 'packaged Windows SQLite addon')
}

main().catch((error) => {
  fail(`Sidecar verification failed: ${error.message}`)
})
