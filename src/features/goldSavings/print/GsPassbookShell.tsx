import type { ReactNode } from 'react'
import {
  defaultShopLogoUrl,
  EMPTY_SHOP_DISPLAY,
  localImageSrc,
  type ShopDisplayInfo,
} from '../../invoices/mapShopDisplay'
import './GsPassbookPrint.css'

export const DEFAULT_PROMO = 'தங்கம் மற்றும் வெள்ளி நகைகள் ஆர்டரின் பேரில் செய்து தரப்படும்.'

export const DEFAULT_RULES = [
  'முதல் மாதம் 1 முதல் 10ம் தேதிக்குள் தவறாமல் பணம் செலுத்த வேண்டும்.',
  'இடையில் பணம் கட்ட தவறினால் சீட்டின் முடிவில் கட்டிய பணத்திற்கு தங்கம் (இ) வெள்ளி எடுத்துக் கொள்ளலாம்.',
  'இத்திட்டத்தில் பணமாக கண்டிப்பாக பெற இயலாது.',
  'மேற்கண்ட அனைத்தும் நிபந்தனைக்கு உட்பட்டது.',
]

const STREET_BREAK = 'Salem Main Road,'

/** Break the shop street after the main road so the hills line stands alone. */
export function passbookAddressLines(lines: string[]): string[] {
  return lines.flatMap((line) => {
    const index = line.indexOf(STREET_BREAK)
    if (index < 0) return [line]
    const head = line.slice(0, index + STREET_BREAK.length).trim()
    const tail = line.slice(index + STREET_BREAK.length).trim()
    return tail ? [head, tail] : [head]
  })
}

export function passbookRuleLines(terms: string): string[] {
  const lines = terms
    .split(/\r?\n/)
    .map((line) => line.replace(/^[•\-*\u2022]\s*/, '').trim())
    .filter(Boolean)
  return lines.length > 0 ? lines : DEFAULT_RULES
}

export function GsPassbookShell({
  shop,
  rules = DEFAULT_RULES,
  fitPage = false,
  children,
}: {
  shop?: ShopDisplayInfo
  rules?: string[]
  fitPage?: boolean
  children: ReactNode
}) {
  const shopInfo = shop ?? EMPTY_SHOP_DISPLAY
  const vis = shopInfo.cashVisibility
  const [phone1, phone2] = shopInfo.phones
  const phones = [phone1, phone2].filter(Boolean)
  const promo = shopInfo.promoLine.trim() || DEFAULT_PROMO
  const bannerSrc = (shopInfo.passbookBannerPath ?? '').trim()
    ? localImageSrc(shopInfo.passbookBannerPath, '')
    : ''

  return (
    <div className="gs-passbook-root" data-print-root data-print-fit={fitPage ? 'page' : undefined}>
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
                      src={localImageSrc(shopInfo.logoImagePath, defaultShopLogoUrl)}
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
                      <span>HUID BIS HALL MARK SHOW ROOM</span>
                    </div>
                  ) : vis.showBisLogo ? (
                    <div className="gs-passbook-bis-wrap gs-passbook-bis-wrap--text">
                      <span>HUID BIS HALL MARK SHOW ROOM</span>
                    </div>
                  ) : null}
                </div>
                <div className="gs-passbook-shop">
                  <h1>{shopInfo.name || 'Amman Jewellers'}</h1>
                  {shopInfo.tagline ? <p className="gs-passbook-tagline">{shopInfo.tagline}</p> : null}
                  {passbookAddressLines(shopInfo.addressLines).map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                  {phones.length > 0 ? <p>செல் : {phones.join(', ')}</p> : null}
                </div>
              </div>
            </div>
          </div>
        </header>

        {children}

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
