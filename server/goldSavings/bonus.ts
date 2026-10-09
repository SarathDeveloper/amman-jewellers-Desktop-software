import type Database from 'better-sqlite3'
import { eligibleBonusGoldWeight, rateForPurity } from '@shared/goldSavings/math'
import { getLatestMetalRates } from '../routes/metalRates.routes'
import { loadAccount, loadScheme } from './rows'

/**
 * Bonus grams the account qualifies for right now. Returns 0 once a bonus has
 * already been credited to the ledger, so a partial redemption cannot grant
 * the same bonus twice.
 */
export function eligibleBonusGoldForAccount(
  db: Database.Database,
  accountId: number,
  accumulated: number,
  ratePerGram?: number,
): number {
  const alreadyCredited = db
    .prepare(`SELECT id FROM gold_saving_ledger WHERE account_id = ? AND entry_type = 'bonus' LIMIT 1`)
    .get(accountId) as { id: number } | undefined
  if (alreadyCredited) return 0

  const account = loadAccount(db, accountId)
  const scheme = loadScheme(db, account.scheme_id)
  const paid = (
    db
      .prepare(`SELECT COUNT(*) AS count FROM gold_saving_installments WHERE account_id = ? AND status = 'paid'`)
      .get(accountId) as { count: number }
  ).count

  let rate = ratePerGram
  if (rate == null) {
    const rates = getLatestMetalRates(db)
    rate = rates ? rateForPurity(rates, account.purity) : 0
  }

  return eligibleBonusGoldWeight({
    bonusType: scheme.bonus_type,
    bonusValue: scheme.bonus_value,
    accumulatedGrams: accumulated,
    paidInstallments: paid,
    durationMonths: account.duration_months,
    ratePerGram: rate,
  })
}
