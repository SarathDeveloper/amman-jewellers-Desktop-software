import { describe, expect, it } from 'vitest'
import { fitWithin, MAX_IMAGE_EDGE } from '../../src/lib/downscaleImage'

describe('fitWithin', () => {
  it('leaves an image that is already small enough untouched', () => {
    expect(fitWithin(400, 300, 1200)).toEqual({ width: 400, height: 300 })
    expect(fitWithin(1200, 1200, 1200)).toEqual({ width: 1200, height: 1200 })
  })

  it('never enlarges an image when the limit is larger than it is', () => {
    expect(fitWithin(100, 50, 1200)).toEqual({ width: 100, height: 50 })
  })

  it('scales the longest side down to the limit and keeps the aspect ratio', () => {
    expect(fitWithin(2400, 1200, 1200)).toEqual({ width: 1200, height: 600 })
    expect(fitWithin(1200, 2400, 1200)).toEqual({ width: 600, height: 1200 })
  })

  it('scales a camera-sized photo down to a sane print size', () => {
    expect(fitWithin(4032, 3024, 1200)).toEqual({ width: 1200, height: 900 })
  })

  it('never returns a zero dimension', () => {
    expect(fitWithin(10_000, 1, 1200)).toEqual({ width: 1200, height: 1 })
    expect(fitWithin(0, 0, 1200)).toEqual({ width: 1, height: 1 })
  })

  it('exposes the default limit used for uploaded shop images', () => {
    expect(MAX_IMAGE_EDGE).toBe(1200)
  })
})
