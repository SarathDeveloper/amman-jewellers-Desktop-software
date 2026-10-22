import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cargoBin = join(homedir(), '.cargo', 'bin')
const cargoExe = join(cargoBin, process.platform === 'win32' ? 'cargo.exe' : 'cargo')
const tauriCli = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tauri.cmd' : 'tauri')
const homebrewLlvmBins = [
  '/opt/homebrew/opt/llvm/bin',
  '/opt/homebrew/opt/lld/bin',
  '/usr/local/opt/llvm/bin',
  '/usr/local/opt/lld/bin',
]
const homebrewBins = ['/opt/homebrew/bin', '/usr/local/bin']

function fail(message) {
  console.error(message)
  process.exit(1)
}

function argValue(args, flag) {
  const index = args.indexOf(flag)
  if (index === -1) {
    return null
  }
  return args[index + 1] ?? null
}

function commandOnPath(command, pathValue) {
  const result = spawnSync('which', [command], {
    env: { ...process.env, PATH: pathValue },
    encoding: 'utf8',
  })
  return result.status === 0 && Boolean(result.stdout?.trim())
}

const pathValue = [
  ...homebrewLlvmBins.filter((dir) => existsSync(dir)),
  ...homebrewBins.filter((dir) => existsSync(dir)),
  cargoBin,
  join(root, 'node_modules', '.bin'),
  process.env.PATH ?? process.env.Path ?? '',
].join(delimiter)

const env = {
  ...process.env,
  PATH: pathValue,
  Path: pathValue,
}

if (!existsSync(cargoExe)) {
  fail(
    'Rust/Cargo is not installed. Install it from https://www.rust-lang.org/tools/install then open a new terminal and run npm run tauri:dev again.',
  )
}

if (!existsSync(tauriCli)) {
  fail('The Tauri CLI is missing. Run npm install and try again.')
}

const args = process.argv.slice(2)
const isBuild = args[0] === 'build'
const target = argValue(args, '--target')
const isWindowsMsvc = target === 'x86_64-pc-windows-msvc'

const sidecarName =
  process.platform === 'darwin'
    ? 'jeweltrackerpro-api-aarch64-apple-darwin'
    : 'jeweltrackerpro-api-x86_64-pc-windows-msvc.exe'
const sidecarPath = join(root, 'src-tauri', 'binaries', sidecarName)
if (!existsSync(sidecarPath)) {
  fail(
    `The API sidecar is missing at src-tauri/binaries/${sidecarName}.\nRun: npm run sidecar:package\nThen run npm run tauri:dev again.`,
  )
}

// tauri.conf.json lists packaged resource paths. cargo requires them to exist
// even for `tauri dev`, which serves Vite and never reads these copies.
const resourceDist = join(root, 'src-tauri', 'resources', 'dist')
const resourceMigrations = join(root, 'src-tauri', 'resources', 'migrations')
if (!isBuild) {
  mkdirSync(resourceDist, { recursive: true })
  mkdirSync(resourceMigrations, { recursive: true })
} else if (!existsSync(resourceDist)) {
  fail('src-tauri/resources/dist is missing. Run: npm run desktop:prepare')
}

if (isBuild && isWindowsMsvc && process.platform !== 'win32') {
  const cargoXwin = join(cargoBin, 'cargo-xwin')
  if (!existsSync(cargoXwin) && !commandOnPath('cargo-xwin', pathValue)) {
    fail(
      'cargo-xwin is required to build the Windows installer from this Mac.\nRun: npm run tauri:setup:win-cross',
    )
  }
  if (!commandOnPath('makensis', pathValue)) {
    fail(
      'makensis (NSIS) is required to bundle the Windows installer from this Mac.\nRun: npm run tauri:setup:win-cross',
    )
  }
  if (!commandOnPath('llvm-rc', pathValue)) {
    fail(
      'Homebrew LLVM (llvm-rc / clang-cl) is required to link the Windows app from this Mac.\nRun: npm run tauri:setup:win-cross',
    )
  }
  if (!commandOnPath('lld-link', pathValue)) {
    fail(
      'Homebrew LLD (lld-link) is required to link the Windows app from this Mac.\nRun: npm run tauri:setup:win-cross',
    )
  }
  if (!args.includes('--runner')) {
    args.push('--runner', 'cargo-xwin')
  }
  if (!args.includes('--bundles')) {
    args.push('--bundles', 'nsis')
  }
  if (!env.XWIN_CACHE_DIR) {
    env.XWIN_CACHE_DIR = join(homedir(), '.cache', 'cargo-xwin')
  }
  if (!env.XWIN_ARCH) {
    env.XWIN_ARCH = 'x86_64'
  }
  console.log(`Cross-compiling Windows with ${args.join(' ')}`)
}

const child = spawn(tauriCli, args, {
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  cwd: root,
})
child.on('exit', (code, signal) => {
  if (signal) {
    process.exit(1)
  }
  process.exit(code ?? 1)
})
