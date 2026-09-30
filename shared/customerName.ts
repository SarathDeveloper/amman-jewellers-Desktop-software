const EPOCH_MS_SUFFIX = /\s+\d{13}$/

/** Strip a trailing `Date.now()` millisecond suffix, e.g. `Sundari 1790742540382` → `Sundari`. */
export function stripEpochNameSuffix(name: string): string {
  return name.trim().replace(EPOCH_MS_SUFFIX, '').trim()
}
