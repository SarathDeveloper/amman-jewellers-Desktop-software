/**
 * macOS renders the same markup with different fonts, form controls and
 * scrollbars. The `platform-mac` class lets `platform-mac.css` normalise those
 * without touching the Windows path.
 */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  const source = navigator.platform || navigator.userAgent || ''
  return /Mac/i.test(source)
}

export function applyPlatformClass(): void {
  if (typeof document === 'undefined') return
  if (isMacPlatform()) {
    document.documentElement.classList.add('platform-mac')
  }
}
