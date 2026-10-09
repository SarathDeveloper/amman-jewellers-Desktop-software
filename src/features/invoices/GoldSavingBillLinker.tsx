import { PiggyBank, Trash2 } from 'lucide-react'
import type { GoldSavingInvoiceLink, GoldSavingSchemeCreditPreview } from '@shared/types'
import { formatCurrency, formatWeight } from '../../lib/format'

/**
 * Applies a customer's gold savings balance as a credit on a sale bill. The
 * value uses the account's accumulated grams plus any earned bonus at the gold
 * rate for the account's purity. Finalize creates the redemption.
 */
export function GoldSavingBillLinker({
  accounts,
  links,
  selectedAccountId,
  disabled,
  onSelect,
}: {
  accounts: GoldSavingSchemeCreditPreview[]
  links: GoldSavingInvoiceLink[]
  selectedAccountId: number | null
  disabled?: boolean
  onSelect: (accountId: number | null) => void
}) {
  if (disabled && links.length === 0) return null

  return (
    <div className="adagu-design-card sale-bill-old-gold">
      <div className="adagu-card-header">
        <div className="adagu-card-title-group">
          <div className="adagu-card-icon" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <PiggyBank size={16} strokeWidth={1.75} />
          </div>
          <div className="adagu-card-titles">
            <h2>Gold Savings</h2>
          </div>
        </div>
      </div>

      {disabled ? (
        <div className="adagu-jewellery-table-wrap">
          <table className="adagu-jewellery-table old-gold-table old-gold-table--links">
            <thead>
              <tr>
                <th>Account</th>
                <th className="num">Gold</th>
                <th className="adagu-col-amount">Credit</th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.id}>
                  <td>{link.accountNo}</td>
                  <td className="num">{formatWeight(link.goldWeight + link.bonusGoldWeight, 3)}</td>
                  <td className="adagu-col-amount num">{formatCurrency(link.amountApplied)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : accounts.length === 0 ? (
        <p className="bill-empty-hint">No scheme balance available to redeem on this bill.</p>
      ) : (
        <div className="adagu-jewellery-table-wrap">
          <table className="adagu-jewellery-table old-gold-table old-gold-table--links">
            <thead>
              <tr>
                <th>Account</th>
                <th className="num">Gold</th>
                <th className="num">Rate</th>
                <th className="adagu-col-amount">Credit</th>
                <th className="adagu-col-action">
                  <span className="adagu-sr-only">Apply</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => {
                const applied = account.accountId === selectedAccountId
                return (
                  <tr key={account.accountId}>
                    <td>
                      <span className="cell-truncate" title={`${account.accountNo} · ${account.schemeName}`}>
                        {account.accountNo}
                        <span className="muted"> · {account.schemeName}</span>
                      </span>
                    </td>
                    <td className="num">
                      {formatWeight(account.goldWeight, 3)}
                      {account.bonusGoldWeight > 0 ? (
                        <span className="muted"> (incl. {formatWeight(account.bonusGoldWeight, 3)} bonus)</span>
                      ) : null}
                    </td>
                    <td className="num">{formatCurrency(account.goldRate)}</td>
                    <td className="adagu-col-amount num">{formatCurrency(account.credit)}</td>
                    <td className="adagu-col-action">
                      {applied ? (
                        <button
                          type="button"
                          className="adagu-action-btn-red"
                          aria-label={`Remove ${account.accountNo}`}
                          onClick={() => onSelect(null)}
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : (
                        <button type="button" className="btn ghost" onClick={() => onSelect(account.accountId)}>
                          Apply
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
