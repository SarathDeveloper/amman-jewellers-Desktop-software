import { useEffect, useState } from 'react'
import { Coins, Plus, Search, Trash2, Wallet } from 'lucide-react'
import { roundMoney } from '@shared/billing/pricing'
import type { OldGoldItem, OldGoldPurchase, OldGoldPurchaseLink } from '@shared/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useToast } from '../../components/toastContext'
import { api } from '../../lib/api'
import { formatCurrency, formatDisplayDate } from '../../lib/format'
import { OldGoldPayoutModal } from '../oldGoldPurchases/OldGoldPayoutModal'
import { OldGoldPurchaseEditorModal } from '../oldGoldPurchases/OldGoldPurchaseEditorModal'

const MONEY_EPSILON = 0.009

export function OldGoldBillLinker({
  links,
  legacyItems,
  disabled,
  currentInvoiceId,
  customerId,
  customerName,
  maxCredit,
  onChange,
  onLegacyChange,
}: {
  links: OldGoldPurchaseLink[]
  legacyItems: OldGoldItem[]
  disabled?: boolean
  currentInvoiceId?: number | null
  customerId?: number
  customerName?: string
  /** Rupees the bill can still absorb in old gold credit. */
  maxCredit?: number
  onChange: (links: OldGoldPurchaseLink[]) => void
  onLegacyChange: (items: OldGoldItem[]) => void
}) {
  const { showToast } = useToast()
  const [billNo, setBillNo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingPurchase, setPendingPurchase] = useState<OldGoldPurchase | null>(null)
  const [payoutPurchase, setPayoutPurchase] = useState<OldGoldPurchase | null>(null)
  const [available, setAvailable] = useState<OldGoldPurchase[]>([])
  const [newOpen, setNewOpen] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (disabled || !customerId || customerId <= 0) return
    let active = true
    void (async () => {
      try {
        const rows = await api.listOldGoldPurchases({ customerId, available: true })
        if (active) setAvailable(rows)
      } catch {
        if (active) setAvailable([])
      }
    })()
    return () => {
      active = false
    }
  }, [disabled, customerId, reloadToken])

  const pickable =
    !disabled && customerId != null && customerId > 0
      ? available.filter((purchase) => !links.some((link) => link.purchaseId === purchase.id))
      : []
  const hasRows = links.length > 0 || legacyItems.length > 0
  const linkedTotal = links.reduce((sum, link) => sum + link.amountApplied, 0)
  const legacyTotal = legacyItems.reduce((sum, item) => sum + item.finalValue, 0)
  const oldGoldTotal = linkedTotal + legacyTotal

  // Finalized / detail bills with no exchange credit should not show an empty card.
  if (disabled && !hasRows) return null

  function remainingCapacity(): number {
    if (maxCredit == null) return Number.POSITIVE_INFINITY
    return Math.max(0, roundMoney(maxCredit - linkedTotal))
  }

  function applyPurchase(purchase: OldGoldPurchase) {
    const capacity = remainingCapacity()
    if (capacity <= MONEY_EPSILON) {
      setError('This bill is already covered by old gold. Reduce a link before adding another.')
      return
    }
    const amount = roundMoney(Math.min(purchase.balance, capacity))
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
        amountApplied: amount,
        netWeight,
        purchaseTotal: purchase.totalAmount,
        balance: roundMoney(Math.max(0, purchase.balance - amount)),
      },
    ])
    setBillNo('')
    setReloadToken((token) => token + 1)
  }

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
      if (purchase.balance <= MONEY_EPSILON) {
        throw new Error(`${purchase.purchaseNo} has no balance left to apply`)
      }
      if (
        purchase.customerId != null &&
        customerId != null &&
        customerId > 0 &&
        purchase.customerId !== customerId
      ) {
        setPendingPurchase(purchase)
        return
      }
      applyPurchase(purchase)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Old gold purchase not found')
    } finally {
      setBusy(false)
    }
  }

  function updateAmount(purchaseId: number, raw: string) {
    const value = Number.parseFloat(raw)
    onChange(
      links.map((link) => {
        if (link.purchaseId !== purchaseId) return link
        const available = roundMoney(link.balance + link.amountApplied)
        const next = Number.isFinite(value) ? Math.min(Math.max(0, value), available) : 0
        return { ...link, amountApplied: roundMoney(next), balance: roundMoney(available - next) }
      }),
    )
  }

  async function openPayout(link: OldGoldPurchaseLink) {
    try {
      setError(null)
      const purchase = await api.getOldGoldPurchase(link.purchaseId)
      setPayoutPurchase(purchase)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load purchase')
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
        <>
          {pickable.length > 0 ? (
            <div className="old-gold-picker">
              <p className="old-gold-picker-title">Finalized old gold for this customer</p>
              <ul className="old-gold-picker-list">
                {pickable.map((purchase) => (
                  <li key={purchase.id}>
                    <span className="old-gold-picker-no">{purchase.purchaseNo}</span>
                    <span className="cell-hint">
                      {formatDisplayDate(purchase.purchaseDate)} · {formatCurrency(purchase.balance)} left
                    </span>
                    <button
                      type="button"
                      className="adagu-btn-add-item"
                      onClick={() => applyPurchase(purchase)}
                    >
                      Apply
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
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
            <button
              type="button"
              className="adagu-btn-add-item"
              onClick={() => setNewOpen(true)}
              disabled={busy}
            >
              <Plus size={14} /> New old gold
            </button>
          </form>
        </>
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
                  <>
                    <th className="adagu-col-amount">Balance left</th>
                    <th className="adagu-col-action">
                      <span className="adagu-sr-only">Actions</span>
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={`link-${link.purchaseId}`}>
                  <td className="old-gold-col-bill-no">{link.purchaseNo}</td>
                  <td className="old-gold-col-customer">{link.customerName || '—'}</td>
                  <td className="adagu-col-amount num">
                    {disabled ? (
                      formatCurrency(link.amountApplied)
                    ) : (
                      <input
                        className="input old-gold-amount-cell"
                        type="number"
                        step="0.01"
                        min="0"
                        value={link.amountApplied}
                        onChange={(event) => updateAmount(link.purchaseId, event.target.value)}
                        aria-label={`Amount from ${link.purchaseNo}`}
                      />
                    )}
                  </td>
                  {disabled ? null : (
                    <>
                      <td className="adagu-col-amount num">{formatCurrency(link.balance)}</td>
                      <td className="adagu-col-action">
                        {link.balance > MONEY_EPSILON ? (
                          <button
                            type="button"
                            className="btn ghost icon-btn"
                            aria-label={`Pay out balance of ${link.purchaseNo}`}
                            onClick={() => void openPayout(link)}
                          >
                            <Wallet size={14} />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="adagu-action-btn-red"
                          aria-label={`Remove ${link.purchaseNo}`}
                          onClick={() => onChange(links.filter((item) => item.purchaseId !== link.purchaseId))}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {legacyItems.map((item) => (
                <tr key={`legacy-${item.id}`}>
                  <td className="old-gold-col-bill-no">On this bill</td>
                  <td className="old-gold-col-customer">{item.description || 'Old gold'}</td>
                  <td className="adagu-col-amount num">{formatCurrency(item.finalValue)}</td>
                  {disabled ? null : (
                    <>
                      <td className="adagu-col-amount num">—</td>
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
                    </>
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

      {pendingPurchase ? (
        <ConfirmDialog
          title="Different customer"
          message={`${pendingPurchase.purchaseNo} belongs to ${pendingPurchase.customerName || 'another customer'}, but this bill is for ${customerName || 'this customer'}. Apply it anyway?`}
          confirmLabel="Apply anyway"
          danger={false}
          onCancel={() => setPendingPurchase(null)}
          onConfirm={() => {
            applyPurchase(pendingPurchase)
            setPendingPurchase(null)
          }}
        />
      ) : null}

      {payoutPurchase ? (
        <OldGoldPayoutModal
          purchase={payoutPurchase}
          onClose={() => setPayoutPurchase(null)}
          onSaved={(updated) => {
            onChange(
              links.map((link) =>
                link.purchaseId === updated.id ? { ...link, balance: updated.balance } : link,
              ),
            )
            setPayoutPurchase(null)
            showToast('Payout recorded', 'success')
          }}
        />
      ) : null}

      {newOpen ? (
        <OldGoldPurchaseEditorModal
          purchase={null}
          readOnly={false}
          initialCustomer={
            customerId && customerId > 0
              ? { id: customerId, name: customerName ?? '', phone: '' }
              : null
          }
          onClose={() => setNewOpen(false)}
          onSaved={async () => {
            setReloadToken((token) => token + 1)
          }}
          onFinalized={(created) => applyPurchase(created)}
        />
      ) : null}
    </div>
  )
}
