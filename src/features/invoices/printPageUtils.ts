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

export async function waitForPrintLayout(): Promise<void> {
  await waitForDocumentImages()
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve())
    })
  })
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
