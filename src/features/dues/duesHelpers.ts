import type { CustomerDuesColumn, DueEntry, DuesLedger } from '@shared/types'

export function runningBalances(entries: DueEntry[]): number[] {
  let balance = 0
  return entries.map((entry) => {
    if (entry.kind === 'due') {
      balance += entry.amount
    } else {
      balance -= entry.amount
    }
    return balance
  })
}

export function balanceForEntries(entries: DueEntry[]): number {
  return runningBalances(entries).at(-1) ?? 0
}

export function productSummary(entry: DueEntry): string | null {
  if (entry.items.length === 0) {
    return null
  }
  const first = entry.items[0].productName
  if (entry.items.length === 1) {
    return first
  }
  return `${first} +${entry.items.length - 1} more`
}

export function totalNetWeight(entry: DueEntry): number {
  return entry.items.reduce((sum, item) => sum + item.netWeight, 0)
}

export function remainingBalance(entry: DueEntry, columnBalance?: number): number {
  if (entry.invoiceId !== null || entry.pledgeId !== null) {
    return Math.max(0, entry.balanceDue ?? 0)
  }
  if (entry.kind !== 'due') {
    return 0
  }
  if (columnBalance === undefined) {
    return entry.amount
  }
  return Math.max(0, Math.min(entry.amount, columnBalance))
}

export function lastPaymentDate(entries: DueEntry[]): string | null {
  let latest: string | null = null
  for (const entry of entries) {
    if (entry.kind !== 'payment') continue
    const key = entry.entryDate.slice(0, 10)
    if (!latest || key > latest) latest = key
  }
  return latest
}

export function firstCollectableDue(column: CustomerDuesColumn): DueEntry | null {
  return column.entries.find((entry) => entry.kind === 'due' && remainingBalance(entry, column.balance) > 0) ?? null
}

export function isBillEntry(entry: DueEntry): boolean {
  return entry.pledgeId === null
}

export function billColumn(column: CustomerDuesColumn): CustomerDuesColumn {
  const entries = column.entries.filter(isBillEntry)
  return { ...column, entries, balance: balanceForEntries(entries) }
}

export function billColumns(columns: CustomerDuesColumn[]): CustomerDuesColumn[] {
  return columns.map(billColumn).filter((column) => column.entries.length > 0)
}

export function billOutstanding(columns: CustomerDuesColumn[]): number {
  return billColumns(columns).reduce((sum, column) => sum + column.balance, 0)
}

export function emptyDuesLedger(): DuesLedger {
  return { columns: [], totalOutstanding: 0, adaguDues: [], adaguOutstanding: 0 }
}
