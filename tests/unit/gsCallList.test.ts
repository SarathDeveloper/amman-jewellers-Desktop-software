import { describe, expect, it } from 'vitest'
import type { GoldSavingReportResult } from '../../shared/types'
import { groupCallList } from '../../src/features/goldSavings/print/gsCallListRows'

function row(overrides: Record<string, string | number>): Record<string, string | number> {
  return {
    Account: 'GS-0001',
    Customer: 'Ravi Kumar',
    Mobile: '9876543210',
    Scheme: 'Monthly',
    Installment: 1,
    Due: '2026-09-01',
    'Days overdue': 10,
    Amount: 2000,
    'Overdue count': 1,
    Bucket: '8-15 days',
    ...overrides,
  }
}

function report(rows: Array<Record<string, string | number>>): GoldSavingReportResult {
  return { id: 'overdue-aging', title: 'Overdue Aging', generatedAt: '', columns: [], rows }
}

describe('groupCallList', () => {
  it('collapses several overdue installments into one line per account', () => {
    const rows = groupCallList(
      report([
        row({ Account: 'GS-0001', Installment: 1, 'Days overdue': 40, Amount: 2000, Bucket: '30+ days' }),
        row({ Account: 'GS-0001', Installment: 2, 'Days overdue': 10, Amount: 2500, Bucket: '8-15 days' }),
        row({ Account: 'GS-0002', Customer: 'Priya', Mobile: '9876500002', 'Days overdue': 5, Amount: 1000, Bucket: '1-7 days' }),
      ]),
      '',
    )
    expect(rows).toHaveLength(2)
    const first = rows.find((entry) => entry.account === 'GS-0001')
    expect(first).toMatchObject({
      customer: 'Ravi Kumar',
      mobile: '9876543210',
      overdueCount: 2,
      daysOverdue: 40,
      amount: 4500,
    })
  })

  it('orders by days overdue, worst first', () => {
    const rows = groupCallList(
      report([
        row({ Account: 'GS-0002', 'Days overdue': 3, Bucket: '1-7 days' }),
        row({ Account: 'GS-0001', 'Days overdue': 45, Bucket: '30+ days' }),
      ]),
      '',
    )
    expect(rows.map((entry) => entry.account)).toEqual(['GS-0001', 'GS-0002'])
  })

  it('filters to a single bucket when one is given', () => {
    const rows = groupCallList(
      report([
        row({ Account: 'GS-0001', 'Days overdue': 40, Bucket: '30+ days' }),
        row({ Account: 'GS-0002', 'Days overdue': 5, Bucket: '1-7 days' }),
      ]),
      '30+ days',
    )
    expect(rows.map((entry) => entry.account)).toEqual(['GS-0001'])
    expect(rows[0].overdueCount).toBe(1)
  })
})
