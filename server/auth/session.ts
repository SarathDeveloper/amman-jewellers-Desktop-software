import { randomBytes } from 'node:crypto'
import type { UserRole } from '@shared/types'

export const SESSION_COOKIE = 'jeweltrackerpro_session'
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000

export type SessionRecord = {
  id: string
  userId: number
  username: string
  role: UserRole
  expiresAt: number
}

const sessions = new Map<string, SessionRecord>()

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
  return session
}

export function getSession(id: string | undefined): SessionRecord | null {
  if (!id) {
    return null
  }
  const session = sessions.get(id)
  if (!session) {
    return null
  }
  if (session.expiresAt <= Date.now()) {
    sessions.delete(id)
    return null
  }
  return session
}

export function destroySession(id: string | undefined): void {
  if (id) {
    sessions.delete(id)
  }
}

export function destroySessionsForUser(userId: number): void {
  for (const [id, session] of sessions) {
    if (session.userId === userId) {
      sessions.delete(id)
    }
  }
}

export function clearAllSessionsForTests(): void {
  sessions.clear()
}

export function sessionCookieValue(sessionId: string): string {
  return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax`
}

export function clearSessionCookieValue(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) {
    return {}
  }
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
