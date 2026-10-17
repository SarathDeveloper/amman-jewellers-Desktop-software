import type Database from 'better-sqlite3'

export type AuditEntity =
  | 'inward'
  | 'invoice'
  | 'product'
  | 'stock_adjustment'
  | 'stocktake'

export type AuditAction =
  | 'create'
  | 'update'
  | 'finalize'
  | 'cancel'
  | 'reverse'
  | 'delete'

export interface AuditInput {
  entityType: AuditEntity
  entityId: number
  action: AuditAction
  /** Snapshot before the change. Omit for create. */
  before?: unknown
  /** Snapshot after the change. Omit for delete. */
  after?: unknown
  operatorId?: number | null
}

/**
 * Appends one row to `audit_logs`. Every write is inside the caller's database
 * transaction, so a rolled-back posting never leaves an audit trail behind.
 * Snapshots are stored as JSON; booleans and numbers survive the round trip.
 */
export function audit(db: Database.Database, input: AuditInput): void {
  db.prepare(
    `INSERT INTO audit_logs (
       entity_type, entity_id, action, user_id, before_json, after_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(
    input.entityType,
    input.entityId,
    input.action,
    input.operatorId ?? null,
    input.before === undefined ? null : JSON.stringify(input.before),
    input.after === undefined ? null : JSON.stringify(input.after),
  )
}

export interface AuditRow {
  id: number
  entity_type: string
  entity_id: number
  action: string
  user_id: number | null
  user_name: string | null
  before_json: string | null
  after_json: string | null
  created_at: string
}

/** Newest-first audit trail for one record. */
export function listAudit(
  db: Database.Database,
  entityType: AuditEntity,
  entityId: number,
): AuditRow[] {
  return db
    .prepare(
      `SELECT a.*, u.username AS user_name
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.entity_type = ? AND a.entity_id = ?
       ORDER BY a.id DESC`,
    )
    .all(entityType, entityId) as AuditRow[]
}
