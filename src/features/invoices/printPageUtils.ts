import { isEmbeddedPrintPreview } from '../print/embedMode'

export { isEmbeddedPrintPreview }

export async function waitForDocumentImages(): Promise<void> {
  const images = Array.from(document.images)
  await Promise.all(
    images.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          }),
    ),
  )
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
