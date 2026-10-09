import type Database from 'better-sqlite3'
import { rateForPurity } from '@shared/goldSavings/math'
import { getLatestMetalRates, getMetalRatesForDate } from '../routes/metalRates.routes'

export interface ResolvedRate {
  rate: number
  /** Effective date of the rate that was applied. */
  effectiveDate: string
  /** True when a rate row exists exactly on the requested date. */
  matchesDate: boolean
  purity: string
}

/**
 * The gold rate for a purity on a date. Uses the latest rate on or before the
 * date, falling back to the newest rate overall so a backdated entry can still
 * be valued; the caller decides whether a mismatched date is acceptable.
 */
export function datedRateForPurity(
  db: Database.Database,
  date: string,
  purity: string,
): ResolvedRate {
  const row = getMetalRatesForDate(db, date) ?? getLatestMetalRates(db)
  if (!row) {
    throw new Error('No gold rate is configured. Set the rate before continuing.')
  }
  const rate = rateForPurity(row, purity)
  if (rate <= 0) {
    throw new Error('Configured gold rate must be greater than zero')
  }
  return { rate, effectiveDate: row.effectiveDate, matchesDate: row.effectiveDate === date, purity }
}

/**
 * Rate safety gate. When the rate that applies is not dated on the requested
 * date, an administrator must pass `acceptRateDate`. Staff are always blocked.
 */
export function assertRateDateAccepted(
  resolved: ResolvedRate,
  date: string,
  options: { acceptRateDate?: boolean; isAdmin: boolean },
): void {
  if (resolved.matchesDate) return
  if (!options.isAdmin) {
    throw new Error(
      `No gold rate is saved for ${date}. The rate in use is from ${resolved.effectiveDate}; ask an administrator to confirm it.`,
    )
  }
  if (!options.acceptRateDate) {
    throw new Error(
      `No gold rate is saved for ${date}. The rate in use is from ${resolved.effectiveDate}. Confirm the rate date to continue.`,
    )
  }
}

/** Resolve a rate and enforce the rate-date rule in one step. */
export function resolveRateForDate(
  db: Database.Database,
  date: string,
  purity: string,
  options: { acceptRateDate?: boolean; isAdmin: boolean },
): ResolvedRate {
  const resolved = datedRateForPurity(db, date, purity)
  assertRateDateAccepted(resolved, date, options)
  return resolved
}
