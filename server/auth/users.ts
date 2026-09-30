import type { FeatureKey, User, UserRole } from '@shared/types'
import { FEATURE_KEYS } from '@shared/types'
import type Database from 'better-sqlite3'
import { hashPasswordToHex } from '../auth/password'

export type UserRow = {
  id: number
  username: string
  password_hash: string
  password_salt: string
  role: UserRole
  must_change_password: number
  active: number
  created_at: string
}

export function listUserFeatures(db: Database.Database, userId: number, role: UserRole): FeatureKey[] {
  if (role === 'admin') {
    return [...FEATURE_KEYS]
  }
  const rows = db
    .prepare('SELECT feature_key FROM staff_permissions WHERE user_id = ? ORDER BY feature_key')
    .all(userId) as { feature_key: string }[]
  return rows
    .map((row) => row.feature_key)
    .filter((key): key is FeatureKey => (FEATURE_KEYS as string[]).includes(key))
}

export function mapUser(db: Database.Database, row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    mustChangePassword: row.must_change_password === 1,
    active: row.active === 1,
    features: listUserFeatures(db, row.id, row.role),
    createdAt: row.created_at,
  }
}

export function findUserById(db: Database.Database, id: number): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
}

export function findUserByUsername(db: Database.Database, username: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username) as
    | UserRow
    | undefined
}

export function replaceStaffPermissions(
  db: Database.Database,
  userId: number,
  features: FeatureKey[],
): void {
  db.prepare('DELETE FROM staff_permissions WHERE user_id = ?').run(userId)
  const insert = db.prepare(
    'INSERT INTO staff_permissions (user_id, feature_key) VALUES (?, ?)',
  )
  for (const feature of features) {
    insert.run(userId, feature)
  }
}

export function ensureDefaultAdmin(db: Database.Database): void {
  const count = (
    db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }
  ).count
  if (count > 0) {
    return
  }

  // E2E seeds its own admin with must_change_password=0.
  if (process.env.JEWELTRACKERPRO_E2E === '1') {
    return
  }

  const { hashHex, saltHex } = hashPasswordToHex('admin123')
  db.prepare(
    `INSERT INTO users (
      username, password_hash, password_salt, role, must_change_password, active
    ) VALUES (?, ?, ?, 'admin', 1, 1)`,
  ).run('admin', hashHex, saltHex)
}

export function seedE2eAdmin(db: Database.Database): void {
  const existing = findUserByUsername(db, 'admin')
  if (existing) {
    db.prepare('UPDATE users SET must_change_password = 0, active = 1 WHERE id = ?').run(existing.id)
    return
  }
  const { hashHex, saltHex } = hashPasswordToHex('admin123')
  db.prepare(
    `INSERT INTO users (
      username, password_hash, password_salt, role, must_change_password, active
    ) VALUES (?, ?, ?, 'admin', 0, 1)`,
  ).run('admin', hashHex, saltHex)
}
