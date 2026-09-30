import { Router } from 'express'
import { changePasswordSchema, loginSchema } from '@shared/schemas'
import { getDatabase } from '../db'
import { asyncHandler, HttpError, parseBody } from '../lib/http'
import { hashPasswordToHex, verifyPassword } from '../auth/password'
import {
  clearSessionCookieValue,
  createSession,
  destroySession,
  parseCookies,
  SESSION_COOKIE,
  sessionCookieValue,
} from '../auth/session'
import { findUserById, findUserByUsername, mapUser } from '../auth/users'
import { requireAuth } from '../auth/middleware'

const router = Router()

router.post(
  '/login',
  asyncHandler((req, res) => {
    const input = parseBody(loginSchema, req.body)
    const db = getDatabase()
    const row = findUserByUsername(db, input.username)
    if (!row || row.active !== 1) {
      throw new HttpError(401, 'Invalid username or password')
    }
    if (!verifyPassword(input.password, row.password_hash, row.password_salt)) {
      throw new HttpError(401, 'Invalid username or password')
    }
    const session = createSession({ id: row.id, username: row.username, role: row.role })
    res.setHeader('Set-Cookie', sessionCookieValue(session.id))
    res.json(mapUser(db, row))
  }),
)

router.post(
  '/logout',
  asyncHandler((req, res) => {
    const cookies = parseCookies(req.headers.cookie)
    destroySession(cookies[SESSION_COOKIE])
    res.setHeader('Set-Cookie', clearSessionCookieValue())
    res.status(204).end()
  }),
)

router.get(
  '/me',
  requireAuth,
  asyncHandler((req, res) => {
    res.json(req.user)
  }),
)

router.post(
  '/change-password',
  requireAuth,
  asyncHandler((req, res) => {
    const input = parseBody(changePasswordSchema, req.body)
    const db = getDatabase()
    const row = findUserById(db, req.user!.id)
    if (!row) {
      throw new HttpError(401, 'Authentication required')
    }
    if (!verifyPassword(input.currentPassword, row.password_hash, row.password_salt)) {
      throw new HttpError(400, 'Current password is incorrect')
    }
    const { hashHex, saltHex } = hashPasswordToHex(input.newPassword)
    db.prepare(
      `UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0 WHERE id = ?`,
    ).run(hashHex, saltHex, row.id)
    const updated = findUserById(db, row.id)!
    res.json(mapUser(db, updated))
  }),
)

export default router
