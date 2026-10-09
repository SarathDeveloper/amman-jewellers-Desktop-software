import type Database from 'better-sqlite3'
import { rateForPurity, roundGoldGrams, roundMoney } from '@shared/goldSavings/math'
import type { GoldSavingInvoiceLink, GoldSavingInvoiceLinkInput } from '@shared/types'
import { getLatestMetalRates } from '../routes/metalRates.routes'
import { eligibleBonusGoldForAccount } from './bonus'
import { redeemInTx } from './maturityService'
import { datedRateForPurity, resolveRateForDate } from './rateGuard'
import { currentGoldBalance, loadAccount, loadScheme } from './rows'

export interface ResolvedSchemeCredit {
  accountId: number
  accountNo: string
  customerName: string
  /** Grams deducted from the account ledger. */
  goldWeight: number
  bonusGoldWeight: number
  goldRate: number
  /** Rupee credit applied to the bill. */
  amountApplied: number
}

export interface ResolveSchemeCreditResult {
  credits: ResolvedSchemeCredit[]
  total: number
}

/**
 * Value the selected scheme accounts against this bill. The credit is the
 * account's accumulated gold plus any earned bonus, converted at the current
 * gold rate for the account's purity. Credits are capped at `available` so the
 * bill payable can reach zero; capping needs the scheme to allow partial
 * redemption and early closure.
 */
export function resolveSchemeCredits(
  db: Database.Database,
  links: GoldSavingInvoiceLinkInput[],
  options: {
    customerId: number
    available: number
    invoiceDate: string
    invoiceId?: number
    acceptRateDate?: boolean
    isAdmin: boolean
  },
): ResolveSchemeCreditResult {
  const seen = new Set<number>()
  let remaining = roundMoney(Math.max(0, options.available))
  const credits: ResolvedSchemeCredit[] = []

  for (const link of links) {
    if (seen.has(link.accountId)) continue
    seen.add(link.accountId)

    const account = loadAccount(db, link.accountId)
    if (account.customer_id !== options.customerId) {
      throw new Error('This scheme account does not belong to the bill customer')
    }
    if (account.status !== 'active' && account.status !== 'matured') {
      throw new Error(`${account.account_no} cannot be redeemed`)
    }
    const existingLink = db
      .prepare('SELECT invoice_id FROM invoice_gold_saving_links WHERE account_id = ?')
      .get(account.id) as { invoice_id: number } | undefined
    if (existingLink && existingLink.invoice_id !== options.invoiceId) {
      throw new Error(`${account.account_no} is already applied to another bill`)
    }

    const scheme = loadScheme(db, account.scheme_id)
    const accumulated = currentGoldBalance(db, account.id)
    const bonus = eligibleBonusGoldForAccount(db, account.id, accumulated)
    const rate = resolveRateForDate(db, options.invoiceDate, account.purity, {
      acceptRateDate: options.acceptRateDate,
      isAdmin: options.isAdmin,
    }).rate

    const listed = roundGoldGrams(accumulated + bonus)
    if (listed <= 0) continue

    const fullCredit = roundMoney(listed * rate)
    let requested = listed
    let amountApplied = fullCredit
    if (fullCredit > remaining + 0.009) {
      if (scheme.allow_partial_redemption !== 1) {
        throw new Error(`${account.account_no} value exceeds the bill; add items or allow partial redemption`)
      }
      requested = roundGoldGrams(remaining / rate)
      amountApplied = remaining
    }
    if (requested <= 0 || amountApplied <= 0) continue

    const isFull = roundGoldGrams(listed - requested) <= 0
    if (account.status === 'active' && scheme.allow_early_closure !== 1 && !isFull) {
      throw new Error(`Early closure is not allowed for ${account.account_no}`)
    }

    credits.push({
      accountId: account.id,
      accountNo: account.account_no,
      customerName: account.customer_name,
      goldWeight: requested,
      bonusGoldWeight: bonus,
      goldRate: rate,
      amountApplied,
    })
    remaining = roundMoney(remaining - amountApplied)
  }

  return { credits, total: roundMoney(credits.reduce((sum, credit) => sum + credit.amountApplied, 0)) }
}

function previewRateForPurity(
  db: Database.Database,
  purity: string,
  invoiceDate?: string,
): { rate: number; effectiveDate: string; stale: boolean } {
  try {
    if (invoiceDate) {
      const dated = datedRateForPurity(db, invoiceDate, purity)
      return { rate: dated.rate, effectiveDate: dated.effectiveDate, stale: !dated.matchesDate }
    }
    const rates = getLatestMetalRates(db)
    return {
      rate: rates ? rateForPurity(rates, purity) : 0,
      effectiveDate: rates?.effectiveDate ?? '',
      stale: false,
    }
  } catch {
    return { rate: 0, effectiveDate: '', stale: false }
  }
}

export interface SchemeCreditPreview {
  accountId: number
  accountNo: string
  customerName: string
  schemeName: string
  purity: string
  accumulatedGold: number
  bonusGoldWeight: number
  goldWeight: number
  goldRate: number
  credit: number
  allowPartialRedemption: boolean
  rateDate: string
  rateStale: boolean
}

/** Redeemable scheme accounts for a customer, valued at the current rate. */
export function previewSchemeCredits(
  db: Database.Database,
  customerId: number,
  invoiceId?: number,
  invoiceDate?: string,
): SchemeCreditPreview[] {
  const rows = db
    .prepare(
      `SELECT id FROM gold_saving_accounts
       WHERE customer_id = ? AND status IN ('active', 'matured')
       ORDER BY account_no`,
    )
    .all(customerId) as Array<{ id: number }>
  const previews: SchemeCreditPreview[] = []

  for (const row of rows) {
    const redeemed = db
      .prepare('SELECT id FROM gold_saving_redemptions WHERE account_id = ? LIMIT 1')
      .get(row.id) as { id: number } | undefined
    if (redeemed) continue
    const link = db
      .prepare('SELECT invoice_id FROM invoice_gold_saving_links WHERE account_id = ?')
      .get(row.id) as { invoice_id: number } | undefined
    if (link && link.invoice_id !== invoiceId) continue

    const account = loadAccount(db, row.id)
    const scheme = loadScheme(db, account.scheme_id)
    const accumulated = currentGoldBalance(db, row.id)
    const bonus = eligibleBonusGoldForAccount(db, row.id, accumulated)
    const priced = previewRateForPurity(db, account.purity, invoiceDate)
    const grams = roundGoldGrams(accumulated + bonus)
    previews.push({
      accountId: account.id,
      accountNo: account.account_no,
      customerName: account.customer_name,
      schemeName: account.scheme_name,
      purity: account.purity,
      accumulatedGold: accumulated,
      bonusGoldWeight: bonus,
      goldWeight: grams,
      goldRate: priced.rate,
      credit: priced.rate > 0 ? roundMoney(grams * priced.rate) : 0,
      allowPartialRedemption: scheme.allow_partial_redemption === 1,
      rateDate: priced.effectiveDate,
      rateStale: priced.stale,
    })
  }
  return previews
}

export function loadGoldSavingLinks(db: Database.Database, invoiceId: number): GoldSavingInvoiceLink[] {
  const rows = db
    .prepare(
      `SELECT l.*, a.account_no, c.name AS customer_name
       FROM invoice_gold_saving_links l
       JOIN gold_saving_accounts a ON a.id = l.account_id
       JOIN customers c ON c.id = a.customer_id
       WHERE l.invoice_id = ?
       ORDER BY l.id`,
    )
    .all(invoiceId) as Array<{
    id: number
    invoice_id: number
    account_id: number
    account_no: string
    customer_name: string
    gold_weight: number
    bonus_gold_weight: number
    gold_rate: number
    amount_applied: number
    redemption_id: number | null
  }>

  return rows.map((row) => ({
    id: row.id,
    invoiceId: row.invoice_id,
    accountId: row.account_id,
    accountNo: row.account_no,
    customerName: row.customer_name,
    goldWeight: row.gold_weight,
    bonusGoldWeight: row.bonus_gold_weight,
    goldRate: row.gold_rate,
    amountApplied: row.amount_applied,
    redemptionId: row.redemption_id,
  }))
}

export function replaceGoldSavingLinks(
  db: Database.Database,
  invoiceId: number,
  credits: ResolvedSchemeCredit[],
): void {
  db.prepare('DELETE FROM invoice_gold_saving_links WHERE invoice_id = ?').run(invoiceId)
  if (credits.length === 0) return
  const insert = db.prepare(
    `INSERT INTO invoice_gold_saving_links (
      invoice_id, account_id, gold_weight, bonus_gold_weight, gold_rate, amount_applied, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
  )
  for (const credit of credits) {
    insert.run(
      invoiceId,
      credit.accountId,
      credit.goldWeight,
      credit.bonusGoldWeight,
      credit.goldRate,
      credit.amountApplied,
    )
  }
}

/**
 * Create the redemption for every scheme link on a bill being finalized.
 * Runs inside the finalize transaction; the draft only holds the link.
 */
export function finalizeGoldSavingLinks(
  db: Database.Database,
  invoiceId: number,
  invoiceDate: string,
  userId: number | null,
): void {
  const rows = db
    .prepare('SELECT * FROM invoice_gold_saving_links WHERE invoice_id = ? ORDER BY id')
    .all(invoiceId) as Array<{
    id: number
    account_id: number
    gold_weight: number
    bonus_gold_weight: number
  }>

  for (const row of rows) {
    const account = loadAccount(db, row.account_id)
    if (account.status !== 'active' && account.status !== 'matured') {
      throw new Error(`${account.account_no} cannot be redeemed`)
    }
    const scheme = loadScheme(db, account.scheme_id)
    const accumulated = currentGoldBalance(db, account.id)
    const currentBonus = eligibleBonusGoldForAccount(db, account.id, accumulated)
    if (Math.abs(currentBonus - row.bonus_gold_weight) > 0.0005) {
      throw new Error(`${account.account_no} balance changed; re-save this bill before finalizing`)
    }
    const eligible = roundGoldGrams(accumulated + currentBonus)
    if (row.gold_weight > eligible + 0.001) {
      throw new Error(`${account.account_no} balance changed; re-save this bill before finalizing`)
    }
    const redemptionId = redeemInTx(db, {
      accountId: account.id,
      redemptionDate: invoiceDate,
      redemptionKind: 'invoice',
      requested: row.gold_weight,
      bonusGold: currentBonus,
      eligible,
      invoiceId,
      notes: '',
      bonusType: scheme.bonus_type,
      userId,
    })
    db.prepare('UPDATE invoice_gold_saving_links SET redemption_id = ? WHERE id = ?').run(redemptionId, row.id)
  }
}
