import { useId } from 'react'
import { BarChart3 } from 'lucide-react'
import type { MetalRates } from '@shared/types'
import { formatCurrency, formatDisplayDate, formatDisplayDayMonth } from '../../lib/format'

const RATE_TREND_PERIODS = [
  { days: 30, label: '1 Month' },
  { days: 90, label: '3 Months' },
  { days: 180, label: '6 Months' },
  { days: 365, label: '1 Year' },
] as const

export type RateTrendDays = (typeof RATE_TREND_PERIODS)[number]['days']

const WIDTH = 760
const HEIGHT = 300
const PAD = { top: 18, right: 18, bottom: 36, left: 62 }

function niceCeil(value: number): number {
  if (value <= 0) return 1
  const mag = 10 ** Math.floor(Math.log10(value))
  const n = value / mag
  const nice =
    n <= 1 ? 1 : n <= 1.2 ? 1.2 : n <= 1.5 ? 1.5 : n <= 1.8 ? 1.8 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return nice * mag
}

function formatAxisAmount(value: number): string {
  if (value >= 1000) {
    return `₹${(value / 1000).toFixed(1)}K`
  }
  return formatCurrency(value)
}

function xAt(index: number, count: number, innerW: number): number {
  if (count <= 1) return PAD.left + innerW / 2
  return PAD.left + (index / (count - 1)) * innerW
}

function yAt(value: number, yMax: number, innerH: number): number {
  return PAD.top + innerH - (value / yMax) * innerH
}

function labelIndexes(count: number): number[] {
  if (count <= 1) return [0]
  const slots = Math.min(7, count)
  const indexes: number[] = []
  for (let slot = 0; slot < slots; slot += 1) {
    indexes.push(Math.round((slot * (count - 1)) / (slots - 1)))
  }
  return [...new Set(indexes)]
}

export function RateTrendChart({
  history,
  days,
  onDaysChange,
}: {
  history: MetalRates[]
  days: RateTrendDays
  onDaysChange: (days: RateTrendDays) => void
}) {
  const gradientId = `rates-trend-fill-${useId().replace(/:/g, '')}`
  const points = [...history].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
  const innerW = WIDTH - PAD.left - PAD.right
  const innerH = HEIGHT - PAD.top - PAD.bottom
  const values = points.map((row) => Number(row.gold22k) || 0)
  const yMax = niceCeil(Math.max(...values, 1))
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((part) => part * yMax)
  const labels = labelIndexes(points.length)
  const baseline = PAD.top + innerH
  const coords = points.map((row, index) => ({
    row,
    value: values[index] ?? 0,
    x: xAt(index, points.length, innerW),
    y: yAt(values[index] ?? 0, yMax, innerH),
  }))
  const linePath = coords.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${baseline} L ${coords[0].x.toFixed(1)} ${baseline} Z`
      : ''
  const lastIndex = coords.length - 1
  const labelSet = new Set(labels)

  return (
    <section className="card padded rates-trend-card">
      <div className="rates-trend-head">
        <div className="rates-trend-title">
          <span className="rates-trend-icon" aria-hidden>
            <BarChart3 size={18} strokeWidth={1.75} />
          </span>
          <div>
            <h2 className="rates-section-title">Rate trend</h2>
            <p className="muted rates-trend-subtitle">Historical rates per gram</p>
          </div>
        </div>
        <label className="rates-trend-period">
          <select
            className="input"
            value={days}
            aria-label="Trend period"
            onChange={(event) => onDaysChange(Number(event.target.value) as RateTrendDays)}
          >
            {RATE_TREND_PERIODS.map((option) => (
              <option key={option.days} value={option.days}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {coords.length === 0 ? (
        <p className="muted rates-trend-empty">No rate history in this period</p>
      ) : (
        <svg
          className="rates-trend-svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label="22K gold rate per gram"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7e3af2" stopOpacity="0.22" />
              <stop offset="72%" stopColor="#7e3af2" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#7e3af2" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gradientId})`} />
          {yTicks.map((tick) => {
            const y = yAt(tick, yMax, innerH)
            return (
              <g key={tick}>
                <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y} y2={y} className="rates-trend-grid" />
                <text x={PAD.left - 10} y={y + 4} textAnchor="end" className="rates-trend-axis">
                  {formatAxisAmount(tick)}
                </text>
              </g>
            )
          })}
          {labels.map((index) => {
            const point = coords[index]
            if (!point) return null
            return (
              <line
                key={`grid-${point.row.id}`}
                x1={point.x}
                x2={point.x}
                y1={PAD.top}
                y2={baseline}
                className="rates-trend-grid"
              />
            )
          })}
          <path d={linePath} className="rates-trend-line" />
          {coords.map((point, index) =>
            index === lastIndex || !labelSet.has(index) ? null : (
              <circle key={point.row.id} cx={point.x} cy={point.y} r={4} className="rates-trend-dot" />
            ),
          )}
          {coords[lastIndex] ? (
            <g className="rates-trend-last">
              <circle cx={coords[lastIndex].x} cy={coords[lastIndex].y} r={11} className="rates-trend-last-halo" />
              <circle cx={coords[lastIndex].x} cy={coords[lastIndex].y} r={6.5} className="rates-trend-last-ring" />
              <circle cx={coords[lastIndex].x} cy={coords[lastIndex].y} r={3.25} className="rates-trend-dot" />
            </g>
          ) : null}
          {coords.map((point) => (
            <circle key={`hit-${point.row.id}`} cx={point.x} cy={point.y} r={8} className="rates-trend-hit">
              <title>
                22K {formatDisplayDate(point.row.effectiveDate)} {formatCurrency(point.value)}
              </title>
            </circle>
          ))}
          {labels.map((index) => {
            const point = coords[index]
            if (!point) return null
            const anchor = index === 0 ? 'start' : index === lastIndex ? 'end' : 'middle'
            return (
              <text
                key={point.row.id}
                x={point.x}
                y={HEIGHT - 8}
                textAnchor={anchor}
                className="rates-trend-axis"
              >
                {formatDisplayDayMonth(point.row.effectiveDate)}
              </text>
            )
          })}
        </svg>
      )}
    </section>
  )
}
