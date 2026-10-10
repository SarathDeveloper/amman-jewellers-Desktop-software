import type { PaperSize } from '@shared/types'
import { formatDisplayDate } from '../../lib/format'
import type { CashBillData } from './cashBillTypes'
import { defaultShopLogoUrl, EMPTY_SHOP_DISPLAY, localImageSrc, type ShopDisplayInfo } from './mapShopDisplay'
import { paperClassName } from './paperSize'
import './CashBillPrint.css'

const MIN_BODY_ROWS_A5 = 5
const MIN_BODY_ROWS_A4 = 6

function formatWeight(value: number): string {
  return value.toFixed(3)
}

function formatAmount(value: number): string {
  return value.toFixed(2)
}

function formatMoney(value: number): string {
  return value.toFixed(2)
}

function formatRate(value: number): string {
  if (!value) return ''
  return value.toFixed(2)
}

export function CashBillPrint({
  data,
  shop,
  paperSize = 'a5',
}: {
  data: CashBillData
  shop?: ShopDisplayInfo
  paperSize?: PaperSize
}) {
  const shopInfo = shop ?? EMPTY_SHOP_DISPLAY
  const labels = shopInfo.billTemplate
  const vis = shopInfo.cashVisibility
  const filled = data.lines
  const minRows = paperSize === 'a4' ? MIN_BODY_ROWS_A4 : MIN_BODY_ROWS_A5
  const emptyCount = paperSize === 'thermal' ? 0 : Math.max(0, minRows - filled.length)
  const emptyRows = Array.from({ length: emptyCount }, (_, index) => index)
  const [phone1, phone2] = shopInfo.phones
  const phoneLine = [
    phone1 ? `${labels.taxPhoneLabel} ${phone1}` : '',
    phone2 ? `${labels.taxMobileLabel} ${phone2}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const discountTotal = data.discountBreakdown.reduce((sum, line) => sum + line.amount, 0)

  return (
    <div
      className={`cash-bill-root ${paperClassName(paperSize)}${filled.length > 8 ? ' cash-bill-root--dense' : ''}`}
      data-print-root
      data-print-fit="page"
    >
      <article className="cash-bill">
        <img
          className="print-watermark"
          src={localImageSrc(shopInfo.logoImagePath, defaultShopLogoUrl)}
          alt=""
          aria-hidden
        />
        {data.watermark ? (
          <div className="bill-status-watermark" aria-hidden>
            <span>{data.watermark}</span>
          </div>
        ) : null}
        <header className="cash-bill-header">
          <div className="cash-bill-brand-row">
            <div className="cash-bill-gstin" />
            <div className="cash-bill-identity">
              {vis.showLogo ? (
                <img className="cash-bill-logo" src={localImageSrc(shopInfo.logoImagePath, defaultShopLogoUrl)} alt="" />
              ) : null}
              {shopInfo.name ? <h1 className="cash-bill-shop-name">{shopInfo.name}</h1> : null}
              {vis.showTagline && shopInfo.tagline ? <p className="cash-bill-tagline">{shopInfo.tagline}</p> : null}
              {shopInfo.addressLines.map((line) => (
                <p key={line} className="cash-bill-address">
                  {line}
                </p>
              ))}
              {phoneLine ? <p className="cash-bill-address">{phoneLine}</p> : null}
            </div>
            <div className="cash-bill-marks">
              {vis.showBisLogo && shopInfo.bisLogoPath ? (
                <img className="cash-bill-bis" src={localImageSrc(shopInfo.bisLogoPath, '')} alt="" />
              ) : null}
              {vis.showQrCode && shopInfo.qrCodePath ? (
                <img className="cash-bill-qr" src={localImageSrc(shopInfo.qrCodePath, '')} alt="" />
              ) : null}
            </div>
          </div>
        </header>

        <hr className="cash-bill-rule" />

        <section className="cash-bill-meta">
          <div className="cash-bill-party">
            {data.customerName ? (
              <p className="cash-bill-customer-name">
                {labels.cashCustomerPrefix} {data.customerName}
              </p>
            ) : null}
            {vis.showCustomerAddress
              ? data.customerAddressLines.map((line) => (
                  <p key={line} className="cash-bill-customer-line">
                    {line}
                  </p>
                ))
              : null}
            {vis.showCustomerPhone && data.customerPhone ? (
              <p className="cash-bill-customer-line">
                {labels.taxMobileLabel} {data.customerPhone}
              </p>
            ) : null}
          </div>
          <div className="cash-bill-title-center">{labels.cashTitle}</div>
          <div className="cash-bill-meta-right">
            <p>
              <span>{labels.cashDateLabel}</span> {formatDisplayDate(data.invoiceDate)}
            </p>
            <p>
              <span>{labels.cashNoLabel}</span> {data.invoiceNo}
            </p>
            {vis.showMarketRates ? (
              <>
                <p className="cash-bill-rates-title">{labels.marketRatesLabel}</p>
                <p>
                  <span>{labels.goldRateLabel}</span> {formatRate(data.goldRate)}
                </p>
                <p>
                  <span>{labels.silverRateLabel}</span> {formatRate(data.silverRate)}
                </p>
              </>
            ) : null}
          </div>
        </section>

        <hr className="cash-bill-rule" />

        <table className="cash-bill-table">
          <thead>
            <tr>
              <th className="cash-bill-col-particulars">{labels.taxColParticulars}</th>
              <th>{labels.taxColTotWgt}</th>
              <th>{labels.taxColGrsWgt}</th>
              <th>{labels.taxColStnWgt}</th>
              <th>{labels.taxColVamc}</th>
              <th>{labels.taxColStoneRate}</th>
              <th>{labels.taxColMetalRate}</th>
              <th className="cash-bill-col-amount">{labels.taxColAmount}</th>
            </tr>
          </thead>
          <tbody>
            {filled.map((line) => (
              <tr key={line.sno}>
                <td className="cash-bill-col-particulars">{line.particulars}</td>
                <td className="cash-bill-col-num">{formatWeight(line.totalWeight ?? line.netWeight)}</td>
                <td className="cash-bill-col-num">{formatWeight(line.grossWeight)}</td>
                <td className="cash-bill-col-num">{formatWeight(line.stoneWeight ?? 0)}</td>
                <td className="cash-bill-col-num">{formatAmount(line.vamc)}</td>
                <td className="cash-bill-col-num">{formatAmount(line.stoneRate)}</td>
                <td className="cash-bill-col-num">{formatAmount(line.metalRate)}</td>
                <td className="cash-bill-col-num cash-bill-col-amount">{formatAmount(line.amount)}</td>
              </tr>
            ))}
            {emptyRows.map((index) => (
              <tr key={`empty-${index}`} className="empty">
                <td className="cash-bill-col-particulars">&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td className="cash-bill-col-amount">&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="cash-bill-item-count">
          {labels.taxItemCountLabel} {data.itemCount}
        </p>

        <div
          className={`cash-bill-footer-grid${vis.showDiscountBreakdown ? '' : ' cash-bill-footer-grid--single'}`}
        >
          {vis.showDiscountBreakdown ? (
            <div className="cash-bill-discount-box">
              <h3>{labels.discountBreakdownLabel}</h3>
              {data.discountBreakdown.length === 0 ? (
                <div className="cash-bill-totals-row">
                  <span>—</span>
                  <span>0.00</span>
                </div>
              ) : (
                data.discountBreakdown.map((line) => (
                  <div key={line.label} className="cash-bill-totals-row">
                    <span>{line.label}</span>
                    <span>{formatMoney(line.amount)}</span>
                  </div>
                ))
              )}
              {discountTotal > 0 ? (
                <div className="cash-bill-totals-row total">
                  <span>{labels.totalLabel}</span>
                  <span>{formatMoney(discountTotal)}</span>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="cash-bill-totals">
            {discountTotal > 0 ? (
              <div className="cash-bill-totals-row">
                <span>{labels.taxLessDiscountLabel}</span>
                <span>{formatMoney(discountTotal)}</span>
              </div>
            ) : null}
            {data.oldGoldTotal > 0 ? (
              <div className="cash-bill-totals-row">
                <span>Old gold</span>
                <span>-{formatMoney(data.oldGoldTotal)}</span>
              </div>
            ) : null}
            {(data.schemeCreditTotal ?? 0) > 0 ? (
              <div className="cash-bill-totals-row">
                <span>Gold savings credit</span>
                <span>-{formatMoney(data.schemeCreditTotal)}</span>
              </div>
            ) : null}
            <div className="cash-bill-totals-row">
              <span>{labels.netAmountLabel}</span>
              <span>{formatMoney(data.amountPayable - data.roundOff)}</span>
            </div>
            {data.roundOff !== 0 ? (
              <div className="cash-bill-totals-row">
                <span>{labels.roundOffLabel}</span>
                <span>{formatMoney(data.roundOff)}</span>
              </div>
            ) : null}
            <div className="cash-bill-totals-row total">
              <span>{labels.totalLabel}</span>
              <span>{formatMoney(data.amountPayable)}</span>
            </div>
            <div className="cash-bill-totals-row">
              <span>{labels.receivedLabel}</span>
              <span>{formatMoney(data.amountPaid)}</span>
            </div>
            {data.balanceDue > 0 ? (
              <div className="cash-bill-totals-row">
                <span>Balance</span>
                <span>{formatMoney(data.balanceDue)}</span>
              </div>
            ) : null}
          </div>
        </div>

        <p className="cash-bill-words">
          {labels.amountInWordsLabel} {data.amountInWords}
        </p>
        <p className="cash-bill-note">{labels.goodsReceivedLabel}</p>

        {vis.showSignatures || vis.showThankYou ? (
          <footer className="cash-bill-signatures">
            <div className="left">{vis.showSignatures ? labels.cashCustomerSign : null}</div>
            <div className="center">{vis.showThankYou ? labels.thanksLabel : null}</div>
            <div className="right">
              {vis.showSignatures ? (
                <>
                  {shopInfo.signatureImagePath ? (
                    <img
                      className="cash-bill-signature-img"
                      src={localImageSrc(shopInfo.signatureImagePath, '')}
                      alt=""
                    />
                  ) : null}
                  {`${labels.cashForPrefix} ${shopInfo.name}`}
                </>
              ) : null}
            </div>
          </footer>
        ) : null}
      </article>
    </div>
  )
}
