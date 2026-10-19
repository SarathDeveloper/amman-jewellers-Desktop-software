import { useEffect, useState } from 'react'
import type { OldGoldLot } from '@shared/types'
import { EmptyState } from '../../components/EmptyState'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/PageHeader'
import { StatCard } from '../../components/StatCard'
import { api } from '../../lib/api'
import { formatCurrency, formatDisplayDate, formatWeight } from '../../lib/format'

export function OldGoldLotPage() {
  const [lot, setLot] = useState<OldGoldLot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const lotPayload = await api.getOldGoldLot()
        if (!active) return
        setLot(lotPayload)
        setError(null)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to load the old gold lot')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const items = lot?.items ?? []

  return (
    <div className="app-page app-page-fill">
      <PageHeader
        title="Old Gold Lot"
        subtitle="Unclaimed old gold by metal."
      />

      {error ? <div className="error-banner">{error}</div> : null}

      {loading ? (
        <LoadingState />
      ) : (
        <>
          {lot && lot.groups.length > 0 ? (
            <div className="stat-card-grid">
              {lot.groups.map((group) => (
                <StatCard
                  key={group.metal}
                  label={`${group.metal} lot · ${group.items} item${group.items === 1 ? '' : 's'}`}
                  value={`${formatWeight(group.grossWeight, 3)} · ${formatCurrency(group.costAmount)}`}
                />
              ))}
            </div>
          ) : null}

          <section className="card padded">
            {items.length === 0 ? (
              <EmptyState
                title="The lot is empty"
                description="Finalized old gold purchases that are not applied to a sale bill appear here."
              />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Purchase</th>
                      <th>Date</th>
                      <th>Customer</th>
                      <th>Item</th>
                      <th>Metal</th>
                      <th className="num">Gross (g)</th>
                      <th className="num">Net (g)</th>
                      <th className="num">Fine (g)</th>
                      <th>Purity</th>
                      <th className="num">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.purchaseNo}</td>
                        <td>{formatDisplayDate(item.purchaseDate)}</td>
                        <td>{item.customerName || '—'}</td>
                        <td>{item.description || 'Old gold'}</td>
                        <td>{item.metal}</td>
                        <td className="num">{formatWeight(item.grossWeight, 3)}</td>
                        <td className="num">{formatWeight(item.netWeight, 3)}</td>
                        <td className="num">{formatWeight(item.fineWeight, 3)}</td>
                        <td>{item.purity || '—'}</td>
                        <td className="num">{formatCurrency(item.finalValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
