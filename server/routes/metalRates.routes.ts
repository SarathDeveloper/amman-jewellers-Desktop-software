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
  gold_22k_buy: number
  gold_24k_buy: number
  gold_20k_buy: number
  gold_18k_buy: number
  silver_fine_buy: number
  silver_925_buy: number
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
    gold22kBuy: row.gold_22k_buy,
    gold24kBuy: row.gold_24k_buy,
    gold20kBuy: row.gold_20k_buy,
    gold18kBuy: row.gold_18k_buy,
    silverFineBuy: row.silver_fine_buy,
    silver925Buy: row.silver_925_buy,
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
    gold22kBuy: input.gold22kBuy ?? 0,
    gold24kBuy: input.gold24kBuy ?? 0,
    gold20kBuy: input.gold20kBuy ?? 0,
    gold18kBuy: input.gold18kBuy ?? 0,
    silverFineBuy: input.silverFineBuy ?? 0,
    silver925Buy: input.silver925Buy ?? 0,
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

/**
 * The rate that applied on `date`: the latest row whose `effective_date` is on
 * or before the target date. Returns null when no rate reaches back that far.
 */
export function getMetalRatesForDate(
  db: ReturnType<typeof getDatabase>,
  date: string,
): MetalRates | null {
  const row = db
    .prepare(
      'SELECT * FROM metal_rates WHERE effective_date <= ? ORDER BY effective_date DESC LIMIT 1',
    )
    .get(date) as MetalRatesRow | undefined
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
        effective_date, gold_22k, gold_24k, gold_20k, gold_18k, silver_fine, silver_925,
        gold_22k_buy, gold_24k_buy, gold_20k_buy, gold_18k_buy, silver_fine_buy, silver_925_buy,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(effective_date) DO UPDATE SET
        gold_22k = excluded.gold_22k,
        gold_24k = excluded.gold_24k,
        gold_20k = excluded.gold_20k,
        gold_18k = excluded.gold_18k,
        silver_fine = excluded.silver_fine,
        silver_925 = excluded.silver_925,
        gold_22k_buy = excluded.gold_22k_buy,
        gold_24k_buy = excluded.gold_24k_buy,
        gold_20k_buy = excluded.gold_20k_buy,
        gold_18k_buy = excluded.gold_18k_buy,
        silver_fine_buy = excluded.silver_fine_buy,
        silver_925_buy = excluded.silver_925_buy,
        created_at = datetime('now')`,
    ).run(
      input.effectiveDate,
      input.gold22k,
      input.gold24k,
      input.gold20k,
      input.gold18k,
      input.silverFine,
      input.silver925,
      input.gold22kBuy,
      input.gold24kBuy,
      input.gold20kBuy,
      input.gold18kBuy,
      input.silverFineBuy,
      input.silver925Buy,
    )

    const row = db
      .prepare('SELECT * FROM metal_rates WHERE effective_date = ?')
      .get(input.effectiveDate) as MetalRatesRow
    res.json(mapRow(row))
  }),
)

export default router
