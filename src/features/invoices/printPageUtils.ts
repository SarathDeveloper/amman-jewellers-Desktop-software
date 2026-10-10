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

/**
 * Shrinks an opted-in bill so a long table still lands on one sheet. Widening
 * the sheet by the same factor keeps the table the full page width after the
 * scale, and the raised min-height keeps the signature row at the foot.
 * Reports omit the attribute and keep paginating.
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

  let scale = 1
  for (let attempt = 0; attempt < MAX_FIT_ATTEMPTS; attempt += 1) {
    const layoutHeight = sheet.scrollHeight
    if (layoutHeight * scale <= pageHeight + 1) return
    const rootWidth = root.clientWidth
    if (rootWidth <= 0) return
    scale = pageHeight / layoutHeight
    setImportant(sheet, 'width', `${rootWidth / scale}px`)
    setImportant(sheet, 'height', 'auto')
    setImportant(sheet, 'max-height', 'none')
    setImportant(sheet, 'min-height', `${pageHeight / scale}px`)
    setImportant(sheet, 'overflow', 'visible')
    setImportant(sheet, 'transform', `scale(${scale})`)
    setImportant(sheet, 'transform-origin', 'top left')
    setImportant(root, 'height', `${pageHeight}px`)
    setImportant(root, 'max-height', `${pageHeight}px`)
    setImportant(root, 'overflow', 'hidden')
    root.dataset.printFitted = '1'
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
