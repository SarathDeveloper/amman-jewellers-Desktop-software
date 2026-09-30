import type { ReactNode } from 'react'

export function FormField({
  label,
  children,
  className,
  error,
}: {
  label: string
  children: ReactNode
  className?: string
  error?: string
}) {
  return (
    <label className={className}>
      {label}
      {children}
      {error ? <span className="muted">{error}</span> : null}
    </label>
  )
}
