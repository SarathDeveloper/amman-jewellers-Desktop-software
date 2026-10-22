import { describe, expect, it } from 'vitest'
import { authFieldKeyDecision } from '../../src/lib/formKeyboard'

const login = { count: 3, lastFieldIndex: 1 }
const changePassword = { count: 4, lastFieldIndex: 2 }

describe('authFieldKeyDecision', () => {
  it('moves Enter from a field to the next field', () => {
    expect(authFieldKeyDecision({ key: 'Enter', index: 0, ...login })).toEqual({ type: 'move', to: 1 })
    expect(authFieldKeyDecision({ key: 'Enter', index: 1, ...changePassword })).toEqual({
      type: 'move',
      to: 2,
    })
  })

  it('submits when Enter is pressed on the last field', () => {
    expect(authFieldKeyDecision({ key: 'Enter', index: 1, ...login })).toEqual({ type: 'submit' })
    expect(authFieldKeyDecision({ key: 'Enter', index: 2, ...changePassword })).toEqual({ type: 'submit' })
  })

  it('leaves Enter on the submit button to the browser', () => {
    expect(authFieldKeyDecision({ key: 'Enter', index: 2, ...login })).toEqual({ type: 'ignore' })
  })

  it('moves ArrowDown and ArrowUp and stops at the ends', () => {
    expect(authFieldKeyDecision({ key: 'ArrowDown', index: 0, ...login })).toEqual({ type: 'move', to: 1 })
    expect(authFieldKeyDecision({ key: 'ArrowDown', index: 1, ...login })).toEqual({ type: 'move', to: 2 })
    expect(authFieldKeyDecision({ key: 'ArrowDown', index: 2, ...login })).toEqual({ type: 'ignore' })
    expect(authFieldKeyDecision({ key: 'ArrowUp', index: 2, ...login })).toEqual({ type: 'move', to: 1 })
    expect(authFieldKeyDecision({ key: 'ArrowUp', index: 0, ...login })).toEqual({ type: 'ignore' })
  })

  it('leaves Tab, Shift+Enter, and IME composition alone', () => {
    expect(authFieldKeyDecision({ key: 'Tab', index: 0, ...login })).toEqual({ type: 'ignore' })
    expect(authFieldKeyDecision({ key: 'Enter', index: 0, shiftKey: true, ...login })).toEqual({
      type: 'ignore',
    })
    expect(authFieldKeyDecision({ key: 'Enter', index: 0, isComposing: true, ...login })).toEqual({
      type: 'ignore',
    })
  })

  it('submits from the last field even when the button is disabled and not in the list', () => {
    expect(authFieldKeyDecision({ key: 'Enter', index: 1, count: 2, lastFieldIndex: 1 })).toEqual({
      type: 'submit',
    })
    expect(authFieldKeyDecision({ key: 'ArrowDown', index: 1, count: 2, lastFieldIndex: 1 })).toEqual({
      type: 'ignore',
    })
  })
})
