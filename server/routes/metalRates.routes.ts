import { Router } from 'express'
import { deriveGoldRates, deriveSilverRates } from '@shared/billing/metalRateDerivation'
import { metalRatesInputSchema } from '@shared/schemas'
import type { MetalRates, MetalRatesInput } from '@shared/types'
import { requireFeature } from '../auth/middleware'
import { getDatabase } from '../db'
import { asyncHandler, parseBody } from '../lib/http'

const router = Router()

const TREND_DAY_OPTIONS = [30, 90, 180, 365] as const

type MetalRatesRow = {
  id: number
  effective_date: string
  gold_22k: number
  gold_24k: number
  gold_20k: number
  gold_18k: number
  silver_fine: number
  silver_925: number
  created_at: string
}

function mapRow(row: MetalRatesRow): MetalRates {
  return {
    id: row.id,
    effectiveDate: row.effective_date,
    gold22k: row.gold_22k,
    gold24k: row.gold_24k,
    gold20k: row.gold_20k,
    gold18k: row.gold_18k,
    silverFine: row.silver_fine,
    silver925: row.silver_925,
    createdAt: row.created_at,
  }
}

function completeRates(input: MetalRatesInput) {
  const gold = deriveGoldRates(24, input.gold24k)
  const silver = deriveSilverRates(999, input.silverFine)
  return {
    effectiveDate: input.effectiveDate,
    gold22k: input.gold22k,
    gold24k: input.gold24k,
    gold20k: input.gold20k ?? gold.gold20k,
    gold18k: input.gold18k ?? gold.gold18k,
    silverFine: input.silverFine,
    silver925: input.silver925 ?? silver.silver925,
  }
}

function parseDaysQuery(value: unknown): (typeof TREND_DAY_OPTIONS)[number] | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string') return null
  const days = Number(raw)
  return TREND_DAY_OPTIONS.includes(days as (typeof TREND_DAY_OPTIONS)[number])
    ? (days as (typeof TREND_DAY_OPTIONS)[number])
    : null
}

export function getLatestMetalRates(db: ReturnType<typeof getDatabase>): MetalRates | null {
  const row = db
    .prepare('SELECT * FROM metal_rates ORDER BY effective_date DESC LIMIT 1')
    .get() as MetalRatesRow | undefined
  return row ? mapRow(row) : null
}

router.get(
  '/latest',
  asyncHandler((_req, res) => {
    res.json(getLatestMetalRates(getDatabase()))
  }),
)

router.get(
  '/',
  asyncHandler((req, res) => {
    const db = getDatabase()
    const days = parseDaysQuery(req.query.days)
    const rows = days
      ? (db
          .prepare(
            `SELECT * FROM metal_rates
             WHERE effective_date >= date('now', ?)
             ORDER BY effective_date DESC`,
          )
          .all(`-${days} days`) as MetalRatesRow[])
      : (db
          .prepare('SELECT * FROM metal_rates ORDER BY effective_date DESC LIMIT 30')
          .all() as MetalRatesRow[])
    res.json(rows.map(mapRow))
  }),
)

router.post(
  '/',
  requireFeature('rates'),
  asyncHandler((req, res) => {
    const input = completeRates(parseBody(metalRatesInputSchema, req.body) as MetalRatesInput)
    const db = getDatabase()
    db.prepare(
      `INSERT INTO metal_rates (
         effective_date, gold_22k, gold_24k, gold_20k, gold_18k, silver_fine, silver_925, created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(effective_date) DO UPDATE SET
         gold_22k = excluded.gold_22k,
         gold_24k = excluded.gold_24k,
         gold_20k = excluded.gold_20k,
         gold_18k = excluded.gold_18k,
         silver_fine = excluded.silver_fine,
         silver_925 = excluded.silver_925,
         created_at = datetime('now')`,
    ).run(
      input.effectiveDate,
      input.gold22k,
      input.gold24k,
      input.gold20k,
      input.gold18k,
      input.silverFine,
      input.silver925,
    )

    const row = db
      .prepare('SELECT * FROM metal_rates WHERE effective_date = ?')
      .get(input.effectiveDate) as MetalRatesRow
    res.json(mapRow(row))
  }),
)

export default router
