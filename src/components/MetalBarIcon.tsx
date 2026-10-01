import { useId } from 'react'

const PALETTES = {
  gold: {
    top: ['#FDE68A', '#F59E0B'],
    left: ['#D97706', '#92400E'],
    right: ['#F59E0B', '#B45309'],
  },
  silver: {
    top: ['#F3F4F6', '#D1D5DB'],
    left: ['#9CA3AF', '#4B5563'],
    right: ['#D1D5DB', '#6B7280'],
  },
} as const

export function MetalBarIcon({ metal }: { metal: 'gold' | 'silver' }) {
  const uid = useId().replace(/:/g, '')
  const palette = PALETTES[metal]
  const top = `mb-${uid}-top`
  const left = `mb-${uid}-left`
  const right = `mb-${uid}-right`

  return (
    <span className="stock-metal-hero-icon" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 4L19 7.5L12 11L5 7.5L12 4Z" fill={`url(#${top})`} />
        <path d="M5 7.5V13.5L12 17V11L5 7.5Z" fill={`url(#${left})`} />
        <path d="M19 7.5V13.5L12 17V11L19 7.5Z" fill={`url(#${right})`} />
        <path d="M6 10L13 13.5L6 17L-1 13.5L6 10Z" fill={`url(#${top})`} />
        <path d="M-1 13.5V19.5L6 23V17L-1 13.5Z" fill={`url(#${left})`} />
        <path d="M13 13.5V19.5L6 23V17L13 13.5Z" fill={`url(#${right})`} />
        <path d="M18 10L25 13.5L18 17L11 13.5L18 10Z" fill={`url(#${top})`} />
        <path d="M11 13.5V19.5L18 23V17L11 13.5Z" fill={`url(#${left})`} />
        <path d="M25 13.5V19.5L18 23V17L25 13.5Z" fill={`url(#${right})`} />
        <defs>
          <linearGradient id={top} x1="12" y1="4" x2="12" y2="11" gradientUnits="userSpaceOnUse">
            <stop stopColor={palette.top[0]} />
            <stop offset="1" stopColor={palette.top[1]} />
          </linearGradient>
          <linearGradient id={left} x1="8.5" y1="7.5" x2="8.5" y2="17" gradientUnits="userSpaceOnUse">
            <stop stopColor={palette.left[0]} />
            <stop offset="1" stopColor={palette.left[1]} />
          </linearGradient>
          <linearGradient id={right} x1="15.5" y1="7.5" x2="15.5" y2="17" gradientUnits="userSpaceOnUse">
            <stop stopColor={palette.right[0]} />
            <stop offset="1" stopColor={palette.right[1]} />
          </linearGradient>
        </defs>
      </svg>
    </span>
  )
}
