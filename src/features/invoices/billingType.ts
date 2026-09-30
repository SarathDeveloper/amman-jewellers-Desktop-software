export type SaleBillingType = 'cash_bill' | 'tax_invoice'
export type BillingType = SaleBillingType | 'adagu'

const STORAGE_KEY = 'jeweltrackerpro.billingType'

export const BILLING_TYPE_OPTIONS: { value: SaleBillingType; label: string }[] = [
  { value: 'cash_bill', label: 'Cash Bill' },
  { value: 'tax_invoice', label: 'Tax Invoice' },
]

export const BILLING_TAB_OPTIONS: {
  value: BillingType
  label: string
  subtitle: string
  path: string
  newPath: string
  newLabel: string
}[] = [
  {
    value: 'cash_bill',
    label: 'Cash Bill',
    subtitle: 'Direct sale without GST',
    path: '/billing/cash',
    newPath: '/billing/cash/new',
    newLabel: 'New Cash Bill',
  },
  {
    value: 'tax_invoice',
    label: 'Tax Invoice',
    subtitle: 'Sale with GST (CGST/SGST/IGST)',
    path: '/billing/tax',
    newPath: '/billing/tax/new',
    newLabel: 'New Tax Invoice',
  },
  {
    value: 'adagu',
    label: 'Adagu Bill',
    subtitle: 'Pledge / Loan receipt',
    path: '/billing/adagu',
    newPath: '/billing/adagu/new',
    newLabel: 'New Adagu Bill',
  },
]

export function getBillingType(): BillingType {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored === 'tax_invoice' || stored === 'cash_bill' || stored === 'adagu') {
      return stored
    }
  } catch {
    // ignore
  }
  return 'cash_bill'
}

export function setBillingType(type: BillingType): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, type)
  } catch {
    // ignore
  }
}

export function billingTypePath(_type?: BillingType): string {
  return '/billing'
}

export function billingTypeFromPath(pathname: string): BillingType | null {
  if (pathname.startsWith('/billing/tax')) return 'tax_invoice'
  if (pathname.startsWith('/billing/adagu')) return 'adagu'
  if (pathname.startsWith('/billing/cash')) return 'cash_bill'
  return null
}

export function salePathForFormat(format: 'cash_bill' | 'tax_invoice', id?: number): string {
  const base = format === 'tax_invoice' ? '/billing/tax' : '/billing/cash'
  return id ? `${base}/${id}` : `${base}/new`
}

export function saleDetailPathForFormat(format: 'cash_bill' | 'tax_invoice', id: number): string {
  return `${salePathForFormat(format, id)}/detail`
}
