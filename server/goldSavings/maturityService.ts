import type Database from 'better-sqlite3'
import { eligibleBonusGoldWeight, rateForPurity, roundGoldGrams } from '@shared/goldSavings/math'
import type { GoldSavingRedemption, GoldSavingRedemptionInput } from '@shared/types'
import { getLatestMetalRates } from '../routes/metalRates.routes'
import { currentGoldBalance, insertLedger, loadAccount, loadScheme, mapRedemption, nextReceiptNo, REDEMPTION_SELECT, writeAudit, type RedemptionRow } from './rows'

function eligibleBonusGold(
  db: Database.Database,
  accountId: number,
  accumulated: number,
): number {
  const account = loadAccount(db, accountId)
  const scheme = loadScheme(db, account.scheme_id)
  const paid = (
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM gold_saving_installments WHERE account_id = ? AND status = 'paid'`,
      )
      .get(accountId) as { count: number }
  ).count
  const rates = getLatestMetalRates(db)
  const rate = rates ? rateForPurity(rates, account.purity) : 0
  return eligibleBonusGoldWeight({
    bonusType: scheme.bonus_type,
    bonusValue: scheme.bonus_value,
    accumulatedGrams: accumulated,
    paidInstallments: paid,
    durationMonths: account.duration_months,
    ratePerGram: rate,
  })
}

export function listRedemptions(db: Database.Database, accountId?: number): GoldSavingRedemption[] {
  const rows = accountId
    ? (db.prepare(`${REDEMPTION_SELECT} WHERE r.account_id = ? ORDER BY r.id DESC`).all(accountId) as RedemptionRow[])
    : (db.prepare(`${REDEMPTION_SELECT} ORDER BY r.id DESC`).all() as RedemptionRow[])
  return rows.map(mapRedemption)
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
    const bonusGold = eligibleBonusGold(db, account.id, accumulated)
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

    const receiptNo = nextReceiptNo(db, 'GSRD')
    const result = db
      .prepare(
        `INSERT INTO gold_saving_redemptions (
          account_id, receipt_no, redemption_date, redemption_kind, gold_weight, bonus_gold_weight,
          invoice_id, making_charges, wastage, taxes, invoice_value, remaining_gold, closes_account, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        account.id,
        receiptNo,
        input.redemptionDate,
        input.redemptionKind,
        requested,
        bonusGold,
        input.invoiceId ?? null,
        input.makingCharges ?? 0,
        input.wastage ?? 0,
        input.taxes ?? 0,
        input.invoiceValue ?? 0,
        remainingAfter,
        isFull ? 1 : 0,
        input.notes ?? (invoiceNo ? `Linked to bill ${invoiceNo}` : ''),
        userId,
      )
    const redemptionId = Number(result.lastInsertRowid)

    if (bonusGold > 0) {
      insertLedger(db, {
        accountId: account.id,
        entryDate: input.redemptionDate,
        entryType: 'bonus',
        redemptionId,
        amount: 0,
        goldWeight: bonusGold,
        goldRate: 0,
        txnRef: `${receiptNo}-BONUS`,
        notes: `Configured bonus (${scheme.bonus_type})`,
        createdBy: userId,
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
      createdBy: userId,
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
      changedBy: userId,
      after: { receiptNo, goldWeight: requested, bonusGold, remainingAfter, invoiceId: input.invoiceId ?? null },
    })
    return redemptionId
  })
  const id = tx()
  const row = db.prepare(`${REDEMPTION_SELECT} WHERE r.id = ?`).get(id) as RedemptionRow
  return mapRedemption(row)
}
