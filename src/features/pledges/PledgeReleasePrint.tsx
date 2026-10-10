import { amountInWords } from '@shared/billing/amountInWords'
import { netPaidAmount } from '@shared/billing/pledgeMath'
import type { Pledge } from '@shared/types'
import { formatDisplayDate } from '../../lib/format'
import { pledgePaymentModeLabel } from '../dues/pledgePaymentModes'
import { EMPTY_SHOP_DISPLAY, type ShopDisplayInfo } from '../invoices/mapShopDisplay'
import {
  AdaguBorrower,
  AdaguEmptyRows,
  AdaguPrintSheet,
  AdaguSignatures,
} from './AdaguPrintHeader'

const MIN_BODY_ROWS = 4
const COLUMNS = 8

function money(value: number): string {
  return value.toFixed(2)
}

function weight(value: number): string {
  return value.toFixed(3)
}

export function PledgeReleasePrint({
  pledge,
  shop,
}: {
  pledge: Pledge
  shop?: ShopDisplayInfo
}) {
  const shopInfo = shop ?? EMPTY_SHOP_DISPLAY
  const netPaid = netPaidAmount(pledge.loanAmount, pledge.charges ?? 0)
  const extraLoan = (pledge.topups ?? []).reduce((sum, topup) => sum + topup.amount, 0)
  const paymentRows = pledge.payments ?? []
  const interestCollected = paymentRows.reduce((sum, payment) => sum + (payment.interestPart ?? 0), 0)
  const principalCollected = paymentRows.reduce((sum, payment) => sum + (payment.principalPart ?? 0), 0)
  const totalDiscount = paymentRows.reduce((sum, payment) => sum + (payment.discount ?? 0), 0)
  const redeemMode = paymentRows.find((payment) => payment.kind === 'redeem')?.mode
  const totalGross = pledge.items.reduce((sum, item) => sum + item.grossWeight, 0)
  const totalStone = pledge.items.reduce((sum, item) => sum + (item.stoneWeight ?? 0), 0)
  const totalNet = pledge.items.reduce((sum, item) => sum + item.netWeight, 0)
  const totalQty = pledge.items.reduce((sum, item) => sum + item.pieces, 0)
  const emptyCount = Math.max(0, MIN_BODY_ROWS - pledge.items.length)
  const releaseDate = pledge.redeemedDate ? formatDisplayDate(pledge.redeemedDate) : ''

  return (
    <AdaguPrintSheet shop={shopInfo} dense={pledge.items.length > 8}>
      <section className="tax-invoice-meta">
        <div className="tax-invoice-party">
          <AdaguBorrower
            name={pledge.customerName}
            guardian={pledge.guardianName}
            address={pledge.customerAddress}
            phone={pledge.customerPhone}
          />
        </div>
        <div className="tax-invoice-title-center">GOLD RELEASE RECEIPT</div>
        <div className="tax-invoice-meta-right">
          <p>
            <span>Adagu No :</span> {pledge.receiptNo}
          </p>
          <p>
            <span>Pledge date :</span> {formatDisplayDate(pledge.pledgeDate)}
          </p>
          <p>
            <span>Release date :</span> {releaseDate || '—'}
          </p>
        </div>
      </section>

      <hr className="tax-invoice-rule" />

      <table className="tax-invoice-table">
        <thead>
          <tr>
            <th className="adagu-print-col-sno">S.No</th>
            <th className="tax-invoice-col-particulars">Particulars</th>
            <th>Purity</th>
            <th>Qty</th>
            <th>Gross</th>
            <th>Ded.</th>
            <th>Net</th>
            <th>Received</th>
          </tr>
        </thead>
        <tbody>
          {pledge.items.map((item, index) => (
            <tr key={item.id}>
              <td className="adagu-print-col-center">{index + 1}</td>
              <td className="tax-invoice-col-particulars">{item.description}</td>
              <td className="adagu-print-col-center">{item.purity}</td>
              <td className="tax-invoice-col-num">{item.pieces}</td>
              <td className="tax-invoice-col-num">{weight(item.grossWeight)}</td>
              <td className="tax-invoice-col-num">{weight(item.stoneWeight ?? 0)}</td>
              <td className="tax-invoice-col-num">{weight(item.netWeight)}</td>
              <td className="adagu-print-check">☐</td>
            </tr>
          ))}
          <AdaguEmptyRows count={emptyCount} columns={COLUMNS} />
          <tr className="adagu-print-total">
            <td />
            <td>Total</td>
            <td />
            <td className="tax-invoice-col-num">{totalQty}</td>
            <td className="tax-invoice-col-num">{weight(totalGross)}</td>
            <td className="tax-invoice-col-num">{weight(totalStone)}</td>
            <td className="tax-invoice-col-num">{weight(totalNet)}</td>
            <td />
          </tr>
        </tbody>
      </table>

      <p className="tax-invoice-item-count">
        {shopInfo.billTemplate.taxItemCountLabel} {totalQty}
      </p>

      <div className="tax-invoice-footer-grid">
        <div className="tax-invoice-discount-box">
          <h3>Settlement details</h3>
          <div className="tax-invoice-totals-row">
            <span>Net paid at sanction</span>
            <span>{money(netPaid)}</span>
          </div>
          {redeemMode ? (
            <div className="tax-invoice-totals-row">
              <span>Settlement mode</span>
              <span>{pledgePaymentModeLabel(redeemMode)}</span>
            </div>
          ) : null}
        </div>
        <div className="tax-invoice-totals">
          <div className="tax-invoice-totals-row">
            <span>Original loan</span>
            <span>{money(pledge.loanAmount)}</span>
          </div>
          <div className="tax-invoice-totals-row">
            <span>Extra after sanction</span>
            <span>{money(extraLoan)}</span>
          </div>
          <div className="tax-invoice-totals-row">
            <span>Interest collected</span>
            <span>{money(interestCollected)}</span>
          </div>
          <div className="tax-invoice-totals-row">
            <span>Principal repaid</span>
            <span>{money(principalCollected)}</span>
          </div>
          {totalDiscount > 0 ? (
            <div className="tax-invoice-totals-row">
              <span>Discount</span>
              <span>{money(totalDiscount)}</span>
            </div>
          ) : null}
          <div className="tax-invoice-totals-row tax-invoice-totals-row--grand">
            <span>Total collected</span>
            <span>{money(pledge.amountCollected)}</span>
          </div>
        </div>
      </div>

      <p className="tax-invoice-words">
        {shopInfo.billTemplate.amountInWordsLabel} {amountInWords(pledge.amountCollected)}
      </p>

      <p className="adagu-print-ack">
        I/We confirm that the jewellery listed above has been received in full and in the same
        condition as pledged under Adagu {pledge.receiptNo}. All dues against this loan have been
        settled on {releaseDate || 'this date'}.
      </p>

      <AdaguSignatures
        left="Customer Signature / LTI"
        center="Witness"
        shop={shopInfo}
      />
    </AdaguPrintSheet>
  )
}
