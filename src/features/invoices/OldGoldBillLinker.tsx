import { useState } from 'react'
import { Coins, Plus, Search, Trash2 } from 'lucide-react'
import type { OldGoldItem, OldGoldPurchaseLink } from '@shared/types'
import { api } from '../../lib/api'
import { formatCurrency } from '../../lib/format'

export function OldGoldBillLinker({
  links,
  legacyItems,
  disabled,
  currentInvoiceId,
  onChange,
  onLegacyChange,
}: {
  links: OldGoldPurchaseLink[]
  legacyItems: OldGoldItem[]
  disabled?: boolean
  currentInvoiceId?: number | null
  onChange: (links: OldGoldPurchaseLink[]) => void
  onLegacyChange: (items: OldGoldItem[]) => void
}) {
  const [billNo, setBillNo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasRows = links.length > 0 || legacyItems.length > 0
  const linkedTotal = links.reduce((sum, link) => sum + link.amountApplied, 0)
  const legacyTotal = legacyItems.reduce((sum, item) => sum + item.finalValue, 0)
  const oldGoldTotal = linkedTotal + legacyTotal

  // Finalized / detail bills with no exchange credit should not show an empty card.
  if (disabled && !hasRows) return null

  async function addByBillNo() {
    const value = billNo.trim()
    if (!value || disabled) return
    try {
      setBusy(true)
      setError(null)
      const purchase = await api.lookupOldGoldPurchaseByNo(value)
      if (links.some((link) => link.purchaseId === purchase.id)) {
        throw new Error(`${purchase.purchaseNo} is already on this bill`)
      }
      if (
        purchase.linkedInvoiceId != null &&
        purchase.linkedInvoiceId !== currentInvoiceId
      ) {
        throw new Error(
          `${purchase.purchaseNo} is already applied to ${purchase.linkedInvoiceNo ?? 'another bill'}`,
        )
      }
      const netWeight = purchase.items.reduce((sum, item) => sum + item.netWeight, 0)
      onChange([
        ...links,
        {
          id: 0,
          invoiceId: currentInvoiceId ?? 0,
          purchaseId: purchase.id,
          purchaseNo: purchase.purchaseNo,
          customerName: purchase.customerName,
          purchaseDate: purchase.purchaseDate,
          amountApplied: purchase.totalAmount,
          netWeight,
        },
      ])
      setBillNo('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Old gold purchase not found')
    } finally {
      setBusy(false)
    }
  }

  const HeaderIcon = disabled ? Coins : Plus

  return (
    <div className={`adagu-design-card sale-bill-old-gold${disabled ? ' sale-bill-old-gold--readonly' : ''}`}>
      <div className="adagu-card-header">
        <div className="adagu-card-title-group">
          <div className="adagu-card-icon" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <HeaderIcon size={16} strokeWidth={1.75} />
          </div>
          <div className="adagu-card-titles">
            <h2>Old Gold / Exchange</h2>
          </div>
        </div>
      </div>

      {disabled ? null : (
        <form
          className="old-gold-link-form"
          onSubmit={(event) => {
            event.preventDefault()
            void addByBillNo()
          }}
        >
          <label className="old-gold-link-field">
            <span>Old gold bill no</span>
            <input
              className="input"
              value={billNo}
              disabled={busy}
              placeholder="OGP-2026-0001"
              onChange={(event) => {
                setBillNo(event.target.value)
                setError(null)
              }}
            />
          </label>
          <button type="submit" className="adagu-btn-add-item" disabled={busy || !billNo.trim()}>
            <Search size={14} />
            {busy ? 'Looking up…' : 'Add'}
          </button>
        </form>
      )}

      {error ? <p className="old-gold-link-error">{error}</p> : null}

      {!hasRows ? (
        <p className="bill-empty-hint">Enter a finalized old gold purchase bill number to reduce this bill.</p>
      ) : (
        <div className="adagu-jewellery-table-wrap">
          <table className="adagu-jewellery-table old-gold-table old-gold-table--links">
            <thead>
              <tr>
                <th className="old-gold-col-bill-no">Bill no</th>
                <th className="old-gold-col-customer">Customer</th>
                <th className="adagu-col-amount">Amount</th>
                {disabled ? null : (
                  <th className="adagu-col-action">
                    <span className="adagu-sr-only">Remove</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={`link-${link.purchaseId}`}>
                  <td className="old-gold-col-bill-no">{link.purchaseNo}</td>
                  <td className="old-gold-col-customer">{link.customerName || '—'}</td>
                  <td className="adagu-col-amount num">{formatCurrency(link.amountApplied)}</td>
                  {disabled ? null : (
                    <td className="adagu-col-action">
                      <button
                        type="button"
                        className="adagu-action-btn-red"
                        aria-label={`Remove ${link.purchaseNo}`}
                        onClick={() => onChange(links.filter((item) => item.purchaseId !== link.purchaseId))}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {legacyItems.map((item) => (
                <tr key={`legacy-${item.id}`}>
                  <td className="old-gold-col-bill-no">On this bill</td>
                  <td className="old-gold-col-customer">{item.description || 'Old gold'}</td>
                  <td className="adagu-col-amount num">{formatCurrency(item.finalValue)}</td>
                  {disabled ? null : (
                    <td className="adagu-col-action">
                      <button
                        type="button"
                        className="adagu-action-btn-red"
                        aria-label="Remove old gold"
                        onClick={() => onLegacyChange(legacyItems.filter((row) => row.id !== item.id))}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasRows ? (
        <div className="old-gold-total">
          <span>Old gold total</span>
          <strong>{formatCurrency(oldGoldTotal)}</strong>
        </div>
      ) : null}
    </div>
  )
}
