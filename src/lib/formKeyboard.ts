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

export type AuthFieldKeyDecision = { type: 'move'; to: number } | { type: 'submit' } | { type: 'ignore' }

/**
 * What an auth form should do for a key pressed on one of its controls.
 * `count` is the number of enabled controls (text fields, then the submit button).
 * `lastFieldIndex` is the last text field; Enter there submits, Enter before it advances.
 * Arrow keys stop at the ends. Tab, Shift+Enter, and IME composition are left to the browser.
 */
export function authFieldKeyDecision(input: {
  key: string
  index: number
  count: number
  lastFieldIndex: number
  shiftKey?: boolean
  isComposing?: boolean
}): AuthFieldKeyDecision {
  const { key, index, count, lastFieldIndex, shiftKey = false, isComposing = false } = input
  if (isComposing || shiftKey || index < 0 || index >= count || count <= 0) return { type: 'ignore' }

  if (key === 'ArrowDown') {
    return index + 1 < count ? { type: 'move', to: index + 1 } : { type: 'ignore' }
  }
  if (key === 'ArrowUp') {
    return index > 0 ? { type: 'move', to: index - 1 } : { type: 'ignore' }
  }
  if (key === 'Enter') {
    if (index === lastFieldIndex) return { type: 'submit' }
    if (index < lastFieldIndex) return { type: 'move', to: index + 1 }
  }
  return { type: 'ignore' }
}

const AUTH_CONTROLS =
  'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([disabled]), button[type="submit"]:not([disabled])'

/**
 * Login and change-password forms. Enter advances until the last field, which submits.
 * ArrowUp / ArrowDown move between the fields and the submit button. Tab stays native.
 */
export function onAuthFieldKeys(event: ReactKeyboardEvent<HTMLElement> | KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing) return
  if (event.key !== 'Enter' && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return

  const target = event.target
  if (!(target instanceof HTMLElement)) return

  const form = target.closest('form')
  if (!form) return

  const controls = Array.from(form.querySelectorAll<HTMLElement>(AUTH_CONTROLS)).filter(isVisible)
  const index = controls.indexOf(target)
  if (index < 0) return

  const lastField = [...controls].reverse().find(isFieldElement)
  const lastFieldIndex = lastField ? controls.indexOf(lastField) : -1
  const decision = authFieldKeyDecision({
    key: event.key,
    index,
    count: controls.length,
    lastFieldIndex,
    shiftKey: event.shiftKey,
    isComposing: event.isComposing,
  })

  if (decision.type !== 'move') return

  event.preventDefault()
  const next = controls[decision.to]
  if (!next) return
  next.focus()
  if (next instanceof HTMLInputElement && next.type !== 'date') {
    next.select?.()
  }
}
