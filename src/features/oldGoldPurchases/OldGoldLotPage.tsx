import { useEffect, useMemo, useState } from 'react'
import { Flame, Send, Trash2, Truck } from 'lucide-react'
import type { OldGoldBatch, OldGoldBatchItem, OldGoldLot } from '@shared/types'
import { EmptyState } from '../../components/EmptyState'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/PageHeader'
import { StatCard } from '../../components/StatCard'
import { useToast } from '../../components/toastContext'
import { api } from '../../lib/api'
import { formatCurrency, formatDisplayDate, formatWeight } from '../../lib/format'
import { RefinerBatchModal, type RefinerBatchMode } from './RefinerBatchModal'

const STATUS_LABEL: Record<OldGoldBatch['status'], string> = {
  open: 'Open',
  melted: 'Melted',
  sent: 'Sent',
  settled: 'Settled',
  cancelled: 'Cancelled',
}

function roundWeight(value: number): number {
  return Math.round(value * 1000) / 1000
}

export function OldGoldLotPage() {
  const { showToast } = useToast()
  const [lot, setLot] = useState<OldGoldLot | null>(null)
  const [batches, setBatches] = useState<OldGoldBatch[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<
    { mode: RefinerBatchMode; batch?: OldGoldBatch; items?: OldGoldBatchItem[] } | null
  >(null)

  async function load() {
    try {
      setError(null)
      const [lotPayload, batchRows] = await Promise.all([api.getOldGoldLot(), api.listOldGoldBatches()])
      setLot(lotPayload)
      setBatches(batchRows)
      setSelected((current) => {
        const available = new Set(lotPayload.items.map((item) => item.id))
        return new Set([...current].filter((id) => available.has(id)))
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the old gold lot')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const [lotPayload, batchRows] = await Promise.all([
          api.getOldGoldLot(),
          api.listOldGoldBatches(),
        ])
        if (!active) return
        setLot(lotPayload)
        setBatches(batchRows)
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

  const items = useMemo(() => lot?.items ?? [], [lot])
  const selectedItems = useMemo(
    () => items.filter((item) => selected.has(item.id)),
    [items, selected],
  )
  const selectedMetal = selectedItems[0]?.metal ?? null

  function toggle(item: OldGoldBatchItem) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(item.id)) {
        next.delete(item.id)
        return next
      }
      if (selectedMetal && item.metal !== selectedMetal) {
        return next
      }
      next.add(item.id)
      return next
    })
  }

  function selectAllMetal(metal: string) {
    setSelected(new Set(items.filter((item) => item.metal === metal).map((item) => item.id)))
  }

  async function refreshAfterSave() {
    setModal(null)
    showToast('Refiner batch updated', 'success')
    await load()
  }

  return (
    <div className="app-page app-page-fill">
      <PageHeader
        title="Old Gold Lot"
        subtitle="Unclaimed old gold by metal. Gather it into a refiner batch, melt, send and settle. Received fine weight is settlement only and never adds to stock."
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
            <div className="dashboard-section-head">
              <h2 className="dashboard-section-title">Unbatched items</h2>
              {selected.size > 0 ? (
                <span className="muted">
                  {selected.size} selected · {formatWeight(roundWeight(selectedItems.reduce((sum, item) => sum + item.grossWeight, 0)), 3)}
                </span>
              ) : null}
            </div>
            {items.length === 0 ? (
              <EmptyState
                title="The lot is empty"
                description="Finalized old gold purchases that are not applied to a sale bill appear here."
              />
            ) : (
              <>
                <div className="row-actions" style={{ marginBottom: '0.75rem' }}>
                  {(lot?.groups ?? []).map((group) => (
                    <button
                      key={group.metal}
                      type="button"
                      className="btn ghost"
                      onClick={() => selectAllMetal(group.metal)}
                    >
                      Select all {group.metal}
                    </button>
                  ))}
                  {selected.size > 0 ? (
                    <button type="button" className="btn ghost" onClick={() => setSelected(new Set())}>
                      Clear
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn"
                    disabled={selectedItems.length === 0}
                    onClick={() => setModal({ mode: 'create', items: selectedItems })}
                  >
                    Create refiner batch
                  </button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th />
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
                      {items.map((item) => {
                        const disabled = selectedMetal != null && item.metal !== selectedMetal && !selected.has(item.id)
                        return (
                          <tr key={item.id}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selected.has(item.id)}
                                disabled={disabled}
                                aria-label={`Select item ${item.id}`}
                                onChange={() => toggle(item)}
                              />
                            </td>
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
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section className="card padded">
            <div className="dashboard-section-head">
              <h2 className="dashboard-section-title">Refiner batches</h2>
            </div>
            {batches.length === 0 ? (
              <p className="muted">No refiner batches yet.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Batch</th>
                      <th>Date</th>
                      <th>Metal</th>
                      <th>Refiner</th>
                      <th>Status</th>
                      <th className="num">Gross (g)</th>
                      <th className="num">Fine exp. (g)</th>
                      <th className="num">Cost</th>
                      <th className="num">Gain / loss</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((batch) => (
                      <tr key={batch.id}>
                        <td>{batch.batchNo}</td>
                        <td>{formatDisplayDate(batch.createdDate)}</td>
                        <td>{batch.metal}</td>
                        <td>{batch.supplierName || '—'}</td>
                        <td>
                          <span className={`badge ${batch.status}`}>{STATUS_LABEL[batch.status]}</span>
                        </td>
                        <td className="num">{formatWeight(batch.grossWeight, 3)}</td>
                        <td className="num">{formatWeight(batch.fineWeightExpected, 3)}</td>
                        <td className="num">{formatCurrency(batch.costAmount)}</td>
                        <td className={`num ${batch.gainLoss < 0 ? 'due-amount' : 'paid-amount'}`}>
                          {batch.status === 'settled' ? formatCurrency(batch.gainLoss) : '—'}
                        </td>
                        <td>
                          <div className="row-actions">
                            {batch.status === 'open' ? (
                              <button
                                type="button"
                                className="btn ghost"
                                onClick={() => setModal({ mode: 'melt', batch })}
                              >
                                <Flame size={15} /> Melt
                              </button>
                            ) : null}
                            {batch.status === 'melted' ? (
                              <button
                                type="button"
                                className="btn ghost"
                                onClick={() => setModal({ mode: 'send', batch })}
                              >
                                <Send size={15} /> Send
                              </button>
                            ) : null}
                            {batch.status === 'sent' ? (
                              <button
                                type="button"
                                className="btn ghost"
                                onClick={() => setModal({ mode: 'settle', batch })}
                              >
                                <Truck size={15} /> Settle
                              </button>
                            ) : null}
                            {batch.status === 'open' ||
                            batch.status === 'melted' ||
                            batch.status === 'sent' ? (
                              <button
                                type="button"
                                className="btn ghost icon-btn"
                                aria-label={`Cancel ${batch.batchNo}`}
                                onClick={() => setModal({ mode: 'cancel', batch })}
                              >
                                <Trash2 size={15} />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {modal ? (
        <RefinerBatchModal
          key={`${modal.mode}-${modal.batch?.id ?? 'new'}`}
          mode={modal.mode}
          batch={modal.batch}
          items={modal.items}
          onClose={() => setModal(null)}
          onSaved={refreshAfterSave}
        />
      ) : null}
    </div>
  )
}
