import type { PaperSize } from "@shared/types";
import type { TaxInvoiceData } from "./taxInvoiceTypes";
import {
  defaultShopLogoUrl,
  EMPTY_SHOP_DISPLAY,
  localImageSrc,
  type ShopDisplayInfo,
} from "./mapShopDisplay";
import { paperClassName } from "./paperSize";
import "./TaxInvoicePrint.css";

const MIN_BODY_ROWS_A5 = 5;
const MIN_BODY_ROWS_A4 = 6;

function fmt3(value: number): string {
  return value.toFixed(3);
}

function fmt2(value: number): string {
  return value.toFixed(2);
}

function fmtRate(value: number): string {
  if (!value) return "";
  return value.toFixed(2);
}

function money(value: number): string {
  return value.toFixed(2);
}

export function TaxInvoicePrint({
  data,
  shop,
  paperSize = "a4",
}: {
  data: TaxInvoiceData;
  shop?: ShopDisplayInfo;
  paperSize?: PaperSize;
}) {
  const shopInfo = shop ?? EMPTY_SHOP_DISPLAY;
  const labels = shopInfo.billTemplate;
  const vis = shopInfo.taxVisibility;
  const [phone1, phone2] = shopInfo.phones;
  const phoneLine = [
    phone1 ? `${labels.taxPhoneLabel} ${phone1}` : "",
    phone2 ? `${labels.taxMobileLabel} ${phone2}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const discountTotal =
    data.discount > 0
      ? data.discount
      : data.discountBreakdown.reduce((sum, line) => sum + line.amount, 0);
  const filled = data.lines;
  const minRows = paperSize === "a4" ? MIN_BODY_ROWS_A4 : MIN_BODY_ROWS_A5;
  const emptyCount =
    paperSize === "thermal" ? 0 : Math.max(0, minRows - filled.length);
  const emptyRows = Array.from({ length: emptyCount }, (_, index) => index);

  return (
    <div
      className={`tax-invoice-root ${paperClassName(paperSize)}${filled.length > 8 ? ' tax-invoice-root--dense' : ''}`}
      data-print-root
    >
      <article className="tax-invoice">
        <img
          className="print-watermark"
          src={localImageSrc(shopInfo.logoImagePath, defaultShopLogoUrl)}
          alt=""
          aria-hidden
        />
        <header className="tax-invoice-header">
          <div className="tax-invoice-brand-row">
            <div className="tax-invoice-gstin">
              {shopInfo.gstin
                ? `${labels.taxGstinLabel} ${shopInfo.gstin}`
                : null}
            </div>
            <div className="tax-invoice-identity">
              {vis.showLogo ? (
                <img
                  className="tax-invoice-logo"
                  src={localImageSrc(shopInfo.logoImagePath, defaultShopLogoUrl)}
                  alt=""
                />
              ) : null}
              {shopInfo.name ? (
                <h1 className="tax-invoice-shop">{shopInfo.name}</h1>
              ) : null}
              {vis.showTagline && shopInfo.tagline ? (
                <p className="tax-invoice-tagline">{shopInfo.tagline}</p>
              ) : null}
              {shopInfo.addressLines.map((line) => (
                <p key={line} className="tax-invoice-address">
                  {line}
                </p>
              ))}
              {phoneLine ? (
                <p className="tax-invoice-meta-line">{phoneLine}</p>
              ) : null}
            </div>
            <div className="tax-invoice-marks">
              {vis.showBisLogo && shopInfo.bisLogoPath ? (
                <img
                  className="tax-invoice-bis"
                  src={localImageSrc(shopInfo.bisLogoPath, "")}
                  alt=""
                />
              ) : null}
              {vis.showQrCode && shopInfo.qrCodePath ? (
                <img
                  className="tax-invoice-qr"
                  src={localImageSrc(shopInfo.qrCodePath, "")}
                  alt=""
                />
              ) : null}
            </div>
          </div>
        </header>

        <hr className="tax-invoice-rule" />

        <section className="tax-invoice-meta">
          <div className="tax-invoice-party">
            <h2>{labels.taxBillToLabel}</h2>
            <p className="tax-invoice-customer-name">{data.customerName}</p>
            {data.customerGstin ? (
              <p className="tax-invoice-customer-address">
                {labels.taxGstinLabel} {data.customerGstin}
              </p>
            ) : null}
            {vis.showCustomerAddress
              ? data.customerAddressLines.map((line) => (
                  <p key={line} className="tax-invoice-customer-address">
                    {line}
                  </p>
                ))
              : null}
            {data.customerPhone ? (
              <p className="tax-invoice-customer-address">
                {labels.taxMobileLabel} {data.customerPhone}
              </p>
            ) : null}
          </div>
          <div className="tax-invoice-title-center">{labels.taxTitle}</div>
          <div className="tax-invoice-meta-right">
            <p>
              <span>{labels.taxDateLabel}</span> {data.billDateTime}
            </p>
            <p>
              <span>{labels.taxBillNoLabel}</span> {data.billNo}
            </p>
            {vis.showMarketRates ? (
              <>
                <p className="tax-invoice-rates-title">
                  {labels.marketRatesLabel}
                </p>
                <p>
                  <span>{labels.goldRateLabel}</span> {fmtRate(data.goldRate)}
                </p>
                <p>
                  <span>{labels.silverRateLabel}</span>{" "}
                  {fmtRate(data.silverRate)}
                </p>
              </>
            ) : null}
          </div>
        </section>

        <hr className="tax-invoice-rule" />

        <table className="tax-invoice-table">
          <thead>
            <tr>
              <th className="tax-invoice-col-particulars">
                {labels.taxColParticulars}
              </th>
              <th>{labels.taxColTotWgt}</th>
              <th>{labels.taxColGrsWgt}</th>
              <th>{labels.taxColStnWgt}</th>
              <th>{labels.taxColVamc}</th>
              <th>{labels.taxColStoneRate}</th>
              <th>{labels.taxColMetalRate}</th>
              <th className="tax-col-amount">{labels.taxColAmount}</th>
            </tr>
          </thead>
          <tbody>
            {filled.map((line, index) => (
              <tr key={index}>
                <td className="tax-invoice-col-particulars">
                  {line.particulars}
                </td>
                <td className="tax-invoice-col-num">
                  {fmt3(line.totalWeight ?? line.grossWeight)}
                </td>
                <td className="tax-invoice-col-num">
                  {fmt3(line.grossWeight)}
                </td>
                <td className="tax-invoice-col-num">
                  {fmt3(line.stoneWeight ?? 0)}
                </td>
                <td className="tax-invoice-col-num">
                  {fmt2(line.vamc ?? line.wastagePct)}
                </td>
                <td className="tax-invoice-col-num">
                  {fmt2(line.stoneRate ?? 0)}
                </td>
                <td className="tax-invoice-col-num">{fmt2(line.metalRate)}</td>
                <td className="tax-invoice-col-num tax-col-amount">
                  {fmt2(line.amount)}
                </td>
              </tr>
            ))}
            {emptyRows.map((index) => (
              <tr key={`empty-${index}`} className="empty">
                <td className="tax-invoice-col-particulars">&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td className="tax-col-amount">&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="tax-invoice-item-count">
          {labels.taxItemCountLabel} {data.itemCount}
        </p>
        <div
          className={`tax-invoice-footer-grid${vis.showDiscountBreakdown ? '' : ' tax-invoice-footer-grid--single'}`}
        >
          {vis.showDiscountBreakdown ? (
            <div className="tax-invoice-discount-box">
              <h3>{labels.discountBreakdownLabel}</h3>
              {data.discountBreakdown.length === 0 ? (
                <div className="tax-invoice-totals-row">
                  <span>—</span>
                  <span>0.00</span>
                </div>
              ) : (
                data.discountBreakdown.map((line) => (
                  <div key={line.label} className="tax-invoice-totals-row">
                    <span>{line.label}</span>
                    <span>{money(line.amount)}</span>
                  </div>
                ))
              )}
              {discountTotal > 0 ? (
                <div className="tax-invoice-totals-row tax-invoice-totals-row--discount-total">
                  <span>{labels.totalLabel}</span>
                  <span>{money(discountTotal)}</span>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="tax-invoice-totals">
            <div className="tax-invoice-totals-row">
              <span>Taxable Value</span>
              <span>{money(data.subtotal)}</span>
            </div>
            {data.cgst > 0 ? (
              <div className="tax-invoice-totals-row">
                <span>{labels.taxCgstLabel}</span>
                <span>{money(data.cgst)}</span>
              </div>
            ) : null}
            {data.sgst > 0 ? (
              <div className="tax-invoice-totals-row">
                <span>{labels.taxSgstLabel}</span>
                <span>{money(data.sgst)}</span>
              </div>
            ) : null}
            {data.igst > 0 ? (
              <div className="tax-invoice-totals-row">
                <span>IGST</span>
                <span>{money(data.igst)}</span>
              </div>
            ) : null}
            {discountTotal > 0 ? (
              <div className="tax-invoice-totals-row">
                <span>{labels.taxLessDiscountLabel}</span>
                <span>{money(discountTotal)}</span>
              </div>
            ) : null}
            {data.oldGoldTotal > 0 ? (
              <div className="tax-invoice-totals-row">
                <span>Old gold</span>
                <span>-{money(data.oldGoldTotal)}</span>
              </div>
            ) : null}
            <div className="tax-invoice-totals-row">
              <span>{labels.netAmountLabel}</span>
              <span>{money(data.amountPayable - data.roundOff)}</span>
            </div>
            {data.roundOff !== 0 ? (
              <div className="tax-invoice-totals-row">
                <span>{labels.roundOffLabel}</span>
                <span>{money(data.roundOff)}</span>
              </div>
            ) : null}
            <div className="tax-invoice-totals-row tax-invoice-totals-row--grand">
              <span>{labels.totalLabel}</span>
              <span>{money(data.amountPayable)}</span>
            </div>
            <div className="tax-invoice-totals-row">
              <span>{labels.receivedLabel}</span>
              <span>{money(data.amountPaid)}</span>
            </div>
            {data.balanceDue > 0 ? (
              <div className="tax-invoice-totals-row">
                <span>Balance</span>
                <span>{money(data.balanceDue)}</span>
              </div>
            ) : null}
          </div>
        </div>

        <p className="tax-invoice-words">
          {labels.amountInWordsLabel} {data.amountInWords}
        </p>
        <p className="tax-invoice-note">{labels.goodsReceivedLabel}</p>

        {vis.showSignatures || labels.taxThanks ? (
          <footer className="tax-invoice-signatures">
            <div className="left">
              {vis.showSignatures ? labels.taxCustomerSign : null}
            </div>
            <div className="center">{labels.taxThanks}</div>
            <div className="right">
              {vis.showSignatures ? (
                <>
                  {shopInfo.signatureImagePath ? (
                    <img
                      className="tax-invoice-signature-img"
                      src={localImageSrc(shopInfo.signatureImagePath, "")}
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
  );
}
