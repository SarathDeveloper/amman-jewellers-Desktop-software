import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import type { PledgePhoto, PledgePhotoKind } from '@shared/types'
import { HttpError } from '../lib/http'
import { getUploadsDir } from '../lib/paths'

type PledgePhotoRow = {
  id: number
  pledge_id: number
  kind: PledgePhotoKind
  path: string
  created_at: string
}

export function mapPledgePhoto(row: PledgePhotoRow): PledgePhoto {
  return {
    id: row.id,
    pledgeId: row.pledge_id,
    kind: row.kind,
    path: row.path,
    createdAt: row.created_at,
  }
}

export function loadPledgePhotos(
  db: Database.Database,
  pledgeId: number,
): PledgePhoto[] {
  const rows = db
    .prepare(
      `SELECT id, pledge_id, kind, path, created_at
       FROM pledge_photos WHERE pledge_id = ? ORDER BY id ASC`,
    )
    .all(pledgeId) as PledgePhotoRow[]
  return rows.map(mapPledgePhoto)
}

/** Count how many photos of a kind a pledge already has. */
export function countPhotos(
  db: Database.Database,
  pledgeId: number,
  kind: PledgePhotoKind,
): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM pledge_photos WHERE pledge_id = ? AND kind = ?')
    .get(pledgeId, kind) as { n: number }
  return row.n
}

export function addPledgePhoto(
  db: Database.Database,
  pledgeId: number,
  kind: PledgePhotoKind,
  path: string,
): PledgePhoto {
  const info = db
    .prepare('INSERT INTO pledge_photos (pledge_id, kind, path) VALUES (?, ?, ?)')
    .run(pledgeId, kind, path)
  const row = db
    .prepare(
      `SELECT id, pledge_id, kind, path, created_at
       FROM pledge_photos WHERE id = ?`,
    )
    .get(Number(info.lastInsertRowid)) as PledgePhotoRow
  return mapPledgePhoto(row)
}

/**
 * Remove the row and the file it points at. Deletion is only allowed for draft
 * and active loans, so sanctioned history cannot be silently emptied.
 */
export function deletePledgePhoto(
  db: Database.Database,
  pledgeId: number,
  photoId: number,
): PledgePhoto {
  const row = db
    .prepare(
      `SELECT p.id, p.pledge_id, p.kind, p.path, p.created_at, l.status
       FROM pledge_photos p
       JOIN pledges l ON l.id = p.pledge_id
       WHERE p.id = ? AND p.pledge_id = ?`,
    )
    .get(photoId, pledgeId) as (PledgePhotoRow & { status: string }) | undefined
  if (!row) {
    throw new HttpError(404, 'Photo not found')
  }
  if (row.status !== 'draft' && row.status !== 'active') {
    throw new HttpError(400, 'Photos on a closed loan cannot be deleted')
  }

  db.prepare('DELETE FROM pledge_photos WHERE id = ?').run(photoId)
  const fileName = row.path.startsWith('/uploads/')
    ? row.path.slice('/uploads/'.length)
    : ''
  if (fileName) {
    const fullPath = join(getUploadsDir(), fileName)
    if (existsSync(fullPath)) {
      try {
        unlinkSync(fullPath)
      } catch {
        // The row is already gone; a stray file is harmless.
      }
    }
  }
  return mapPledgePhoto(row)
}
