import { amountInWords } from '@shared/billing/amountInWords'
import type { GoldSavingPayment } from '@shared/types'
import { formatDisplayDate } from '../../../lib/format'
import { EMPTY_SHOP_DISPLAY, localImageSrc, type ShopDisplayInfo } from '../../invoices/mapShopDisplay'
import { formatGsPaymentMode } from '../gsLabels'
import { GsPassbookShell } from './GsPassbookShell'

/**
 * Collection receipt for one or more installments. A multi-installment batch
 * shares a receipt number and lists every installment it covers.
 */
export function GsReceiptPrint({
  payments,
  shop,
}: {
  payments: GoldSavingPayment[]
  shop?: ShopDisplayInfo
}) {
  const shopInfo = shop ?? EMPTY_SHOP_DISPLAY
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
    <GsPassbookShell shop={shopInfo} fitPage>
      <div className="gs-passbook-body gs-receipt">
        <section className="gs-passbook-form">
          <h3>Monthly Gold Savings Scheme · மாதாந்திர தங்க சேமிப்பு</h3>
          <div className="gs-passbook-form-top">
            <div>
              <span>Receipt</span>
              <strong>{primary.receiptNo}</strong>
            </div>
            <div>
              <span>Payment date</span>
              <strong>{formatDisplayDate(primary.paymentDate)}</strong>
            </div>
            <div>
              <span>Account</span>
              <strong>{primary.accountNo}</strong>
            </div>
          </div>
          {payments.length > 1 ? (
            <p className="gs-receipt-note gs-receipt-note--form">
              One receipt for {payments.length} installments
              {primary.batchNo ? ` · Batch ${primary.batchNo}` : ''}
            </p>
          ) : null}
        </section>

        <h3>Customer details</h3>
        <dl>
          <div><dt>Customer name</dt><dd>{primary.customerName}</dd></div>
          <div><dt>Customer ID</dt><dd>{primary.customerId}</dd></div>
          <div><dt>Mobile</dt><dd>{primary.customerPhone || '—'}</dd></div>
          <div><dt>Scheme</dt><dd>{primary.schemeName}</dd></div>
          <div><dt>Gold purity</dt><dd>{primary.purity}</dd></div>
          <div><dt>Payment mode</dt><dd>{formatGsPaymentMode(primary.paymentMode)}</dd></div>
        </dl>

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

        <h3>Collection details</h3>
        <table>
          <tbody>
            <tr><th>Gold rate per gram (this receipt)</th><td>₹{primary.goldRate.toFixed(2)}</td></tr>
            <tr><th>Gold weight credited</th><td>{totalGold.toFixed(3)} g</td></tr>
            <tr><th>Total amount received</th><td>₹{totalReceived.toFixed(2)}</td></tr>
            <tr><th>Total amount paid to date</th><td>₹{latest.totalPaidToDate.toFixed(2)}</td></tr>
            <tr><th>Total gold accumulated</th><td>{latest.goldAccumulatedToDate.toFixed(3)} g</td></tr>
            <tr><th>Transaction reference</th><td>{primary.transactionRef || '—'}</td></tr>
          </tbody>
        </table>

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
      </div>
    </GsPassbookShell>
  )
}
