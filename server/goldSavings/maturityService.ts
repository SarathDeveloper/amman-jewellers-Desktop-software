import type Database from 'better-sqlite3'
import { roundGoldGrams } from '@shared/goldSavings/math'
import type { GoldSavingRedemption, GoldSavingRedemptionInput, GoldSavingRedemptionKind } from '@shared/types'
import { eligibleBonusGoldForAccount } from './bonus'
import { currentGoldBalance, insertLedger, loadAccount, loadScheme, mapRedemption, nextReceiptNo, REDEMPTION_SELECT, writeAudit, type RedemptionRow } from './rows'

export function listRedemptions(db: Database.Database, accountId?: number): GoldSavingRedemption[] {
  const rows = accountId
    ? (db.prepare(`${REDEMPTION_SELECT} WHERE r.account_id = ? ORDER BY r.id DESC`).all(accountId) as RedemptionRow[])
    : (db.prepare(`${REDEMPTION_SELECT} ORDER BY r.id DESC`).all() as RedemptionRow[])
  return rows.map(mapRedemption)
}

export interface RedeemInTxInput {
  accountId: number
  redemptionDate: string
  redemptionKind: GoldSavingRedemptionKind
  /** Grams deducted from the ledger (excluding bonus). */
  requested: number
  /** Bonus grams credited alongside this redemption. */
  bonusGold: number
  /** Total grams available before this redemption (accumulated + bonus). */
  eligible: number
  invoiceId?: number | null
  notes?: string
  bonusType?: string
  userId: number | null
}

/**
 * Insert a redemption and its ledger rows. Callers must validate eligibility
 * first. Used by the maturity screen and by sale-bill finalize so both paths
 * write an identical ledger.
 */
export function redeemInTx(db: Database.Database, input: RedeemInTxInput): number {
  const account = loadAccount(db, input.accountId)
  const requested = roundGoldGrams(input.requested)
  const remainingAfter = roundGoldGrams(input.eligible - requested)
  const isFull = remainingAfter <= 0
  const receiptNo = nextReceiptNo(db, 'GSRD')

  const result = db
    .prepare(
      `INSERT INTO gold_saving_redemptions (
        account_id, receipt_no, redemption_date, redemption_kind, gold_weight, bonus_gold_weight,
        invoice_id, making_charges, wastage, taxes, invoice_value, remaining_gold, closes_account, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?, ?)`,
    )
    .run(
      account.id,
      receiptNo,
      input.redemptionDate,
      input.redemptionKind,
      requested,
      input.bonusGold,
      input.invoiceId ?? null,
      remainingAfter,
      isFull ? 1 : 0,
      input.notes ?? '',
      input.userId,
    )
  const redemptionId = Number(result.lastInsertRowid)

  if (input.bonusGold > 0) {
    insertLedger(db, {
      accountId: account.id,
      entryDate: input.redemptionDate,
      entryType: 'bonus',
      redemptionId,
      amount: 0,
      goldWeight: input.bonusGold,
      goldRate: 0,
      txnRef: `${receiptNo}-BONUS`,
      notes: `Configured bonus (${input.bonusType ?? 'scheme'})`,
      createdBy: input.userId,
    })
  }
  insertLedger(db, {
    accountId: account.id,
    entryDate: input.redemptionDate,
    entryType: 'redemption',
    redemptionId,
    amount: 0,
    goldWeight: -requested,
    goldRate: 0,
    txnRef: receiptNo,
    notes: input.notes ?? '',
    createdBy: input.userId,
  })

  if (isFull) {
    db.prepare(
      `UPDATE gold_saving_accounts SET status = 'redeemed', closed_at = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(input.redemptionDate, account.id)
  }
  writeAudit(db, {
    entityType: 'redemption',
    entityId: redemptionId,
    action: isFull ? 'redeem_full' : 'redeem_partial',
    changedBy: input.userId,
    after: { receiptNo, goldWeight: requested, bonusGold: input.bonusGold, remainingAfter, invoiceId: input.invoiceId ?? null },
  })
  return redemptionId
}

export function processRedemption(
  db: Database.Database,
  input: GoldSavingRedemptionInput,
  userId: number,
): GoldSavingRedemption {
  const tx = db.transaction(() => {
    const account = loadAccount(db, input.accountId)
    if (account.status === 'cancelled' || account.status === 'redeemed' || account.status === 'closed') {
      throw new Error('This scheme account cannot be redeemed')
    }
    const scheme = loadScheme(db, account.scheme_id)
    const accumulated = currentGoldBalance(db, account.id)
    const bonusGold = eligibleBonusGoldForAccount(db, account.id, accumulated)
    const eligible = roundGoldGrams(accumulated + bonusGold)
    if (eligible <= 0) {
      throw new Error('No accumulated gold is available to redeem')
    }

    const requested = roundGoldGrams(input.goldWeight ?? eligible)
    if (requested > eligible) {
      throw new Error('Requested gold weight exceeds the eligible balance')
    }
    const remainingAfter = roundGoldGrams(eligible - requested)
    const isFull = remainingAfter <= 0
    if (!isFull && scheme.allow_partial_redemption !== 1) {
      throw new Error('Partial redemption is not allowed for this scheme')
    }
    if (account.status === 'active' && !scheme.allow_early_closure && !isFull) {
      throw new Error('Early closure is not allowed for this scheme')
    }

    if (input.redemptionKind === 'invoice' && !input.invoiceId) {
      throw new Error('Select a jewellery invoice for this redemption')
    }
    let invoiceNo = ''
    if (input.invoiceId) {
      const invoice = db
        .prepare('SELECT id, invoice_no, status FROM invoices WHERE id = ?')
        .get(input.invoiceId) as { id: number; invoice_no: string; status: string } | undefined
      if (!invoice) throw new Error('Invoice not found')
      invoiceNo = invoice.invoice_no
    }

    return redeemInTx(db, {
      accountId: account.id,
      redemptionDate: input.redemptionDate,
      redemptionKind: input.redemptionKind,
      requested,
      bonusGold,
      eligible,
      invoiceId: input.invoiceId ?? null,
      notes: input.notes ?? (invoiceNo ? `Linked to bill ${invoiceNo}` : ''),
      bonusType: scheme.bonus_type,
      userId,
    })
  })
  const id = tx()
  const row = db.prepare(`${REDEMPTION_SELECT} WHERE r.id = ?`).get(id) as RedemptionRow
  return mapRedemption(row)
}
