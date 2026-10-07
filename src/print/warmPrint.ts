/**
 * Warms the print preview's own module graph in the background.
 *
 * `print.html` is a separate Vite entry, so its scripts are not part of the
 * main application's graph and the browser would only discover them when the
 * preview iframe is created. Fetching the document at idle and preloading the
 * modules it references means the first preview is served from cache.
 */
let warmed = false

/** The minimum a node needs to expose for URL extraction. */
interface AttributeCarrier {
  getAttribute(name: string): string | null
}

/**
 * Anything with `querySelectorAll`, so a real `Document` works and the
 * extraction can be tested without a DOM.
 */
interface Queryable {
  querySelectorAll(selector: string): ArrayLike<AttributeCarrier>
}

/**
 * The module URLs a parsed document references, as paths. Exported so the
 * extraction can be tested without the network.
 */
export function moduleUrlsFromDocument(doc: Queryable): string[] {
  const urls = new Set<string>()
  for (const script of Array.from(doc.querySelectorAll('script[src]'))) {
    const src = script.getAttribute('src')
    if (src) {
      urls.add(src)
    }
  }
  for (const link of Array.from(doc.querySelectorAll('link[rel="modulepreload"][href]'))) {
    const href = link.getAttribute('href')
    if (href) {
      urls.add(href)
    }
  }
  return Array.from(urls)
}

export function warmPrintPreview(): void {
  if (warmed || typeof document === 'undefined') {
    return
  }
  warmed = true
  // In dev the print document pulls modules through the dev server one by one,
  // so there is nothing useful to preload.
  if (!import.meta.env.PROD) {
    return
  }

  void (async () => {
    try {
      const response = await fetch('/print.html', { credentials: 'same-origin' })
      if (!response.ok) {
        return
      }
      const html = await response.text()
      const doc = new DOMParser().parseFromString(html, 'text/html')
      for (const url of moduleUrlsFromDocument(doc)) {
        if (document.querySelector(`link[rel="modulepreload"][href="${url}"]`)) {
          continue
        }
        const link = document.createElement('link')
        link.rel = 'modulepreload'
        link.href = url
        document.head.appendChild(link)
      }
    } catch {
      // Best effort only; a cold preview still works.
    }
  })()
}
