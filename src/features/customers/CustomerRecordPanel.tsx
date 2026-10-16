import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Customer, Pledge } from '@shared/types'
import { formatCurrency, formatDisplayDate } from '../../lib/format'
import { loadCustomerLoans, loanStatusLabel } from './customerLoans'

function detail(label: string, value: string, wide = false) {
  return (
    <p className={wide ? 'customer-record-span' : undefined}>
      <strong>{label}</strong>
      {value.trim() || '—'}
    </p>
  )
}

export function CustomerRecordPanel({
  customer,
  profileTitle = 'Customer',
  showDetails = true,
  linkLoans = false,
  loans: loansProp,
}: {
  customer: Customer
  profileTitle?: string
  /** The loan editor already shows these fields, so it only needs the history. */
  showDetails?: boolean
  /** Receipt links leave the current screen. Keep them on the customer page only. */
  linkLoans?: boolean
  /** When provided, skip the internal fetch so the customer page can share one load. */
  loans?: Pledge[]
}) {
  const [fetchedLoans, setFetchedLoans] = useState<Pledge[] | null>(null)
  const [loanError, setLoanError] = useState<string | null>(null)
  const provided = loansProp !== undefined

  useEffect(() => {
    if (provided) return
    let active = true
    void loadCustomerLoans(customer.id)
      .then((rows) => {
        if (active) {
          setFetchedLoans(rows)
          setLoanError(null)
        }
      })
      .catch(() => {
        if (active) {
          setFetchedLoans([])
          setLoanError('Loan history could not be loaded')
        }
      })
    return () => {
      active = false
    }
  }, [customer.id, provided])

  const loans = provided ? loansProp : fetchedLoans

  return (
    <div className="customer-record">
      {showDetails ? (
        <>
          <div className="customer-record-head">
            <h3>{profileTitle}</h3>
          </div>
          <div className="customer-record-grid">
            {detail('Name', customer.name)}
            {detail('Mobile', customer.phone)}
            {detail('F / M / H name', customer.guardianName ?? '')}
            {detail('Aadhaar', customer.aadhaar ?? '')}
            {detail('PAN', customer.pan ?? '')}
            {detail('GSTIN', customer.gstin ?? '')}
            {detail('ID proof', customer.idProofType ?? '')}
            {detail('Address', customer.address ?? '', true)}
            {detail('Notes', customer.notes ?? '', true)}
          </div>
        </>
      ) : null}
      <h3>Loan history</h3>
      {loanError ? <p className="adagu-field-error" role="alert">{loanError}</p> : null}
      {loans === null ? (
        <p className="muted">Loading loan history…</p>
      ) : loans.length === 0 && !loanError ? (
        <p className="muted">No loans yet.</p>
      ) : (
        <ul className="dues-detail-history">
          {loans.map((loan) => (
            <li key={loan.id}>
              {linkLoans ? (
                <Link to={`/billing/adagu/${loan.id}`}>{loan.receiptNo}</Link>
              ) : (
                <span>{loan.receiptNo}</span>
              )}
              <span>{formatDisplayDate(loan.pledgeDate)}</span>
              <span className="num">{formatCurrency(loan.loanAmount)}</span>
              <span>{loan.interestPct}% interest</span>
              <span>{loan.repaymentDueDate ? formatDisplayDate(loan.repaymentDueDate) : '—'}</span>
              <span className={loan.status === 'active' ? 'due-amount' : 'paid-amount'}>
                {loanStatusLabel(loan.status)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
