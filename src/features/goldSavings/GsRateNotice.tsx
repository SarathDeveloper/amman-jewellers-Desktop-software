import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { GoldSavingRate } from '@shared/types'
import { api } from '../../lib/api'
import { formatCurrency, formatDisplayDate } from '../../lib/format'

/**
 * Shows the gold rate that applies to a date and enforces rate safety: when the
 * rate on file is not dated the same day, an administrator must tick a
 * confirmation and staff are blocked with a link to the rates page.
 */
export function GsRateNotice({
  date,
  purity,
  isAdmin,
  acceptRateDate,
  onAcceptRateDateChange,
  onRate,
}: {
  date: string
  purity: string
  isAdmin: boolean
  acceptRateDate: boolean
  onAcceptRateDateChange: (next: boolean) => void
  onRate?: (rate: GoldSavingRate | null) => void
}) {
  const [rate, setRate] = useState<GoldSavingRate | null>(null)
  const [loading, setLoading] = useState(() => /^\d{4}-\d{2}-\d{2}$/.test(date) && Boolean(purity))
  const onRateRef = useRef(onRate)

  useEffect(() => {
    onRateRef.current = onRate
  }, [onRate])

  useEffect(() => {
    let active = true
    const run = async () => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !purity) {
        setRate(null)
        onRateRef.current?.(null)
        return
      }
      setLoading(true)
      try {
        const next = await api.getGsRate(date, purity)
        if (!active) return
        setRate(next)
        onRateRef.current?.(next)
      } catch {
        if (!active) return
        setRate(null)
        onRateRef.current?.(null)
      } finally {
        if (active) setLoading(false)
      }
    }
    void run()
    return () => {
      active = false
    }
  }, [date, purity])

  if (loading) {
    return <p className="muted">Checking the gold rate…</p>
  }
  if (!rate) {
    return <p className="muted">No gold rate is configured for this purity.</p>
  }

  return (
    <div className="gs-rate-notice">
      <p className="muted">
        Rate {formatCurrency(rate.rate)} / g, set on {formatDisplayDate(rate.effectiveDate)}
      </p>
      {rate.matchesDate ? null : isAdmin ? (
        <label className="gs-check gs-rate-warning">
          <input
            type="checkbox"
            checked={acceptRateDate}
            onChange={(event) => onAcceptRateDateChange(event.target.checked)}
          />
          No rate is saved for {formatDisplayDate(date)}. The rate above is from{' '}
          {formatDisplayDate(rate.effectiveDate)} — confirm to use it.
        </label>
      ) : (
        <div className="error-banner">
          No gold rate is saved for {formatDisplayDate(date)}. Ask an administrator to set it on the{' '}
          <Link to="/rates">rates page</Link>.
        </div>
      )}
    </div>
  )
}
