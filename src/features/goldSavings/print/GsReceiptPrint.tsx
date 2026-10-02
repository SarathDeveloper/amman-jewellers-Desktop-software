import { amountInWords } from '@shared/billing/amountInWords'
import type { GoldSavingPayment } from '@shared/types'
import logoUrl from '../../../assets/jeweltrackerpro-logo.svg'
import { formatDisplayDate } from '../../../lib/format'
import { EMPTY_SHOP_DISPLAY, localImageSrc, type ShopDisplayInfo } from '../../invoices/mapShopDisplay'
import { paperClassName } from '../../invoices/paperSize'
import { formatGsPaymentMode } from '../gsLabels'
import './GsReceiptPrint.css'

export function GsReceiptPrint({
  payment,
  shop,
  paperSize = 'a4',
}: {
  payment: GoldSavingPayment
  shop?: ShopDisplayInfo
  paperSize?: 'a4' | 'a5' | 'thermal'
}) {
  const shopInfo = shop ?? EMPTY_SHOP_DISPLAY
  const vis = shopInfo.cashVisibility
  const [phone1, phone2] = shopInfo.phones
  const phoneLine = [phone1, phone2].filter(Boolean).join(' · ')

  return (
    <div className={`gs-receipt-root ${paperClassName(paperSize)}`} data-print-root>
      <article className="gs-receipt">
        <header className="gs-receipt-header">
          <div className="gs-receipt-brand">
            {vis.showLogo ? (
              <img className="gs-receipt-logo" src={localImageSrc(shopInfo.logoImagePath, logoUrl)} alt="" />
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
          <h2>Monthly Gold Savings Scheme · மாதாந்திர தங்க சேமிப்பு</h2>
          <div className="gs-receipt-meta">
            <span>Receipt No: {payment.receiptNo}</span>
            <span>Payment Date: {formatDisplayDate(payment.paymentDate)}</span>
          </div>
        </header>

        <section>
          <h3>Customer details</h3>
          <dl>
            <div><dt>Customer name</dt><dd>{payment.customerName}</dd></div>
            <div><dt>Customer ID</dt><dd>{payment.customerId}</dd></div>
            <div><dt>Mobile</dt><dd>{payment.customerPhone || '—'}</dd></div>
            <div><dt>Scheme account</dt><dd>{payment.accountNo}</dd></div>
            <div><dt>Scheme</dt><dd>{payment.schemeName}</dd></div>
            <div><dt>Gold purity</dt><dd>{payment.purity}</dd></div>
          </dl>
        </section>

        <section>
          <h3>Installment details</h3>
          <table>
            <tbody>
              <tr><th>Installment number</th><td>{payment.installmentNo} of {payment.durationMonths}</td></tr>
              <tr><th>Installment due date</th><td>{formatDisplayDate(payment.dueDate)}</td></tr>
              <tr><th>Amount paid</th><td>₹{payment.amount.toFixed(2)}</td></tr>
              <tr><th>Gold rate per gram (this receipt)</th><td>₹{payment.goldRate.toFixed(2)}</td></tr>
              <tr><th>Gold weight credited</th><td>{payment.goldWeight.toFixed(3)} g</td></tr>
              <tr><th>Total amount paid to date</th><td>₹{payment.totalPaidToDate.toFixed(2)}</td></tr>
              <tr><th>Total gold accumulated</th><td>{payment.goldAccumulatedToDate.toFixed(3)} g</td></tr>
              <tr><th>Payment mode</th><td>{formatGsPaymentMode(payment.paymentMode)}</td></tr>
              <tr><th>Transaction reference</th><td>{payment.transactionRef || '—'}</td></tr>
            </tbody>
          </table>
        </section>

        <p className="gs-receipt-words">{amountInWords(payment.totalReceived)}</p>
        <p className="gs-receipt-note">
          This installment gold weight ({payment.goldWeight.toFixed(3)} g) is separate from the running total
          ({payment.goldAccumulatedToDate.toFixed(3)} g). The rate shown is the snapshot stored with this receipt.
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
          Terms: Accumulated gold is a scheme credit, not physical stock. Reprinting this receipt does not recalculate
          the gold rate.
        </p>
      </article>
    </div>
  )
}
