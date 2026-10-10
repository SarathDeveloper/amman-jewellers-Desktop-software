import { useCallback, useEffect, useRef, useState } from 'react'
import { FileDown, Printer } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { downloadPrintDocument } from './downloadPrintPdf'
import { withEmbedFlag } from './printPreviewPaths'

interface FrameSize {
  width: number
  height: number
  scale: number
}

const INITIAL_SIZE: FrameSize = { width: 0, height: 480, scale: 1 }

export function PrintPreviewModal({
  title,
  path,
  onClose,
  onPrint,
  printLabel = 'Print',
  pdfFilename = 'document.pdf',
}: {
  title: string
  path: string
  onClose: () => void
  onPrint?: () => void
  printLabel?: string
  pdfFilename?: string
}) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const frameWrapRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingPdf, setSavingPdf] = useState(false)
  const [size, setSize] = useState<FrameSize>(INITIAL_SIZE)

  // Measuring reads layout and writes state, so it is kept to one pass per frame
  // and skipped entirely when nothing changed. Without both guards this modal
  // measured four times per open and re-measured itself on every resize.
  const rafRef = useRef<number | null>(null)
  const measuredRef = useRef<FrameSize>(INITIAL_SIZE)

  const measure = useCallback(() => {
    try {
      const doc = frameRef.current?.contentDocument
      const sheet = sheetRef.current
      if (!doc || !sheet) return
      const height = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0, 320)
      const width = Math.max(doc.documentElement.scrollWidth, doc.body?.scrollWidth ?? 0, 1)
      const available = sheet.clientWidth
      const scale = available > 0 && width > available ? available / width : 1
      const previous = measuredRef.current
      if (previous.width === width && previous.height === height && previous.scale === scale) {
        return
      }
      measuredRef.current = { width, height, scale }
      setSize({ width, height, scale })
    } catch {
      // iframe document may be unavailable while the preview document is still loading
    }
  }, [])

  const scheduleSize = useCallback(() => {
    if (rafRef.current !== null) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null
      measure()
    })
  }, [measure])

  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      if (event.source !== frameRef.current?.contentWindow) return
      const data = event.data as { type?: string; message?: string } | null
      if (!data || typeof data !== 'object') return
      if (data.type === 'print-error') {
        setError(typeof data.message === 'string' ? data.message : 'Failed to load preview')
        setReady(false)
        return
      }
      if (data.type === 'print-ready') {
        setError(null)
        setReady(true)
        // The document has finished loading its images, so this is the one
        // measurement that matters.
        scheduleSize()
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [scheduleSize])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Only a change in available width needs a re-measure. The sheet height is
  // derived from this state, so reacting to height would loop.
  useEffect(() => {
    const wrap = frameWrapRef.current
    if (!wrap || typeof ResizeObserver === 'undefined') return
    let lastWidth = wrap.clientWidth
    const observer = new ResizeObserver(() => {
      if (wrap.clientWidth === lastWidth) return
      lastWidth = wrap.clientWidth
      scheduleSize()
    })
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [scheduleSize])

  useEffect(() => {
    let lastWidth = frameWrapRef.current?.clientWidth ?? 0
    function onResize() {
      const width = frameWrapRef.current?.clientWidth ?? 0
      if (width === lastWidth) return
      lastWidth = width
      scheduleSize()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [scheduleSize])

  function printFrame() {
    // WKWebView does not reliably print an embedded iframe, so on macOS the
    // document is opened in its own window and printed through the webview.
    if (window.desktopAPI?.isMac) {
      window.desktopAPI
        .openPrintWindow(path)
        .catch(() => setError('Could not open the print window'))
      onPrint?.()
      return
    }
    frameRef.current?.contentWindow?.print()
    onPrint?.()
  }

  async function downloadPdf() {
    const doc = frameRef.current?.contentDocument
    if (!doc) {
      setError('Print template is not ready')
      return
    }
    try {
      setSavingPdf(true)
      setError(null)
      await downloadPrintDocument(doc, pdfFilename)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : typeof err === 'string' && err ? err : 'Failed to save PDF',
      )
    } finally {
      setSavingPdf(false)
    }
  }

  const actionsDisabled = !ready || savingPdf

  return (
    <Modal
      title={title}
      className="modal-print"
      noBodyWrapper
      onClose={onClose}
      footer={
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn secondary" disabled={actionsDisabled} onClick={printFrame}>
            <Printer size={16} strokeWidth={1.75} aria-hidden />
            {printLabel}
          </button>
          <button type="button" className="btn" disabled={actionsDisabled} onClick={() => void downloadPdf()}>
            <FileDown size={16} strokeWidth={1.75} aria-hidden />
            {savingPdf ? 'Saving…' : 'PDF'}
          </button>
        </div>
      }
    >
      {error ? <div className="error-banner">{error}</div> : null}
      {!error && !ready ? <p className="muted">Loading preview…</p> : null}
      <div className="print-preview-frame" ref={frameWrapRef}>
        <div
          className="print-preview-sheet"
          ref={sheetRef}
          style={{ height: size.height * size.scale }}
        >
          <iframe
            ref={frameRef}
            title={title}
            src={withEmbedFlag(path)}
            onLoad={() => {
              // The ready message is the signal to measure. Loading alone is too
              // early, because images and fonts are still arriving.
              if (ready) scheduleSize()
            }}
            style={{
              height: size.height,
              // Laid out at its own paper width and scaled down, rather than
              // laid out wider than the modal and scaled. The browser then only
              // rasterizes what is on screen.
              width: size.width > 0 ? size.width : '100%',
              transform: size.scale < 1 ? `scale(${size.scale})` : undefined,
              transformOrigin: 'top left',
            }}
          />
        </div>
      </div>
    </Modal>
  )
}
