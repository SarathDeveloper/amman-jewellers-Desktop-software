import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cargoBin = join(homedir(), '.cargo', 'bin')
const cargoExe = join(cargoBin, process.platform === 'win32' ? 'cargo.exe' : 'cargo')
const tauriCli = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tauri.cmd' : 'tauri')
const pathValue = process.env.PATH ?? process.env.Path ?? ''
const env = {
  ...process.env,
  PATH: `${cargoBin}${delimiter}${join(root, 'node_modules', '.bin')}${delimiter}${pathValue}`,
  Path: `${cargoBin}${delimiter}${join(root, 'node_modules', '.bin')}${delimiter}${pathValue}`,
}

if (!existsSync(cargoExe)) {
  console.error(
    'Rust/Cargo is not installed. Install it from https://www.rust-lang.org/tools/install then open a new terminal and run npm run tauri:dev again.',
  )
  process.exit(1)
}

if (!existsSync(tauriCli)) {
  console.error('The Tauri CLI is missing. Run npm install and try again.')
  process.exit(1)
}

const args = process.argv.slice(2)
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
