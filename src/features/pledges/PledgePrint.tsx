import { netPaidAmount } from '@shared/billing/pledgeMath'
import type { Pledge } from '@shared/types'
import { formatDisplayDate } from '../../lib/format'
import { defaultShopLogoUrl, EMPTY_SHOP_DISPLAY, localImageSrc, type ShopDisplayInfo } from '../invoices/mapShopDisplay'
import './PledgePrint.css'

function formatWeight(value: number): string {
  if (!value) return ''
  return value.toFixed(3)
}

function formatAmount(value: number): string {
  if (!value && value !== 0) return ''
  return value.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

/** KYC numbers are only ever printed masked: `XXXX XXXX 1234`. */
function maskAadhaar(value: string | undefined): string {
  const digits = (value ?? '').replace(/\D/g, '')
  if (digits.length < 4) return ''
  return `XXXX XXXX ${digits.slice(-4)}`
}

export function PledgePrint({
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
  const rateNote =
    pledge.notes?.trim() ||
    `Applicable Note Rate fixed at ${pledge.interestPct}% per month`
  const ornaments = pledge.items.map((item) => item.description).filter(Boolean).join(', ')
  const identification = pledge.items
    .map((item) => item.identification)
    .filter(Boolean)
    .join(', ')
  const totalQty = pledge.items.reduce((sum, item) => sum + item.pieces, 0)
  const totalGross = pledge.items.reduce((sum, item) => sum + item.grossWeight, 0)
  const totalStone = pledge.items.reduce((sum, item) => sum + (item.stoneWeight ?? 0), 0)
  const totalNet = pledge.items.reduce((sum, item) => sum + item.netWeight, 0)
  const puritySummary = [...new Set(pledge.items.map((item) => item.purity).filter(Boolean))].join(', ')
  const showItemValue = pledge.items.some(
    (item) => (item.ratePerGram ?? 0) > 0 || (item.itemValue ?? 0) > 0,
  )
  const maskedAadhaar = maskAadhaar(pledge.customerAadhaar)
  const idProofLine = [pledge.customerIdProofType, maskedAadhaar, pledge.customerPan]
    .filter((part) => (part ?? '').trim())
    .join(' · ')
  const customerPhoto = pledge.photos?.find((photo) => photo.kind === 'customer')
  const itemPhoto = pledge.photos?.find((photo) => photo.kind === 'item')

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
            <p className="pledge-print-title">ADAGU / GOLD PLEDGE RECEIPT</p>
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

        {shopInfo.promoLine ? <p className="pledge-print-promo-top">{shopInfo.promoLine}</p> : null}

        <div className="pledge-print-meta">
          <div>
            <span>BILL NO.:</span>
            <strong>{pledge.receiptNo}</strong>
          </div>
          <div>
            <span>DATE:</span>
            <strong>{formatDisplayDate(pledge.pledgeDate)}</strong>
          </div>
          <div>
            <span>PLEDGE TYPE:</span>
            <strong>{pledge.pledgeType || 'GOLD JEWELLERY'}</strong>
          </div>
        </div>

        <section className="pledge-print-section">
          <h2>BORROWER / CUSTOMER DETAILS (Official Records)</h2>
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
            <div className="full">
              <span>ID Proof:</span>
              <strong>{idProofLine || '—'}</strong>
            </div>
          </div>
        </section>

        {customerPhoto || itemPhoto ? (
          <section className="pledge-print-section">
            <h2>PHOTOS ON RECORD</h2>
            <div className="pledge-print-photos">
              {customerPhoto ? (
                <figure>
                  <img src={localImageSrc(customerPhoto.path, '')} alt="Borrower" />
                  <figcaption>Borrower</figcaption>
                </figure>
              ) : null}
              {itemPhoto ? (
                <figure>
                  <img src={localImageSrc(itemPhoto.path, '')} alt="Pledged item" />
                  <figcaption>Pledged item</figcaption>
                </figure>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="pledge-print-section">
          <h2>DESCRIPTION OF JEWELLS (Detailed item breakdown)</h2>
          <div className="pledge-print-jewells">
            <p>
              <span>Ornaments:</span> {ornaments || '—'}
            </p>
            <p>
              <span>Identification:</span> {identification || '—'}
            </p>
          </div>

          <table className="pledge-print-valuation">
            <thead>
              <tr>
                <th>Field / Metric</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Unit (Qty)</td>
                <td>{totalQty || ''}</td>
              </tr>
              <tr>
                <td>Purity (Karat)</td>
                <td>{puritySummary}</td>
              </tr>
              <tr>
                <td>Gross Wt.</td>
                <td>{formatWeight(totalGross)} gms</td>
              </tr>
              <tr>
                <td>Deductions (Stones/Beads)</td>
                <td>{formatWeight(totalStone)} gms</td>
              </tr>
              <tr>
                <td>Net Wt.</td>
                <td>{formatWeight(totalNet)} gms</td>
              </tr>
              <tr>
                <td>Assessed Value</td>
                <td>₹ {formatAmount(pledge.assessedValue ?? 0)}</td>
              </tr>
            </tbody>
          </table>

          {pledge.items.length > 1 ? (
            <table className="pledge-print-items">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Ornaments</th>
                  <th>Identification</th>
                  <th>Purity</th>
                  <th className="num">Qty</th>
                  <th className="num">Gross</th>
                  <th className="num">Ded.</th>
                  <th className="num">Net</th>
                  {showItemValue ? <th className="num">Rate/gm</th> : null}
                  {showItemValue ? <th className="num">Value</th> : null}
                </tr>
              </thead>
              <tbody>
                {pledge.items.map((item, index) => (
                  <tr key={item.id}>
                    <td>{index + 1}</td>
                    <td>{item.description}</td>
                    <td>{item.identification || ''}</td>
                    <td>{item.purity}</td>
                    <td className="num">{item.pieces}</td>
                    <td className="num">{formatWeight(item.grossWeight)}</td>
                    <td className="num">{formatWeight(item.stoneWeight ?? 0)}</td>
                    <td className="num">{formatWeight(item.netWeight)}</td>
                    {showItemValue ? (
                      <td className="num">{formatAmount(item.ratePerGram ?? 0)}</td>
                    ) : null}
                    {showItemValue ? (
                      <td className="num">{formatAmount(item.itemValue ?? 0)}</td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </section>

        <section className="pledge-print-section">
          <h2>LOAN & PAYMENT SUMMARY</h2>
          <div className="pledge-print-loan-boxes">
            <div className="pledge-print-loan-box">
              <span>SANCTIONED LOAN</span>
              <strong>₹ {formatAmount(pledge.loanAmount)}</strong>
            </div>
            <div className="pledge-print-loan-box">
              <span>NET PAID AMOUNT</span>
              <strong>₹ {formatAmount(netPaid)}</strong>
            </div>
          </div>
          <div className="pledge-print-loan-grid">
            <div>
              <span>Monthly Interest Rate</span>
              <strong>{pledge.interestPct}%</strong>
            </div>
            <div>
              <span>Deduction / Charges</span>
              <strong>₹ {formatAmount(pledge.charges ?? 0)}</strong>
            </div>
            <div className="full">
              <span>Applicable Note</span>
              <strong>{rateNote}</strong>
            </div>
            <div className="full">
              <span>Repayment Due</span>
              <strong>{pledge.repaymentDueDate ? formatDisplayDate(pledge.repaymentDueDate) : '—'}</strong>
            </div>
          </div>
        </section>

        {shopInfo.promoLine ? (
          <p className="pledge-print-promo-bottom">
            {shopName ? `Available at ${shopName}: ` : ''}
            {shopInfo.promoLine}
          </p>
        ) : null}

        <section className="pledge-print-declaration">
          <h2>Declaration & Terms:</h2>
          <ol>
            <li>
              I/We hereby declare that the pledged gold articles are my/our self-acquired personal
              property with undisputed ownership rights.
            </li>
            <li>
              Interest is calculated at {pledge.interestPct}% monthly as agreed. In case of
              non-redemption within the stipulated schedule after formal notice, the jeweller holds
              rights according to applicable lending laws.
            </li>
            <li>
              The borrower must present this original Adagu receipt when paying interest or redeeming
              the pledged jewellery.
            </li>
          </ol>
        </section>

        <footer className="pledge-print-signs">
          <div>
            <div className="pledge-print-sign-line" />
            <span>BORROWER SIGNATURE / LTI</span>
          </div>
          <div>
            <div className="pledge-print-sign-line" />
            <span>APPRAISER SIGNATURE</span>
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
          <span>A4 Gold Pledge Invoice / Voucher</span>
        </div>
      </article>
    </div>
  )
}
