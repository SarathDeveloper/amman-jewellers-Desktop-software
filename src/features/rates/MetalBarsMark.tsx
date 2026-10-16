import { useId } from 'react'

const PALETTES = {
  gold: {
    top: ['#FDE68A', '#F59E0B'],
    front: ['#FBBF24', '#D97706'],
    end: ['#D97706', '#92400E'],
    edge: '#92400E',
  },
  silver: {
    top: ['#F9FAFB', '#E5E7EB'],
    front: ['#E5E7EB', '#9CA3AF'],
    end: ['#9CA3AF', '#4B5563'],
    edge: '#4B5563',
  },
} as const

type Metal = keyof typeof PALETTES

function ingot(ox: number, oy: number) {
  const length = 48
  const depth = 8
  const height = 11
  const skew = 7
  return {
    top: `M${ox} ${oy} L${ox + length} ${oy - 1} L${ox + length + skew} ${oy - depth} L${ox + skew} ${oy - depth + 1} Z`,
    front: `M${ox} ${oy} L${ox + length} ${oy - 1} L${ox + length} ${oy - 1 + height} L${ox} ${oy + height} Z`,
    end: `M${ox + length} ${oy - 1} L${ox + length + skew} ${oy - depth} L${ox + length + skew} ${oy - depth + height} L${ox + length} ${oy - 1 + height} Z`,
    shine: `M${ox + 4} ${oy + 1} L${ox + length - 6} ${oy} `,
  }
}

export function MetalBarsMark({
  metal,
  size = 'md',
}: {
  metal: Metal
  size?: 'sm' | 'md' | 'lg'
}) {
  const uid = useId().replace(/:/g, '')
  const palette = PALETTES[metal]
  const top = `rb-${uid}-top`
  const front = `rb-${uid}-front`
  const end = `rb-${uid}-end`
  const bars = [ingot(18, 16), ingot(10, 30), ingot(2, 44)]

  return (
    <span className={`rates-bars rates-bars-${size}`} aria-hidden>
      <svg viewBox="0 0 76 58" fill="none" xmlns="http://www.w3.org/2000/svg">
        {bars.map((bar) => (
          <g key={bar.top}>
            <path d={bar.end} fill={`url(#${end})`} stroke={palette.edge} strokeWidth="0.4" />
            <path d={bar.front} fill={`url(#${front})`} stroke={palette.edge} strokeWidth="0.4" />
            <path d={bar.top} fill={`url(#${top})`} stroke={palette.edge} strokeWidth="0.4" />
            <path d={bar.shine} stroke={palette.top[0]} strokeWidth="0.8" strokeLinecap="round" />
          </g>
        ))}
        <defs>
          <linearGradient id={top} x1="8" y1="6" x2="60" y2="20" gradientUnits="userSpaceOnUse">
            <stop stopColor={palette.top[0]} />
            <stop offset="1" stopColor={palette.top[1]} />
          </linearGradient>
          <linearGradient id={front} x1="4" y1="14" x2="4" y2="56" gradientUnits="userSpaceOnUse">
            <stop stopColor={palette.front[0]} />
            <stop offset="1" stopColor={palette.front[1]} />
          </linearGradient>
          <linearGradient id={end} x1="50" y1="8" x2="70" y2="48" gradientUnits="userSpaceOnUse">
            <stop stopColor={palette.end[0]} />
            <stop offset="1" stopColor={palette.end[1]} />
          </linearGradient>
        </defs>
      </svg>
    </span>
  )
}
