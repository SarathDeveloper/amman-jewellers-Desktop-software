import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

function processResourcesPath(): string | undefined {
  if ('resourcesPath' in process && typeof process.resourcesPath === 'string') {
    return process.resourcesPath
  }
  return undefined
}

function currentModuleDir(): string {
  try {
    const metaUrl = import.meta.url
    if (typeof metaUrl === 'string' && metaUrl.length > 0) {
      return dirname(fileURLToPath(metaUrl))
    }
  } catch {
    // Bundled CJS sidecar has no import.meta.url.
  }
  return process.cwd()
}

function looksLikeAppRoot(dir: string): boolean {
  return existsSync(join(dir, 'package.json'))
}

export function getAppRoot(): string {
  const override = process.env.JEWELTRACKERPRO_APP_ROOT
  if (override) {
    if (looksLikeAppRoot(override)) {
      return override
    }
    const nested = join(override, 'resources')
    if (looksLikeAppRoot(nested)) {
      return nested
    }
    return override
  }

  const here = currentModuleDir()
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

/** Version reported by `/api/version` and attached to crash reports. */
export function getAppVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(getAppRoot(), 'package.json'), 'utf8')) as {
      version?: string
    }
    return typeof pkg.version === 'string' && pkg.version ? pkg.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export function getMigrationsDir(): string {
  const override = process.env.JEWELTRACKERPRO_MIGRATIONS_DIR
  const appRoot = getAppRoot()
  const here = currentModuleDir()
  const candidates = [
    override,
    join(appRoot, 'migrations'),
    join(appRoot, 'resources', 'migrations'),
    join(appRoot, 'server', 'db', 'migrations'),
    join(here, 'migrations'),
    join(here, '..', 'db', 'migrations'),
  ]

  const resourcesPath = processResourcesPath()
  if (resourcesPath) {
    candidates.unshift(join(resourcesPath, 'migrations'), join(resourcesPath, 'resources', 'migrations'))
  }

  for (const dir of candidates) {
    if (dir && existsSync(join(dir, '001_initial.sql'))) {
      return dir
    }
  }

  return join(appRoot, 'server', 'db', 'migrations')
}
