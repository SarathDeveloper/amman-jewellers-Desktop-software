import { isEmbeddedPrintPreview } from '../print/embedMode'

export { isEmbeddedPrintPreview }

export async function waitForDocumentImages(): Promise<void> {
  const images = Array.from(document.images)
  await Promise.all(
    images.map((img) =>
      img.complete
        ? decodeImage(img)
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => void decodeImage(img).then(resolve), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          }),
    ),
  )
}

/**
 * Decoding is separate from loading, and it is the part that costs CPU on a
 * large logo. Waiting for it here means the image is paintable by the time the
 * frame reports itself ready, instead of being decoded during the first paint.
 * Never rejects: a broken image is not worth failing the preview over.
 */
async function decodeImage(img: HTMLImageElement): Promise<void> {
  try {
    await img.decode()
  } catch {
    /* already decoded, or undecodable */
  }
}

const PAGE_HEIGHT_MM = { a4: 297, a5: 210 } as const
const MAX_FIT_ATTEMPTS = 3

function pageHeightPx(paper: keyof typeof PAGE_HEIGHT_MM): number {
  const probe = document.createElement('div')
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  probe.style.pointerEvents = 'none'
  probe.style.height = `${PAGE_HEIGHT_MM[paper]}mm`
  probe.style.width = '0'
  document.body.appendChild(probe)
  const height = probe.getBoundingClientRect().height
  probe.remove()
  return height
}

function setImportant(element: HTMLElement, property: string, value: string): void {
  element.style.setProperty(property, value, 'important')
}

const FIT_SHEET_PROPERTIES = [
  'zoom',
  'transform',
  'transform-origin',
  'width',
  'height',
  'max-height',
  'min-height',
  'overflow',
] as const

/**
 * Shrinks an opted-in bill so a long table still lands on one sheet. Zoom, not
 * transform, changes the layout height WebView2 paginates, so preview and
 * print stay on one page. Widening the sheet by the same factor keeps the
 * table the full page width after the zoom, and the raised min-height keeps
 * the signature row at the foot. Reports omit the attribute and keep paginating.
 */
export function fitPrintSheetToPage(): void {
  const paper = document.documentElement.dataset.paper
  if (paper !== 'a4' && paper !== 'a5') return

  const root = document.querySelector<HTMLElement>('[data-print-root][data-print-fit="page"]')
  if (!root) return
  const sheet = root.firstElementChild
  if (!(sheet instanceof HTMLElement)) return

  const pageHeight = pageHeightPx(paper)
  if (pageHeight <= 0) return

  for (const property of FIT_SHEET_PROPERTIES) {
    sheet.style.removeProperty(property)
  }
  delete root.dataset.printFitted
  delete root.dataset.printFitScale

  let scale = 1
  for (let attempt = 0; attempt < MAX_FIT_ATTEMPTS; attempt += 1) {
    // Zoom changes scrollHeight, so each pass measures the unscaled sheet.
    setImportant(sheet, 'zoom', '1')
    const layoutHeight = sheet.scrollHeight
    if (layoutHeight <= pageHeight + 1) {
      if (scale === 1) {
        sheet.style.removeProperty('zoom')
        return
      }
      break
    }
    const rootWidth = root.clientWidth
    if (rootWidth <= 0) {
      sheet.style.removeProperty('zoom')
      return
    }
    scale = pageHeight / layoutHeight
    setImportant(sheet, 'width', `${rootWidth / scale}px`)
    setImportant(sheet, 'height', 'auto')
    setImportant(sheet, 'max-height', 'none')
    setImportant(sheet, 'min-height', `${pageHeight / scale}px`)
    setImportant(sheet, 'overflow', 'visible')
    setImportant(root, 'height', `${pageHeight}px`)
    setImportant(root, 'max-height', `${pageHeight}px`)
    setImportant(root, 'overflow', 'hidden')
    root.dataset.printFitted = '1'
    root.dataset.printFitScale = String(scale)
  }

  if (scale < 1) {
    setImportant(sheet, 'zoom', String(scale))
    // Zoom rounding can leave the laid-out sheet a few pixels past the page,
    // and that is enough for the printer to open a blank second sheet.
    setImportant(root, 'height', 'auto')
    setImportant(root, 'max-height', 'none')
    setImportant(root, 'overflow', 'visible')
    const laidOut = root.offsetHeight
    if (laidOut > pageHeight) {
      scale *= pageHeight / laidOut
      setImportant(sheet, 'zoom', String(scale))
      root.dataset.printFitScale = String(scale)
    }
    setImportant(root, 'height', `${pageHeight}px`)
    setImportant(root, 'max-height', `${pageHeight}px`)
    setImportant(root, 'overflow', 'hidden')
  } else {
    sheet.style.removeProperty('zoom')
  }
}

export async function waitForPrintLayout(): Promise<void> {
  await waitForDocumentImages()
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve())
    })
  })
  fitPrintSheetToPage()
}

export function triggerBrowserPrint(error: string | null): void {
  const payload = error
    ? { type: 'print-error' as const, message: error }
    : { type: 'print-ready' as const }
  Object.assign(window, { __PRINT_SIGNAL__: payload })
  if (error) {
    if (isEmbeddedPrintPreview()) {
      window.parent?.postMessage({ type: 'print-error', message: error }, window.origin)
    }
    return
  }
  if (isEmbeddedPrintPreview()) {
    window.parent?.postMessage({ type: 'print-ready' }, window.origin)
    return
  }
  window.print()
}

export const signalPrintReady = triggerBrowserPrint
