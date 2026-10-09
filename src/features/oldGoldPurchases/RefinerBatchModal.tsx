import { useEffect, useMemo, useState } from 'react'
import { localTodayIso } from '@shared/localDate'
import type { OldGoldBatch, OldGoldBatchItem, OldGoldSettlementMode, Supplier } from '@shared/types'
import { DateInput } from '../../components/DateInput'
import { Modal } from '../../components/Modal'
import { api } from '../../lib/api'
import { formatCurrency, formatWeight } from '../../lib/format'

export type RefinerBatchMode = 'create' | 'melt' | 'send' | 'settle' | 'cancel'

function roundWeight(value: number): number {
  return Math.round(value * 1000) / 1000
}

export function RefinerBatchModal({
  mode,
  batch,
  items = [],
  onClose,
  onSaved,
}: {
  mode: RefinerBatchMode
  batch?: OldGoldBatch | null
  items?: OldGoldBatchItem[]
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const [createdDate, setCreatedDate] = useState(localTodayIso())
  const [supplierId, setSupplierId] = useState('')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [meltDate, setMeltDate] = useState(localTodayIso())
  const [meltedWeight, setMeltedWeight] = useState(() =>
    mode === 'melt' && batch ? String(roundWeight(batch.grossWeight)) : '',
  )
  const [sentDate, setSentDate] = useState(localTodayIso())
  const [sentWeight, setSentWeight] = useState(() =>
    mode === 'send' && batch ? String(roundWeight(batch.meltedWeight ?? batch.grossWeight)) : '',
  )
  const [settledDate, setSettledDate] = useState(localTodayIso())
  const [fineWeightReceived, setFineWeightReceived] = useState(() =>
    mode === 'settle' && batch ? String(roundWeight(batch.fineWeightExpected)) : '',
  )
  const [fineRate, setFineRate] = useState(() =>
    mode === 'settle' && batch && batch.fineRate != null ? String(batch.fineRate) : '',
  )
  const [cashReceived, setCashReceived] = useState(() =>
    mode === 'settle' && batch && batch.cashReceived != null ? String(batch.cashReceived) : '',
  )
  const [settlementMode, setSettlementMode] = useState<OldGoldSettlementMode>('cash')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (mode !== 'create') return
    let active = true
    void api
      .listSuppliers()
      .then((rows) => {
        if (active) setSuppliers(rows)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [mode])

  const totals = useMemo(() => {
    const metal = items[0]?.metal ?? ''
    return {
      metal,
      count: items.length,
      grossWeight: roundWeight(items.reduce((sum, item) => sum + item.grossWeight, 0)),
      fineWeight: roundWeight(items.reduce((sum, item) => sum + item.fineWeight, 0)),
      costAmount: items.reduce((sum, item) => sum + item.finalValue, 0),
    }
  }, [items])

  const title =
    mode === 'create'
      ? 'Create refiner batch'
      : mode === 'melt'
        ? `Melt ${batch?.batchNo ?? ''}`
        : mode === 'send'
          ? `Send ${batch?.batchNo ?? ''} to refiner`
          : mode === 'settle'
            ? `Settle ${batch?.batchNo ?? ''}`
            : `Cancel ${batch?.batchNo ?? ''}`

  async function submit() {
    try {
      setSaving(true)
      setError(null)
      if (mode === 'create') {
        await api.createOldGoldBatch({
          itemIds: items.map((item) => item.id),
          createdDate,
          supplierId: supplierId ? Number.parseInt(supplierId, 10) : null,
          notes: notes.trim(),
        })
      } else if (batch && mode === 'melt') {
        const value = Number.parseFloat(meltedWeight)
        if (!Number.isFinite(value) || value < 0) {
          setError('Enter the melted weight')
          return
        }
        await api.meltOldGoldBatch(batch.id, { meltDate, meltedWeight: value, notes: notes.trim() })
      } else if (batch && mode === 'send') {
        const value = Number.parseFloat(sentWeight)
        if (!Number.isFinite(value) || value < 0) {
          setError('Enter the weight sent to the refiner')
          return
        }
        await api.sendOldGoldBatch(batch.id, { sentDate, sentWeight: value, notes: notes.trim() })
      } else if (batch && mode === 'settle') {
        const fineValue = Number.parseFloat(fineWeightReceived)
        const rateValue = Number.parseFloat(fineRate)
        const cashValue = cashReceived ? Number.parseFloat(cashReceived) : 0
        if (!Number.isFinite(fineValue) || fineValue < 0) {
          setError('Enter the fine weight received')
          return
        }
        if (!Number.isFinite(cashValue) || cashValue < 0) {
          setError('Enter the cash received')
          return
        }
        await api.settleOldGoldBatch(batch.id, {
          settledDate,
          fineWeightReceived: fineValue,
          fineRate: Number.isFinite(rateValue) ? rateValue : 0,
          cashReceived: cashValue,
          settlementMode,
          notes: notes.trim(),
        })
      } else if (batch && mode === 'cancel') {
        if (!reason.trim()) {
          setError('Enter a reason')
          return
        }
        await api.cancelOldGoldBatch(batch.id, { reason: reason.trim() })
      }
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <div className="modal-actions">
          <button type="button" className="btn secondary" disabled={saving} onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className={`btn${mode === 'cancel' ? ' link-danger' : ''}`}
            disabled={saving}
            onClick={() => void submit()}
          >
            {saving ? 'Saving…' : mode === 'cancel' ? 'Cancel batch' : 'Save'}
          </button>
        </div>
      }
    >
      {error ? <div className="error-banner">{error}</div> : null}

      {mode === 'create' ? (
        <>
          <p className="bill-empty-hint">
            {totals.count} item{totals.count === 1 ? '' : 's'} of {totals.metal || 'old gold'} ·{' '}
            {formatWeight(totals.grossWeight)} gross · {formatWeight(totals.fineWeight)} fine ·{' '}
            {formatCurrency(totals.costAmount)} cost.
          </p>
          <div className="adagu-form-fields">
            <div className="adagu-field">
              <label>Batch date</label>
              <DateInput className="input" value={createdDate} disabled={saving} onChange={setCreatedDate} />
            </div>
            <div className="adagu-field">
              <label>Refiner</label>
              <select
                className="input"
                value={supplierId}
                disabled={saving}
                onChange={(event) => setSupplierId(event.target.value)}
              >
                <option value="">Not set</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="adagu-field adagu-field-wide">
              <label>Notes</label>
              <input
                className="input"
                value={notes}
                disabled={saving}
                placeholder="Optional"
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </div>
        </>
      ) : null}

      {mode === 'melt' && batch ? (
        <div className="adagu-form-fields">
          <div className="adagu-field">
            <label>Melt date</label>
            <DateInput className="input" value={meltDate} disabled={saving} onChange={setMeltDate} />
          </div>
          <div className="adagu-field">
            <label>Melted weight (g)</label>
            <input
              className="input"
              type="number"
              step="0.001"
              value={meltedWeight}
              disabled={saving}
              onChange={(event) => setMeltedWeight(event.target.value)}
            />
          </div>
          <div className="adagu-field adagu-field-wide">
            <label>Notes</label>
            <input
              className="input"
              value={notes}
              disabled={saving}
              placeholder="Optional"
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>
      ) : null}

      {mode === 'send' && batch ? (
        <div className="adagu-form-fields">
          <div className="adagu-field">
            <label>Sent date</label>
            <DateInput className="input" value={sentDate} disabled={saving} onChange={setSentDate} />
          </div>
          <div className="adagu-field">
            <label>Sent weight (g)</label>
            <input
              className="input"
              type="number"
              step="0.001"
              value={sentWeight}
              disabled={saving}
              onChange={(event) => setSentWeight(event.target.value)}
            />
          </div>
          <div className="adagu-field adagu-field-wide">
            <label>Notes</label>
            <input
              className="input"
              value={notes}
              disabled={saving}
              placeholder="Optional"
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>
      ) : null}

      {mode === 'settle' && batch ? (
        <div className="adagu-form-fields">
          <div className="adagu-field">
            <label>Settled date</label>
            <DateInput className="input" value={settledDate} disabled={saving} onChange={setSettledDate} />
          </div>
          <div className="adagu-field">
            <label>Fine weight received (g)</label>
            <input
              className="input"
              type="number"
              step="0.001"
              value={fineWeightReceived}
              disabled={saving}
              onChange={(event) => setFineWeightReceived(event.target.value)}
            />
          </div>
          <div className="adagu-field">
            <label>Fine rate (₹/g)</label>
            <input
              className="input"
              type="number"
              step="0.01"
              value={fineRate}
              disabled={saving}
              onChange={(event) => setFineRate(event.target.value)}
            />
          </div>
          <div className="adagu-field">
            <label>Cash received (₹)</label>
            <input
              className="input"
              type="number"
              step="0.01"
              value={cashReceived}
              disabled={saving}
              onChange={(event) => setCashReceived(event.target.value)}
            />
          </div>
          <div className="adagu-field">
            <label>Settlement mode</label>
            <select
              className="input"
              value={settlementMode}
              disabled={saving}
              onChange={(event) => setSettlementMode(event.target.value as OldGoldSettlementMode)}
            >
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
              <option value="fine">Fine metal</option>
            </select>
          </div>
          <div className="adagu-field adagu-field-wide">
            <label>Notes</label>
            <input
              className="input"
              value={notes}
              disabled={saving}
              placeholder="Optional"
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <p className="bill-empty-hint">
            Expected fine weight {formatWeight(batch.fineWeightExpected)} · cost{' '}
            {formatCurrency(batch.costAmount)}.
          </p>
        </div>
      ) : null}

      {mode === 'cancel' && batch ? (
        <>
          <p className="bill-empty-hint">
            Cancelling releases all {batch.items.length} item
            {batch.items.length === 1 ? '' : 's'} back to the lot. This is only possible before the batch
            is settled.
          </p>
          <div className="adagu-form-fields">
            <div className="adagu-field adagu-field-wide">
              <label>Reason</label>
              <input
                className="input"
                value={reason}
                disabled={saving}
                placeholder="Why is this batch being cancelled?"
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          </div>
        </>
      ) : null}
    </Modal>
  )
}
