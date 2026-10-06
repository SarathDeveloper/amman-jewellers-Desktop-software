import { useCallback, useEffect, useRef, useState } from 'react'
import { FileDown, Printer } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { withEmbedFlag } from './printPreviewPaths'

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
  const [frameHeight, setFrameHeight] = useState(480)
  const [scale, setScale] = useState(1)

  const sizeFrame = useCallback(() => {
    try {
      const doc = frameRef.current?.contentDocument
      const sheet = sheetRef.current
      if (!doc || !sheet) return
      const height = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0, 320)
      const width = Math.max(doc.documentElement.scrollWidth, doc.body?.scrollWidth ?? 0, 1)
      setFrameHeight(height)
      const available = sheet.clientWidth
      setScale(available > 0 && width > available ? available / width : 1)
    } catch {
      // iframe document may be unavailable while the preview document is still loading
    }
  }, [])

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
        window.requestAnimationFrame(sizeFrame)
        window.setTimeout(sizeFrame, 50)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [sizeFrame])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const wrap = frameWrapRef.current
    if (!wrap || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => sizeFrame())
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [sizeFrame])

  useEffect(() => {
    window.addEventListener('resize', sizeFrame)
    return () => window.removeEventListener('resize', sizeFrame)
  }, [sizeFrame])

  function printFrame() {
    frameRef.current?.contentWindow?.print()
    onPrint?.()
  }

  async function downloadPdf() {
    const savePdf = window.desktopAPI?.savePdf
    if (typeof savePdf !== 'function') {
      printFrame()
      return
    }
    try {
      setSavingPdf(true)
      setError(null)
      const result = await savePdf(path, pdfFilename)
      if (result.canceled) return
      onPrint?.()
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Failed to save PDF'
      setError(raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/u, ''))
    } finally {
      setSavingPdf(false)
    }
  }

  const actionsDisabled = !ready || savingPdf

  return (
    <Modal
      title={title}
      className="modal-print"
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
          style={{ height: frameHeight * scale }}
        >
          <iframe
            ref={frameRef}
            title={title}
            src={withEmbedFlag(path)}
            onLoad={sizeFrame}
            style={{
              height: frameHeight,
              width: scale < 1 ? `${100 / scale}%` : '100%',
              transform: scale < 1 ? `scale(${scale})` : undefined,
              transformOrigin: 'top left',
            }}
          />
        </div>
      </div>
    </Modal>
  )
}
