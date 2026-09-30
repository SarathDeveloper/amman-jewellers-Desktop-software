import { ChartNoAxesCombined } from 'lucide-react'
import type { MetalRates } from '@shared/types'
import { formatCurrency, formatDisplayDate } from '../../lib/format'

const RATE_TREND_PERIODS = [
  { days: 30, label: '1 Month' },
  { days: 90, label: '3 Months' },
  { days: 180, label: '6 Months' },
  { days: 365, label: '1 Year' },
] as const

export type RateTrendDays = (typeof RATE_TREND_PERIODS)[number]['days']

const WIDTH = 720
const HEIGHT = 240
const PAD = { top: 16, right: 16, bottom: 36, left: 52 }

const GOLD_SERIES: { key: keyof MetalRates; label: string }[] = [
  { key: 'gold24k', label: 'Gold 24K' },
  { key: 'gold22k', label: 'Gold 22K' },
  { key: 'gold20k', label: 'Gold 20K' },
  { key: 'gold18k', label: 'Gold 18K' },
]

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

function formatChartDate(isoDate: string): string {
  const formatted = formatDisplayDate(isoDate)
  const parts = formatted.split(' ')
  return parts.length >= 2 ? `${parts[0]} ${parts[1]}` : formatted
}

function xAt(index: number, count: number, innerW: number): number {
  if (count <= 1) return PAD.left + innerW / 2
  return PAD.left + (index / (count - 1)) * innerW
}

function yAt(value: number, yMax: number, innerH: number): number {
  return PAD.top + innerH - (value / yMax) * innerH
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
  const points = [...history].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
  const innerW = WIDTH - PAD.left - PAD.right
  const innerH = HEIGHT - PAD.top - PAD.bottom
  const yMax = niceCeil(Math.max(...points.map((row) => row.gold24k), 1))
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((part) => part * yMax)
  const xLabelIndexes =
    points.length <= 4
      ? points.map((_, index) => index)
      : [0, Math.floor((points.length - 1) / 2), points.length - 1]
  const lastX = points.length > 0 ? xAt(points.length - 1, points.length, innerW) : PAD.left

  return (
    <section className="card padded rates-trend-card">
      <div className="rates-trend-head">
        <div className="rates-trend-title">
          <span className="rates-trend-icon" aria-hidden>
            <ChartNoAxesCombined size={16} strokeWidth={1.75} />
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
      {points.length === 0 ? (
        <p className="muted rates-trend-empty">No rate history in this period</p>
      ) : (
        <svg
          className="rates-trend-svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label="Gold karat and silver rates per gram"
        >
          {yTicks.map((tick) => {
            const y = yAt(tick, yMax, innerH)
            return (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={WIDTH - PAD.right}
                  y1={y}
                  y2={y}
                  className="rates-trend-grid"
                />
                <text x={PAD.left - 8} y={y + 4} textAnchor="end" className="rates-trend-axis">
                  {formatAxisAmount(tick)}
                </text>
              </g>
            )
          })}
          <line
            x1={lastX}
            x2={lastX}
            y1={PAD.top}
            y2={PAD.top + innerH}
            className="rates-trend-cursor"
          />
          {points.map((row, index) => {
            const x = xAt(index, points.length, innerW)
            return (
              <g key={row.id}>
                {GOLD_SERIES.map((series) => {
                  const value = Number(row[series.key] ?? 0)
                  return (
                    <circle
                      key={series.key}
                      cx={x}
                      cy={yAt(value, yMax, innerH)}
                      r={4.5}
                      className="rates-trend-dot rates-trend-dot-gold"
                    >
                      <title>
                        {series.label} {formatDisplayDate(row.effectiveDate)} {formatCurrency(value)}
                      </title>
                    </circle>
                  )
                })}
                <circle
                  cx={x}
                  cy={yAt(row.silverFine, yMax, innerH)}
                  r={3.5}
                  className="rates-trend-dot rates-trend-dot-silver"
                >
                  <title>
                    Silver 999 {formatDisplayDate(row.effectiveDate)} {formatCurrency(row.silverFine)}
                  </title>
                </circle>
              </g>
            )
          })}
          {xLabelIndexes.map((index) => (
            <text
              key={points[index].id}
              x={xAt(index, points.length, innerW)}
              y={HEIGHT - 10}
              textAnchor="middle"
              className="rates-trend-axis"
            >
              {formatChartDate(points[index].effectiveDate)}
            </text>
          ))}
        </svg>
      )}
    </section>
  )
}
