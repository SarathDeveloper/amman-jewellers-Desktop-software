import { amountInWords } from '@shared/billing/amountInWords'
import type { GoldSavingPayment } from '@shared/types'
import { formatDisplayDate } from '../../../lib/format'
import { defaultShopLogoUrl, EMPTY_SHOP_DISPLAY, localImageSrc, type ShopDisplayInfo } from '../../invoices/mapShopDisplay'
import { paperClassName } from '../../invoices/paperSize'
import { formatGsPaymentMode } from '../gsLabels'
import './GsReceiptPrint.css'

/**
 * Collection receipt for one or more installments. A multi-installment batch
 * shares a receipt number and lists every installment it covers.
 */
export function GsReceiptPrint({
  payments,
  shop,
  paperSize = 'a4',
}: {
  payments: GoldSavingPayment[]
  shop?: ShopDisplayInfo
  paperSize?: 'a4' | 'a5' | 'thermal'
}) {
  const shopInfo = shop ?? EMPTY_SHOP_DISPLAY
  const vis = shopInfo.cashVisibility
  const [phone1, phone2] = shopInfo.phones
  const phoneLine = [phone1, phone2].filter(Boolean).join(' · ')
  const primary = payments[0]
  if (!primary) return null
  // To-date running totals come from the last row of the batch; the first row's
  // snapshot would omit the rest of the batch it belongs to.
  const latest = payments[payments.length - 1]
  const totalAmount = payments.reduce((sum, row) => sum + row.amount, 0)
  const totalLateFee = payments.reduce((sum, row) => sum + row.lateFee, 0)
  const totalDiscount = payments.reduce((sum, row) => sum + row.discount, 0)
  const totalReceived = payments.reduce((sum, row) => sum + row.totalReceived, 0)
  const totalGold = payments.reduce((sum, row) => sum + row.goldWeight, 0)

  return (
    <div className={`gs-receipt-root ${paperClassName(paperSize)}`} data-print-root>
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
          <h2>Monthly Gold Savings Scheme · மாதாந்திர தங்க சேமிப்பு</h2>
          <div className="gs-receipt-meta">
            <span>Receipt No: {primary.receiptNo}</span>
            <span>Payment Date: {formatDisplayDate(primary.paymentDate)}</span>
          </div>
          {payments.length > 1 ? (
            <p className="gs-receipt-note">
              One receipt for {payments.length} installments
              {primary.batchNo ? ` · Batch ${primary.batchNo}` : ''}
            </p>
          ) : null}
        </header>

        <section>
          <h3>Customer details</h3>
          <dl>
            <div><dt>Customer name</dt><dd>{primary.customerName}</dd></div>
            <div><dt>Customer ID</dt><dd>{primary.customerId}</dd></div>
            <div><dt>Mobile</dt><dd>{primary.customerPhone || '—'}</dd></div>
            <div><dt>Scheme account</dt><dd>{primary.accountNo}</dd></div>
            <div><dt>Scheme</dt><dd>{primary.schemeName}</dd></div>
            <div><dt>Gold purity</dt><dd>{primary.purity}</dd></div>
          </dl>
        </section>

        <section>
          <h3>Installments collected</h3>
          <table className="gs-receipt-batch">
            <thead>
              <tr>
                <th>Installment</th>
                <th>Due date</th>
                <th className="num">Amount</th>
                <th className="num">Late fee</th>
                <th className="num">Discount</th>
                <th className="num">Received</th>
                <th className="num">Gold (g)</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((row) => (
                <tr key={row.id}>
                  <td>#{row.installmentNo} of {row.durationMonths}</td>
                  <td>{formatDisplayDate(row.dueDate)}</td>
                  <td className="num">₹{row.amount.toFixed(2)}</td>
                  <td className="num">₹{row.lateFee.toFixed(2)}</td>
                  <td className="num">₹{row.discount.toFixed(2)}</td>
                  <td className="num">₹{row.totalReceived.toFixed(2)}</td>
                  <td className="num">{row.goldWeight.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={2}>Total</th>
                <th className="num">₹{totalAmount.toFixed(2)}</th>
                <th className="num">₹{totalLateFee.toFixed(2)}</th>
                <th className="num">₹{totalDiscount.toFixed(2)}</th>
                <th className="num">₹{totalReceived.toFixed(2)}</th>
                <th className="num">{totalGold.toFixed(3)}</th>
              </tr>
            </tfoot>
          </table>
        </section>

        <section>
          <h3>Collection details</h3>
          <table>
            <tbody>
              <tr><th>Gold rate per gram (this receipt)</th><td>₹{primary.goldRate.toFixed(2)}</td></tr>
              <tr><th>Gold weight credited</th><td>{totalGold.toFixed(3)} g</td></tr>
              <tr><th>Total amount received</th><td>₹{totalReceived.toFixed(2)}</td></tr>
              <tr><th>Total amount paid to date</th><td>₹{latest.totalPaidToDate.toFixed(2)}</td></tr>
              <tr><th>Total gold accumulated</th><td>{latest.goldAccumulatedToDate.toFixed(3)} g</td></tr>
              <tr><th>Payment mode</th><td>{formatGsPaymentMode(primary.paymentMode)}</td></tr>
              <tr><th>Transaction reference</th><td>{primary.transactionRef || '—'}</td></tr>
            </tbody>
          </table>
        </section>

        <p className="gs-receipt-words">{amountInWords(totalReceived)}</p>
        <p className="gs-receipt-note">
          Gold weight is credited per installment at the rate stored with each receipt row. It is a scheme credit, not
          physical stock. Reprinting this receipt does not recalculate the gold rate.
        </p>

        <footer className="gs-receipt-footer">
          <div>
            <span>Customer signature / வாடிக்கையாளர் கையொப்பம்</span>
          </div>
          <div>
            {shopInfo.signatureImagePath ? (
              <img className="gs-receipt-signature-img" src={localImageSrc(shopInfo.signatureImagePath, '')} alt="" />
            ) : null}
            <span>Authorized signature / அங்கீகரிக்கப்பட்ட கையொப்பம்</span>
          </div>
        </footer>
        <p className="gs-receipt-thanks">நன்றி · Thank you for saving with Amman Jewellers.</p>
      </article>
    </div>
  )
}
