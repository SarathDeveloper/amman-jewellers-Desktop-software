import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { PaperSize, ShopSettings } from '@shared/types'
import { api } from '../../lib/api'
import { SAMPLE_ADAGU_PLEDGE, SAMPLE_CASH_BILL, SAMPLE_TAX_INVOICE } from '../settings/sampleBillPreview'
import { PledgePrint } from '../pledges/PledgePrint'
import '../pledges/PledgePrint.css'
import { CashBillPrint } from './CashBillPrint'
import { shopSettingsToDisplay, type ShopDisplayInfo } from './mapShopDisplay'
import { applyPaperDataset, paperPageCss } from './paperSize'
import { signalPrintReady, waitForPrintLayout } from './printPageUtils'
import { takeSampleBillPrint, type SampleBillKind } from './sampleBillPrintStore'
import { TaxInvoicePrint } from './TaxInvoicePrint'
import './CashBillPrint.css'
import './TaxInvoicePrint.css'

export type { SampleBillKind } from './sampleBillPrintStore'
export { storeSampleBillPrint } from './sampleBillPrintStore'

function isSampleBillKind(value: string | undefined): value is SampleBillKind {
  return value === 'cash' || value === 'tax' || value === 'adagu'
}

function paperForKind(kind: SampleBillKind, shop: ShopSettings): PaperSize {
  if (kind === 'tax') return shop.paperSizeTax
  if (kind === 'adagu') return 'a4'
  return shop.paperSizeCash
}

export function SampleBillPrintPage() {
  const { kind: kindParam } = useParams()
  const [kind, setKind] = useState<SampleBillKind | null>(null)
  const [shop, setShop] = useState<ShopDisplayInfo | null>(null)
  const [paperSize, setPaperSize] = useState<PaperSize>('a5')
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        if (!isSampleBillKind(kindParam)) {
          throw new Error('Invalid sample bill type')
        }
        let settings: ShopSettings | null = takeSampleBillPrint(kindParam)
        if (!settings) {
          settings = await api.getShopSettings()
        }
        if (!active) return
        const paper = paperForKind(kindParam, settings)
        setKind(kindParam)
        setShop(shopSettingsToDisplay(settings))
        setPaperSize(paper)
        applyPaperDataset(paper)
        setReady(true)
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to prepare sample bill')
        }
      }
    })()
    return () => {
      active = false
    }
  }, [kindParam])

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
          signalPrintReady(err instanceof Error ? err.message : 'Failed to prepare sample bill')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ready, error])

  return (
    <div className="cash-bill-print-page">
      <style>{paperPageCss(paperSize)}</style>
      {error && <p className="cash-bill-print-status cash-bill-print-error">{error}</p>}
      {!error && !ready && <p className="cash-bill-print-status">Preparing sample bill…</p>}
      {ready && kind === 'cash' && shop ? (
        <CashBillPrint data={SAMPLE_CASH_BILL} shop={shop} paperSize={paperSize} />
      ) : null}
      {ready && kind === 'tax' && shop ? (
        <TaxInvoicePrint data={SAMPLE_TAX_INVOICE} shop={shop} paperSize={paperSize} />
      ) : null}
      {ready && kind === 'adagu' && shop ? <PledgePrint pledge={SAMPLE_ADAGU_PLEDGE} shop={shop} /> : null}
    </div>
  )
}
