import { RouterProvider } from 'react-router-dom'
import { router } from './app/routes'
import { ErrorBoundary } from './components/ErrorBoundary'
import { FatalErrorGate } from './components/FatalErrorGate'
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
              <RouterProvider router={router} />
            </ShopBrandingProvider>
          </AuthProvider>
        </ToastProvider>
      </ErrorBoundary>
    </FatalErrorGate>
  )
}

export default App
