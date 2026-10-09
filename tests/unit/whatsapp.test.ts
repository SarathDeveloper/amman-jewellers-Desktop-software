import { describe, expect, it } from 'vitest'
import { goldSavingsReminderMessage, whatsappLink } from '../../src/lib/whatsapp'

describe('whatsappLink', () => {
  it('adds the 91 country code to a 10-digit Indian number', () => {
    expect(whatsappLink('9876543210', 'hi')).toBe('https://wa.me/919876543210?text=hi')
  })

  it('keeps an already-prefixed number and strips formatting', () => {
    expect(whatsappLink('+91 98765 43210', 'hi')).toBe('https://wa.me/919876543210?text=hi')
  })

  it('leaves a non-10-digit number untouched apart from formatting', () => {
    expect(whatsappLink('+1 (415) 555-0100', 'hi')).toBe('https://wa.me/14155550100?text=hi')
  })

  it('percent-encodes the message', () => {
    expect(whatsappLink('9876543210', 'Due ₹500 on 8 Oct 2026')).toBe(
      `https://wa.me/919876543210?text=${encodeURIComponent('Due ₹500 on 8 Oct 2026')}`,
    )
  })
})

describe('goldSavingsReminderMessage', () => {
  it('includes the shop, customer, account, installment, due date and amount', () => {
    const message = goldSavingsReminderMessage({
      shopName: 'Amman Jewellers',
      customerName: 'Ravi Kumar',
      accountNo: 'GS-0001',
      installmentNo: 4,
      dueDate: '2026-09-22',
      amount: 5000,
    })
    expect(message).toContain('Amman Jewellers')
    expect(message).toContain('Dear Ravi Kumar,')
    expect(message).toContain('GS-0001')
    expect(message).toContain('installment #4')
    expect(message).toContain('22 Sep 2026')
    expect(message).toContain('₹5,000')
  })

  it('omits the shop line when the shop name is blank', () => {
    const message = goldSavingsReminderMessage({
      shopName: '   ',
      customerName: 'Priya',
      accountNo: 'GS-0002',
      installmentNo: 1,
      dueDate: '2026-10-01',
      amount: 1000,
    })
    expect(message.startsWith('Dear Priya,')).toBe(true)
  })

  it('falls back to a generic phrase when no installment number is known', () => {
    const message = goldSavingsReminderMessage({
      shopName: 'Shop',
      customerName: 'Suresh',
      accountNo: 'GS-0003',
      dueDate: '2026-10-05',
      amount: 2500,
    })
    expect(message).toContain('the next installment')
    expect(message).not.toContain('#')
  })
})
