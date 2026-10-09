import type { GoldSavingReportResult } from '@shared/types'
import { formatCurrency, formatDisplayDate } from '../../../lib/format'
import {
  defaultShopLogoUrl,
  EMPTY_SHOP_DISPLAY,
  localImageSrc,
  type ShopDisplayInfo,
} from '../../invoices/mapShopDisplay'
import { paperClassName } from '../../invoices/paperSize'
import { groupCallList } from './gsCallListRows'
import './GsCallListPrint.css'

export function GsCallListPrint({
  report,
  bucket,
  title,
  shop,
  paperSize = 'a4',
}: {
  report: GoldSavingReportResult
  bucket: string
  title: string
  shop?: ShopDisplayInfo
  paperSize?: 'a4' | 'a5'
}) {
  const shopInfo = shop ?? EMPTY_SHOP_DISPLAY
  const [phone1, phone2] = shopInfo.phones
  const phoneLine = [phone1, phone2].filter(Boolean).join(' · ')
  const rows = groupCallList(report, bucket)
  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0)
  const totalOverdue = rows.reduce((sum, row) => sum + row.overdueCount, 0)
  const generatedAt = report.generatedAt ? formatDisplayDate(report.generatedAt.slice(0, 10)) : ''

  return (
    <div className={`gs-call-list-root ${paperClassName(paperSize)}`} data-print-root>
      <article className="gs-call-list">
        <header className="gs-call-list-header">
          <div className="gs-call-list-brand">
            <img
              className="gs-call-list-logo"
              src={localImageSrc(shopInfo.logoImagePath, defaultShopLogoUrl)}
              alt=""
            />
            <div>
              <h1>{shopInfo.name || 'Amman Jewellers'}</h1>
              {shopInfo.addressLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
              {phoneLine ? <p>Mobile: {phoneLine}</p> : null}
            </div>
          </div>
          <h2>Gold savings call list</h2>
          <div className="gs-call-list-meta">
            <span>{title}</span>
            {generatedAt ? <span>Generated: {generatedAt}</span> : null}
          </div>
        </header>

        {rows.length === 0 ? (
          <p className="gs-call-list-empty">No overdue installments to call.</p>
        ) : (
          <>
            <div className="gs-call-list-summary">
              <span>
                <strong>{rows.length}</strong> accounts
              </span>
              <span>
                <strong>{totalOverdue}</strong> overdue installments
              </span>
              <span>
                <strong>{formatCurrency(totalAmount)}</strong> to collect
              </span>
            </div>
            <table className="gs-call-list-table">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Customer</th>
                  <th>Mobile</th>
                  <th>Account</th>
                  <th>Scheme</th>
                  <th className="num">Overdue</th>
                  <th className="num">Days</th>
                  <th className="num">Amount</th>
                  <th className="gs-call-list-notes">Notes / call outcome</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.account}>
                    <td className="num">{index + 1}</td>
                    <td>{row.customer}</td>
                    <td>{row.mobile || '—'}</td>
                    <td>{row.account}</td>
                    <td>{row.scheme}</td>
                    <td className="num">{row.overdueCount}</td>
                    <td className="num">{row.daysOverdue}</td>
                    <td className="num">{formatCurrency(row.amount)}</td>
                    <td className="gs-call-list-notes" />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={5}>Total</th>
                  <th className="num">{totalOverdue}</th>
                  <th />
                  <th className="num">{formatCurrency(totalAmount)}</th>
                  <th />
                </tr>
              </tfoot>
            </table>
          </>
        )}

        <footer className="gs-call-list-footer">
          <span>Prepared by: ____________________</span>
          <span>Date: ____________________</span>
        </footer>
      </article>
    </div>
  )
}
