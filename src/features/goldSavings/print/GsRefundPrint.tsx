import { amountInWords } from '@shared/billing/amountInWords'
import type { GoldSavingRefund } from '@shared/types'
import { formatDisplayDate } from '../../../lib/format'
import { EMPTY_SHOP_DISPLAY, localImageSrc, type ShopDisplayInfo } from '../../invoices/mapShopDisplay'
import { formatGsPaymentMode } from '../gsLabels'
import { GsPassbookShell } from './GsPassbookShell'

export function GsRefundPrint({
  refund,
  shop,
}: {
  refund: GoldSavingRefund
  shop?: ShopDisplayInfo
}) {
  const shopInfo = shop ?? EMPTY_SHOP_DISPLAY
  const ratePct =
    refund.totalPaid > 0 ? Math.round((refund.deduction / refund.totalPaid) * 1000) / 10 : 0

  return (
    <GsPassbookShell shop={shopInfo} fitPage>
      <div className="gs-passbook-body gs-receipt">
        <section className="gs-passbook-form">
          <h3>Scheme Cancellation Refund · திட்ட ரத்து பணம் திரும்ப</h3>
          <div className="gs-passbook-form-top">
            <div>
              <span>Voucher</span>
              <strong>{refund.voucherNo}</strong>
            </div>
            <div>
              <span>Refund date</span>
              <strong>{formatDisplayDate(refund.refundDate)}</strong>
            </div>
            <div>
              <span>Account</span>
              <strong>{refund.accountNo}</strong>
            </div>
          </div>
        </section>

        <h3>Customer details</h3>
        <dl>
          <div><dt>Customer name</dt><dd>{refund.customerName}</dd></div>
          <div><dt>Customer ID</dt><dd>{refund.customerId}</dd></div>
          <div><dt>Mobile</dt><dd>{refund.customerPhone || '—'}</dd></div>
          <div><dt>Scheme</dt><dd>{refund.schemeName}</dd></div>
          <div><dt>Duration</dt><dd>{refund.durationMonths} months</dd></div>
          <div><dt>Payment mode</dt><dd>{formatGsPaymentMode(refund.paymentMode)}</dd></div>
        </dl>

        <h3>Cancellation refund</h3>
        <table>
          <tbody>
            <tr><th>Total amount paid</th><td>₹{refund.totalPaid.toFixed(2)}</td></tr>
            <tr>
              <th>Cancellation deduction</th>
              <td>₹{refund.deduction.toFixed(2)}{ratePct > 0 ? ` (${ratePct}% of paid)` : ''}</td>
            </tr>
            <tr><th>Refund amount</th><td><strong>₹{refund.refundAmount.toFixed(2)}</strong></td></tr>
            <tr><th>Gold forfeited</th><td>{refund.goldForfeited.toFixed(3)} g</td></tr>
            <tr><th>Transaction reference</th><td>{refund.transactionRef || '—'}</td></tr>
            <tr><th>Reason</th><td>{refund.reason || '—'}</td></tr>
          </tbody>
        </table>

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
        <p className="gs-receipt-tnc">
          Terms: A cancelled scheme refunds the paid amount minus the configured or approved deduction. This voucher is
          the only valid proof of the refund.
        </p>
      </div>
    </GsPassbookShell>
  )
}
