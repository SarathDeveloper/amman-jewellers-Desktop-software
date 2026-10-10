import { amountInWords } from '@shared/billing/amountInWords'
import type { GoldSavingRefund } from '@shared/types'
import { formatDisplayDate } from '../../../lib/format'
import { defaultShopLogoUrl, EMPTY_SHOP_DISPLAY, localImageSrc, type ShopDisplayInfo } from '../../invoices/mapShopDisplay'
import { paperClassName } from '../../invoices/paperSize'
import { formatGsPaymentMode } from '../gsLabels'
import './GsReceiptPrint.css'

export function GsRefundPrint({
  refund,
  shop,
  paperSize = 'a4',
}: {
  refund: GoldSavingRefund
  shop?: ShopDisplayInfo
  paperSize?: 'a4' | 'a5' | 'thermal'
}) {
  const shopInfo = shop ?? EMPTY_SHOP_DISPLAY
  const vis = shopInfo.cashVisibility
  const [phone1, phone2] = shopInfo.phones
  const phoneLine = [phone1, phone2].filter(Boolean).join(' · ')
  const ratePct =
    refund.totalPaid > 0 ? Math.round((refund.deduction / refund.totalPaid) * 1000) / 10 : 0

  return (
    <div className={`gs-receipt-root ${paperClassName(paperSize)}`} data-print-root data-print-fit="page">
      <article className="gs-receipt">
        <header className="gs-receipt-header">
          <div className="gs-receipt-brand">
            {vis.showLogo ? (
              <img className="gs-receipt-logo" src={localImageSrc(shopInfo.logoImagePath, defaultShopLogoUrl)} alt="" />
            ) : null}
            <div>
              <h1>{shopInfo.name || 'Amman Jewellers'}</h1>
              {shopInfo.addressLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
              {phoneLine ? <p>Mobile: {phoneLine}</p> : null}
            </div>
            {vis.showBisLogo && shopInfo.bisLogoPath ? (
              <img className="gs-receipt-bis" src={localImageSrc(shopInfo.bisLogoPath, '')} alt="BIS" />
            ) : null}
          </div>
          <h2>Scheme Cancellation Refund · திட்ட ரத்து பணம் திரும்ப</h2>
          <div className="gs-receipt-meta">
            <span>Voucher No: {refund.voucherNo}</span>
            <span>Refund Date: {formatDisplayDate(refund.refundDate)}</span>
          </div>
        </header>

        <section>
          <h3>Customer details</h3>
          <dl>
            <div><dt>Customer name</dt><dd>{refund.customerName}</dd></div>
            <div><dt>Customer ID</dt><dd>{refund.customerId}</dd></div>
            <div><dt>Mobile</dt><dd>{refund.customerPhone || '—'}</dd></div>
            <div><dt>Scheme account</dt><dd>{refund.accountNo}</dd></div>
            <div><dt>Scheme</dt><dd>{refund.schemeName}</dd></div>
            <div><dt>Duration</dt><dd>{refund.durationMonths} months</dd></div>
          </dl>
        </section>

        <section>
          <h3>Cancellation refund</h3>
          <table>
            <tbody>
              <tr><th>Total amount paid</th><td>₹{refund.totalPaid.toFixed(2)}</td></tr>
              <tr><th>Cancellation deduction</th><td>₹{refund.deduction.toFixed(2)}{ratePct > 0 ? ` (${ratePct}% of paid)` : ''}</td></tr>
              <tr><th>Refund amount</th><td><strong>₹{refund.refundAmount.toFixed(2)}</strong></td></tr>
              <tr><th>Gold forfeited</th><td>{refund.goldForfeited.toFixed(3)} g</td></tr>
              <tr><th>Payment mode</th><td>{formatGsPaymentMode(refund.paymentMode)}</td></tr>
              <tr><th>Transaction reference</th><td>{refund.transactionRef || '—'}</td></tr>
              <tr><th>Reason</th><td>{refund.reason || '—'}</td></tr>
            </tbody>
          </table>
        </section>

        <p className="gs-receipt-words">{amountInWords(refund.refundAmount)}</p>
        <p className="gs-receipt-note">
          The scheme is cancelled. Accumulated gold of {refund.goldForfeited.toFixed(3)} g is released back to the shop
          and the scheme balance is closed. Deduction and refund are as recorded on this voucher and are not
          recalculated on reprint.
        </p>

        <footer className="gs-receipt-footer">
          <div>
            <span>Customer signature / வாடிக்கையாளர் கையொப்பம்</span>
          </div>
          <div>
            {shopInfo.signatureImagePath ? (
              <img
                className="gs-receipt-signature-img"
                src={localImageSrc(shopInfo.signatureImagePath, '')}
                alt=""
              />
            ) : null}
            <span>Authorized signature / அங்கீகரிக்கப்பட்ட கையொப்பம்</span>
          </div>
        </footer>
        <p className="gs-receipt-thanks">நன்றி · Thank you for saving with Amman Jewellers.</p>
        <p className="gs-receipt-tnc">
          Terms: A cancelled scheme refunds the paid amount minus the configured or approved deduction. This voucher is
          the only valid proof of the refund.
        </p>
      </article>
    </div>
  )
}
