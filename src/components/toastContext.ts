import { createContext, useContext } from 'react'

export type ToastKind = 'info' | 'success' | 'error'

export interface ToastContextValue {
  showToast: (message: string, kind?: ToastKind) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    return {
      showToast: () => undefined,
    }
  }
  return context
}
