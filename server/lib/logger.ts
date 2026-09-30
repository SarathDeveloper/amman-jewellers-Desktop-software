import {
  appendFileSync,
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import type { LogCategory } from '@shared/types'
import { getLogsDir } from './paths'

const MAX_LOG_BYTES = 1024 * 1024

type SeqState = {
  date: string
  seq: number
}

let seqCache: SeqState | null = null
const loggedErrors = new WeakMap<object, string>()

export function markDiagnosticLogged(error: object, referenceId: string): void {
  loggedErrors.set(error, referenceId)
}

export function getDiagnosticReferenceId(error: unknown): string | undefined {
  if (error && typeof error === 'object') {
    return loggedErrors.get(error)
  }
}

export { getLogsDir }

export function categoryLogFile(category: LogCategory): string {
  return join(getLogsDir(), `${category}.log`)
}

function seqFilePath(): string {
  return join(getLogsDir(), 'error-seq.json')
}

export function todayStamp(now = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

function readSeqState(date: string): SeqState {
  if (seqCache) {
    return seqCache.date === date ? seqCache : { date, seq: 0 }
  }

  const file = seqFilePath()
  if (!existsSync(file)) {
    return { date, seq: 0 }
  }

  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as SeqState
    if (parsed.date !== date || !Number.isInteger(parsed.seq) || parsed.seq < 0) {
      return { date, seq: 0 }
    }
    return parsed
  } catch {
    return { date, seq: 0 }
  }
}

export function nextReferenceId(now = new Date()): string {
  const date = todayStamp(now)
  const state = readSeqState(date)
  state.date = date
  state.seq += 1
  seqCache = state
  try {
    writeFileSync(seqFilePath(), JSON.stringify(state), 'utf8')
  } catch {
    // keep issuing IDs even if the counter file cannot be written
  }
  return `JTP-ERR-${date}-${String(state.seq).padStart(3, '0')}`
}

function rotateIfNeeded(filePath: string): void {
  if (!existsSync(filePath)) {
    return
  }
  if (statSync(filePath).size < MAX_LOG_BYTES) {
    return
  }
  const rotated = `${filePath}.1`
  if (existsSync(rotated)) {
    unlinkSync(rotated)
  }
  renameSync(filePath, rotated)
}

function appendLine(filePath: string, line: string): void {
  try {
    rotateIfNeeded(filePath)
    appendFileSync(filePath, line, 'utf8')
  } catch {
    // ignore logging failures
  }
}

function formatError(error?: unknown): string {
  if (error === undefined) {
    return ''
  }
  if (error instanceof Error) {
    return error.stack ?? error.message
  }
  return String(error)
}

export function logInfo(category: LogCategory, message: string): void {
  const line = `[${new Date().toISOString()}] ${message}\n`
  appendLine(categoryLogFile(category), line)
}

export function logDiagnostic(
  category: LogCategory,
  message: string,
  error?: unknown,
): { referenceId: string; timestamp: string } {
  const referenceId = nextReferenceId()
  const timestamp = new Date().toISOString()
  const detail = formatError(error)
  const line = `[${timestamp}] ${referenceId} ${message}${detail ? ` ${detail}` : ''}\n`
  appendLine(categoryLogFile(category), line)
  console.error(line)
  if (error && typeof error === 'object') {
    markDiagnosticLogged(error, referenceId)
  }
  return { referenceId, timestamp }
}

export function resetLoggerStateForTests(): void {
  seqCache = null
}

export function logError(message: string, error?: unknown): void {
  logDiagnostic('application', message, error)
}
