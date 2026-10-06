import { formatPaymentMode } from '../../lib/format'
import { defaultShopLogoUrl, EMPTY_SHOP_DISPLAY, localImageSrc, type ShopDisplayInfo } from '../invoices/mapShopDisplay'
import type { PurchaseInvoiceData } from './purchaseInvoiceTypes'
import './PurchaseInvoicePrint.css'

const MIN_BODY_ROWS = 10

function fmt3(value: number): string {
  if (!value) return ''
  return value.toFixed(3)
}

function money(value: number): string {
  return value.toFixed(2)
}

export function PurchaseInvoicePrint({
  data,
  shop,
}: {
  data: PurchaseInvoiceData
  shop?: ShopDisplayInfo
}) {
  const shopInfo = shop ?? EMPTY_SHOP_DISPLAY
  const [phone1, phone2] = shopInfo.phones
  const phoneLine = [phone1, phone2].filter(Boolean).join(' · ')
  const emptyCount = Math.max(0, MIN_BODY_ROWS - data.lines.length)
  const emptyRows = Array.from({ length: emptyCount }, (_, index) => index)

  return (
    <div className="purchase-invoice-root" data-print-root>
      <article className="purchase-invoice">
        <img
          className="print-watermark"
          src={localImageSrc(shopInfo.logoImagePath, defaultShopLogoUrl)}
          alt=""
          aria-hidden
        />
        <header className="purchase-invoice-header">
          {shopInfo.taxVisibility.showLogo ? (
            <img
              className="purchase-invoice-logo"
              src={localImageSrc(shopInfo.logoImagePath, defaultShopLogoUrl)}
              alt=""
            />
          ) : null}
          {shopInfo.name ? <h1 className="purchase-invoice-shop">{shopInfo.name}</h1> : null}
          {shopInfo.addressLines.map((line) => (
            <p key={line} className="purchase-invoice-address">
              {line}
            </p>
          ))}
          {phoneLine ? <p className="purchase-invoice-phone">Phone: {phoneLine}</p> : null}
          {shopInfo.gstin ? (
            <p className="purchase-invoice-gstin">GSTIN {shopInfo.gstin}</p>
          ) : null}
        </header>

        <hr className="purchase-invoice-rule" />
        <h2 className="purchase-invoice-title">PURCHASE INVOICE</h2>

        <section className="purchase-invoice-meta">
          <div>
            <h2>Billed To</h2>
            <p className="purchase-invoice-supplier-name">{data.supplierName}</p>
            {data.supplierAddressLines.map((line) => (
              <p key={line} className="purchase-invoice-supplier-line">
                {line}
              </p>
            ))}
            {data.supplierPhone ? (
              <p className="purchase-invoice-supplier-line">Phone: {data.supplierPhone}</p>
            ) : null}
            {data.supplierGstin ? (
              <p className="purchase-invoice-supplier-line">GSTIN {data.supplierGstin}</p>
            ) : null}
          </div>
          <div className="purchase-invoice-meta-right">
            <p>
              <span>Invoice No</span> {data.invoiceNo}
            </p>
            <p>
              <span>Date</span> {data.invoiceDate}
            </p>
            {shopInfo.gstin ? (
              <p>
                <span>Shop GSTIN</span> {shopInfo.gstin}
              </p>
            ) : null}
          </div>
        </section>

        <div className="purchase-invoice-table-wrap">
          <table className="purchase-invoice-table">
            <colgroup>
              <col className="purchase-invoice-col-sno" />
              <col className="purchase-invoice-col-item" />
              <col className="purchase-invoice-col-hsn" />
              <col className="purchase-invoice-col-purity" />
              <col className="purchase-invoice-col-wt" />
              <col className="purchase-invoice-col-wt" />
              <col className="purchase-invoice-col-money" />
              <col className="purchase-invoice-col-money" />
              <col className="purchase-invoice-col-money" />
            </colgroup>
            <thead>
              <tr>
                <th>S.No</th>
                <th>Item</th>
                <th>HSN</th>
                <th>Purity</th>
                <th>Gross Wt</th>
                <th>Net Wt</th>
                <th>Rate</th>
                <th>Making</th>
                <th>Amount</th>
              </tr>
            </thead>
          <tbody>
            {data.lines.map((line) => (
              <tr key={line.sno}>
                <td className="purchase-invoice-col-sno">{line.sno}</td>
                <td className="purchase-invoice-col-item">{line.item}</td>
                <td>{line.hsnCode}</td>
                <td>{line.purity}</td>
                <td className="purchase-invoice-col-num">{fmt3(line.grossWeight)}</td>
                <td className="purchase-invoice-col-num">{fmt3(line.netWeight)}</td>
                <td className="purchase-invoice-col-num">{money(line.rate)}</td>
                <td className="purchase-invoice-col-num">{money(line.makingCharges)}</td>
                <td className="purchase-invoice-col-num">{money(line.amount)}</td>
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
        </div>

        <div className="purchase-invoice-footer">
          <div className="purchase-invoice-notes">
            <p>Payment: {formatPaymentMode(data.paymentMode)}</p>
            {data.notes ? <p>Notes: {data.notes}</p> : null}
            <p className="purchase-invoice-words">Total in words: {data.amountInWords}</p>
          </div>
          <div className="purchase-invoice-totals">
            <div className="purchase-invoice-totals-row">
              <span>Taxable</span>
              <span>{money(data.subtotal)}</span>
            </div>
            {data.cgst > 0 ? (
              <div className="purchase-invoice-totals-row">
                <span>CGST 1.5%</span>
                <span>{money(data.cgst)}</span>
              </div>
            ) : null}
            {data.sgst > 0 ? (
              <div className="purchase-invoice-totals-row">
                <span>SGST 1.5%</span>
                <span>{money(data.sgst)}</span>
              </div>
            ) : null}
            {data.igst > 0 ? (
              <div className="purchase-invoice-totals-row">
                <span>IGST</span>
                <span>{money(data.igst)}</span>
              </div>
            ) : null}
            {data.roundOff !== 0 ? (
              <div className="purchase-invoice-totals-row">
                <span>Round off</span>
                <span>{money(data.roundOff)}</span>
              </div>
            ) : null}
            <div className="purchase-invoice-totals-row grand">
              <span>Grand Total</span>
              <span>{money(data.total)}</span>
            </div>
          </div>
        </div>

        <p className="purchase-invoice-generated">This is a computer generated invoice</p>
      </article>
    </div>
  )
}
