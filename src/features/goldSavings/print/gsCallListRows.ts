import type { GoldSavingReportResult } from '@shared/types'

export interface GsCallListRow {
  account: string
  customer: string
  mobile: string
  scheme: string
  overdueCount: number
  daysOverdue: number
  amount: number
}

function text(row: Record<string, string | number>, column: string): string {
  return String(row[column] ?? '')
}

function num(row: Record<string, string | number>, column: string): number {
  return Number(row[column] || 0)
}

/**
 * Collapses the per-installment `overdue-aging` report into one line per
 * account, so a counter clerk calls a customer once rather than once for every
 * overdue installment. Pass an empty `bucket` for the whole report.
 */
export function groupCallList(report: GoldSavingReportResult, bucket: string): GsCallListRow[] {
  const groups = new Map<string, GsCallListRow>()
  for (const row of report.rows) {
    if (bucket && text(row, 'Bucket') !== bucket) continue
    const account = text(row, 'Account')
    const existing = groups.get(account)
    if (existing) {
      existing.overdueCount += 1
      existing.daysOverdue = Math.max(existing.daysOverdue, num(row, 'Days overdue'))
      existing.amount += num(row, 'Amount')
      if (!existing.mobile) existing.mobile = text(row, 'Mobile')
      continue
    }
    groups.set(account, {
      account,
      customer: text(row, 'Customer'),
      mobile: text(row, 'Mobile'),
      scheme: text(row, 'Scheme'),
      overdueCount: 1,
      daysOverdue: num(row, 'Days overdue'),
      amount: num(row, 'Amount'),
    })
  }
  return [...groups.values()].sort(
    (a, b) => b.daysOverdue - a.daysOverdue || a.account.localeCompare(b.account),
  )
}
