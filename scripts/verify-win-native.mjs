import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourceAddon = join(root, 'node_modules', 'better-sqlite3', 'prebuilds', 'win32-x64.node')
const packagedAddon = join(
  root,
  'release',
  'win-unpacked',
  'resources',
  'better-sqlite3',
  'win32-x64.node',
)
const unpackedAsarAddon = join(
  root,
  'release',
  'win-unpacked',
  'resources',
  'app.asar.unpacked',
  'node_modules',
  'better-sqlite3',
  'prebuilds',
  'win32-x64.node',
)

const mode = process.argv.includes('--packaged')
  ? 'packaged'
  : process.argv.includes('--source')
    ? 'source'
    : 'source'

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
      `${label} is not a Windows PE binary (expected MZ header):\n  ${path}\nRebuild on Windows or restore node_modules/better-sqlite3/prebuilds/win32-x64.node.`,
    )
  }
  console.log(`OK ${label}: ${path}`)
}

if (mode === 'source') {
  assertWindowsAddon(sourceAddon, 'better-sqlite3 win32-x64 prebuild')
} else {
  if (existsSync(packagedAddon)) {
    assertWindowsAddon(packagedAddon, 'packaged Windows SQLite addon')
    process.exit(0)
  }
  if (existsSync(unpackedAsarAddon)) {
    assertWindowsAddon(unpackedAsarAddon, 'unpacked asar Windows SQLite addon')
    process.exit(0)
  }
  fail(
    `Windows SQLite native addon was not packaged.\nLooked for:\n  ${packagedAddon}\n  ${unpackedAsarAddon}\nThe Windows installer built on this machine would crash at startup.`,
  )
}
