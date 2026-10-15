import { describe, expect, it } from 'vitest'
import { anchoredPanelStyle } from '../../src/lib/useAnchoredPanel'

const anchor = { top: 600, bottom: 640, left: 80, width: 320 }

describe('anchoredPanelStyle', () => {
  it('opens under the field when there is room below', () => {
    const style = anchoredPanelStyle(anchor, 900)
    expect(style.top).toBe(644)
    expect(style.maxHeight).toBe(224)
    expect(style.left).toBe(80)
    expect(style.width).toBe(320)
  })

  it('opens above the field when the list would leave the window', () => {
    const style = anchoredPanelStyle(anchor, 720)
    expect(style.top).toBe(600 - 4 - 224)
    expect(style.maxHeight).toBe(224)
    expect(Number(style.top) + Number(style.maxHeight)).toBeLessThanOrEqual(anchor.top)
  })
})
