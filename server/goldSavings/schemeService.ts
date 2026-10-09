import type Database from 'better-sqlite3'
import type { GoldSavingScheme, GoldSavingSchemeInput } from '@shared/types'
import { loadScheme, mapScheme, nextSchemeCode, writeAudit, type SchemeRow } from './rows'

function persistScheme(db: Database.Database, input: GoldSavingSchemeInput, id?: number, userId?: number | null) {
  const payload = {
    name: input.name.trim(),
    description: input.description ?? '',
    monthly_amount: input.monthlyAmount,
    duration_months: input.durationMonths,
    min_installment: input.minInstallment ?? null,
    max_installment: input.maxInstallment ?? null,
    purity: input.purity,
    gold_rate_source: input.goldRateSource,
    bonus_type: input.bonusType,
    bonus_value: input.bonusValue ?? 0,
    bonus_eligibility: input.bonusEligibility ?? '',
    allow_late_payments: input.allowLatePayments === false ? 0 : 1,
    grace_period_days: input.gracePeriodDays ?? 0,
    allow_missed_installments: input.allowMissedInstallments ? 1 : 0,
    allow_early_closure: input.allowEarlyClosure ? 1 : 0,
    allow_partial_redemption: input.allowPartialRedemption ? 1 : 0,
    allow_multiple_accounts: input.allowMultipleAccounts ? 1 : 0,
    redemption_type: input.redemptionType,
    making_charge_rules: input.makingChargeRules ?? '',
    wastage_rules: input.wastageRules ?? '',
    available_from: input.availableFrom ?? null,
    available_to: input.availableTo ?? null,
    terms: input.terms ?? '',
    status: input.status ?? 'active',
    cancel_deduction_type: input.cancelDeductionType ?? 'none',
    cancel_deduction_value: input.cancelDeductionValue ?? 0,
    late_fee_type: input.lateFeeType ?? 'none',
    late_fee_value: input.lateFeeValue ?? 0,
  }

  if (id) {
    const before = loadScheme(db, id)
    db.prepare(
      `UPDATE gold_saving_schemes SET
        name = ?, description = ?, monthly_amount = ?, duration_months = ?,
        min_installment = ?, max_installment = ?, purity = ?, gold_rate_source = ?,
        bonus_type = ?, bonus_value = ?, bonus_eligibility = ?,
        allow_late_payments = ?, grace_period_days = ?, allow_missed_installments = ?,
        allow_early_closure = ?, allow_partial_redemption = ?, allow_multiple_accounts = ?,
        redemption_type = ?, making_charge_rules = ?, wastage_rules = ?,
        available_from = ?, available_to = ?, terms = ?, status = ?,
        cancel_deduction_type = ?, cancel_deduction_value = ?,
        late_fee_type = ?, late_fee_value = ?,
        updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      payload.name,
      payload.description,
      payload.monthly_amount,
      payload.duration_months,
      payload.min_installment,
      payload.max_installment,
      payload.purity,
      payload.gold_rate_source,
      payload.bonus_type,
      payload.bonus_value,
      payload.bonus_eligibility,
      payload.allow_late_payments,
      payload.grace_period_days,
      payload.allow_missed_installments,
      payload.allow_early_closure,
      payload.allow_partial_redemption,
      payload.allow_multiple_accounts,
      payload.redemption_type,
      payload.making_charge_rules,
      payload.wastage_rules,
      payload.available_from,
      payload.available_to,
      payload.terms,
      payload.status,
      payload.cancel_deduction_type,
      payload.cancel_deduction_value,
      payload.late_fee_type,
      payload.late_fee_value,
      id,
    )
    const after = loadScheme(db, id)
    writeAudit(db, {
      entityType: 'scheme',
      entityId: id,
      action: 'update',
      changedBy: userId ?? null,
      before,
      after,
    })
    return after
  }

  const code = nextSchemeCode(db)
  const result = db
    .prepare(
      `INSERT INTO gold_saving_schemes (
        name, code, description, monthly_amount, duration_months, min_installment, max_installment,
        purity, gold_rate_source, bonus_type, bonus_value, bonus_eligibility,
        allow_late_payments, grace_period_days, allow_missed_installments,
        allow_early_closure, allow_partial_redemption, allow_multiple_accounts,
        redemption_type, making_charge_rules, wastage_rules, available_from, available_to, terms, status,
        cancel_deduction_type, cancel_deduction_value, late_fee_type, late_fee_value
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      payload.name,
      code,
      payload.description,
      payload.monthly_amount,
      payload.duration_months,
      payload.min_installment,
      payload.max_installment,
      payload.purity,
      payload.gold_rate_source,
      payload.bonus_type,
      payload.bonus_value,
      payload.bonus_eligibility,
      payload.allow_late_payments,
      payload.grace_period_days,
      payload.allow_missed_installments,
      payload.allow_early_closure,
      payload.allow_partial_redemption,
      payload.allow_multiple_accounts,
      payload.redemption_type,
      payload.making_charge_rules,
      payload.wastage_rules,
      payload.available_from,
      payload.available_to,
      payload.terms,
      payload.status,
      payload.cancel_deduction_type,
      payload.cancel_deduction_value,
      payload.late_fee_type,
      payload.late_fee_value,
    )
  const created = loadScheme(db, Number(result.lastInsertRowid))
  writeAudit(db, {
    entityType: 'scheme',
    entityId: created.id,
    action: 'create',
    changedBy: userId ?? null,
    after: created,
  })
  return created
}

export function listSchemes(db: Database.Database): GoldSavingScheme[] {
  const rows = db
    .prepare('SELECT * FROM gold_saving_schemes ORDER BY created_at DESC')
    .all() as SchemeRow[]
  return rows.map(mapScheme)
}

export function getScheme(db: Database.Database, id: number): GoldSavingScheme {
  return mapScheme(loadScheme(db, id))
}

export function createScheme(
  db: Database.Database,
  input: GoldSavingSchemeInput,
  userId: number | null,
): GoldSavingScheme {
  const tx = db.transaction(() => persistScheme(db, input, undefined, userId))
  return mapScheme(tx())
}

export function updateScheme(
  db: Database.Database,
  id: number,
  input: GoldSavingSchemeInput,
  userId: number | null,
): GoldSavingScheme {
  const tx = db.transaction(() => persistScheme(db, input, id, userId))
  return mapScheme(tx())
}
