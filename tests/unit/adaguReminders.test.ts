import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ADAGU_REMINDER_TEMPLATE,
  buildAdaguWhatsAppUrl,
  encodeWhatsAppText,
  isSafeWhatsAppUrl,
  normalizeWhatsAppPhone,
  renderAdaguReminder,
} from '../../shared/adagu/reminders'

describe('adagu reminder helpers', () => {
  it('fills the template placeholders', () => {
    const text = renderAdaguReminder('Hi {name}, {receiptNo} due {dueDate} interest {interestDue}', {
      name: 'Ravi',
      receiptNo: 'ADG0007',
      interestDue: 420.5,
      dueDate: '10 Oct 2026',
    })
    expect(text).toBe('Hi Ravi, ADG0007 due 10 Oct 2026 interest 420.50')
  })

  it('leaves unknown placeholders untouched', () => {
    expect(
      renderAdaguReminder('{name} {missing}', {
        name: 'Ravi',
        receiptNo: 'ADG0007',
        interestDue: 0,
        dueDate: '',
      }),
    ).toBe('Ravi {missing}')
  })

  it('normalises Indian mobile numbers', () => {
    expect(normalizeWhatsAppPhone('9876543210')).toBe('919876543210')
    expect(normalizeWhatsAppPhone('+91 98765 43210')).toBe('919876543210')
    expect(normalizeWhatsAppPhone('0044 7911 123456')).toBeNull()
    expect(normalizeWhatsAppPhone('12345')).toBeNull()
  })

  it('builds a safe wa.me link with an encoded message', () => {
    const url = buildAdaguWhatsAppUrl('9876543210', DEFAULT_ADAGU_REMINDER_TEMPLATE, {
      name: 'Ravi & Sons',
      receiptNo: 'ADG0007',
      interestDue: 100,
      dueDate: '10 Oct 2026',
    })
    expect(url).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/)
    expect(url).not.toContain('&')
    expect(url).not.toContain('(')
    expect(isSafeWhatsAppUrl(url ?? '')).toBe(true)
  })

  it('returns null when the phone or message is unusable', () => {
    expect(buildAdaguWhatsAppUrl('', DEFAULT_ADAGU_REMINDER_TEMPLATE, {
      name: 'Ravi',
      receiptNo: 'ADG0007',
      interestDue: 0,
      dueDate: '',
    })).toBeNull()
    expect(buildAdaguWhatsAppUrl('9876543210', '   ', {
      name: 'Ravi',
      receiptNo: 'ADG0007',
      interestDue: 0,
      dueDate: '',
    })).toBeNull()
  })

  it('rejects links that are not WhatsApp reminders', () => {
    expect(isSafeWhatsAppUrl('https://wa.me/919876543210?text=Hello')).toBe(true)
    expect(isSafeWhatsAppUrl('https://example.com/evil')).toBe(false)
    expect(isSafeWhatsAppUrl('https://wa.me/919876543210')).toBe(false)
    expect(isSafeWhatsAppUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeWhatsAppUrl('https://wa.me/919876543210?text=a&b=c')).toBe(false)
  })

  it('keeps command-hostile characters out of the encoded text', () => {
    const encoded = encodeWhatsAppText('100% & "quoted" <tag> `x` | pipe')
    expect(encoded).not.toMatch(/[&"<>`|()!*' ]/)
    expect(encodeWhatsAppText('%')).toBe('%25')
  })
})
