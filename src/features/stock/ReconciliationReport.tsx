import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import type { StockReconciliationRow } from '@shared/types'
import { LoadingState } from '../../components/LoadingState'
import { formatWeight } from '../../lib/format'
import { api } from '../../lib/api'

export function ReconciliationReport({ date }: { date: string }) {
  const [rows, setRows] = useState<StockReconciliationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      setLoading(true)
      setRows(await api.getStockReconciliation(date))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reconciliation')
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return <LoadingState />
  }

  return (
    <div className="card table-wrap">
      <div className="padded row-actions" style={{ justifyContent: 'space-between' }}>
        <p className="muted" style={{ margin: 0 }}>
          Weight ledger closing vs piece stock (net wt × qty). Both views read from one stock_movements ledger, so non-zero unexplained means direct DB tampering outside the movement helpers.
        </p>
        <button type="button" className="btn secondary" onClick={() => void load()}>
          <RefreshCw size={15} aria-hidden />
          Refresh
        </button>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      <table>
        <thead>
          <tr>
            <th>Metal</th>
            <th>Category</th>
            <th className="num">Ledger close</th>
            <th className="num">Piece implied</th>
            <th className="num">Raw inward</th>
            <th className="num">Unexplained</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.metal}-${row.category}`} className={row.flagged ? 'is-danger' : undefined}>
              <td>{row.metal}</td>
              <td>{row.category}</td>
              <td className="num">{formatWeight(row.ledgerClosing)}</td>
              <td className="num">{formatWeight(row.pieceImpliedWeight)}</td>
              <td className="num">{formatWeight(row.rawMetalInward)}</td>
              <td className="num">{formatWeight(row.unexplained)}</td>
              <td>
                {row.flagged ? (
                  <span className="badge final" title="ledgerClosing − pieceImpliedWeight − rawMetalInward">
                    <AlertTriangle size={13} aria-hidden /> Drift
                  </span>
                ) : (
                  <span className="badge draft">OK</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
