import { Router } from 'express'
import {
  createUserSchema,
  resetPasswordSchema,
  updatePermissionsSchema,
} from '@shared/schemas'
import type { FeatureKey } from '@shared/types'
import { getDatabase } from '../db'
import { asyncHandler, HttpError, parseBody, parseIdParam } from '../lib/http'
import { hashPasswordToHex } from '../auth/password'
import { destroySessionsForUser } from '../auth/session'
import {
  findUserById,
  findUserByUsername,
  mapUser,
  replaceStaffPermissions,
  type UserRow,
} from '../auth/users'

const router = Router()

router.get(
  '/',
  asyncHandler((_req, res) => {
    const db = getDatabase()
    const rows = db
      .prepare('SELECT * FROM users ORDER BY role ASC, username ASC')
      .all() as UserRow[]
    res.json(rows.map((row) => mapUser(db, row)))
  }),
)

router.post(
  '/',
  asyncHandler((req, res) => {
    const input = parseBody(createUserSchema, req.body)
    const db = getDatabase()
    if (findUserByUsername(db, input.username)) {
      throw new HttpError(400, 'Username already exists')
    }
    const { hashHex, saltHex } = hashPasswordToHex(input.password)
    const result = db
      .prepare(
        `INSERT INTO users (
          username, password_hash, password_salt, role, must_change_password, active
        ) VALUES (?, ?, ?, ?, 1, 1)`,
      )
      .run(input.username, hashHex, saltHex, input.role)
    const userId = Number(result.lastInsertRowid)
    if (input.role === 'staff' && input.features) {
      replaceStaffPermissions(db, userId, input.features as FeatureKey[])
    }
    const row = findUserById(db, userId)!
    res.status(201).json(mapUser(db, row))
  }),
)

router.put(
  '/:id/permissions',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(updatePermissionsSchema, req.body)
    const db = getDatabase()
    const row = findUserById(db, id)
    if (!row) {
      throw new HttpError(404, 'User not found')
    }
    if (row.role === 'admin') {
      throw new HttpError(400, 'Admin users always have all permissions')
    }
    replaceStaffPermissions(db, id, input.features as FeatureKey[])
    res.json(mapUser(db, findUserById(db, id)!))
  }),
)

router.post(
  '/:id/reset-password',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(resetPasswordSchema, req.body)
    const db = getDatabase()
    const row = findUserById(db, id)
    if (!row) {
      throw new HttpError(404, 'User not found')
    }
    const { hashHex, saltHex } = hashPasswordToHex(input.newPassword)
    db.prepare(
      `UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 1 WHERE id = ?`,
    ).run(hashHex, saltHex, id)
    destroySessionsForUser(id)
    res.json(mapUser(db, findUserById(db, id)!))
  }),
)

router.delete(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    const row = findUserById(db, id)
    if (!row) {
      throw new HttpError(404, 'User not found')
    }
    if (req.user?.id === id) {
      throw new HttpError(400, 'You cannot deactivate your own account')
    }
    if (row.role === 'admin') {
      const adminCount = (
        db
          .prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1`)
          .get() as { count: number }
      ).count
      if (adminCount <= 1) {
        throw new HttpError(400, 'Cannot deactivate the last admin')
      }
    }
    db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(id)
    destroySessionsForUser(id)
    res.status(204).end()
  }),
)

export default router
