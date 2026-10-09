import type { RequestHandler } from 'express'
import type { FeatureKey, User, UserRole } from '@shared/types'
import { getDatabase } from '../db'
import { HttpError } from '../lib/http'
import { findUserById, mapUser } from './users'
import { getSession, parseCookies, SESSION_COOKIE, type SessionRecord } from './session'

declare module 'express-serve-static-core' {
  interface Request {
    session?: SessionRecord | null
    user?: User | null
  }
}

export const attachSession: RequestHandler = (req, _res, next) => {
  const cookies = parseCookies(req.headers.cookie)
  const session = getSession(cookies[SESSION_COOKIE])
  req.session = session
  if (!session) {
    req.user = null
    next()
    return
  }
  const db = getDatabase()
  const row = findUserById(db, session.userId)
  req.user = row && row.active === 1 ? mapUser(db, row) : null
  next()
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    next(new HttpError(401, 'Authentication required'))
    return
  }
  next()
}

export function requireRole(role: UserRole): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(new HttpError(401, 'Authentication required'))
      return
    }
    if (req.user.role !== role) {
      next(new HttpError(403, 'Permission denied'))
      return
    }
    next()
  }
}

export function requireFeature(feature: FeatureKey): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(new HttpError(401, 'Authentication required'))
      return
    }
    if (req.user.role === 'admin' || req.user.features.includes(feature)) {
      next()
      return
    }
    next(new HttpError(403, 'Permission denied'))
  }
}

export function requireAnyFeature(features: FeatureKey[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(new HttpError(401, 'Authentication required'))
      return
    }
    if (req.user.role === 'admin' || features.some((feature) => req.user?.features.includes(feature))) {
      next()
      return
    }
    next(new HttpError(403, 'Permission denied'))
  }
}

export function requireAuthAndFeature(feature: FeatureKey): RequestHandler[] {
  return [requireAuth, requireFeature(feature)]
}
