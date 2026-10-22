import { expect, test } from './fixtures/web-app'
import { localTodayIso } from './helpers/dates'

function pdfPages(pdf: Buffer): number {
  return pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g)?.length ?? 0
}

test('a bill with many items prints on one page', async ({ window }) => {
  const origin = new URL(window.url()).origin
  const count = 30
  const invoiceId = await window.evaluate(
    async ({ date, count }) => {
      async function api<T>(path: string, init?: RequestInit): Promise<T> {
        const response = await fetch(path, {
          ...init,
          headers: { 'Content-Type': 'application/json', ...init?.headers },
        })
        if (!response.ok) throw new Error(await response.text())
        return (await response.json()) as T
      }
      const customer = await api<{ id: number }>('/api/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Many Items',
          phone: '9000001111',
          address: '12 Long Address Road, Salem, Tamil Nadu',
          notes: '',
        }),
      })
      const product = await api<{ id: number }>('/api/products', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Antique gold chain with stone work',
          category: 'Chain',
          metal: 'Gold',
          purity: '22K',
          grossWeight: 10,
          netWeight: 2.5,
          makingCharges: 0,
          stockQty: count,
          imagePath: '',
          huids: [],
        }),
      })
      const invoice = await api<{ id: number }>('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          customerId: customer.id,
          invoiceDate: date,
          tax: 0,
          autoTax: false,
          paymentMode: 'upi',
          items: Array.from({ length: count }, () => ({
            productId: product.id,
            qty: 1,
            rate: 1000,
            metalRate: 1000,
            netWeight: 2.5,
          })),
        }),
      })
      const finalized = await api<{ id: number }>(`/api/invoices/${invoice.id}/finalize`, {
        method: 'POST',
      })
      return finalized.id
    },
    { date: localTodayIso(), count },
  )

  for (const kind of ['cash-bill', 'tax-invoice'] as const) {
    await window.goto(`${origin}/print/${kind}/${invoiceId}`)
    await window.waitForFunction(
      () =>
        (window as unknown as { __PRINT_SIGNAL__?: { type?: string } }).__PRINT_SIGNAL__?.type ===
        'print-ready',
      null,
      { timeout: 15_000 },
    )
    await window.emulateMedia({ media: 'print' })
    const fit = await window.evaluate(() => {
      const root = document.querySelector('[data-print-root]') as HTMLElement
      const foot = root.querySelector('.cash-bill-signatures, .tax-invoice-signatures') as HTMLElement
      const lastRow = root.querySelector('tbody tr:last-child') as HTMLElement
      const rootBox = root.getBoundingClientRect()
      return {
        rows: root.querySelectorAll('tbody tr').length,
        footClipped: foot.getBoundingClientRect().bottom > rootBox.bottom + 1,
        rowClipped: lastRow.getBoundingClientRect().bottom > rootBox.bottom + 1,
      }
    })
    expect(fit.rows).toBe(count)
    expect(fit.rowClipped).toBe(false)
    expect(fit.footClipped).toBe(false)
    await window.emulateMedia({ media: 'screen' })

    const cssPages = pdfPages(await window.pdf({ preferCSSPageSize: true, printBackground: true }))
    const marginedPages = pdfPages(
      await window.pdf({
        preferCSSPageSize: false,
        format: 'A5',
        printBackground: true,
        margin: { top: '8mm', bottom: '8mm', left: '8mm', right: '8mm' },
      }),
    )
    expect(cssPages).toBe(1)
    expect(marginedPages).toBe(1)
  }
})
