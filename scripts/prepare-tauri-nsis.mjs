// Pre-populates the NSIS tool cache used by the Tauri bundler.
//
// While bundling, `tauri build` downloads the NSIS toolchain from GitHub. On a slow
// or filtered GitHub connection that download hits the bundler's global HTTP timeout
// and the build dies with a bare
//
//   Info Verifying NSIS package
//    Downloading https://github.com/tauri-apps/binary-releases/releases/download/nsis-3.11/nsis-3.11.zip
//   failed to bundle project: `timeout: global`
//
// after the app binary has already been compiled and linked (see tauri-apps/tauri#13147).
// Fetching the same hash-pinned files here removes that failure mode entirely and lets
// the bundler run offline.
//
// The locations mirror crates/tauri-bundler/src/bundle/windows/nsis/mod.rs, which uses
// `dirs::cache_dir().join("tauri")` and verifies the same SHA-1 digests:
//
//   <tools>                dirs::cache_dir()/tauri   -> %LOCALAPPDATA%\tauri on Windows
//   <tools>/NSIS           the NSIS 3.11 toolset (nsis-3.11.zip, extracted then renamed)
//   <tools>/NSIS/Plugins/x86-unicode/additional/nsis_tauri_utils.dll
//
// Run with --force to re-download even when a cache entry already verifies.

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

// Keep the versions and SHA-1 digests below in sync with the NSIS_URL, NSIS_SHA1,
// NSIS_TAURI_UTILS_URL and NSIS_TAURI_UTILS_SHA1 constants in that same file whenever
// @tauri-apps/cli is upgraded — the bundler verifies them and re-downloads on a mismatch.

const NSIS_ARCHIVE_URL =
  'https://github.com/tauri-apps/binary-releases/releases/download/nsis-3.11/nsis-3.11.zip'
const NSIS_ARCHIVE_SHA1 = 'EF7FF767E5CBD9EDD22ADD3A32C9B8F4500BB10D'
const NSIS_ARCHIVE_ROOT = 'nsis-3.11'
const NSIS_UTILS_URL =
  'https://github.com/tauri-apps/nsis-tauri-utils/releases/download/nsis_tauri_utils-v0.5.3/nsis_tauri_utils.dll'
const NSIS_UTILS_SHA1 = '75197FEE3C6A814FE035788D1C34EAD39349B860'

// Same list the bundler checks before it decides a cached toolset is usable.
const NSIS_REQUIRED_FILES = [
  'makensis.exe',
  'Bin/makensis.exe',
  'Stubs/lzma-x86-unicode',
  'Stubs/lzma_solid-x86-unicode',
  'Include/MUI2.nsh',
  'Include/FileFunc.nsh',
  'Include/x64.nsh',
  'Include/nsDialogs.nsh',
  'Include/WinMessages.nsh',
  'Include/Win/COM.nsh',
  'Include/Win/Propkey.nsh',
  'Include/Win/RestartManager.nsh',
]

const force = process.argv.includes('--force')

// Mirrors `dirs::cache_dir()` per platform so the bundler finds what we place here.
function tauriToolsDir() {
  const home = homedir()
  if (process.platform === 'win32') {
    return join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'tauri')
  }
  if (process.platform === 'darwin') {
    return join(home, 'Library', 'Caches', 'tauri')
  }
  return join(process.env.XDG_CACHE_HOME ?? join(home, '.cache'), 'tauri')
}

function sha1(path) {
  return createHash('sha1').update(readFileSync(path)).digest('hex').toUpperCase()
}

async function fetchToFile(url, dest) {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }
  writeFileSync(dest, Buffer.from(await response.arrayBuffer()))
}

function curlToFile(url, dest) {
  const result = spawnSync(
    process.platform === 'win32' ? 'curl.exe' : 'curl',
    [
      '--fail',
      '--show-error',
      '--silent',
      '--location',
      '--retry',
      '3',
      '--retry-delay',
      '2',
      '--connect-timeout',
      '30',
      '--max-time',
      '900',
      '--output',
      dest,
      url,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    const detail = result.stderr?.toString().trim()
    throw new Error(`curl exited with code ${result.status}${detail ? `: ${detail}` : ''}`)
  }
}

async function download(url, dest) {
  console.log(`Downloading ${url}`)
  try {
    await fetchToFile(url, dest)
  } catch (error) {
    // Node's fetch and the bundler's Rust client share neither CA store nor proxy
    // handling, so fall back to curl, which is what most machines already trust.
    console.warn(`  fetch failed (${error.message}); retrying with curl…`)
    curlToFile(url, dest)
  }
}

async function downloadVerified(url, dest, expectedSha1) {
  mkdirSync(dirname(dest), { recursive: true })
  const cached = existsSync(dest) && sha1(dest) === expectedSha1
  if (cached && !force) {
    return false
  }

  const tmp = `${dest}.part`
  rmSync(tmp, { force: true })
  try {
    await download(url, tmp)
    const actual = sha1(tmp)
    if (actual !== expectedSha1) {
      throw new Error(`SHA-1 mismatch for ${url}: expected ${expectedSha1}, got ${actual}`)
    }
    rmSync(dest, { force: true })
    renameSync(tmp, dest)
  } finally {
    rmSync(tmp, { force: true })
  }
  return true
}

// `tar.exe` in System32 is bsdtar and reads zip archives; a GNU tar earlier on PATH
// (Git Bash, MSYS) cannot, so always use the absolute Windows path.
function extractZip(zipPath, destination) {
  const tar =
    process.platform === 'win32'
      ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
      : 'tar'
  const result = spawnSync(tar, ['-xf', zipPath, '-C', destination], { stdio: 'pipe' })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    const detail = result.stderr?.toString().trim()
    throw new Error(`failed to extract ${zipPath}${detail ? `: ${detail}` : ''}`)
  }
}

async function installToolset(toolsDir, nsisDir) {
  // The verified archive is kept in the cache so --force re-installs need no network.
  const archive = join(toolsDir, `${NSIS_ARCHIVE_ROOT}.zip`)
  await downloadVerified(NSIS_ARCHIVE_URL, archive, NSIS_ARCHIVE_SHA1)

  const staging = join(toolsDir, '.nsis-staging')
  rmSync(staging, { recursive: true, force: true })
  try {
    mkdirSync(staging, { recursive: true })
    extractZip(archive, staging)

    const extracted = join(staging, NSIS_ARCHIVE_ROOT)
    if (!existsSync(join(extracted, 'makensis.exe'))) {
      throw new Error(`${NSIS_ARCHIVE_ROOT}.zip did not contain a makensis.exe toolset`)
    }

    rmSync(nsisDir, { recursive: true, force: true })
    renameSync(extracted, nsisDir)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
  console.log(`Installed NSIS toolset → ${nsisDir}`)
}

async function main() {
  const toolsDir = tauriToolsDir()
  const nsisDir = join(toolsDir, 'NSIS')
  const pluginPath = join(nsisDir, 'Plugins', 'x86-unicode', 'additional', 'nsis_tauri_utils.dll')
  mkdirSync(toolsDir, { recursive: true })

  // The bundler only downloads the toolset on Windows hosts; other platforms cross-compile
  // against a system makensis and just need the plugin DLL below.
  const toolsetReady =
    !force &&
    existsSync(nsisDir) &&
    NSIS_REQUIRED_FILES.every((relative) => existsSync(join(nsisDir, relative)))
  if (process.platform === 'win32' && !toolsetReady) {
    await installToolset(toolsDir, nsisDir)
  }

  const pluginInstalled = await downloadVerified(
    NSIS_UTILS_URL,
    pluginPath,
    NSIS_UTILS_SHA1,
  )
  if (pluginInstalled) {
    console.log(`Installed NSIS plugin → ${pluginPath}`)
  }

  console.log(`NSIS bundler tools are ready: ${nsisDir}`)
}

main().catch((error) => {
  console.error(`Failed to prepare the NSIS bundler tools: ${error.message}`)
  console.error(
    'The Windows installer cannot be built without them. Retry once the connection is back,',
  )
  console.error(
    'or set TAURI_BUNDLER_TOOLS_GITHUB_MIRROR to a GitHub mirror and run the build again.',
  )
  process.exit(1)
})
