import { describe, expect, it } from 'vitest'
import { PAN_FORMAT_MESSAGE } from '../../shared/schemas'
import {
  assertCustomerInput,
  customerFieldErrors,
  CustomerFormError,
  takeCustomerFormError,
} from '../../src/features/customers/customerFieldErrors'
import { emptyCustomerInput } from '../../src/features/customers/CustomerFormModal'

const valid = {
  ...emptyCustomerInput,
  name: 'Raja',
  phone: '9876543210',
  address: 'Salem',
}

describe('customerFieldErrors', () => {
  it('maps a short mobile number onto the mobile field', () => {
    expect(customerFieldErrors({ ...valid, phone: '98765' }).phone).toBe(
      'Mobile number must be exactly 10 digits',
    )
  })

  it('keeps each invalid field on its own message', () => {
    const errors = customerFieldErrors({
      ...valid,
      name: '',
      phone: '12',
      address: '',
      aadhaar: '123',
      pan: 'ABC',
    })
    expect(errors.name).toBe('Name is required')
    expect(errors.phone).toBe('Mobile number must be exactly 10 digits')
    expect(errors.address).toBe('Address is required')
    expect(errors.aadhaar).toBe('Aadhaar must be exactly 12 digits')
    expect(errors.pan).toBe(PAN_FORMAT_MESSAGE)
  })

  it('accepts a complete customer', () => {
    expect(customerFieldErrors(valid)).toEqual({})
    expect(() => assertCustomerInput(valid)).not.toThrow()
  })

  it('recognises the same messages when they come back from the server', () => {
    expect(takeCustomerFormError(new Error('Mobile number must be exactly 10 digits'))).toEqual({
      phone: 'Mobile number must be exactly 10 digits',
    })
    expect(takeCustomerFormError(new CustomerFormError({ name: 'Name is required' }))).toEqual({
      name: 'Name is required',
    })
    expect(takeCustomerFormError(new Error('Failed to save invoice'))).toBeNull()
  })
})
