import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

function processResourcesPath(): string | undefined {
  if ('resourcesPath' in process && typeof process.resourcesPath === 'string') {
    return process.resourcesPath
  }
  return undefined
}

function looksLikeAppRoot(dir: string): boolean {
  return existsSync(join(dir, 'package.json'))
}

export function getAppRoot(): string {
  const override = process.env.JEWELTRACKERPRO_APP_ROOT
  if (override) {
    return override
  }

  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, '..'),
    join(here, '..', '..'),
    process.cwd(),
  ]

  for (const dir of candidates) {
    if (looksLikeAppRoot(dir)) {
      return dir
    }
  }

  return join(here, '..')
}

export function getMigrationsDir(): string {
  const override = process.env.JEWELTRACKERPRO_MIGRATIONS_DIR
  if (override) {
    return override
  }

  const candidates = [
    join(getAppRoot(), 'server', 'db', 'migrations'),
    join(dirname(fileURLToPath(import.meta.url)), 'migrations'),
    join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations'),
  ]

  const resourcesPath = processResourcesPath()
  if (resourcesPath) {
    candidates.unshift(join(resourcesPath, 'migrations'))
  }

  for (const dir of candidates) {
    if (existsSync(join(dir, '001_initial.sql'))) {
      return dir
    }
  }

  return join(getAppRoot(), 'server', 'db', 'migrations')
}
