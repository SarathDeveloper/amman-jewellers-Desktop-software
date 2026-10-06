import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { Options } from 'better-sqlite3'

function sqliteAddonFileName(): string {
  return `${process.platform}-${process.arch}.node`
}

function envAddonPath(): string | undefined {
  const override = process.env.JEWELTRACKERPRO_SQLITE_ADDON
  if (override && override.length > 0) {
    return override
  }
  const appRoot = process.env.JEWELTRACKERPRO_APP_ROOT
  if (!appRoot) {
    return undefined
  }
  const fileName = sqliteAddonFileName()
  return [
    join(appRoot, `better-sqlite3-${fileName}`),
    join(appRoot, fileName),
    join(appRoot, 'binaries', `better-sqlite3-${fileName}`),
    join(appRoot, 'resources', `better-sqlite3-${fileName}`),
  ].find((path) => existsSync(path))
}

function sidecarAddonPath(): string | undefined {
  const exeDir = dirname(process.execPath)
  const fileName = sqliteAddonFileName()
  return [
    join(exeDir, `better-sqlite3-${fileName}`),
    join(exeDir, fileName),
    join(exeDir, 'better-sqlite3', fileName),
  ].find((path) => existsSync(path))
}

function packagedAddonPath(): string | undefined {
  if (typeof process.resourcesPath !== 'string' || process.resourcesPath.length === 0) {
    return undefined
  }
  const fileName = sqliteAddonFileName()
  return [
    join(process.resourcesPath, `better-sqlite3-${fileName}`),
    join(process.resourcesPath, 'better-sqlite3', fileName),
    join(process.resourcesPath, fileName),
  ].find((path) => existsSync(path))
}

function nodeModulesAddonPath(): string | undefined {
  const packageJson = join(process.cwd(), 'package.json')
  try {
    const require = createRequire(packageJson)
    const packageDir = dirname(require.resolve('better-sqlite3/package.json'))
    return join(packageDir, 'prebuilds', sqliteAddonFileName())
  } catch {
    return join(process.cwd(), 'node_modules', 'better-sqlite3', 'prebuilds', sqliteAddonFileName())
  }
}

export function resolveSqliteNativeBinding(): string {
  const candidates = [envAddonPath(), sidecarAddonPath(), packagedAddonPath(), nodeModulesAddonPath()].filter(
    (path): path is string => Boolean(path),
  )
  const found = candidates.find((path) => existsSync(path))
  if (!found) {
    throw new Error(
      `SQLite native addon missing (${sqliteAddonFileName()}). Rebuild the desktop app so the Windows/macOS prebuild is packaged, then reinstall.`,
    )
  }
  return found
}

function loadSqliteAddon(): object {
  const bindingPath = resolveSqliteNativeBinding()
  const addon = { exports: {} }
  process.dlopen(addon as NodeModule, bindingPath)
  return addon.exports
}

export function sqliteNativeOptions(options: Options = {}): Options {
  return {
    ...options,
    nativeBinding: loadSqliteAddon(),
  }
}
