import { describe, expect, it } from 'vitest'
import { moduleUrlsFromDocument } from '../../src/print/warmPrint'

/** Minimal stand-in for a parsed document, so this needs no DOM. */
function fakeDocument(scripts: string[], preloads: string[]) {
  return {
    querySelectorAll(selector: string) {
      const values = selector.includes('modulepreload') ? preloads : scripts
      return values.map((value) => ({ getAttribute: () => value }))
    },
  }
}

describe('moduleUrlsFromDocument', () => {
  it('collects the print entry script', () => {
    const urls = moduleUrlsFromDocument(fakeDocument(['/assets/print-abc.js'], []))
    expect(urls).toEqual(['/assets/print-abc.js'])
  })

  it('collects modulepreload links, which carry the shared vendor chunk', () => {
    const urls = moduleUrlsFromDocument(fakeDocument([], ['/assets/vendor-xyz.js']))
    expect(urls).toEqual(['/assets/vendor-xyz.js'])
  })

  it('does not repeat a url that is both a script and a preload', () => {
    const urls = moduleUrlsFromDocument(
      fakeDocument(['/assets/print-abc.js'], ['/assets/vendor-xyz.js', '/assets/print-abc.js']),
    )
    expect(urls).toEqual(['/assets/print-abc.js', '/assets/vendor-xyz.js'])
  })

  it('skips elements without a url', () => {
    const urls = moduleUrlsFromDocument(fakeDocument(['', '/assets/print-abc.js'], ['']))
    expect(urls).toEqual(['/assets/print-abc.js'])
  })

  it('returns nothing when the document references no modules', () => {
    expect(moduleUrlsFromDocument(fakeDocument([], []))).toEqual([])
  })
})
