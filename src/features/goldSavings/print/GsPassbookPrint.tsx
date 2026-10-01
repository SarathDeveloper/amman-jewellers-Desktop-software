import type { GoldSavingLedgerEntry, GoldSavingPassbook } from '@shared/types'
import logoUrl from '../../../assets/jeweltrackerpro-logo.svg'
import { formatDisplayDate } from '../../../lib/format'
import { EMPTY_SHOP_DISPLAY, localImageSrc, type ShopDisplayInfo } from '../../invoices/mapShopDisplay'
import './GsPassbookPrint.css'

const COLUMNS = ['மாதம்', 'தேதி', 'ரசீது எண்', 'தொகை', 'தங்கம் விலை', 'தங்கம் எடை', 'கையொப்பம்'] as const

const DEFAULT_PROMO = 'தங்கம் மற்றும் வெள்ளி நகைகள் ஆர்டரின் போரில் செய்து தரப்படும்.'

const DEFAULT_RULES = [
  'முதல் மாதம் 1 முதல் 10ம் தேதிக்குள் தவறாமல் பணம் செலுத்த வேண்டும்.',
  'இடையில் பணம் கட்ட தவறினால் சீட்டின் முடிவில் கட்டிய பணத்திற்கு தங்கம் (இ) வெள்ளி எடுத்துக் கொள்ளலாம்.',
  'இத்திட்டத்தில் பணமாக கண்டிப்பாக பெற இயலாது.',
  'மேற்கண்ட அனைத்தும் நிபந்தனைக்கு உட்பட்டது.',
]

function monthLabel(index: number): string {
  return String(index + 1).padStart(2, '0')
}

function ruleLines(terms: string): string[] {
  const lines = terms
    .split(/\r?\n/)
    .map((line) => line.replace(/^[•\-\*\u2022]\s*/, '').trim())
    .filter(Boolean)
  return lines.length > 0 ? lines : DEFAULT_RULES
}

export function GsPassbookPrint({
  passbook,
  shop,
}: {
  passbook: GoldSavingPassbook
  shop?: ShopDisplayInfo
}) {
  const shopInfo = shop ?? EMPTY_SHOP_DISPLAY
  const vis = shopInfo.cashVisibility
  const payments = passbook.rows.filter(
    (row) => row.entryType === 'payment' && row.paymentStatus === 'posted',
  )
  const byInstallment = new Map<number, GoldSavingLedgerEntry>()
  for (const row of payments) {
    if (row.installmentNo) byInstallment.set(row.installmentNo, row)
  }
  const totalRows = Math.max(passbook.scheme.durationMonths, payments.length, 11)
  const rows = Array.from({ length: totalRows }, (_, index) => byInstallment.get(index + 1) ?? null)
  const [phone1, phone2] = shopInfo.phones
  const phones = [phone1, phone2].filter(Boolean)
  const promo = shopInfo.promoLine.trim() || DEFAULT_PROMO
  const bannerSrc = (shopInfo.passbookBannerPath ?? '').trim()
    ? localImageSrc(shopInfo.passbookBannerPath, '')
    : ''
  const sideSrc = (shopInfo.passbookSideImagePath ?? '').trim()
    ? localImageSrc(shopInfo.passbookSideImagePath, '')
    : ''
  const rules = ruleLines(passbook.scheme.terms)

  return (
    <div className="gs-passbook-root" data-print-root>
      <article className="gs-passbook">
        <header className="gs-passbook-header">
          {bannerSrc ? (
            <div className="gs-passbook-banner">
              <img src={bannerSrc} alt="" />
            </div>
          ) : null}
          <div className="gs-passbook-hero">
            <div className="gs-passbook-hero-left">
              <p className="gs-passbook-promo">{promo}</p>
              <h2>தங்க நகைகள் சிறுசேமிப்பு சீட்டு விதிமுறைகள்</h2>
              <ul className="gs-passbook-rules">
                {rules.map((rule, index) => (
                  <li key={index}>{rule}</li>
                ))}
              </ul>
            </div>
            <div className="gs-passbook-hero-right">
              <div className="gs-passbook-brand">
                <div className="gs-passbook-brand-top">
                  {vis.showLogo ? (
                    <img
                      className="gs-passbook-logo"
                      src={localImageSrc(shopInfo.logoImagePath, logoUrl)}
                      alt=""
                    />
                  ) : null}
                  {vis.showBisLogo && shopInfo.bisLogoPath ? (
                    <div className="gs-passbook-bis-wrap">
                      <img
                        className="gs-passbook-bis"
                        src={localImageSrc(shopInfo.bisLogoPath, '')}
                        alt="BIS"
                      />
                      <span>BIS HALL MARK SHOW ROOM</span>
                    </div>
                  ) : vis.showBisLogo ? (
                    <div className="gs-passbook-bis-wrap gs-passbook-bis-wrap--text">
                      <span>BIS HALL MARK SHOW ROOM</span>
                    </div>
                  ) : null}
                </div>
                <div className="gs-passbook-shop">
                  <h1>{shopInfo.name || 'Amman Jewellers'}</h1>
                  {shopInfo.tagline ? <p className="gs-passbook-tagline">{shopInfo.tagline}</p> : null}
                  {shopInfo.addressLines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                  {phones.length > 0 ? <p>செல் : {phones.join(', ')}</p> : null}
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className={`gs-passbook-mid${sideSrc ? '' : ' gs-passbook-mid--form-only'}`}>
          {sideSrc ? (
            <div className="gs-passbook-side">
              <img className="gs-passbook-side-img" src={sideSrc} alt="" />
            </div>
          ) : null}
          <section className="gs-passbook-form">
            <h3>தங்க நகை சிறு சேமிப்பு திட்டம்</h3>
            <div className="gs-passbook-form-top">
              <div>
                <span>குரூப்</span>
                <strong>{passbook.account.schemeCode || passbook.scheme.code}</strong>
              </div>
              <div>
                <span>எண்</span>
                <strong>{passbook.account.accountNo}</strong>
              </div>
              <div>
                <span>தொகை</span>
                <strong>₹{passbook.account.monthlyAmount.toFixed(2)}</strong>
              </div>
            </div>
            <dl className="gs-passbook-form-fields">
              <div>
                <dt>பெயர்</dt>
                <dd>{passbook.account.customerName}</dd>
              </div>
              <div>
                <dt>முகவரி</dt>
                <dd>{passbook.account.customerAddress}</dd>
              </div>
              <div>
                <dt>செல்</dt>
                <dd>{passbook.account.customerPhone}</dd>
              </div>
            </dl>
          </section>
        </div>

        <table>
          <colgroup>
            <col className="gs-col-month" />
            <col className="gs-col-date" />
            <col className="gs-col-receipt" />
            <col className="gs-col-amount" />
            <col className="gs-col-rate" />
            <col className="gs-col-weight" />
            <col className="gs-col-sign" />
          </colgroup>
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td>{monthLabel(index)}</td>
                <td>{row ? formatDisplayDate(row.entryDate) : ''}</td>
                <td>{row?.receiptNo ?? ''}</td>
                <td>{row ? row.amount.toFixed(2) : ''}</td>
                <td>{row ? row.goldRate.toFixed(2) : ''}</td>
                <td>{row ? row.goldWeight.toFixed(3) : ''}</td>
                <td className="gs-sign-cell" />
              </tr>
            ))}
          </tbody>
        </table>

        <footer className="gs-passbook-footer">
          <p>{promo}</p>
          <p>
            <span>தங்கள் வருகைக்கு நன்றி !</span>
            <span className="gs-passbook-footer-sep">|</span>
            <span>மீண்டும் வருக !</span>
          </p>
        </footer>
      </article>
    </div>
  )
}
