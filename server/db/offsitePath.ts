import { isAbsolute, relative, resolve, sep } from 'node:path'

export const MAX_OFFSITE_DIR_LENGTH = 260

export function isSameOrInside(candidate: string, root: string): boolean {
  const from = resolve(root)
  const to = resolve(candidate)
  const rel = relative(from, to)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

export function offsiteDirError(dir: string, protectedRoots: string[]): string | null {
  const trimmed = dir.trim()
  if (!trimmed) return null
  if (trimmed.length > MAX_OFFSITE_DIR_LENGTH) return 'Folder path is too long'
  if (!isAbsolute(trimmed)) return 'Choose an absolute folder path'
  const resolvedDir = resolve(trimmed)
  for (const root of protectedRoots) {
    if (!root.trim()) continue
    if (isSameOrInside(resolvedDir, root)) {
      return "Choose a folder outside this computer's app data"
    }
  }
  return null
}
