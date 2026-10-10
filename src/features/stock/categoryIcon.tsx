export function formatStockNumber(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  }).format(value)
}

export function getCategoryIconClass(name: string): string {
  const norm = name.toLowerCase().trim()
  const colorMap: Record<string, string> = {
    chain: 'stock-category-icon-chain',
    necklace: 'stock-category-icon-necklace',
    haram: 'stock-category-icon-haram',
    bangle: 'stock-category-icon-bangle',
    ring: 'stock-category-icon-ring',
    stud: 'stock-category-icon-stud',
    mattal: 'stock-category-icon-mattal',
  }
  return colorMap[norm] ?? ''
}

export function CategoryIcon({ name }: { name: string }) {
  const norm = name.toLowerCase().trim()
  const svgProps = {
    viewBox: '0 0 24 24',
    width: '20',
    height: '20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  if (norm === 'chain') {
    return (
      <svg {...svgProps}>
        <path d="M9.5 14.5a3.5 3.5 0 1 1 0-7h2.2" />
        <path d="M14.5 9.5a3.5 3.5 0 1 1 0 7h-2.2" />
      </svg>
    )
  }
  if (norm === 'necklace') {
    return (
      <svg {...svgProps}>
        <path d="M5 6.5c.5 8 4.2 12.2 7 14 2.8-1.8 6.5-6 7-14" />
        <circle cx="12" cy="20.2" r="1.7" fill="currentColor" stroke="none" />
      </svg>
    )
  }
  if (norm === 'haram') {
    return (
      <svg {...svgProps}>
        <path d="M4 5.5c.4 10 4.6 14.5 8 16 3.4-1.5 7.6-6 8-16" />
        <path d="M7 8c.4 7.2 3 10.6 5 11.8 2-1.2 4.6-4.6 5-11.8" />
      </svg>
    )
  }
  if (norm === 'bangle') {
    return (
      <svg {...svgProps}>
        <ellipse cx="12" cy="12" rx="8.5" ry="5.2" />
        <ellipse cx="12" cy="12" rx="5.6" ry="2.8" />
      </svg>
    )
  }
  if (norm === 'ring') {
    return (
      <svg {...svgProps}>
        <circle cx="12" cy="14.5" r="5.2" />
        <path d="M10 9.4 12 4.8 14 9.4Z" fill="currentColor" />
      </svg>
    )
  }
  if (norm === 'stud') {
    return (
      <svg {...svgProps}>
        <circle cx="8" cy="13" r="2.4" fill="currentColor" stroke="none" />
        <circle cx="16" cy="13" r="2.4" fill="currentColor" stroke="none" />
        <path d="M8 10.4V7.2M16 10.4V7.2" />
      </svg>
    )
  }
  if (norm === 'mattal') {
    return (
      <svg {...svgProps}>
        <path d="M8 5.5v11.5" />
        <path d="M16 5.5v11.5" />
        <path d="M8 17c0 2.4 8 2.4 8 0" />
        <circle cx="12" cy="19.6" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    )
  }

  return (
    <svg {...svgProps}>
      <polygon points="12 3 14.9 8.8 21.3 9.7 16.6 14.1 17.7 20.5 12 17.6 6.3 20.5 7.4 14.1 2.7 9.7 9.1 8.8 12 3" />
    </svg>
  )
}
