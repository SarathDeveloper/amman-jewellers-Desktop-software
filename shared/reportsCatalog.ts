export const REPORT_IDS = [
  'daily-sales',
  'date-wise-sales',
  'cash-sales',
  'tax-invoice-sales',
  'adagu-sales',
  'product-wise-sales',
  'customer-wise-sales',
  'sales-return',
  'purchase-register',
  'date-wise-purchases',
  'supplier-wise-purchases',
  'product-wise-purchases',
  'purchase-return',
  'current-stock',
  'gold-stock',
  'silver-stock',
  'product-stock',
  'variant-size-stock',
  'stock-movement',
  'stock-inward',
  'stock-outward',
  'low-stock',
  'customer-list',
  'customer-transactions',
  'customer-outstanding',
  'customer-purchase-history',
  'customer-metal-transactions',
  'daily-collection',
  'cash-collection',
  'upi-collection',
  'card-collection',
  'credit-outstanding',
  'payment-history',
  'gold-stock-summary',
  'silver-stock-summary',
  'purity-wise-stock',
  'metal-wise-inward',
  'metal-wise-outward',
  'weight-movement',
  'active-pledges',
  'closed-pledges',
  'due-pledges',
  'customer-wise-pledges',
  'pledge-transactions',
  'gst-sales',
  'gst-purchase',
  'tax-summary',
  'invoice-register',
  'sales-summary',
  'purchase-summary',
  'gross-profit',
  'outstanding-summary',
  'daily-business-summary',
] as const

export type ReportId = (typeof REPORT_IDS)[number]

export type ReportGroupId =
  | 'sales'
  | 'purchase'
  | 'stock'
  | 'customer'
  | 'payment'
  | 'metal'
  | 'pledge'
  | 'tax'
  | 'summary'

export type ReportDateScope = 'range' | 'asOf' | 'none'

export type ReportFilter = 'customer' | 'supplier' | 'product' | 'metal' | 'qtyCutoff'

export type ReportColumnFormat = 'text' | 'money' | 'weight' | 'qty' | 'date'

export interface ReportColumn {
  key: string
  label: string
  align?: 'left' | 'right'
  format?: ReportColumnFormat
  total?: boolean
}

export interface ReportResult {
  columns: ReportColumn[]
  rows: Record<string, string | number>[]
  totals: Record<string, number>
}

export interface ReportLookups {
  customers: { id: number; name: string }[]
  suppliers: { id: number; name: string }[]
  products: { id: number; name: string }[]
}

export interface ReportDefinition {
  id: ReportId
  group: ReportGroupId
  title: string
  dateScope: ReportDateScope
  defaultToday?: boolean
  filters: ReportFilter[]
  available: boolean
  unavailableReason?: string
  note?: string
}

export const REPORT_GROUPS: { id: ReportGroupId; label: string }[] = [
  { id: 'sales', label: 'Sales Reports' },
  { id: 'purchase', label: 'Purchase Reports' },
  { id: 'stock', label: 'Stock Reports' },
  { id: 'customer', label: 'Customer Reports' },
  { id: 'payment', label: 'Payment Reports' },
  { id: 'metal', label: 'Gold & Silver Reports' },
  { id: 'pledge', label: 'Adagu / Pledge Reports' },
  { id: 'tax', label: 'Tax Reports' },
  { id: 'summary', label: 'Business Summary' },
]

const paymentModeNote =
  'Includes single-mode payments only. Mixed amounts stay in Daily Collection and Payment History.'

const stockAsOfNote = 'Category weight as of the selected date, matching the Gold & Silver screen.'

export const REPORTS: ReportDefinition[] = [
  { id: 'daily-sales', group: 'sales', title: 'Daily Sales', dateScope: 'range', defaultToday: true, filters: [], available: true },
  { id: 'date-wise-sales', group: 'sales', title: 'Date-wise Sales', dateScope: 'range', filters: ['customer'], available: true },
  { id: 'cash-sales', group: 'sales', title: 'Cash Sales', dateScope: 'range', filters: ['customer'], available: true },
  { id: 'tax-invoice-sales', group: 'sales', title: 'Tax Invoice Sales', dateScope: 'range', filters: ['customer'], available: true },
  {
    id: 'adagu-sales',
    group: 'sales',
    title: 'Adagu Sales',
    dateScope: 'none',
    filters: [],
    available: false,
    unavailableReason: 'Adagu receipts are pledges, not sales. Use Adagu / Pledge reports.',
  },
  { id: 'product-wise-sales', group: 'sales', title: 'Product-wise Sales', dateScope: 'range', filters: ['customer', 'product', 'metal'], available: true },
  { id: 'customer-wise-sales', group: 'sales', title: 'Customer-wise Sales', dateScope: 'range', filters: ['customer'], available: true },
  {
    id: 'sales-return',
    group: 'sales',
    title: 'Sales Return',
    dateScope: 'none',
    filters: [],
    available: false,
    unavailableReason: 'There is no sales return document yet.',
  },
  { id: 'purchase-register', group: 'purchase', title: 'Purchase Register', dateScope: 'range', filters: ['supplier'], available: true },
  { id: 'date-wise-purchases', group: 'purchase', title: 'Date-wise Purchases', dateScope: 'range', filters: ['supplier'], available: true },
  { id: 'supplier-wise-purchases', group: 'purchase', title: 'Supplier-wise Purchases', dateScope: 'range', filters: ['supplier'], available: true },
  { id: 'product-wise-purchases', group: 'purchase', title: 'Product-wise Purchases', dateScope: 'range', filters: ['supplier', 'product', 'metal'], available: true },
  {
    id: 'purchase-return',
    group: 'purchase',
    title: 'Purchase Return',
    dateScope: 'none',
    filters: [],
    available: false,
    unavailableReason: 'There is no purchase return document yet.',
  },
  { id: 'current-stock', group: 'stock', title: 'Current Stock', dateScope: 'none', filters: ['product', 'metal'], available: true },
  { id: 'gold-stock', group: 'stock', title: 'Gold Stock', dateScope: 'none', filters: ['product'], available: true },
  { id: 'silver-stock', group: 'stock', title: 'Silver Stock', dateScope: 'none', filters: ['product'], available: true },
  { id: 'product-stock', group: 'stock', title: 'Product Stock', dateScope: 'none', filters: ['metal'], available: true },
  {
    id: 'variant-size-stock',
    group: 'stock',
    title: 'Variant/Size Stock',
    dateScope: 'none',
    filters: [],
    available: false,
    unavailableReason: 'Products do not have a size or variant.',
  },
  { id: 'stock-movement', group: 'stock', title: 'Stock Movement', dateScope: 'range', filters: ['metal', 'product'], available: true },
  { id: 'stock-inward', group: 'stock', title: 'Stock Inward', dateScope: 'range', filters: ['metal'], available: true },
  { id: 'stock-outward', group: 'stock', title: 'Stock Outward', dateScope: 'range', filters: ['metal'], available: true },
  { id: 'low-stock', group: 'stock', title: 'Low Stock', dateScope: 'none', filters: ['metal', 'qtyCutoff'], available: true },
  { id: 'customer-list', group: 'customer', title: 'Customer List', dateScope: 'none', filters: [], available: true },
  { id: 'customer-transactions', group: 'customer', title: 'Customer Transactions', dateScope: 'range', filters: ['customer'], available: true },
  { id: 'customer-outstanding', group: 'customer', title: 'Customer Outstanding', dateScope: 'none', filters: ['customer'], available: true },
  { id: 'customer-purchase-history', group: 'customer', title: 'Customer Purchase History', dateScope: 'range', filters: ['customer'], available: true },
  { id: 'customer-metal-transactions', group: 'customer', title: 'Customer-wise Gold/Silver Transactions', dateScope: 'range', filters: ['customer', 'metal'], available: true },
  { id: 'daily-collection', group: 'payment', title: 'Daily Collection', dateScope: 'range', defaultToday: true, filters: [], available: true },
  { id: 'cash-collection', group: 'payment', title: 'Cash Collection', dateScope: 'range', filters: ['customer'], available: true, note: paymentModeNote },
  { id: 'upi-collection', group: 'payment', title: 'UPI Collection', dateScope: 'range', filters: ['customer'], available: true, note: paymentModeNote },
  { id: 'card-collection', group: 'payment', title: 'Card Collection', dateScope: 'range', filters: ['customer'], available: true, note: paymentModeNote },
  { id: 'credit-outstanding', group: 'payment', title: 'Credit / Outstanding', dateScope: 'none', filters: ['customer'], available: true },
  { id: 'payment-history', group: 'payment', title: 'Payment History', dateScope: 'range', filters: ['customer'], available: true },
  { id: 'gold-stock-summary', group: 'metal', title: 'Gold Stock Summary', dateScope: 'asOf', filters: [], available: true, note: stockAsOfNote },
  { id: 'silver-stock-summary', group: 'metal', title: 'Silver Stock Summary', dateScope: 'asOf', filters: [], available: true, note: stockAsOfNote },
  { id: 'purity-wise-stock', group: 'metal', title: 'Purity-wise Stock', dateScope: 'none', filters: ['metal'], available: true },
  { id: 'metal-wise-inward', group: 'metal', title: 'Metal-wise Inward', dateScope: 'range', filters: ['metal'], available: true },
  { id: 'metal-wise-outward', group: 'metal', title: 'Metal-wise Outward', dateScope: 'range', filters: ['metal'], available: true },
  { id: 'weight-movement', group: 'metal', title: 'Weight Movement', dateScope: 'range', filters: ['metal'], available: true },
  { id: 'active-pledges', group: 'pledge', title: 'Active Pledges', dateScope: 'none', filters: ['customer'], available: true },
  { id: 'closed-pledges', group: 'pledge', title: 'Closed Pledges', dateScope: 'range', filters: ['customer'], available: true },
  { id: 'due-pledges', group: 'pledge', title: 'Due / Overdue Pledges', dateScope: 'asOf', filters: ['customer'], available: true },
  { id: 'customer-wise-pledges', group: 'pledge', title: 'Customer-wise Pledges', dateScope: 'none', filters: ['customer'], available: true },
  { id: 'pledge-transactions', group: 'pledge', title: 'Pledge Transactions', dateScope: 'range', filters: ['customer'], available: true },
  { id: 'gst-sales', group: 'tax', title: 'GST Sales', dateScope: 'range', filters: [], available: true },
  {
    id: 'gst-purchase',
    group: 'tax',
    title: 'GST Purchase',
    dateScope: 'range',
    filters: [],
    available: true,
  },
  { id: 'tax-summary', group: 'tax', title: 'Tax Summary', dateScope: 'range', filters: [], available: true },
  { id: 'invoice-register', group: 'tax', title: 'Invoice Register', dateScope: 'range', filters: ['customer'], available: true },
  { id: 'sales-summary', group: 'summary', title: 'Sales Summary', dateScope: 'range', filters: [], available: true },
  { id: 'purchase-summary', group: 'summary', title: 'Purchase Summary', dateScope: 'range', filters: ['supplier'], available: true },
  {
    id: 'gross-profit',
    group: 'summary',
    title: 'Gross Profit',
    dateScope: 'none',
    filters: [],
    available: false,
    unavailableReason: 'Sold lines do not store purchase cost.',
  },
  { id: 'outstanding-summary', group: 'summary', title: 'Outstanding Summary', dateScope: 'none', filters: [], available: true },
  { id: 'daily-business-summary', group: 'summary', title: 'Daily Business Summary', dateScope: 'range', defaultToday: true, filters: [], available: true },
]

export function findReport(id: string): ReportDefinition | undefined {
  return REPORTS.find((report) => report.id === id)
}

export function reportsInGroup(group: ReportGroupId): ReportDefinition[] {
  return REPORTS.filter((report) => report.group === group)
}
