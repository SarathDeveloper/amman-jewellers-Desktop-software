import type { ReactNode } from 'react'
import { TABLE_PAGE_SIZE } from '../lib/format'

function pageNumbers(page: number, lastPage: number): number[] {
  const windowSize = 5
  const start = Math.max(1, Math.min(page - 2, lastPage - windowSize + 1))
  const end = Math.min(lastPage, start + windowSize - 1)
  const pages: number[] = []
  for (let value = Math.max(1, start); value <= end; value += 1) {
    pages.push(value)
  }
  return pages
}

export function TablePager({
  page,
  pageSize = TABLE_PAGE_SIZE,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions,
  itemLabel,
}: {
  page: number
  pageSize?: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: number[]
  itemLabel?: string
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const numbered = Boolean(onPageSizeChange || itemLabel)

  return (
    <div className="table-footer">
      <span>
        Showing {from} to {to} of {total}
        {itemLabel ? ` ${itemLabel}` : ''}
      </span>
      <div className="table-footer-actions">
        <button
          type="button"
          className={numbered ? 'table-page-btn' : 'btn secondary'}
          disabled={page <= 1}
          aria-label="Previous page"
          onClick={() => onPageChange(page - 1)}
        >
          {numbered ? '‹' : 'Previous'}
        </button>
        {numbered
          ? pageNumbers(page, lastPage).map((value) => (
              <button
                key={value}
                type="button"
                className={`table-page-btn${value === page ? ' active' : ''}`}
                aria-current={value === page ? 'page' : undefined}
                onClick={() => onPageChange(value)}
              >
                {value}
              </button>
            ))
          : null}
        <button
          type="button"
          className={numbered ? 'table-page-btn' : 'btn secondary'}
          disabled={page >= lastPage}
          aria-label="Next page"
          onClick={() => onPageChange(page + 1)}
        >
          {numbered ? '›' : 'Next'}
        </button>
        {onPageSizeChange && pageSizeOptions?.length ? (
          <label className="table-page-size">
            <select
              className="input"
              value={pageSize}
              aria-label="Rows per page"
              onChange={(event) => {
                onPageSizeChange(Number(event.target.value))
                onPageChange(1)
              }}
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </div>
  )
}

export function DataTable({
  children,
  header,
  footer,
}: {
  children: ReactNode
  header?: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="card data-table">
      {header}
      <div className="table-wrap">{children}</div>
      {footer}
    </div>
  )
}
