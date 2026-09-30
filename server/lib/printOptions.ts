import type { PaperSize } from '@shared/types'

export const DEFAULT_PAPER_SIZE: PaperSize = 'a5'
export const MIN_PRINT_COPIES = 1
export const MAX_PRINT_COPIES = 5

const PAPER_SIZES = new Set<PaperSize>(['a5', 'a4', 'thermal'])

export function parsePaperSize(value: string | undefined): PaperSize {
  const trimmed = value?.trim().toLowerCase() ?? ''
  if (PAPER_SIZES.has(trimmed as PaperSize)) {
    return trimmed as PaperSize
  }
  return DEFAULT_PAPER_SIZE
}

export function clampCopies(value: number | string | undefined): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) {
    return MIN_PRINT_COPIES
  }
  return Math.min(MAX_PRINT_COPIES, Math.max(MIN_PRINT_COPIES, Math.round(parsed)))
}

export function parseBooleanSetting(value: string | undefined): boolean {
  return value === '1' || value === 'true'
}
