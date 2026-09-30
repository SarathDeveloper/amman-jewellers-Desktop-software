import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { ZodError } from 'zod'
import type { ZodType } from 'zod'
import { classifyFailure, isExpectedError } from './diagnostics'
import { getDiagnosticReferenceId, logDiagnostic } from './logger'

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => unknown | Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next)
  }
}

export function parseBody<T>(schema: ZodType<T>, raw: unknown): T {
  return schema.parse(raw ?? undefined)
}

export function parseIdParam(value: string): number {
  const id = Number.parseInt(value, 10)
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, 'Invalid id')
  }
  return id
}

export function errorMiddleware(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    return
  }

  if (error instanceof ZodError) {
    const message = error.issues[0]?.message ?? 'Invalid input'
    res.status(400).json({ error: message })
    return
  }

  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message })
    return
  }

  const message = error instanceof Error ? error.message : 'An unexpected error occurred'
  if (/not found/i.test(message)) {
    res.status(404).json({ error: message })
    return
  }
  if (isExpectedError(error)) {
    res.status(400).json({ error: message })
    return
  }

  const alreadyLogged = getDiagnosticReferenceId(error)
  if (alreadyLogged) {
    res.status(500).json({ error: message, referenceId: alreadyLogged })
    return
  }

  const category = classifyFailure(req.path, error)
  if (category) {
    const { referenceId } = logDiagnostic(category, `HTTP ${req.method} ${req.path} failed`, error)
    res.status(500).json({ error: message, referenceId })
    return
  }

  res.status(500).json({ error: message })
}
