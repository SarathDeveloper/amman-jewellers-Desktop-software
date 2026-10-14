import type { GoldSavingLedgerEntry, GoldSavingPassbook } from '@shared/types'
import { formatDisplayDate } from '../../../lib/format'
import { EMPTY_SHOP_DISPLAY, localImageSrc, type ShopDisplayInfo } from '../../invoices/mapShopDisplay'
import { currentBonusGold, progressPct, projectedBonusGold } from '../gsProjection'
import { GsPassbookShell, passbookRuleLines } from './GsPassbookShell'
import './GsPassbookPrint.css'

const COLUMNS = ['மாதம்', 'தேதி', 'ரசீது எண்', 'தொகை', 'தங்கம் விலை', 'தங்கம் எடை', 'கையொப்பம்'] as const

function monthLabel(index: number): string {
  return String(index + 1).padStart(2, '0')
}

export function GsPassbookPrint({
  passbook,
  shop,
}: {
  passbook: GoldSavingPassbook
  shop?: ShopDisplayInfo
}) {
  const shopInfo = shop ?? EMPTY_SHOP_DISPLAY
  const payments = passbook.rows.filter(
    (row) => row.entryType === 'payment' && row.paymentStatus === 'posted',
  )
  const byInstallment = new Map<number, GoldSavingLedgerEntry>()
  for (const row of payments) {
    if (row.installmentNo) byInstallment.set(row.installmentNo, row)
  }
  const totalRows = Math.max(passbook.scheme.durationMonths, payments.length, 11)
  const rows = Array.from({ length: totalRows }, (_, index) => byInstallment.get(index + 1) ?? null)
  const sideSrc = (shopInfo.passbookSideImagePath ?? '').trim()
    ? localImageSrc(shopInfo.passbookSideImagePath, '')
    : ''
  const rules = passbookRuleLines(passbook.scheme.terms)
  const paidCount = passbook.account.paidInstallments
  const duration = passbook.account.durationMonths
  const schemePct = progressPct(paidCount, duration)
  const remaining = Math.max(0, duration - paidCount)
  const bonusNow = currentBonusGold({
    scheme: passbook.scheme,
    accumulatedGrams: passbook.account.goldAccumulated,
    paidInstallments: paidCount,
    durationMonths: duration,
    ratePerGram: 0,
  })
  const bonusProjected = projectedBonusGold({
    scheme: passbook.scheme,
    accumulatedGrams: passbook.account.goldAccumulated,
    remainingInstallments: remaining,
    monthlyAmount: passbook.account.monthlyAmount,
    durationMonths: duration,
    ratePerGram: 0,
  })
  const bonusLine =
    passbook.scheme.bonusType === 'none' || passbook.scheme.bonusValue <= 0
      ? 'None'
      : bonusNow > 0
        ? `${bonusNow.toFixed(3)} g eligible`
        : bonusProjected > 0
          ? `${bonusProjected.toFixed(3)} g if completed`
          : passbook.scheme.bonusType === 'fixed_amount'
            ? `₹${passbook.scheme.bonusValue.toFixed(2)} if completed`
            : passbook.scheme.bonusType === 'additional_gold'
              ? `${passbook.scheme.bonusValue.toFixed(3)} g if completed`
              : `${passbook.scheme.bonusValue}% if completed`

  return (
    <GsPassbookShell shop={shopInfo} rules={rules}>
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

      <section className="gs-passbook-summary" aria-label="Scheme summary">
        <div>
          <span>Amount paid</span>
          <strong>₹{passbook.account.totalPaid.toFixed(2)}</strong>
        </div>
        <div>
          <span>Gold accumulated</span>
          <strong>{passbook.account.goldAccumulated.toFixed(3)} g</strong>
        </div>
        <div>
          <span>Installments</span>
          <strong>
            {paidCount} / {duration} ({schemePct}%)
          </strong>
        </div>
        <div>
          <span>Bonus</span>
          <strong>{bonusLine}</strong>
        </div>
      </section>

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
    </GsPassbookShell>
  )
}
