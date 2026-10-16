import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { Calendar, Clock, Pencil, Save } from 'lucide-react'
import {
  deriveGoldRates,
  deriveSilverRates,
  goldPurityPercent,
  silverPurityPercent,
  type GoldKarat,
  type SilverFineness,
} from '@shared/billing/metalRateDerivation'
import { localTodayIso } from '@shared/localDate'
import type { MetalRates, MetalRatesInput } from '@shared/types'
import { DataTable, TablePager } from '../../components/DataTable'
import { DateInput } from '../../components/DateInput'
import { LoadingState } from '../../components/LoadingState'
import { useToast } from '../../components/toastContext'
import { api } from '../../lib/api'
import { formatCurrency, formatDisplayDateTime, paginate, TABLE_PAGE_SIZE } from '../../lib/format'
import { numericFieldToNumber, parseNumericField, type NumericField } from '../../lib/numericField'
import { MetalBarsMark } from './MetalBarsMark'
import { flattenRateHistory } from './rateHistory'
import { RateTrendChart, type RateTrendDays } from './RateTrendChart'

type GoldField = 'gold24k' | 'gold22k' | 'gold20k' | 'gold18k'
type SilverField = 'silverFine' | 'silver925'
type RateField = GoldField | SilverField
type BuyField = 'gold24kBuy' | 'gold22kBuy' | 'gold20kBuy' | 'gold18kBuy' | 'silverFineBuy' | 'silver925Buy'

type DraftRates = Record<RateField, NumericField>
type BuyRates = Record<BuyField, NumericField>

const BUY_CARDS: { field: BuyField; title: string }[] = [
  { field: 'gold24kBuy', title: '24K GOLD BUY' },
  { field: 'gold22kBuy', title: '22K GOLD BUY' },
  { field: 'gold20kBuy', title: '20K GOLD BUY' },
  { field: 'gold18kBuy', title: '18K GOLD BUY' },
  { field: 'silverFineBuy', title: 'FINE SILVER BUY' },
  { field: 'silver925Buy', title: '925 SILVER BUY' },
]

const EMPTY_BUY_RATES: BuyRates = {
  gold24kBuy: '',
  gold22kBuy: '',
  gold20kBuy: '',
  gold18kBuy: '',
  silverFineBuy: '',
  silver925Buy: '',
}

function buyRatesFromRates(rates: MetalRates): BuyRates {
  return {
    gold24kBuy: rates.gold24kBuy || '',
    gold22kBuy: rates.gold22kBuy || '',
    gold20kBuy: rates.gold20kBuy || '',
    gold18kBuy: rates.gold18kBuy || '',
    silverFineBuy: rates.silverFineBuy || '',
    silver925Buy: rates.silver925Buy || '',
  }
}

const GOLD_CARDS: { field: GoldField; karat: GoldKarat; title: string }[] = [
  { field: 'gold24k', karat: 24, title: '24K GOLD' },
  { field: 'gold22k', karat: 22, title: '22K GOLD' },
  { field: 'gold20k', karat: 20, title: '20K GOLD' },
  { field: 'gold18k', karat: 18, title: '18K GOLD' },
]

const SILVER_CARDS: { field: SilverField; fineness: SilverFineness; title: string }[] = [
  { field: 'silverFine', fineness: 999, title: 'FINE SILVER (999)' },
  { field: 'silver925', fineness: 925, title: '925 SILVER' },
]

const EMPTY_DRAFT: DraftRates = {
  gold24k: '',
  gold22k: '',
  gold20k: '',
  gold18k: '',
  silverFine: '',
  silver925: '',
}

function draftFromRates(rates: MetalRates): DraftRates {
  return {
    gold24k: rates.gold24k,
    gold22k: rates.gold22k,
    gold20k: rates.gold20k,
    gold18k: rates.gold18k,
    silverFine: rates.silverFine,
    silver925: rates.silver925,
  }
}

function RatesPageHeader({
  goldAmount,
  silverAmount,
}: {
  goldAmount: number | undefined
  silverAmount: number | undefined
}) {
  return (
    <header className="page-header app-page-header rates-page-header">
      <div className="rates-page-title">
        <MetalBarsMark metal="gold" size="md" />
        <div>
          <h1>Gold &amp; Silver Rates</h1>
          <p className="page-subtitle muted">
            Manage daily bullion rates. Every update is saved with a timestamp.
          </p>
        </div>
      </div>
      <div className="page-header-actions rates-summary-pills">
        <RateSummaryPill metal="gold" label="GOLD" amount={goldAmount} />
        <RateSummaryPill metal="silver" label="SILVER" amount={silverAmount} />
      </div>
    </header>
  )
}

function RateSummaryPill({
  metal,
  label,
  amount,
}: {
  metal: 'gold' | 'silver'
  label: string
  amount: number | undefined
}) {
  return (
    <span className={`rates-summary-pill rates-summary-pill-${metal}`}>
      <MetalBarsMark metal={metal} size="sm" />
      <span className="rates-summary-copy">
        <span className="rates-summary-label">{label}</span>
        <span className="rates-summary-amount num">
          {amount != null ? `${formatCurrency(amount)}/g` : '—'}
        </span>
      </span>
    </span>
  )
}

function RatePurityCard({
  metal,
  title,
  subtitle,
  value,
  lastUpdated,
  editing,
  onEdit,
  onChange,
  onKeyDown,
}: {
  metal: 'gold' | 'silver'
  title: string
  subtitle: string
  value: NumericField
  lastUpdated: string | null
  editing: boolean
  onEdit: () => void
  onChange: (raw: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
}) {
  return (
    <article className="rate-purity-card">
      <div className="rate-purity-card-head">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <button
          type="button"
          className="rate-purity-edit"
          aria-label={`Edit ${title}`}
          onClick={onEdit}
        >
          <Pencil size={15} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      <div className="rate-purity-body">
        {editing ? (
          <input
            className="input rate-purity-input"
            type="number"
            min="0"
            step="0.01"
            autoFocus
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            aria-label={`${title} rate per gram`}
          />
        ) : (
          <p className="rate-purity-amount num">{value === '' ? '—' : formatCurrency(value)}</p>
        )}
        <MetalBarsMark metal={metal} size="lg" />
      </div>
      <p className="rate-purity-updated">
        <Clock size={13} strokeWidth={1.75} aria-hidden />
        <span>Last updated: {lastUpdated ? formatDisplayDateTime(lastUpdated) : '—'}</span>
      </p>
    </article>
  )
}

export function MetalRatesPage() {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [latest, setLatest] = useState<MetalRates | null>(null)
  const [history, setHistory] = useState<MetalRates[]>([])
  const [trend, setTrend] = useState<MetalRates[]>([])
  const [trendDays, setTrendDays] = useState<RateTrendDays>(90)
  const [effectiveDate, setEffectiveDate] = useState(localTodayIso)
  const [draft, setDraft] = useState<DraftRates>(EMPTY_DRAFT)
  const [buyDraft, setBuyDraft] = useState<BuyRates>(EMPTY_BUY_RATES)
  const [editing, setEditing] = useState<RateField | null>(null)
  const [page, setPage] = useState(1)

  async function reload(days = trendDays) {
    const [latestRates, list, trendList] = await Promise.all([
      api.getLatestMetalRates(),
      api.listMetalRates(),
      api.listMetalRates(days),
    ])
    setLatest(latestRates)
    setHistory(list)
    setTrend(trendList)
    setPage(1)
    if (latestRates) {
      setDraft(draftFromRates(latestRates))
      setBuyDraft(buyRatesFromRates(latestRates))
    }
    return latestRates
  }

  useEffect(() => {
    void (async () => {
      try {
        const [latestRates, list, trendList] = await Promise.all([
          api.getLatestMetalRates(),
          api.listMetalRates(),
          api.listMetalRates(90),
        ])
        setLatest(latestRates)
        setHistory(list)
        setTrend(trendList)
        if (latestRates) {
          setDraft(draftFromRates(latestRates))
          setBuyDraft(buyRatesFromRates(latestRates))
        }
        setPage(1)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load metal rates')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function changeTrendDays(days: RateTrendDays) {
    setTrendDays(days)
    try {
      setTrend(await api.listMetalRates(days))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rate trend')
    }
  }

  const historyRows = useMemo(() => flattenRateHistory(history), [history])
  const lastHistoryPage = Math.max(1, Math.ceil(historyRows.length / TABLE_PAGE_SIZE))
  const historyPage = Math.min(page, lastHistoryPage)
  const pagedHistory = useMemo(
    () => paginate(historyRows, historyPage, TABLE_PAGE_SIZE),
    [historyRows, historyPage],
  )

  const savedSnapshot = useMemo(() => (latest ? draftFromRates(latest) : EMPTY_DRAFT), [latest])
  const savedBuySnapshot = useMemo(
    () => (latest ? buyRatesFromRates(latest) : EMPTY_BUY_RATES),
    [latest],
  )
  const dirty =
    effectiveDate !== (latest?.effectiveDate ?? localTodayIso()) ||
    GOLD_CARDS.some((card) => numericFieldToNumber(draft[card.field]) !== numericFieldToNumber(savedSnapshot[card.field])) ||
    SILVER_CARDS.some(
      (card) => numericFieldToNumber(draft[card.field]) !== numericFieldToNumber(savedSnapshot[card.field]),
    ) ||
    BUY_CARDS.some(
      (card) => numericFieldToNumber(buyDraft[card.field]) !== numericFieldToNumber(savedBuySnapshot[card.field]),
    )

  function revert() {
    setDraft(latest ? draftFromRates(latest) : EMPTY_DRAFT)
    setBuyDraft(latest ? buyRatesFromRates(latest) : EMPTY_BUY_RATES)
    setEditing(null)
  }

  function onGoldChange(karat: GoldKarat, raw: string) {
    const parsed = parseNumericField(raw)
    if (parsed === '') {
      const field = GOLD_CARDS.find((card) => card.karat === karat)?.field
      if (field) setDraft((current) => ({ ...current, [field]: '' }))
      return
    }
    setDraft((current) => ({ ...current, ...deriveGoldRates(karat, parsed) }))
  }

  function onSilverChange(fineness: SilverFineness, raw: string) {
    const parsed = parseNumericField(raw)
    if (parsed === '') {
      const field = SILVER_CARDS.find((card) => card.fineness === fineness)?.field
      if (field) setDraft((current) => ({ ...current, [field]: '' }))
      return
    }
    setDraft((current) => ({ ...current, ...deriveSilverRates(fineness, parsed) }))
  }

  async function saveRates() {
    const input: MetalRatesInput = {
      effectiveDate,
      gold24k: numericFieldToNumber(draft.gold24k),
      gold22k: numericFieldToNumber(draft.gold22k),
      gold20k: numericFieldToNumber(draft.gold20k),
      gold18k: numericFieldToNumber(draft.gold18k),
      silverFine: numericFieldToNumber(draft.silverFine),
      silver925: numericFieldToNumber(draft.silver925),
      gold24kBuy: numericFieldToNumber(buyDraft.gold24kBuy),
      gold22kBuy: numericFieldToNumber(buyDraft.gold22kBuy),
      gold20kBuy: numericFieldToNumber(buyDraft.gold20kBuy),
      gold18kBuy: numericFieldToNumber(buyDraft.gold18kBuy),
      silverFineBuy: numericFieldToNumber(buyDraft.silverFineBuy),
      silver925Buy: numericFieldToNumber(buyDraft.silver925Buy),
    }
    setSaving(true)
    try {
      await api.upsertMetalRates(input)
      await reload()
      setEditing(null)
      showToast('Metal rates saved', 'success')
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save metal rates')
    } finally {
      setSaving(false)
    }
  }

  function onCardKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      void saveRates()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      revert()
    }
  }

  if (loading) {
    return (
      <div className="billing-shell rates-page">
        <RatesPageHeader goldAmount={undefined} silverAmount={undefined} />
        <LoadingState rows={4} />
      </div>
    )
  }

  return (
    <div className="billing-shell rates-page">
      <RatesPageHeader goldAmount={latest?.gold24k} silverAmount={latest?.silverFine} />

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="rates-toolbar">
        <label className="rates-date-field">
          <Calendar size={16} strokeWidth={1.75} aria-hidden />
          <span>Effective date</span>
          <DateInput
            className="input"
            value={effectiveDate}
            onChange={setEffectiveDate}
            ariaLabel="Effective date"
            showIcon
          />
        </label>
        <button
          type="button"
          className="btn"
          disabled={saving || !dirty}
          onClick={() => void saveRates()}
        >
          <Save size={16} strokeWidth={1.75} aria-hidden />
          Save rates
        </button>
      </div>

      <section className="rates-metal-panel rates-metal-panel-gold">
        <div className="rates-metal-head">
          <MetalBarsMark metal="gold" size="sm" />
          <h2 className="rates-metal-label">GOLD</h2>
          <span className="rates-metal-divider" aria-hidden />
          <p>Update gold rates for different purities.</p>
        </div>
        <div className="rates-gold-grid">
          {GOLD_CARDS.map((card) => (
            <RatePurityCard
              key={card.field}
              metal="gold"
              title={card.title}
              subtitle={`${card.karat}K (${goldPurityPercent(card.karat)})`}
              value={draft[card.field]}
              lastUpdated={latest?.createdAt ?? null}
              editing={editing === card.field}
              onEdit={() => setEditing((current) => (current === card.field ? null : card.field))}
              onChange={(raw) => onGoldChange(card.karat, raw)}
              onKeyDown={onCardKeyDown}
            />
          ))}
        </div>
      </section>

      <section className="rates-metal-panel rates-metal-panel-silver">
        <div className="rates-metal-head">
          <MetalBarsMark metal="silver" size="sm" />
          <h2 className="rates-metal-label">SILVER</h2>
          <span className="rates-metal-divider" aria-hidden />
          <p>Update silver rates for different purities.</p>
        </div>
        <div className="rates-silver-grid">
          {SILVER_CARDS.map((card) => (
            <RatePurityCard
              key={card.field}
              metal="silver"
              title={card.title}
              subtitle={`${card.fineness} (${silverPurityPercent(card.fineness)})`}
              value={draft[card.field]}
              lastUpdated={latest?.createdAt ?? null}
              editing={editing === card.field}
              onEdit={() => setEditing((current) => (current === card.field ? null : card.field))}
              onChange={(raw) => onSilverChange(card.fineness, raw)}
              onKeyDown={onCardKeyDown}
            />
          ))}
        </div>
      </section>

      <section className="card padded rates-metal-panel">
        <h2 className="rates-metal-label">OLD GOLD BUYING RATES</h2>
        <p className="rates-buy-note">
          Rates paid to the customer when buying old gold. Leave a rate at zero to fall back to the
          selling rate above.
        </p>
        <div className="rates-gold-grid">
          {BUY_CARDS.map((card) => (
            <article key={card.field} className="rate-purity-card">
              <div className="rate-purity-card-head">
                <div>
                  <h3>{card.title}</h3>
                </div>
              </div>
              <input
                className="input rate-purity-input"
                type="number"
                min="0"
                step="0.01"
                value={buyDraft[card.field]}
                onChange={(event) =>
                  setBuyDraft((current) => ({
                    ...current,
                    [card.field]: parseNumericField(event.target.value),
                  }))
                }
                aria-label={`${card.title} rate per gram`}
              />
            </article>
          ))}
        </div>
      </section>

      <RateTrendChart history={trend} days={trendDays} onDaysChange={(days) => void changeTrendDays(days)} />

      <DataTable
        header={
          <div className="rates-history-head">
            <h2 className="rates-section-title">Recent updates</h2>
          </div>
        }
        footer={
          historyRows.length > 0 ? (
            <TablePager page={historyPage} total={historyRows.length} onPageChange={setPage} />
          ) : null
        }
      >
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Purity</th>
              <th className="num">Rate</th>
              <th>Updated at</th>
            </tr>
          </thead>
          <tbody>
            {pagedHistory.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-cell">
                  No metal rates saved yet
                </td>
              </tr>
            ) : (
              pagedHistory.map((row) => (
                <tr key={row.key}>
                  <td>{row.type}</td>
                  <td>{row.purity}</td>
                  <td className="num">{formatCurrency(row.rate)}</td>
                  <td>{formatDisplayDateTime(row.updatedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </DataTable>
    </div>
  )
}
