import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

/** Fields that Enter should advance between (not buttons / hidden). */
const FOCUSABLE_FIELDS =
  'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'

const OWN_ENTER = '[data-form-nav-own="enter"]'

function isFieldElement(el: Element): el is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement
}

function isVisible(el: HTMLElement): boolean {
  return el.getClientRects().length > 0
}

/**
 * Focus the next enabled field after `from` within `root` (or the nearest
 * `[data-form-nav]` ancestor). Returns true if focus moved.
 */
export function focusNextField(from: HTMLElement, root?: HTMLElement | null): boolean {
  const scope =
    root ?? from.closest<HTMLElement>('[data-form-nav]') ?? from.ownerDocument?.body ?? null
  if (!scope) return false

  const fields = Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE_FIELDS)).filter(isVisible)
  const index = fields.indexOf(from)
  if (index < 0) return false
  const next = fields[index + 1]
  if (!next) return false
  next.focus()
  if (next instanceof HTMLInputElement && next.type !== 'date') {
    next.select?.()
  }
  return true
}

function shouldOwnEnter(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest(OWN_ENTER))
}

/**
 * Event-delegation handler for containers with `data-form-nav`.
 * Enter advances to the next field; Shift+Enter / textarea / exclusive owners are left alone.
 */
export function onEnterAdvanceFields(
  event: ReactKeyboardEvent<HTMLElement> | KeyboardEvent,
): void {
  if (event.key !== 'Enter' || event.shiftKey || event.defaultPrevented) return
  if (event.isComposing) return

  const target = event.target
  if (!(target instanceof HTMLElement)) return
  if (!isFieldElement(target)) return
  if (target instanceof HTMLTextAreaElement) return
  if (shouldOwnEnter(target)) return

  const root = target.closest<HTMLElement>('[data-form-nav]')
  if (!root) return

  event.preventDefault()
  focusNextField(target, root)
}
