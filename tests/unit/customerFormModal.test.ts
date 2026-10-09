import { describe, expect, it } from 'vitest'
import { looksLikePhone, prefillFromSearch } from '../../src/features/customers/CustomerFormModal'

describe('customerFormModal prefill', () => {
  it('prefills name from text search', () => {
    expect(prefillFromSearch('Raja Kumar')).toEqual({
      name: 'Raja Kumar',
      phone: '',
      address: '',
      guardianName: '',
      notes: '',
      gstin: '',
      aadhaar: '',
      pan: '',
      idProofType: '',
    })
  })

  it('prefills phone when query looks like a phone number', () => {
    expect(prefillFromSearch('9876543210')).toEqual({
      name: '',
      phone: '9876543210',
      address: '',
      guardianName: '',
      notes: '',
      gstin: '',
      aadhaar: '',
      pan: '',
      idProofType: '',
    })
  })

  it('detects phone-like input', () => {
    expect(looksLikePhone('+91 98765 43210')).toBe(true)
    expect(looksLikePhone('Raja')).toBe(false)
  })
})
