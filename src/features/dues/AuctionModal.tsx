import { useEffect, useMemo, useState } from 'react'
import type {
  Pledge,
  PledgeAuction,
  PledgeAuctionBuyerType,
  PledgeAuctionInput,
} from '@shared/types'
import { localTodayIso } from '@shared/localDate'
import { DateInput } from '../../components/DateInput'
import { Modal } from '../../components/Modal'
import { api } from '../../lib/api'
import { formatCurrency, formatDisplayDate, formatWeight } from '../../lib/format'

type AuctionMode = 'notice' | 'auction'

export type AuctionModalSubject = {
  pledgeId: number
  receiptNo: string
  customerName: string
  remaining: number
}

export function AuctionModal({
  summary,
  mode,
  busy,
  onClose,
  onNotice,
  onAuction,
}: {
  summary: AuctionModalSubject
  mode: AuctionMode
  busy: boolean
  onClose: () => void
  onNotice: (input: { noticeDate: string }) => void
  onAuction: (input: Omit<PledgeAuctionInput, 'id'>) => void
}) {
  const [notice, setNotice] = useState<PledgeAuction | null>(null)
  const [noticeDate, setNoticeDate] = useState(localTodayIso())
  const [auctionDate, setAuctionDate] = useState(localTodayIso())
  const [saleAmount, setSaleAmount] = useState(0)
  const [buyerType, setBuyerType] = useState<PledgeAuctionBuyerType>('outside')
  const [buyerName, setBuyerName] = useState('')
  const [writeOffShortfall, setWriteOffShortfall] = useState(false)
  const [pledge, setPledge] = useState<Pledge | null>(null)
  const [categories, setCategories] = useState<string[]>([])
  const [itemCategories, setItemCategories] = useState<Record<number, string>>({})
  const [payoff, setPayoff] = useState(summary.remaining)
  const [formPledgeId, setFormPledgeId] = useState(summary.pledgeId)

  // A reused modal must not carry the previous loan's buyer or categories over.
  if (formPledgeId !== summary.pledgeId) {
    setFormPledgeId(summary.pledgeId)
    setBuyerName('')
    setBuyerType('outside')
    setItemCategories({})
    setWriteOffShortfall(false)
    setNotice(null)
    setNoticeDate(localTodayIso())
    setAuctionDate(localTodayIso())
    setSaleAmount(summary.remaining)
  }

  useEffect(() => {
    if (mode !== 'auction') return
    let active = true
    void (async () => {
      try {
        const [data, cats, noticeRow] = await Promise.all([
          api.getPledge(summary.pledgeId),
          api.listStockCategories(),
          api.getPledgeAuction(summary.pledgeId),
        ])
        if (!active) return
        setPledge(data)
        setCategories(cats.map((category) => category.name))
        setNotice(noticeRow)
        setAuctionDate((current) =>
          current && current !== localTodayIso()
            ? current
            : noticeRow?.auctionEligibleDate ?? current,
        )
        setSaleAmount((current) => current || summary.remaining)
      } catch {
        // The modal still works with the summary numbers if these fail.
      }
    })()
    return () => {
      active = false
    }
  }, [mode, summary.pledgeId, summary.remaining])

  useEffect(() => {
    if (mode !== 'auction') return
    let active = true
    void (async () => {
      try {
        const result = await api.getPledgePayoff(summary.pledgeId, auctionDate)
        if (active && result) setPayoff(result.payoff)
      } catch {
        // Keep the current payoff estimate.
      }
    })()
    return () => {
      active = false
    }
  }, [mode, summary.pledgeId, auctionDate])

  const shortfall = useMemo(
    () => Math.max(0, Math.round((payoff - saleAmount) * 100) / 100),
    [payoff, saleAmount],
  )
  const surplus = useMemo(
    () => Math.max(0, Math.round((saleAmount - payoff) * 100) / 100),
    [payoff, saleAmount],
  )

  const shopReady =
    buyerType !== 'shop' ||
    (pledge?.items.length ?? 0) === 0 ||
    (pledge?.items.every((item) => Boolean(itemCategories[item.id])) ?? false)

  if (mode === 'notice') {
    const noticeDays = notice?.noticeDays ?? 14
    const eligible = addDaysLocal(noticeDate, noticeDays)
    return (
      <Modal
        title={`Auction notice · ${summary.receiptNo}`}
        onClose={onClose}
        footer={
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => onNotice({ noticeDate })}
            >
              Send notice
            </button>
          </div>
        }
      >
        <dl className="dues-detail-totals">
          <div>
            <dt>Customer</dt>
            <dd>{summary.customerName}</dd>
          </div>
          <div>
            <dt>Payoff today</dt>
            <dd className="num">{formatCurrency(summary.remaining)}</dd>
          </div>
          <div>
            <dt>Notice period</dt>
            <dd>{notice?.noticeDays ?? 14} days</dd>
          </div>
        </dl>
        <div className="form-grid">
          <label>
            Notice date
            <DateInput
              className="input"
              value={noticeDate}
              onChange={(value) => setNoticeDate(value || localTodayIso())}
            />
          </label>
        </div>
        <p className="muted">
          After the notice, the auction can be recorded on or after {formatDisplayDate(eligible)}.
        </p>
      </Modal>
    )
  }

  return (
    <Modal
      title={`Record auction · ${summary.receiptNo}`}
      onClose={onClose}
      footer={
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || !shopReady}
            onClick={() =>
              onAuction({
                auctionDate,
                buyerType,
                buyerName: buyerName.trim(),
                saleAmount,
                writeOffShortfall,
                note: '',
                items: Object.entries(itemCategories).map(([id, category]) => ({
                  pledgeItemId: Number(id),
                  category,
                })),
              })
            }
          >
            Record auction
          </button>
        </div>
      }
    >
      <dl className="dues-detail-totals">
        <div>
          <dt>Notice sent</dt>
          <dd>{notice ? formatDisplayDate(notice.noticeDate) : '—'}</dd>
        </div>
        <div>
          <dt>Payoff on auction date</dt>
          <dd className="num">{formatCurrency(payoff)}</dd>
        </div>
        <div>
          <dt>{surplus > 0 ? 'Surplus to refund' : 'Shortfall'}</dt>
          <dd className="num">
            <strong>{formatCurrency(surplus > 0 ? surplus : shortfall)}</strong>
          </dd>
        </div>
      </dl>
      <div className="form-grid">
        <label>
          Auction date
          <DateInput
            className="input"
            value={auctionDate}
            onChange={(value) => setAuctionDate(value || localTodayIso())}
          />
        </label>
        <label>
          Sale amount
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            value={saleAmount || ''}
            onChange={(event) => setSaleAmount(Number(event.target.value) || 0)}
          />
        </label>
        <label>
          Buyer
          <select
            className="input"
            value={buyerType}
            onChange={(event) => setBuyerType(event.target.value as PledgeAuctionBuyerType)}
          >
            <option value="outside">Outside buyer</option>
            <option value="shop">Shop takes the gold</option>
          </select>
        </label>
        {buyerType === 'outside' ? (
          <label>
            Buyer name
            <input
              className="input"
              value={buyerName}
              onChange={(event) => setBuyerName(event.target.value)}
            />
          </label>
        ) : null}
      </div>

      {shortfall > 0 ? (
        <label className="adagu-banner-check">
          <input
            type="checkbox"
            checked={writeOffShortfall}
            onChange={(event) => setWriteOffShortfall(event.target.checked)}
          />
          Write off the {formatCurrency(shortfall)} shortfall
        </label>
      ) : null}

      {buyerType === 'shop' ? (
        <div className="adagu-auction-items">
          <h4>Stock categories for the bought-back items</h4>
          {(pledge?.items ?? []).map((item) => (
            <label key={item.id} className="adagu-auction-item">
              <span>
                {item.description} · {item.metal} {item.purity} · {formatWeight(item.netWeight, 3)} g
              </span>
              <select
                className="input"
                value={itemCategories[item.id] ?? ''}
                onChange={(event) =>
                  setItemCategories((current) => ({
                    ...current,
                    [item.id]: event.target.value,
                  }))
                }
              >
                <option value="">Select category</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : null}
    </Modal>
  )
}

function addDaysLocal(isoDate: string, days: number): string {
  if (!days) return isoDate
  const date = new Date(`${isoDate}T00:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}
