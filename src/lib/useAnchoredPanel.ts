import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

/**
 * Positions a portaled panel under an anchor element.
 *
 * Search dropdowns used to live inside their card, which meant any ancestor with
 * `overflow: hidden` (notably the bill editor items panel) clipped the list. The
 * panel is now rendered into <body> and placed with viewport coordinates, the same
 * approach PaymentModeSelect uses.
 */
export function useAnchoredPanel(
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean,
  { gap = 4, maxHeight = 224 }: { gap?: number; maxHeight?: number } = {},
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({})

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return

    function place() {
      const anchor = anchorRef.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom - gap - 8
      const height = Math.min(maxHeight, Math.max(spaceBelow, 120))
      setStyle({
        position: 'fixed',
        top: rect.bottom + gap,
        left: rect.left,
        right: 'auto',
        width: rect.width,
        maxHeight: height,
      })
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
