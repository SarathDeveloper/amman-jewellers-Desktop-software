import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

type PanelBox = { top: number; bottom: number; left: number; width: number }

/**
 * Positions a portaled panel under an anchor element.
 *
 * Search dropdowns used to live inside their card, which meant any ancestor with
 * `overflow: hidden` (notably the bill editor items panel) clipped the list. The
 * panel is now rendered into <body> and placed with viewport coordinates, the same
 * approach PaymentModeSelect uses. When the field sits near the bottom of the
 * window, the list opens upward so the options stay clickable.
 */
export function anchoredPanelStyle(
  rect: PanelBox,
  viewportHeight: number,
  { gap = 4, maxHeight = 224 }: { gap?: number; maxHeight?: number } = {},
): CSSProperties {
  const margin = 8
  const spaceBelow = Math.max(0, viewportHeight - rect.bottom - gap - margin)
  const spaceAbove = Math.max(0, rect.top - gap - margin)
  const preferred = Math.min(maxHeight, 160)
  const openUp = spaceBelow < preferred && spaceAbove > spaceBelow
  const height = Math.min(maxHeight, openUp ? spaceAbove : spaceBelow)
  const top = openUp ? Math.max(margin, rect.top - gap - height) : rect.bottom + gap
  return {
    position: 'fixed',
    top,
    left: rect.left,
    right: 'auto',
    width: rect.width,
    maxHeight: height,
  }
}

export function useAnchoredPanel(
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean,
  options: { gap?: number; maxHeight?: number } = {},
): CSSProperties {
  const { gap = 4, maxHeight = 224 } = options
  const [style, setStyle] = useState<CSSProperties>({})

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return

    function place() {
      const anchor = anchorRef.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      setStyle(anchoredPanelStyle(rect, window.innerHeight, { gap, maxHeight }))
    }

    place()
    // The anchor scrolls with its container, so follow it while the panel is open.
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchorRef, gap, maxHeight])

  return style
}
