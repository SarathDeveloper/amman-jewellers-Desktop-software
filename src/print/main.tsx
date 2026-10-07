import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { applyPrintEmbedDataset } from '../features/print/embedMode'
import '../index.css'
import '../responsive.css'
import { printRouter } from './printRoutes'

/**
 * Entry for `print.html`, the document print preview and PDF export load.
 *
 * It deliberately skips the application shell: no auth provider, no shop
 * branding provider, no fatal-error gate. The frame only needs the template, so
 * it must not pull in the main bundle.
 *
 * `responsive.css` is loaded to keep the templates pixel-identical to the main
 * app's render of the same route.
 */
applyPrintEmbedDataset()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Suspense fallback={<div id="boot-fallback">Preparing document…</div>}>
        <RouterProvider router={printRouter} />
      </Suspense>
    </ErrorBoundary>
  </StrictMode>,
)
