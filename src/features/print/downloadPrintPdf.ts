import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { withEmbedFlag } from './printPreviewPaths'

const PRINT_READY_TIMEOUT_MS = 20000

function paperPageMm(paper: string | undefined): { width: number; height: number | 'auto'; format?: 'a4' | 'a5' } {
  if (paper === 'a4') return { width: 210, height: 297, format: 'a4' }
  if (paper === 'thermal') return { width: 80, height: 'auto' }
  return { width: 148, height: 210, format: 'a5' }
}

function safePdfFilename(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').trim() || 'document'
  return /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned}.pdf`
}

type PrintSignal = { type?: string; message?: string }

function readPrintSignal(iframe: HTMLIFrameElement): PrintSignal | null {
  try {
    const win = iframe.contentWindow as (Window & { __PRINT_SIGNAL__?: PrintSignal }) | null
    return win?.__PRINT_SIGNAL__ ?? null
  } catch {
    return null
  }
}

function waitForPrintDocument(iframe: HTMLIFrameElement): Promise<Document> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = window.setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('Timed out preparing PDF'))
    }, PRINT_READY_TIMEOUT_MS)

    function finish(doc: Document | null, error?: string) {
      if (settled) return
      settled = true
      cleanup()
      if (error || !doc) {
        reject(new Error(error || 'Failed to load bill'))
        return
      }
      resolve(doc)
    }

    function cleanup() {
      window.clearTimeout(timer)
      window.clearInterval(poll)
      window.removeEventListener('message', onMessage)
    }

    function applySignal(signal: PrintSignal | null) {
      if (!signal || typeof signal !== 'object') return false
      if (signal.type === 'print-error') {
        finish(null, typeof signal.message === 'string' ? signal.message : 'Failed to load bill')
        return true
      }
      if (signal.type === 'print-ready') {
        finish(iframe.contentDocument)
        return true
      }
      return false
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      if (event.source !== iframe.contentWindow) return
      applySignal(event.data as PrintSignal | null)
    }

    const poll = window.setInterval(() => {
      applySignal(readPrintSignal(iframe))
    }, 100)

    window.addEventListener('message', onMessage)
  })
}

async function waitForDocumentImages(doc: Document): Promise<void> {
  await Promise.all(
    Array.from(doc.images).map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          }),
    ),
  )
}

/** Pixels of top margin so `offsetTop` lands on the next PDF page. */
export function pageBreakPaddingPx(offsetTop: number, pageHeightPx: number): number {
  if (pageHeightPx <= 0 || offsetTop <= 0) return 0
  const posInPage = offsetTop % pageHeightPx
  if (posInPage < 1) return 0
  return pageHeightPx - posInPage
}

/**
 * html2canvas ignores CSS page-break, so pad marked blocks to the next A4/A5
 * boundary before capture. Returns a restore function.
 */
function applyHtml2CanvasPageBreaks(
  root: HTMLElement,
  page: { width: number; height: number | 'auto' },
): () => void {
  if (page.height === 'auto') return () => {}
  const captureWidth = Math.max(root.scrollWidth, root.offsetWidth, 1)
  const pageHeightPx = (page.height / page.width) * captureWidth
  const previous: Array<{ el: HTMLElement; marginTop: string }> = []
  const breaks = Array.from(root.querySelectorAll<HTMLElement>('[data-print-break-before="page"]'))
  for (const el of breaks) {
    previous.push({ el, marginTop: el.style.marginTop })
    el.style.marginTop = '0px'
    const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top
    const pad = pageBreakPaddingPx(top, pageHeightPx)
    el.style.marginTop = pad > 0 ? `${pad}px` : ''
  }
  return () => {
    for (const item of previous) {
      item.el.style.marginTop = item.marginTop
    }
  }
}

function saveCanvasAsPdf(
  canvas: HTMLCanvasElement,
  page: { width: number; height: number | 'auto'; format?: 'a4' | 'a5' },
): jsPDF {
  const image = canvas.toDataURL('image/png')
  const width = page.width
  const contentHeight = (canvas.height / Math.max(canvas.width, 1)) * width

  if (page.height === 'auto') {
    const height = Math.max(contentHeight, 1)
    const pdf = new jsPDF({
      orientation: height >= width ? 'p' : 'l',
      unit: 'mm',
      format: [width, height],
      compress: true,
    })
    pdf.addImage(image, 'PNG', 0, 0, width, height, undefined, 'FAST')
    return pdf
  }

  const pageHeight = page.height
  const pdf = new jsPDF({
    orientation: pageHeight >= width ? 'p' : 'l',
    unit: 'mm',
    format: page.format ?? [width, pageHeight],
    compress: true,
  })

  if (contentHeight <= pageHeight + 1) {
    pdf.addImage(image, 'PNG', 0, 0, width, contentHeight, undefined, 'FAST')
    return pdf
  }

  let remaining = contentHeight
  let offset = 0
  let first = true
  while (remaining > 0.5) {
    if (!first) pdf.addPage()
    first = false
    pdf.addImage(image, 'PNG', 0, -offset, width, contentHeight, undefined, 'FAST')
    offset += pageHeight
    remaining -= pageHeight
  }
  return pdf
}

async function savePdfFile(pdf: jsPDF, filename: string): Promise<DesktopExportResult> {
  const name = safePdfFilename(filename)
  const savePdf = window.desktopAPI?.savePdf
  if (savePdf) {
    const bytes = new Uint8Array(pdf.output('arraybuffer'))
    return savePdf(bytes, name)
  }
  pdf.save(name)
  return { canceled: false }
}

export async function downloadPrintDocument(doc: Document, filename: string): Promise<DesktopExportResult> {
  const root = (doc.querySelector('[data-print-root]') as HTMLElement | null) ?? doc.body
  if (!root) {
    throw new Error('Print template is not ready')
  }
  await waitForDocumentImages(doc)

  const page = paperPageMm(doc.documentElement.dataset.paper)
  const restoreBreaks = applyHtml2CanvasPageBreaks(root, page)
  try {
    const fitted = root.dataset.printFitted === '1'
    const captureWidth = fitted
      ? Math.max(root.offsetWidth, 1)
      : Math.max(root.scrollWidth, root.offsetWidth, 1)
    const captureHeight = fitted
      ? Math.max(root.offsetHeight, 1)
      : Math.max(root.scrollHeight, root.offsetHeight, 1)
    const canvas = await html2canvas(root, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      width: captureWidth,
      height: captureHeight,
      windowWidth: captureWidth,
      windowHeight: captureHeight,
    })
    const pdf = saveCanvasAsPdf(canvas, page)
    return savePdfFile(pdf, filename)
  } finally {
    restoreBreaks()
  }
}

export async function downloadPrintPdf(path: string, filename: string): Promise<DesktopExportResult> {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.title = 'PDF export'
  iframe.style.cssText =
    'position:fixed;left:-12000px;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none;'

  const ready = waitForPrintDocument(iframe)
  document.body.appendChild(iframe)
  iframe.src = withEmbedFlag(path)

  try {
    const doc = await ready
    return await downloadPrintDocument(doc, filename)
  } finally {
    iframe.remove()
  }
}
