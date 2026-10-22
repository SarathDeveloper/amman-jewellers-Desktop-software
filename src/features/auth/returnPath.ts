/** A same-app path to reopen after sign-in. Rejects external and login URLs. */
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  if (value === '/login' || value.startsWith('/login/') || value.startsWith('/login?')) return null
  return value
}
