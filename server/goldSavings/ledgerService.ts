import type Database from 'better-sqlite3'
import type { GoldSavingAuditLog, GoldSavingLedgerEntry, GoldSavingPassbook } from '@shared/types'
import { getAccountDetail } from './accountService'
import { LEDGER_SELECT, loadAccount, loadScheme, mapAudit, mapLedger, mapScheme, type AuditRow, type LedgerRow } from './rows'

export function listLedger(
  db: Database.Database,
  accountId: number,
  query?: { from?: string; to?: string },
): GoldSavingLedgerEntry[] {
  loadAccount(db, accountId)
  let sql = `${LEDGER_SELECT} WHERE l.account_id = ?`
  const params: Array<string | number> = [accountId]
  if (query?.from) {
    sql += ' AND l.entry_date >= ?'
    params.push(query.from)
  }
  if (query?.to) {
    sql += ' AND l.entry_date <= ?'
    params.push(query.to)
  }
  sql += ' ORDER BY l.id'
  const rows = db.prepare(sql).all(...params) as LedgerRow[]
  return rows.map(mapLedger)
}

export function getPassbook(db: Database.Database, accountId: number): GoldSavingPassbook {
  const detail = getAccountDetail(db, accountId)
  const scheme = loadScheme(db, detail.account.schemeId)
  return {
    account: detail.account,
    scheme: mapScheme(scheme),
    rows: detail.ledger.filter(
      (entry) =>
        (entry.entryType === 'payment' && entry.paymentStatus === 'posted') || entry.entryType === 'reversal',
    ),
  }
}

export function listAudit(db: Database.Database, accountId: number): GoldSavingAuditLog[] {
  loadAccount(db, accountId)
  const rows = db
    .prepare(
      `SELECT * FROM gold_saving_audit_logs
       WHERE (entity_type = 'account' AND entity_id = ?)
          OR (entity_type IN ('payment', 'redemption') AND entity_id IN (
            SELECT id FROM gold_saving_payments WHERE account_id = ?
            UNION ALL
            SELECT id FROM gold_saving_redemptions WHERE account_id = ?
          ))
       ORDER BY id DESC`,
    )
    .all(accountId, accountId, accountId) as AuditRow[]
  return rows.map(mapAudit)
}
