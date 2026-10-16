import type { Pledge, PledgeStatus } from '@shared/types'
import { api } from '../../lib/api'

const LOAN_PAGE_SIZE = 50

export async function loadCustomerLoans(customerId: number): Promise<Pledge[]> {
  const first = await api.listPledges({
    customerId,
    page: 1,
    pageSize: LOAN_PAGE_SIZE,
    sort: 'desc',
  })
  const items = [...(first.items ?? [])]
  const total = first.total ?? items.length
  let page = 1
  while (items.length < total && page < 20) {
    page += 1
    const next = await api.listPledges({
      customerId,
      page,
      pageSize: LOAN_PAGE_SIZE,
      sort: 'desc',
    })
    const batch = next.items ?? []
    if (batch.length === 0) break
    items.push(...batch)
  }
  return items
}

export function loanStatusLabel(status: PledgeStatus): string {
  if (status === 'redeemed') return 'Redeemed'
  if (status === 'forfeited') return 'Forfeited'
  if (status === 'renewed') return 'Renewed'
  if (status === 'draft') return 'Draft'
  return 'Active'
}
