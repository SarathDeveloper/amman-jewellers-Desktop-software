import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

export function getDataDir(): string {
  const override = process.env.JEWELTRACKERPRO_E2E_USER_DATA || process.env.JEWELTRACKERPRO_DATA_DIR
  const dir = override ? resolve(override) : resolve(process.cwd(), 'data')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function getUploadsDir(): string {
  const dir = join(getDataDir(), 'uploads')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function getLogsDir(): string {
  const dir = join(getDataDir(), 'logs')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function getBackupsDir(): string {
  const dir = join(getDataDir(), 'backups')
  mkdirSync(dir, { recursive: true })
  return dir
}
