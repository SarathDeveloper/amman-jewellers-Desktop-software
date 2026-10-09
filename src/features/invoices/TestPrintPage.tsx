import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { PaperSize, PrinterRole } from '@shared/types'
import { api } from '../../lib/api'
import { formatDisplayDateTime } from '../../lib/format'
import { applyPaperDataset, paperClassName, paperPageCss } from './paperSize'
import { signalPrintReady, waitForPrintLayout } from './printPageUtils'
import './CashBillPrint.css'
import './TestPrintPage.css'

function isPrinterRole(value: string | undefined): value is PrinterRole {
  return value === 'cash' || value === 'tax'
}

function paperLabel(paper: PaperSize): string {
  if (paper === 'a4') return 'A4'
  if (paper === 'thermal') return 'Thermal 80mm'
  return 'A5'
}

export function TestPrintPage() {
  const { role: roleParam } = useParams()
  const [shopName, setShopName] = useState('')
  const [paperSize, setPaperSize] = useState<PaperSize>('a5')
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const role: PrinterRole = isPrinterRole(roleParam) ? roleParam : 'cash'

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        if (!isPrinterRole(roleParam)) {
          throw new Error('Invalid printer role')
        }
        const settings = await api.getShopSettings()
        if (!active) return
        const paper = role === 'tax' ? settings.paperSizeTax : settings.paperSizeCash
        setShopName(settings.shopName)
        setPaperSize(paper)
        applyPaperDataset(paper)
        setReady(true)
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to prepare test print')
        }
      }
    })()
    return () => {
      active = false
    }
  }, [role, roleParam])

  useEffect(() => {
    if (!ready && !error) return
    let cancelled = false
    void (async () => {
      try {
        if (ready) {
          await waitForPrintLayout()
        }
        if (cancelled) return
        signalPrintReady(error)
      } catch (err) {
        if (!cancelled) {
          signalPrintReady(err instanceof Error ? err.message : 'Failed to prepare test print')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ready, error])

  const printedAt = formatDisplayDateTime(new Date().toISOString())

  return (
    <div className="cash-bill-print-page">
      <style>{paperPageCss(paperSize)}</style>
      {error && <p className="cash-bill-print-status cash-bill-print-error">{error}</p>}
      {!error && !ready && <p className="cash-bill-print-status">Preparing test print…</p>}
      {ready && (
        <div className={`test-print-root ${paperClassName(paperSize)}`} data-print-root>
          <h1>{shopName}</h1>
          <p className="test-print-title">Printer test</p>
          <p>
            <strong>Role:</strong> {role === 'tax' ? 'Tax invoice' : 'Cash bill'}
          </p>
          <p>
            <strong>Paper:</strong> {paperLabel(paperSize)}
          </p>
          <p>
            <strong>Printed:</strong> {printedAt}
          </p>
          <p className="test-print-ok">If you can read this, the printer is working.</p>
        </div>
      )}
    </div>
  )
}
