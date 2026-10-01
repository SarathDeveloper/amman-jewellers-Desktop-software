import { ZodError } from 'zod'
import type { LogCategory } from '@shared/types'

const EXPECTED_MESSAGE_PATTERNS = [
  /^Export cancelled$/,
  /^Restore cancelled$/,
  /^Image selection cancelled$/,
  /^Insufficient stock/,
  /already used$/,
  /^HUID .+ is already used/,
  /^HUID .+ is duplicated/,
  /^HUID .+ is not tagged/,
  /^Add .+ HUID/,
  /^Select .+ HUID/,
  /already exists$/,
  /already settled$/,
  /cannot be (modified|finalized|edited|deleted)/i,
  /^Cannot delete customer/,
  /^Cannot close/,
  /^Cannot change stock/,
  /^Stocktake already posted/,
  /^Adjustment not found/,
  /^Stocktake not found/,
  /^Weight movement requires/,
  /^Category does not exist/,
  /^Category is in use/,
  /^Sales override requires/,
  /metal and category must match/i,
  /^Bill-linked/,
  /^Only draft invoices/,
  /^Only draft old gold/,
  /^Estimates cannot/,
  /must be finalized before it can be applied/,
  /is still a draft/,
  /already applied to another/,
  /^Add at least one old gold/,
  /^Enter an old gold purchase/,
  /^Payments can only be recorded/,
  /^Bill amount must be/,
  /^Amount paid cannot/,
  /^Payment exceeds remaining/,
  /^Image must be 2MB/,
  /^This due is already settled$/,
  /^Choose a cash printer in Settings\.$/,
  /^Choose a printer in Settings\.$/,
  /^No bill has been printed yet\.$/,
  /^The last printed bill is no longer available\.$/,
  /^Scheme not found$/,
  /^Scheme account not found$/,
  /^Payment not found$/,
  /^No gold rate is configured/,
  /^Manual gold rates are not allowed/,
  /^Late payments are not allowed/,
  /^Customer already has an active account/,
  /^This installment is not eligible/,
  /^No eligible installment remains/,
  /^Payments cannot be recorded/,
  /^This payment is already reversed$/,
  /^Partial redemption is not allowed/,
  /^Early closure is not allowed/,
  /^Requested gold weight exceeds/,
  /^No accumulated gold is available/,
  /^This scheme account cannot be redeemed/,
  /^Cannot enroll into an inactive scheme$/,
  /^This scheme is not yet available$/,
  /^This scheme is no longer available$/,
  /^Cannot delete customer with existing gold savings/,
  /^A reason is required when overriding/,
  /^Permission denied to override/,
  /^Only administrators can apply/,
  /^Collect the next unpaid installment/,
  /^Monthly installment is below the scheme minimum$/,
  /^Monthly installment exceeds the scheme maximum$/,
  /^Installment amount is below the scheme minimum$/,
  /^Installment amount exceeds the scheme maximum$/,
  /^This scheme account is already closed$/,
]

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error ?? '')
}

function isSqliteError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  const candidate = error as { name?: string; code?: string }
  if (candidate.name === 'SqliteError') {
    return true
  }
  return typeof candidate.code === 'string' && candidate.code.startsWith('SQLITE_')
}

function isSqliteConstraint(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  const code = (error as { code?: string }).code
  return code === 'SQLITE_CONSTRAINT' || Boolean(code?.startsWith('SQLITE_CONSTRAINT'))
}

export function isExpectedError(error: unknown): boolean {
  if (error instanceof ZodError) {
    return true
  }
  if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
    return true
  }
  if (isSqliteConstraint(error)) {
    return true
  }

  const message = errorMessage(error)
  if (/^Backup file (was not found|is damaged)/.test(message)) {
    return false
  }
  if (/not found/i.test(message)) {
    return true
  }
  return EXPECTED_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))
}

export function classifyFailure(area: string, error: unknown): LogCategory | null {
  if (isExpectedError(error)) {
    return null
  }
  if (isSqliteError(error) || /Database not initialized/.test(errorMessage(error))) {
    return 'database'
  }
  if (area.includes('backup')) {
    return 'backup'
  }
  return 'application'
}
