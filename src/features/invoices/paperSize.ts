import type { PaperSize } from '@shared/types'

export function paperClassName(paper: PaperSize | undefined): string {
  if (paper === 'a4') return 'paper-a4'
  if (paper === 'thermal') return 'paper-thermal'
  return 'paper-a5'
}

export function paperPageCss(paper: PaperSize | undefined): string {
  if (paper === 'a4') return '@page { size: A4 portrait; margin: 8mm; }'
  if (paper === 'thermal') return '@page { size: 80mm auto; margin: 2mm; }'
  return '@page { size: A5 portrait; margin: 5mm; }'
}

export function applyPaperDataset(paper: PaperSize | undefined): void {
  document.documentElement.dataset.paper = paper ?? 'a5'
}
