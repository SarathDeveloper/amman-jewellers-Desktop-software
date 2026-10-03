import { RouterProvider } from 'react-router-dom'
import { Suspense } from 'react'
import { router } from './app/routes'
import { ErrorBoundary } from './components/ErrorBoundary'
import { FatalErrorGate } from './components/FatalErrorGate'
import { LoadingState } from './components/LoadingState'
import { ToastProvider } from './components/Toast'
import { AuthProvider } from './features/auth/authContext'
import { ShopBrandingProvider } from './features/settings/shopBrandingContext'

function App() {
  return (
    <FatalErrorGate>
      <ErrorBoundary>
        <ToastProvider>
          <AuthProvider>
            <ShopBrandingProvider>
              <ErrorBoundary>
                <Suspense fallback={<LoadingState />}>
                  <RouterProvider router={router} />
                </Suspense>
              </ErrorBoundary>
            </ShopBrandingProvider>
          </AuthProvider>
        </ToastProvider>
      </ErrorBoundary>
    </FatalErrorGate>
  )
}

export default App
