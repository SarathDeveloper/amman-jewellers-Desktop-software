import type { CustomerInput } from '@shared/types'
import { customerInputSchema, PAN_FORMAT_MESSAGE } from '@shared/schemas'

export type CustomerField = 'name' | 'phone' | 'address' | 'aadhaar' | 'pan'

export type CustomerFieldErrors = Partial<Record<CustomerField, string>>

const MESSAGE_FIELDS: Record<string, CustomerField> = {
  'Name is required': 'name',
  'Enter customer name': 'name',
  'Mobile number must be exactly 10 digits': 'phone',
  'Address is required': 'address',
  'Aadhaar must be exactly 12 digits': 'aadhaar',
  [PAN_FORMAT_MESSAGE]: 'pan',
}

export function customerFieldErrors(input: CustomerInput): CustomerFieldErrors {
  const parsed = customerInputSchema.safeParse(input)
  if (parsed.success) return {}
  const errors: CustomerFieldErrors = {}
  for (const issue of parsed.error.issues) {
    const key = issue.path[0]
    if (
      (key === 'name' || key === 'phone' || key === 'address' || key === 'aadhaar' || key === 'pan') &&
      !errors[key]
    ) {
      errors[key] = issue.message
    }
  }
  return errors
}

export class CustomerFormError extends Error {
  fields: CustomerFieldErrors

  constructor(fields: CustomerFieldErrors) {
    super(Object.values(fields)[0] ?? 'Invalid customer details')
    this.name = 'CustomerFormError'
    this.fields = fields
  }
}

export function assertCustomerInput(input: CustomerInput): void {
  const fields = customerFieldErrors(input)
  if (Object.keys(fields).length > 0) throw new CustomerFormError(fields)
}

/** Field messages stay on the customer form. Other failures stay on the page. */
export function takeCustomerFormError(err: unknown): CustomerFieldErrors | null {
  if (err instanceof CustomerFormError) return err.fields
  if (err instanceof Error) {
    const field = MESSAGE_FIELDS[err.message]
    if (field) return { [field]: err.message }
  }
  return null
}
