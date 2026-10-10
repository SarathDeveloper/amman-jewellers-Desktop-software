import type { Pledge, PledgeAuction } from '@shared/types'
import { formatDisplayDate } from '../../lib/format'
import { EMPTY_SHOP_DISPLAY, type ShopDisplayInfo } from '../invoices/mapShopDisplay'
import {
  AdaguBorrower,
  AdaguEmptyRows,
  AdaguPrintSheet,
  AdaguSignatures,
} from './AdaguPrintHeader'

const MIN_BODY_ROWS = 4
const COLUMNS = 6

function money(value: number): string {
  return value.toFixed(2)
}

function weight(value: number): string {
  return value.toFixed(3)
}

export function PledgeNoticePrint({
  pledge,
  auction,
  shop,
}: {
  pledge: Pledge
  auction: PledgeAuction | null
  shop?: ShopDisplayInfo
}) {
  const shopInfo = shop ?? EMPTY_SHOP_DISPLAY
  const totalQty = pledge.items.reduce((sum, item) => sum + item.pieces, 0)
  const totalGross = pledge.items.reduce((sum, item) => sum + item.grossWeight, 0)
  const totalNet = pledge.items.reduce((sum, item) => sum + item.netWeight, 0)
  const emptyCount = Math.max(0, MIN_BODY_ROWS - pledge.items.length)
  const noticeDate = auction?.noticeDate ?? ''
  const auctionEligibleDate = auction?.auctionEligibleDate ?? ''
  const noticeDays = auction?.noticeDays ?? 0

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
        <div className="tax-invoice-title-center">ADAGU AUCTION NOTICE</div>
        <div className="tax-invoice-meta-right">
          <p>
            <span>Adagu No :</span> {pledge.receiptNo}
          </p>
          <p>
            <span>Pledge date :</span> {formatDisplayDate(pledge.pledgeDate)}
          </p>
          <p>
            <span>Notice date :</span> {noticeDate ? formatDisplayDate(noticeDate) : '—'}
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
            <th>Net</th>
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
              <td className="tax-invoice-col-num">{weight(item.netWeight)}</td>
            </tr>
          ))}
          <AdaguEmptyRows count={emptyCount} columns={COLUMNS} />
          <tr className="adagu-print-total">
            <td />
            <td>Total</td>
            <td />
            <td className="tax-invoice-col-num">{totalQty}</td>
            <td className="tax-invoice-col-num">{weight(totalGross)}</td>
            <td className="tax-invoice-col-num">{weight(totalNet)}</td>
          </tr>
        </tbody>
      </table>

      <p className="tax-invoice-item-count">
        {shopInfo.billTemplate.taxItemCountLabel} {totalQty}
      </p>

      <div className="tax-invoice-footer-grid">
        <div className="tax-invoice-discount-box">
          <h3>Notice details</h3>
          <div className="tax-invoice-totals-row">
            <span>Repayment due</span>
            <span>{pledge.repaymentDueDate ? formatDisplayDate(pledge.repaymentDueDate) : '—'}</span>
          </div>
          <div className="tax-invoice-totals-row">
            <span>Notice period</span>
            <span>{noticeDays} days</span>
          </div>
          <div className="tax-invoice-totals-row">
            <span>Auction on or after</span>
            <span>{auctionEligibleDate ? formatDisplayDate(auctionEligibleDate) : '—'}</span>
          </div>
        </div>
        <div className="tax-invoice-totals">
          <div className="tax-invoice-totals-row">
            <span>Assessed value</span>
            <span>{money(pledge.assessedValue ?? 0)}</span>
          </div>
          <div className="tax-invoice-totals-row tax-invoice-totals-row--grand">
            <span>Loan amount</span>
            <span>{money(pledge.loanAmount)}</span>
          </div>
        </div>
      </div>

      <section className="adagu-print-terms">
        <h2>Notice</h2>
        <p>
          This is to inform you that the Adagu loan <strong>{pledge.receiptNo}</strong> remains
          unpaid past its repayment due date. Despite reminders, the dues have not been settled.
        </p>
        <p>
          In accordance with the terms of the pledge, if the total dues are not settled on or before{' '}
          <strong>{auctionEligibleDate ? formatDisplayDate(auctionEligibleDate) : 'the auction date'}</strong>,
          the pledged jewellery listed above will be sold by public auction. Any surplus realised
          over the dues will be refunded to you, and you remain liable for any shortfall.
        </p>
        <p>Please contact the shop at the earliest to settle the loan and release your jewellery.</p>
      </section>

      <AdaguSignatures
        left="Customer Signature / LTI"
        center="Witness"
        shop={shopInfo}
      />
    </AdaguPrintSheet>
  )
}
