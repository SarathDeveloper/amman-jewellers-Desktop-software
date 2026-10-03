import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Options } from 'better-sqlite3'

function sqliteAddonFileName(): string {
  return `${process.platform}-${process.arch}.node`
}

function packagedAddonPath(): string | undefined {
  if (typeof process.resourcesPath !== 'string' || process.resourcesPath.length === 0) {
    return undefined
  }
  return join(process.resourcesPath, 'better-sqlite3', sqliteAddonFileName())
}

function nodeModulesAddonPath(): string | undefined {
  try {
    const require = createRequire(import.meta.url)
    const packageDir = dirname(require.resolve('better-sqlite3/package.json'))
    return join(packageDir, 'prebuilds', sqliteAddonFileName())
  } catch {
    const here = dirname(fileURLToPath(import.meta.url))
    return join(here, '..', '..', 'node_modules', 'better-sqlite3', 'prebuilds', sqliteAddonFileName())
  }
}

export function resolveSqliteNativeBinding(): string {
  const candidates = [packagedAddonPath(), nodeModulesAddonPath()].filter(
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

export function sqliteNativeOptions(options: Options = {}): Options {
  return {
    ...options,
    nativeBinding: resolveSqliteNativeBinding(),
  }
}
