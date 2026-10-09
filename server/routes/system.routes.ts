import { Router } from 'express'
import { pledgeWhatsAppOpenSchema } from '@shared/schemas'
import { requireAuth } from '../auth/middleware'
import { getDatabase } from '../db'
import { asyncHandler, parseBody } from '../lib/http'
import { openExternalUrl } from '../lib/openExternal'

const router = Router()

/**
 * Open a WhatsApp reminder in the browser and log that it was sent. The link is
 * rebuilt from the shop template on the reminders endpoint, validated again
 * here, and only then handed to the operating system.
 */
router.post(
  '/open-whatsapp',
  requireAuth,
  asyncHandler((req, res) => {
    const input = parseBody(pledgeWhatsAppOpenSchema, req.body ?? {})
    const db = getDatabase()
    const pledge = db.prepare('SELECT id FROM pledges WHERE id = ?').get(input.pledgeId) as
      | { id: number }
      | undefined
    if (!pledge) {
      res.status(404).json({ error: 'Pledge not found' })
      return
    }

    openExternalUrl(input.url)
    db.prepare(
      `INSERT INTO pledge_reminders (pledge_id, kind, channel, sent_at)
       VALUES (?, ?, 'whatsapp', datetime('now'))`,
    ).run(input.pledgeId, input.kind || 'interest')

    res.json({ ok: true })
  }),
)

export default router
