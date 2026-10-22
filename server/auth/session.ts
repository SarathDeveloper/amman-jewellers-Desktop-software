import { randomBytes } from 'node:crypto'
import type { UserRole } from '@shared/types'
import { getDatabase, isDatabaseReady } from '../db'

export const SESSION_COOKIE = 'jeweltrackerpro_session'
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000

/** How long a stored expiry can lag before another request writes it again. */
const SLIDE_WRITE_MS = 60 * 1000

export type SessionRecord = {
  id: string
  userId: number
  username: string
  role: UserRole
  expiresAt: number
}

const sessions = new Map<string, SessionRecord>()

type SessionRow = {
  id: string
  user_id: number
  username: string
  role: string
  expires_at: number
}

function isRole(value: string): value is UserRole {
  return value === 'admin' || value === 'staff'
}

function persistSession(session: SessionRecord): void {
  if (!isDatabaseReady()) return
  getDatabase()
    .prepare(
      `INSERT INTO sessions (id, user_id, username, role, expires_at)
       VALUES (@id, @userId, @username, @role, @expiresAt)
       ON CONFLICT(id) DO UPDATE SET
         user_id = excluded.user_id,
         username = excluded.username,
         role = excluded.role,
         expires_at = excluded.expires_at`,
    )
    .run(session)
}

function deletePersisted(id: string): void {
  if (!isDatabaseReady()) return
  getDatabase().prepare('DELETE FROM sessions WHERE id = ?').run(id)
}

function loadPersisted(id: string): SessionRecord | null {
  if (!isDatabaseReady()) return null
  const row = getDatabase()
    .prepare(
      `SELECT id, user_id, username, role, expires_at
       FROM sessions
       WHERE id = ?`,
    )
    .get(id) as SessionRow | undefined
  if (!row || !isRole(row.role)) return null
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    role: row.role,
    expiresAt: row.expires_at,
  }
}

/**
 * Active use keeps the session alive for another 12 hours. The write is
 * skipped when the stored deadline is already within a minute of that.
 */
function touchSession(session: SessionRecord): SessionRecord {
  const refreshed = Date.now() + SESSION_TTL_MS
  if (session.expiresAt > refreshed - SLIDE_WRITE_MS) return session
  const next = { ...session, expiresAt: refreshed }
  sessions.set(next.id, next)
  persistSession(next)
  return next
}

export function createSession(user: {
  id: number
  username: string
  role: UserRole
}): SessionRecord {
  const id = randomBytes(24).toString('hex')
  const session: SessionRecord = {
    id,
    userId: user.id,
    username: user.username,
    role: user.role,
    expiresAt: Date.now() + SESSION_TTL_MS,
  }
  sessions.set(id, session)
  persistSession(session)
  return session
}

export function getSession(id: string | undefined): SessionRecord | null {
  if (!id) return null
  const session = sessions.get(id) ?? loadPersisted(id)
  if (!session) return null
  if (session.expiresAt <= Date.now()) {
    destroySession(id)
    return null
  }
  if (!sessions.has(id)) sessions.set(id, session)
  return touchSession(session)
}

export function destroySession(id: string | undefined): void {
  if (!id) return
  sessions.delete(id)
  deletePersisted(id)
}

export function destroySessionsForUser(userId: number): void {
  for (const [id, session] of sessions) {
    if (session.userId === userId) sessions.delete(id)
  }
  if (!isDatabaseReady()) return
  getDatabase().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
}

export function clearAllSessionsForTests(): void {
  sessions.clear()
  if (!isDatabaseReady()) return
  getDatabase().prepare('DELETE FROM sessions').run()
}

/** Drops the in-memory cache so the next lookup reads the database, as a restart would. */
export function forgetCachedSessionsForTests(): void {
  sessions.clear()
}

export function sessionCookieValue(sessionId: string): string {
  return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax`
}

export function clearSessionCookieValue(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {}
  const out: Record<string, string> = {}
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index <= 0) continue
    const key = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (key) out[key] = decodeURIComponent(value)
  }
  return out
}
