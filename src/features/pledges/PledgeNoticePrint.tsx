import type { Pledge, PledgeAuction } from '@shared/types'
import { formatCurrency, formatDisplayDate } from '../../lib/format'
import { defaultShopLogoUrl, EMPTY_SHOP_DISPLAY, localImageSrc, type ShopDisplayInfo } from '../invoices/mapShopDisplay'
import './PledgePrint.css'

function formatWeight(value: number): string {
  if (!value) return ''
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
  const shopName = shopInfo.name
  const phones = shopInfo.phones
  const addressLines = shopInfo.addressLines
  const footerParts = [
    shopName,
    shopInfo.place,
    phones.length ? `Ph: ${phones.join(' / ')}` : '',
  ].filter(Boolean)
  const totalQty = pledge.items.reduce((sum, item) => sum + item.pieces, 0)
  const totalNet = pledge.items.reduce((sum, item) => sum + item.netWeight, 0)
  const noticeDate = auction?.noticeDate ?? ''
  const auctionEligibleDate = auction?.auctionEligibleDate ?? ''
  const noticeDays = auction?.noticeDays ?? 0

  return (
    <div className="pledge-print-root" data-print-root>
      <article className="pledge-print">
        <img
          className="print-watermark"
          src={localImageSrc(shopInfo.logoImagePath, defaultShopLogoUrl)}
          alt=""
          aria-hidden
        />
        <header className="pledge-print-top">
          <div className="pledge-print-brand">
            <img
              className="pledge-print-logo"
              src={localImageSrc(shopInfo.logoImagePath, defaultShopLogoUrl)}
              alt=""
            />
            {shopName ? <h1>{shopName}</h1> : null}
            <p className="pledge-print-title">ADAGU AUCTION NOTICE</p>
            {shopInfo.proprietorLines.length > 0 ? (
              <div className="pledge-print-proprietor">
                {shopInfo.proprietorLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            ) : null}
          </div>
          <div className="pledge-print-contact">
            {phones.length > 0 ? <p className="pledge-print-contact-label">DIRECT CONTACT</p> : null}
            {phones.map((phone) => (
              <p key={phone}>{phone}</p>
            ))}
            {addressLines.map((line) => (
              <p key={line} className="pledge-print-address">
                {line}
              </p>
            ))}
          </div>
        </header>

        <div className="pledge-print-meta">
          <div>
            <span>ADAGU NO.:</span>
            <strong>{pledge.receiptNo}</strong>
          </div>
          <div>
            <span>PLEDGE DATE:</span>
            <strong>{formatDisplayDate(pledge.pledgeDate)}</strong>
          </div>
          <div>
            <span>NOTICE DATE:</span>
            <strong>{noticeDate ? formatDisplayDate(noticeDate) : '—'}</strong>
          </div>
        </div>

        <section className="pledge-print-section">
          <h2>BORROWER / CUSTOMER DETAILS</h2>
          <div className="pledge-print-borrower">
            <div>
              <span>Customer Name:</span>
              <strong>{pledge.customerName}</strong>
            </div>
            <div>
              <span>Mobile Number:</span>
              <strong>{pledge.customerPhone || '—'}</strong>
            </div>
            <div>
              <span>F / M / H Name:</span>
              <strong>{pledge.guardianName || '—'}</strong>
            </div>
            <div className="full">
              <span>Address:</span>
              <strong>{pledge.customerAddress || '—'}</strong>
            </div>
          </div>
        </section>

        <section className="pledge-print-section">
          <h2>PLEDGED JEWELLERY</h2>
          <table className="pledge-print-items">
            <thead>
              <tr>
                <th>#</th>
                <th>Ornaments</th>
                <th>Purity</th>
                <th className="num">Qty</th>
                <th className="num">Gross</th>
                <th className="num">Net</th>
              </tr>
            </thead>
            <tbody>
              {pledge.items.map((item, index) => (
                <tr key={item.id}>
                  <td>{index + 1}</td>
                  <td>{item.description}</td>
                  <td>{item.purity}</td>
                  <td className="num">{item.pieces}</td>
                  <td className="num">{formatWeight(item.grossWeight)}</td>
                  <td className="num">{formatWeight(item.netWeight)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3}>
                  <strong>Total</strong>
                </td>
                <td className="num">{totalQty}</td>
                <td className="num" />
                <td className="num">{formatWeight(totalNet)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="pledge-print-section">
          <h2>LOAN SUMMARY</h2>
          <div className="pledge-print-loan-grid">
            <div>
              <span>Loan amount</span>
              <strong>₹ {formatCurrency(pledge.loanAmount)}</strong>
            </div>
            <div>
              <span>Assessed value</span>
              <strong>₹ {formatCurrency(pledge.assessedValue)}</strong>
            </div>
            <div>
              <span>Repayment due</span>
              <strong>{pledge.repaymentDueDate ? formatDisplayDate(pledge.repaymentDueDate) : '—'}</strong>
            </div>
            <div>
              <span>Notice period</span>
              <strong>{noticeDays} days</strong>
            </div>
            <div className="full">
              <span>Auction on or after</span>
              <strong>{auctionEligibleDate ? formatDisplayDate(auctionEligibleDate) : '—'}</strong>
            </div>
          </div>
        </section>

        <section className="pledge-print-declaration">
          <h2>Notice</h2>
          <p>
            This is to inform you that the Adagu loan <strong>{pledge.receiptNo}</strong> remains
            unpaid past its repayment due date. Despite reminders, the dues have not been settled.
          </p>
          <p>
            In accordance with the terms of the pledge, if the total dues are not settled on or
            before <strong>{auctionEligibleDate ? formatDisplayDate(auctionEligibleDate) : 'the auction date'}</strong>, the
            pledged jewellery listed above will be sold by public auction. Any surplus realised over
            the dues will be refunded to you, and you remain liable for any shortfall.
          </p>
          <p>
            Please contact the shop at the earliest to settle the loan and release your jewellery.
          </p>
        </section>

        <footer className="pledge-print-signs">
          <div>
            <div className="pledge-print-sign-line" />
            <span>CUSTOMER SIGNATURE / LTI</span>
          </div>
          <div>
            <div className="pledge-print-sign-line" />
            <span>WITNESS</span>
          </div>
          <div>
            <div className="pledge-print-sign-line">
              {shopInfo.signatureImagePath ? (
                <img
                  className="pledge-print-sign-img"
                  src={localImageSrc(shopInfo.signatureImagePath, '')}
                  alt=""
                />
              ) : null}
            </div>
            <span>{shopName ? `FOR ${shopName}` : 'FOR'}</span>
            <span className="pledge-print-sign-sub">(AUTHORIZED SIGNATORY)</span>
          </div>
        </footer>

        <div className="pledge-print-bottom">
          {footerParts.length > 0 ? <span>{footerParts.join(' • ')}</span> : null}
          <span>Adagu Auction Notice</span>
        </div>
      </article>
    </div>
  )
}
