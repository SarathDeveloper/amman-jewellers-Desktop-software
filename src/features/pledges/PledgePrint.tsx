import { amountInWords } from '@shared/billing/amountInWords'
import {
  monthlyPledgeInterestAmount,
  netPaidAmount,
  totalPayableAfterOneYear,
} from '@shared/billing/pledgeMath'
import type { Pledge } from '@shared/types'
import { formatDisplayDate, formatInr } from '../../lib/format'
import { EMPTY_SHOP_DISPLAY, localImageSrc, type ShopDisplayInfo } from '../invoices/mapShopDisplay'
import { AdaguBorrower, AdaguPrintSheet, AdaguSignatures } from './AdaguPrintHeader'

function weight(value: number): string {
  return value.toFixed(3)
}

/** Rupee amounts with Indian grouping: `₹35,000.00`. */
function rupees(value: number): string {
  return `₹${formatInr(value, 2)}`
}

/** KYC numbers are only ever printed masked: `XXXX XXXX 1234`. */
function maskAadhaar(value: string | undefined): string {
  const digits = (value ?? '').replace(/\D/g, '')
  if (digits.length < 4) return ''
  return `XXXX XXXX ${digits.slice(-4)}`
}

export function PledgePrint({
  pledge,
  shop,
}: {
  pledge: Pledge
  shop?: ShopDisplayInfo
}) {
  const shopInfo = shop ?? EMPTY_SHOP_DISPLAY
  const charges = pledge.charges ?? 0
  const netPaid = netPaidAmount(pledge.loanAmount, charges)
  const monthlyInterest = monthlyPledgeInterestAmount(pledge.loanAmount, pledge.interestPct)
  const payableOneYear = totalPayableAfterOneYear(
    pledge.loanAmount,
    pledge.interestPct,
    pledge.pledgeDate,
  )
  const totalQty = pledge.items.reduce((sum, item) => sum + item.pieces, 0)
  const totalGross = pledge.items.reduce((sum, item) => sum + item.grossWeight, 0)
  const totalStone = pledge.items.reduce((sum, item) => sum + (item.stoneWeight ?? 0), 0)
  const totalNet = pledge.items.reduce((sum, item) => sum + item.netWeight, 0)
  const maskedAadhaar = maskAadhaar(pledge.customerAadhaar)
  const idProofLine = [maskedAadhaar, pledge.customerPan]
    .filter((part) => (part ?? '').trim())
    .join(' · ')
  const itemPhoto = pledge.photos?.find((photo) => photo.kind === 'item')
  const note = pledge.notes?.trim()

  return (
    <AdaguPrintSheet shop={shopInfo} dense={pledge.items.length > 8} layout="receipt">
      <div className="adagu-receipt-title-band">ADAGU RECEIPT</div>

      <div className="adagu-receipt-info">
        <div className="adagu-receipt-party">
          <AdaguBorrower
            name={pledge.customerName}
            guardian={pledge.guardianName}
            address={pledge.customerAddress}
            phone={pledge.customerPhone}
            idProof={idProofLine}
          />
        </div>
        <div className="adagu-receipt-no-box">
          <div className="adagu-receipt-no-row adagu-receipt-no-row--lead">
            <span>Receipt No</span>
            <strong>{pledge.receiptNo}</strong>
          </div>
          <div className="adagu-receipt-no-row">
            <span>Loan Date</span>
            <strong>{formatDisplayDate(pledge.pledgeDate)}</strong>
          </div>
          <div className="adagu-receipt-no-row">
            <span>Due Date</span>
            <strong>
              {pledge.repaymentDueDate ? formatDisplayDate(pledge.repaymentDueDate) : '—'}
            </strong>
          </div>
        </div>
      </div>

      <div className="adagu-receipt-key-figures">
        <div className="adagu-receipt-figure adagu-receipt-figure--lead">
          <span className="adagu-receipt-figure-label">Loan Amount</span>
          <strong className="adagu-receipt-figure-value adagu-receipt-figure-value--lead">
            {rupees(pledge.loanAmount)}
          </strong>
          <span className="adagu-receipt-figure-sub">Sanctioned</span>
        </div>
        <div className="adagu-receipt-figure">
          <span className="adagu-receipt-figure-label">Interest</span>
          <strong className="adagu-receipt-figure-value">{pledge.interestPct}% / month</strong>
          <span className="adagu-receipt-figure-sub">{rupees(monthlyInterest)} per month</span>
        </div>
        <div className="adagu-receipt-figure">
          <span className="adagu-receipt-figure-label">Net Paid</span>
          <strong className="adagu-receipt-figure-value">{rupees(netPaid)}</strong>
          <span className="adagu-receipt-figure-sub">
            {charges > 0 ? `After ${rupees(charges)} charges` : 'Cash paid to borrower'}
          </span>
        </div>
      </div>

      <table className="adagu-receipt-table">
        <thead>
          <tr>
            <th className="adagu-receipt-col-sno">#</th>
            <th className="adagu-receipt-col-desc">Description</th>
            <th className="adagu-receipt-col-center">Purity</th>
            <th className="adagu-receipt-col-num">Qty</th>
            <th className="adagu-receipt-col-num">Gross (g)</th>
            <th className="adagu-receipt-col-num">Ded. (g)</th>
            <th className="adagu-receipt-col-num">Net (g)</th>
          </tr>
        </thead>
        <tbody>
          {pledge.items.map((item, index) => (
            <tr key={item.id}>
              <td className="adagu-receipt-col-center">{index + 1}</td>
              <td className="adagu-receipt-col-desc">
                {item.description}
                {item.identification ? (
                  <span className="adagu-receipt-sub">{item.identification}</span>
                ) : null}
              </td>
              <td className="adagu-receipt-col-center">{item.purity}</td>
              <td className="adagu-receipt-col-num">{item.pieces}</td>
              <td className="adagu-receipt-col-num">{weight(item.grossWeight)}</td>
              <td className="adagu-receipt-col-num">{weight(item.stoneWeight ?? 0)}</td>
              <td className="adagu-receipt-col-num adagu-receipt-cell-strong">
                {weight(item.netWeight)}
              </td>
            </tr>
          ))}
          <tr className="adagu-receipt-total">
            <td />
            <td>Total</td>
            <td />
            <td className="adagu-receipt-col-num">{totalQty}</td>
            <td className="adagu-receipt-col-num">{weight(totalGross)}</td>
            <td className="adagu-receipt-col-num">{weight(totalStone)}</td>
            <td className="adagu-receipt-col-num">{weight(totalNet)}</td>
          </tr>
        </tbody>
      </table>

      <div className="adagu-receipt-bottom">
        {itemPhoto ? (
          <figure className="adagu-receipt-photo">
            <figcaption>Item photo</figcaption>
            <img src={localImageSrc(itemPhoto.path, '')} alt="Pledged item" />
          </figure>
        ) : null}
        <div className="adagu-receipt-repay">
          <div className="adagu-receipt-repay-title">Repayment</div>
          <div className="adagu-receipt-repay-row">
            <span>Monthly interest</span>
            <span>{rupees(monthlyInterest)}</span>
          </div>
          <div className="adagu-receipt-repay-row adagu-receipt-repay-row--grand">
            <span>Payable after 1 year</span>
            <span>{rupees(payableOneYear)}</span>
          </div>
          <div className="adagu-receipt-words">
            Amount paid: <strong>{amountInWords(netPaid)}</strong>
          </div>
        </div>
      </div>

      <section className="adagu-receipt-terms">
        <h2>Terms</h2>
        <ol>
          <li>Bring this original receipt to pay interest or redeem the jewellery.</li>
          <li>
            Interest is {pledge.interestPct}% per month; a part month is charged as a full month.
          </li>
          <li>
            If not redeemed by the due date, the jewellery may be auctioned after written notice.
          </li>
          <li>I declare the pledged articles are my own property.</li>
        </ol>
        {note ? <p className="adagu-receipt-term-note">Note: {note}</p> : null}
      </section>

      <AdaguSignatures
        left="Borrower Signature / LTI"
        center="Appraiser Signature"
        shop={shopInfo}
      />
    </AdaguPrintSheet>
  )
}
