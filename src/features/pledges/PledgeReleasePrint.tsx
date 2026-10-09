import { netPaidAmount } from '@shared/billing/pledgeMath'
import type { Pledge } from '@shared/types'
import { formatDisplayDate } from '../../lib/format'
import { defaultShopLogoUrl, EMPTY_SHOP_DISPLAY, localImageSrc, type ShopDisplayInfo } from '../invoices/mapShopDisplay'
import { pledgePaymentModeLabel } from '../dues/pledgePaymentModes'
import './PledgePrint.css'

function formatWeight(value: number): string {
  if (!value) return ''
  return value.toFixed(3)
}

function formatAmount(value: number): string {
  if (!value && value !== 0) return ''
  return value.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export function PledgeReleasePrint({
  pledge,
  shop,
}: {
  pledge: Pledge
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
  const releaseDate = pledge.redeemedDate ? formatDisplayDate(pledge.redeemedDate) : ''

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
            <p className="pledge-print-title">GOLD RELEASE RECEIPT</p>
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
            <span>RELEASE DATE:</span>
            <strong>{pledge.redeemedDate ? formatDisplayDate(pledge.redeemedDate) : '—'}</strong>
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
          <h2>JEWELLERY RELEASED (Item checklist)</h2>
          <table className="pledge-print-items">
            <thead>
              <tr>
                <th>#</th>
                <th>Ornaments</th>
                <th>Purity</th>
                <th className="num">Qty</th>
                <th className="num">Gross</th>
                <th className="num">Ded.</th>
                <th className="num">Net</th>
                <th>Received</th>
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
                  <td className="num">{formatWeight(item.stoneWeight ?? 0)}</td>
                  <td className="num">{formatWeight(item.netWeight)}</td>
                  <td className="pledge-print-check">☐</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3}><strong>Total</strong></td>
                <td className="num">{totalQty}</td>
                <td className="num">{formatWeight(totalGross)}</td>
                <td className="num">{formatWeight(totalStone)}</td>
                <td className="num">{formatWeight(totalNet)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </section>

        <section className="pledge-print-section">
          <h2>SETTLEMENT SUMMARY</h2>
          <div className="pledge-print-loan-grid">
            <div>
              <span>Original loan</span>
              <strong>₹ {formatAmount(pledge.loanAmount)}</strong>
            </div>
            <div>
              <span>Net paid at sanction</span>
              <strong>₹ {formatAmount(netPaid)}</strong>
            </div>
            <div>
              <span>Extra after sanction</span>
              <strong>₹ {formatAmount(extraLoan)}</strong>
            </div>
            <div>
              <span>Total collected</span>
              <strong>₹ {formatAmount(pledge.amountCollected)}</strong>
            </div>
            <div>
              <span>Interest collected</span>
              <strong>₹ {formatAmount(interestCollected)}</strong>
            </div>
            <div>
              <span>Principal repaid</span>
              <strong>₹ {formatAmount(principalCollected)}</strong>
            </div>
            {totalDiscount > 0 ? (
              <div>
                <span>Discount given</span>
                <strong>₹ {formatAmount(totalDiscount)}</strong>
              </div>
            ) : null}
            {redeemMode ? (
              <div>
                <span>Settlement mode</span>
                <strong>{pledgePaymentModeLabel(redeemMode)}</strong>
              </div>
            ) : null}
          </div>
        </section>

        <section className="pledge-print-declaration">
          <h2>Customer acknowledgment</h2>
          <p>
            I/We confirm that the jewellery listed above has been received in full and in the same
            condition as pledged under Adagu {pledge.receiptNo}. All dues against this loan have been
            settled on {pledge.redeemedDate ? formatDisplayDate(pledge.redeemedDate) : releaseDate || 'this date'}.
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
          <span>Gold Release Receipt</span>
        </div>
      </article>
    </div>
  )
}
