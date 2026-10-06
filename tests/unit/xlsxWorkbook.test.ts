import { describe, expect, it } from 'vitest'
import { buildXlsxBuffer, colLetter, escapeXml, uniqueSheetName } from '../../server/lib/xlsxWorkbook'

describe('xlsx workbook', () => {
  it('escapes xml and names sheets uniquely', () => {
    expect(escapeXml('a < b & "c"')).toBe('a &lt; b &amp; &quot;c&quot;')
    expect(colLetter(1)).toBe('A')
    expect(colLetter(27)).toBe('AA')
    const used = new Set<string>()
    expect(uniqueSheetName('products', used)).toBe('products')
    expect(uniqueSheetName('products', used)).toBe('products_1')
    expect(uniqueSheetName('gold_saving_installments', used).length).toBeLessThanOrEqual(31)
  })

  it('writes a zip workbook with one sheet per table', () => {
    const bytes = buildXlsxBuffer([
      { name: '_tables', columns: ['table', 'rows'], rows: [['products', 1]] },
      { name: 'products', columns: ['id', 'name'], rows: [[1, 'Test chain']] },
    ])
    const text = bytes.toString('utf8')
    expect(bytes.subarray(0, 2).toString()).toBe('PK')
    expect(text).toContain('Test chain')
    expect(text).toContain('_tables')
    expect(text).toContain('products')
  })
})
