#!/usr/bin/env node
// One-time setup so a macOS (or Linux) host can cross-compile the Windows NSIS
// installer. Windows hosts do not need this; they already have MSVC.
//
// Installs:
//   rustup target x86_64-pc-windows-msvc
//   cargo-xwin (downloads the Windows SDK/CRT on first build)
//   Homebrew nsis + llvm + lld on macOS (makensis, clang-cl, lld-link, llvm-rc)
//
// After this, `npm run tauri:build:win` injects `--runner cargo-xwin`.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

const cargoBin = join(homedir(), '.cargo', 'bin')
const homebrewLlvmBins = [
  '/opt/homebrew/opt/llvm/bin',
  '/opt/homebrew/opt/lld/bin',
  '/usr/local/opt/llvm/bin',
  '/usr/local/opt/lld/bin',
]

function fail(message) {
  console.error(message)
  process.exit(1)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`)
  }
}

function which(command, pathValue = process.env.PATH) {
  const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], {
    encoding: 'utf8',
    env: { ...process.env, PATH: pathValue ?? process.env.PATH },
  })
  if (result.status !== 0) {
    return null
  }
  return result.stdout.trim().split('\n')[0] || null
}

function commandExists(command) {
  return Boolean(which(command))
}

if (process.platform === 'win32') {
  console.log('This machine is already Windows. cargo-xwin is not needed.')
  console.log('Use npm run tauri:build:win as usual.')
  process.exit(0)
}

if (!existsSync(join(cargoBin, 'cargo'))) {
  fail('Rust/Cargo is not installed. Install it from https://www.rust-lang.org/tools/install')
}

if (!commandExists('rustup')) {
  fail('rustup is not on PATH. Install Rust from https://www.rust-lang.org/tools/install')
}

console.log('Adding Rust target x86_64-pc-windows-msvc…')
run('rustup', ['target', 'add', 'x86_64-pc-windows-msvc'])
run('rustup', ['component', 'add', 'llvm-tools'])

const cargoXwin = join(cargoBin, 'cargo-xwin')
if (!existsSync(cargoXwin) && !commandExists('cargo-xwin')) {
  console.log('Installing cargo-xwin…')
  run('cargo', ['install', '--locked', 'cargo-xwin'])
} else {
  console.log(`cargo-xwin already installed: ${which('cargo-xwin') ?? cargoXwin}`)
}

if (process.platform === 'darwin') {
  if (!commandExists('brew')) {
    fail('Homebrew is required on macOS. Install it from https://brew.sh then re-run this script.')
  }
  const formulae = []
  if (!commandExists('makensis')) {
    formulae.push('nsis')
  }
  const llvmBin = homebrewLlvmBins.find((dir) => existsSync(join(dir, 'llvm-rc')))
  if (!llvmBin) {
    formulae.push('llvm')
  }
  // Homebrew split LLD out of the llvm formula; cargo-xwin needs lld-link.
  if (!commandExists('lld-link') && !existsSync(join('/opt/homebrew/opt/lld/bin', 'lld-link'))) {
    formulae.push('lld')
  }
  if (formulae.length > 0) {
    console.log(`Installing Homebrew packages: ${formulae.join(', ')}…`)
    run('brew', ['install', ...formulae])
  } else {
    console.log('Homebrew nsis and llvm are already installed.')
  }
} else {
  if (!commandExists('makensis')) {
    fail('makensis is missing. Install NSIS (for example: sudo apt install nsis) and re-run.')
  }
  if (!which('llvm-rc') && !which('llvm-rc-18') && !which('llvm-rc-19')) {
    fail('llvm-rc is missing. Install LLVM/LLD (for example: sudo apt install lld llvm) and re-run.')
  }
}

const pathWithLlvm = [
  ...homebrewLlvmBins.filter((dir) => existsSync(dir)),
  cargoBin,
  process.env.PATH ?? '',
].join(delimiter)

const checks = ['cargo-xwin', 'makensis', 'llvm-rc', 'clang-cl', 'lld-link']
let failed = false
for (const name of checks) {
  const result = spawnSync('which', [name], {
    env: { ...process.env, PATH: pathWithLlvm },
    encoding: 'utf8',
  })
  const resolved = result.stdout?.trim()
  if (result.status !== 0 || !resolved) {
    console.error(`Missing ${name} on PATH.`)
    failed = true
  } else {
    console.log(`OK ${name}: ${resolved}`)
  }
}

if (failed) {
  fail(
    'Windows cross-compile tools are not ready. Fix the errors above, then run npm run tauri:setup:win-cross again.',
  )
}

console.log('')
console.log('Windows cross-compile tools are ready.')
console.log('Build the installer with: npm run tauri:build:win')
console.log('The first cargo-xwin build downloads the Windows SDK into ~/.cache/cargo-xwin.')
