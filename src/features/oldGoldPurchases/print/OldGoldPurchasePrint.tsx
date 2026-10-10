import { formatDisplayDate } from '../../../lib/format'
import {
  defaultShopLogoUrl,
  EMPTY_SHOP_DISPLAY,
  localImageSrc,
  type ShopDisplayInfo,
} from '../../invoices/mapShopDisplay'
import type { Customer, OldGoldPurchase } from '@shared/types'
import './OldGoldPurchasePrint.css'

const MIN_BODY_ROWS = 6

function money(value: number): string {
  return (value ?? 0).toFixed(2)
}

function fmt3(value: number): string {
  if (!value) return ''
  return value.toFixed(3)
}

export function OldGoldPurchasePrint({
  purchase,
  customer,
  shop,
}: {
  purchase: OldGoldPurchase
  customer?: Customer | null
  shop?: ShopDisplayInfo
}) {
  const shopInfo = shop ?? EMPTY_SHOP_DISPLAY
  const [phone1, phone2] = shopInfo.phones
  const phoneLine = [phone1, phone2].filter(Boolean).join(' · ')
  const totalNet = purchase.items.reduce((sum, item) => sum + item.netWeight, 0)
  const emptyRows = Array.from(
    { length: Math.max(0, MIN_BODY_ROWS - purchase.items.length) },
    (_, index) => index,
  )
  const activePayouts = purchase.payouts.filter((payout) => payout.voidedAt == null)

  return (
    <div className="ogp-print-root" data-print-root data-print-fit="page">
      <article className="ogp-print-sheet">
        <img
          className="ogp-print-watermark"
          src={localImageSrc(shopInfo.logoImagePath, defaultShopLogoUrl)}
          alt=""
          aria-hidden
        />
        <header className="ogp-print-header">
          {shopInfo.taxVisibility.showLogo ? (
            <img
              className="ogp-print-logo"
              src={localImageSrc(shopInfo.logoImagePath, defaultShopLogoUrl)}
              alt=""
            />
          ) : null}
          {shopInfo.name ? <h1 className="ogp-print-shop">{shopInfo.name}</h1> : null}
          {shopInfo.addressLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {phoneLine ? <p>Phone: {phoneLine}</p> : null}
          {shopInfo.gstin ? <p>GSTIN {shopInfo.gstin}</p> : null}
        </header>

        <hr className="ogp-print-rule" />
        <h2 className="ogp-print-title">OLD GOLD PURCHASE VOUCHER</h2>

        <section className="ogp-print-meta">
          <div>
            <h3>Received From</h3>
            <p>{purchase.customerName || '—'}</p>
            {purchase.customerPhone ? <p>Phone: {purchase.customerPhone}</p> : null}
            {customer?.address ? <p>{customer.address}</p> : null}
            {customer?.idProofType ? <p>ID: {customer.idProofType}</p> : null}
            {customer?.aadhaar ? <p>Aadhaar: {customer.aadhaar}</p> : null}
            {customer?.pan ? <p>PAN: {customer.pan}</p> : null}
          </div>
          <div className="ogp-print-meta-right">
            <p>
              <span>Bill No</span> {purchase.purchaseNo}
            </p>
            <p>
              <span>Date</span> {formatDisplayDate(purchase.purchaseDate)}
            </p>
            <p>
              <span>Status</span> {purchase.status === 'cancelled' ? 'Cancelled' : 'Final'}
            </p>
          </div>
        </section>

        <table className="ogp-print-table">
          <thead>
            <tr>
              <th>S.No</th>
              <th>Item</th>
              <th className="num">Gross</th>
              <th className="num">Stone</th>
              <th className="num">Net</th>
              <th>Purity</th>
              <th className="num">Rate/g</th>
              <th className="num">Ded %</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {purchase.items.map((item, index) => (
              <tr key={item.id}>
                <td>{index + 1}</td>
                <td>{item.description || 'Old gold'}</td>
                <td className="num">{fmt3(item.grossWeight)}</td>
                <td className="num">{fmt3(item.stoneWeight)}</td>
                <td className="num">{fmt3(item.netWeight)}</td>
                <td>{item.purity}</td>
                <td className="num">{money(item.ratePerGram)}</td>
                <td className="num">{item.deductionPct ? item.deductionPct.toFixed(2) : ''}</td>
                <td className="num">{money(item.finalValue)}</td>
              </tr>
            ))}
            {emptyRows.map((index) => (
              <tr key={`empty-${index}`} className="empty">
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ogp-print-settlement">
          <table>
            <tbody>
              <tr>
                <td>Total net weight</td>
                <td>{totalNet.toFixed(3)} g</td>
              </tr>
              <tr className="grand">
                <td>Purchase amount</td>
                <td>{money(purchase.totalAmount)}</td>
              </tr>
              <tr>
                <td>Paid to customer</td>
                <td>{money(purchase.paidOut)}</td>
              </tr>
              <tr>
                <td>Applied to bills</td>
                <td>{money(purchase.applied)}</td>
              </tr>
              <tr>
                <td>Balance</td>
                <td>{money(purchase.balance)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {activePayouts.length > 0 ? (
          <>
            <h3 className="ogp-print-section-title">Payouts</h3>
            <table className="ogp-print-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Mode</th>
                  <th className="num">Amount</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {activePayouts.map((payout) => (
                  <tr key={payout.id}>
                    <td>{formatDisplayDate(payout.payoutDate)}</td>
                    <td>{payout.mode.toUpperCase()}</td>
                    <td className="num">{money(payout.amount)}</td>
                    <td>{payout.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}

        {purchase.links.length > 0 ? (
          <>
            <h3 className="ogp-print-section-title">Applied to bills</h3>
            <table className="ogp-print-table">
              <thead>
                <tr>
                  <th>Bill No</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {purchase.links.map((link) => (
                  <tr key={link.invoiceId}>
                    <td>{link.invoiceNo}</td>
                    <td>{formatDisplayDate(link.invoiceDate)}</td>
                    <td>{link.invoiceStatus === 'final' ? 'Final' : 'Draft'}</td>
                    <td className="num">{money(link.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}

        {purchase.notes ? <p className="ogp-print-notes">Notes: {purchase.notes}</p> : null}

        <div className="ogp-print-signatures">
          <div>Customer signature</div>
          <div>For {shopInfo.name || 'the shop'}</div>
        </div>

        <p className="ogp-print-generated">This is a computer generated voucher</p>
      </article>
    </div>
  )
}
