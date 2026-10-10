import type { ReactNode } from 'react'
import {
  defaultShopLogoUrl,
  localImageSrc,
  type ShopDisplayInfo,
} from '../invoices/mapShopDisplay'

export function AdaguPrintSheet({
  shop,
  dense = false,
  layout = 'classic',
  children,
}: {
  shop: ShopDisplayInfo
  dense?: boolean
  layout?: 'classic' | 'receipt'
  children: ReactNode
}) {
  return (
    <div
      className={`tax-invoice-root paper-a4 adagu-print-sheet${
        dense ? ' tax-invoice-root--dense' : ''
      }${layout === 'receipt' ? ' adagu-print-sheet--receipt' : ''}`}
      data-print-root
      data-print-fit="page"
    >
      <article className="tax-invoice">
        <img
          className="print-watermark"
          src={localImageSrc(shop.logoImagePath, defaultShopLogoUrl)}
          alt=""
          aria-hidden
        />
        <AdaguPrintHeader shop={shop} layout={layout} />
        {children}
      </article>
    </div>
  )
}

export function AdaguPrintHeader({
  shop,
  layout = 'classic',
}: {
  shop: ShopDisplayInfo
  layout?: 'classic' | 'receipt'
}) {
  const labels = shop.billTemplate
  const vis = shop.taxVisibility
  const [phone1, phone2] = shop.phones
  const phoneLine = [
    phone1 ? `${labels.taxPhoneLabel} ${phone1}` : '',
    phone2 ? `${labels.taxMobileLabel} ${phone2}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const license = shop.pawnbrokerLicenseNo.trim()

  if (layout === 'receipt') {
    return (
      <header className="adagu-receipt-header">
        <div className="adagu-receipt-header-logo">
          {vis.showLogo ? (
            <img
              className="tax-invoice-logo"
              src={localImageSrc(shop.logoImagePath, defaultShopLogoUrl)}
              alt=""
            />
          ) : null}
        </div>
        <div className="adagu-receipt-header-shop">
          {shop.name ? <h1 className="tax-invoice-shop">{shop.name}</h1> : null}
          {vis.showTagline && shop.tagline ? (
            <p className="tax-invoice-tagline">{shop.tagline}</p>
          ) : null}
          {shop.addressLines.map((line) => (
            <p key={line} className="tax-invoice-address">
              {line}
            </p>
          ))}
          {phoneLine ? <p className="tax-invoice-meta-line">{phoneLine}</p> : null}
          {shop.proprietorLines.map((line, index) => (
            <p key={`${index}-${line}`} className="adagu-print-proprietor">
              {line}
            </p>
          ))}
        </div>
        <div className="adagu-receipt-header-marks">
          {license ? (
            <>
              <div className="adagu-receipt-lic-label">Pawnbroker Lic. No</div>
              <div className="adagu-receipt-lic-no">{license}</div>
            </>
          ) : null}
          {shop.gstin ? (
            <div className="tax-invoice-gstin">
              {labels.taxGstinLabel} {shop.gstin}
            </div>
          ) : null}
          {vis.showQrCode && shop.qrCodePath ? (
            <img className="tax-invoice-qr" src={localImageSrc(shop.qrCodePath, '')} alt="" />
          ) : null}
        </div>
      </header>
    )
  }

  return (
    <>
      <header className="tax-invoice-header">
        <div className="tax-invoice-brand-row">
          <div className="adagu-print-ids">
            {shop.gstin ? (
              <div className="tax-invoice-gstin">
                {labels.taxGstinLabel} {shop.gstin}
              </div>
            ) : null}
            {license ? (
              <div className="adagu-print-license">Pawnbroker Lic. No: {license}</div>
            ) : null}
          </div>
          <div className="tax-invoice-identity">
            {vis.showLogo ? (
              <img
                className="tax-invoice-logo"
                src={localImageSrc(shop.logoImagePath, defaultShopLogoUrl)}
                alt=""
              />
            ) : null}
            {shop.name ? <h1 className="tax-invoice-shop">{shop.name}</h1> : null}
            {vis.showTagline && shop.tagline ? (
              <p className="tax-invoice-tagline">{shop.tagline}</p>
            ) : null}
            {shop.addressLines.map((line) => (
              <p key={line} className="tax-invoice-address">
                {line}
              </p>
            ))}
            {phoneLine ? <p className="tax-invoice-meta-line">{phoneLine}</p> : null}
            {shop.proprietorLines.map((line, index) => (
              <p key={`${index}-${line}`} className="adagu-print-proprietor">
                {line}
              </p>
            ))}
          </div>
          <div className="tax-invoice-marks">
            {vis.showBisLogo && shop.bisLogoPath ? (
              <img className="tax-invoice-bis" src={localImageSrc(shop.bisLogoPath, '')} alt="" />
            ) : null}
            {vis.showQrCode && shop.qrCodePath ? (
              <img className="tax-invoice-qr" src={localImageSrc(shop.qrCodePath, '')} alt="" />
            ) : null}
          </div>
        </div>
      </header>
      <hr className="tax-invoice-rule" />
    </>
  )
}

export function AdaguBorrower({
  name,
  guardian,
  address,
  phone,
  idProof,
}: {
  name: string
  guardian?: string
  address?: string
  phone?: string
  idProof?: string
}) {
  return (
    <>
      <h2>Borrower</h2>
      <p className="tax-invoice-customer-name">{name}</p>
      <p className="tax-invoice-customer-address">F / M / H : {guardian?.trim() || '—'}</p>
      <p className="tax-invoice-customer-address">Address : {address?.trim() || '—'}</p>
      <p className="tax-invoice-customer-address">Mobile : {phone?.trim() || '—'}</p>
      {idProof !== undefined ? (
        <p className="tax-invoice-customer-address">ID Proof : {idProof.trim() || '—'}</p>
      ) : null}
    </>
  )
}

export function AdaguSignatures({
  left,
  center,
  shop,
}: {
  left: string
  center: string
  shop: ShopDisplayInfo
}) {
  return (
    <footer className="tax-invoice-signatures">
      <div className="left">{left}</div>
      <div className="center">{center}</div>
      <div className="right">
        {shop.signatureImagePath ? (
          <img
            className="tax-invoice-signature-img"
            src={localImageSrc(shop.signatureImagePath, '')}
            alt=""
          />
        ) : null}
        {shop.name ? `For ${shop.name}` : 'For'}
      </div>
    </footer>
  )
}

export function AdaguEmptyRows({ count, columns }: { count: number; columns: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <tr key={`empty-${index}`} className="empty">
          {Array.from({ length: columns }, (_, cell) => (
            <td key={cell}>&nbsp;</td>
          ))}
        </tr>
      ))}
    </>
  )
}
