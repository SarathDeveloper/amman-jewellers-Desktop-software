import type { BillTemplateSettings, CashBillVisibility, TaxInvoiceVisibility, TemplatePreset } from './billTemplate'

export type { BillTemplateSettings, CashBillVisibility, TaxInvoiceVisibility, TemplatePreset } from './billTemplate'

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; referenceId?: string }

export type LogCategory = 'application' | 'database' | 'printer' | 'crash' | 'backup'

export type DiagnosticSource = 'boundary' | 'window' | 'rejection'

export interface DiagnosticReport {
  referenceId: string
  timestamp: string
  version: string
  category: LogCategory
  message: string
  stack?: string
}

export interface RendererErrorInput {
  message: string
  stack?: string
  source: DiagnosticSource
}

export type InvoiceStatus = 'draft' | 'final'
export type BillFormat = 'cash_bill' | 'tax_invoice'
export type PaymentMode = 'cash' | 'upi' | 'card' | 'mixed'
export type PaperSize = 'a5' | 'a4' | 'thermal'
export type PrinterRole = 'cash' | 'tax'
export type PrinterState = 'ready' | 'printing' | 'offline'

export interface InstalledPrinter {
  name: string
  displayName: string
  status: PrinterState
}

export interface LastPrintedBill {
  invoiceId: number | null
  invoiceNo: string
  billFormat: BillFormat | ''
}

export interface PrintReadyPayload {
  contentHeightMicrons?: number
}

export type ProductAttributes = Record<string, string>

export const EMPTY_PRODUCT_VARIANT_FIELDS = {
  parentId: null as number | null,
  variantCode: '',
  size: '',
  stoneWeight: 0,
  stoneDetails: '',
  attributes: {} as ProductAttributes,
  isActive: true,
}

export interface Product {
  id: number
  name: string
  category: string
  metal: string
  purity: string
  grossWeight: number
  netWeight: number
  makingCharges: number
  stockQty: number
  imagePath: string
  updatedAt: string
  parentId: number | null
  variantCode: string
  size: string
  stoneWeight: number
  stoneDetails: string
  attributes: ProductAttributes
  isActive: boolean
}

export interface ProductInput {
  name: string
  category: string
  metal: string
  purity: string
  grossWeight: number
  netWeight: number
  makingCharges: number
  stockQty: number
  imagePath: string
  parentId?: number | null
  variantCode?: string
  size?: string
  stoneWeight?: number
  stoneDetails?: string
  attributes?: ProductAttributes
  isActive?: boolean
}

export interface Customer {
  id: number
  name: string
  phone: string
  address: string
  guardianName: string
  notes: string
  gstin: string
  aadhaar: string
  pan: string
  createdAt: string
}

export interface CustomerInput {
  name: string
  phone: string
  address: string
  guardianName?: string
  notes?: string
  gstin?: string
  aadhaar?: string
  pan?: string
}

export type InvoiceLineKind = 'sale' | 'exchange'

export interface InvoiceItem {
  id: number
  invoiceId: number
  productId: number | null
  productName: string
  qty: number
  rate: number
  lineTotal: number
  grossWeight: number
  netWeight: number
  stoneWeight: number
  metalRate: number
  makingCharges: number
  wastagePct: number
  stoneRate: number
  otherCharges: number
  lineSubtotal: number
  lineTax: number
  hsnCode: string
  metal?: string
  category?: string
  lineKind: InvoiceLineKind
  description: string
}

export interface InvoiceItemInput {
  productId?: number | null
  qty: number
  rate: number
  grossWeight?: number
  netWeight?: number
  stoneWeight?: number
  metalRate?: number
  makingCharges?: number
  wastagePct?: number
  stoneRate?: number
  otherCharges?: number
  hsnCode?: string
  lineKind?: InvoiceLineKind
  description?: string
  metal?: string
  category?: string
}

export interface OldGoldItemInput {
  description?: string
  grossWeight: number
  stoneWeight?: number
  netWeight: number
  purity?: string
  ratePerGram: number
  deductionPct?: number
}

export interface OldGoldItem {
  id: number
  invoiceId: number
  description: string
  grossWeight: number
  stoneWeight: number
  netWeight: number
  purity: string
  ratePerGram: number
  deductionPct: number
  grossValue: number
  deductionAmount: number
  finalValue: number
}

export type OldGoldPurchaseStatus = 'draft' | 'final'

export interface OldGoldPurchaseItemInput {
  description?: string
  grossWeight: number
  stoneWeight?: number
  netWeight: number
  purity?: string
  ratePerGram: number
  deductionPct?: number
}

export interface OldGoldPurchaseItem {
  id: number
  purchaseId: number
  description: string
  grossWeight: number
  stoneWeight: number
  netWeight: number
  purity: string
  ratePerGram: number
  deductionPct: number
  grossValue: number
  deductionAmount: number
  finalValue: number
}

export interface OldGoldPurchase {
  id: number
  purchaseNo: string
  purchaseDate: string
  customerId: number | null
  customerName: string
  customerPhone: string
  totalAmount: number
  notes: string
  status: OldGoldPurchaseStatus
  createdAt: string
  finalizedAt: string | null
  items: OldGoldPurchaseItem[]
  linkedInvoiceId: number | null
  linkedInvoiceNo: string | null
}

export interface OldGoldPurchaseInput {
  customerId?: number | null
  customerName: string
  customerPhone?: string
  purchaseDate: string
  notes?: string
  items: OldGoldPurchaseItemInput[]
}

export interface OldGoldPurchaseUpdateInput extends OldGoldPurchaseInput {
  id: number
}

export interface OldGoldPurchaseLinkInput {
  purchaseId: number
}

export interface OldGoldPurchaseLink {
  id: number
  invoiceId: number
  purchaseId: number
  purchaseNo: string
  customerName: string
  purchaseDate: string
  amountApplied: number
  netWeight: number
}

export interface MixedPaymentPart {
  mode: Extract<PaymentMode, 'cash' | 'upi' | 'card'>
  amount: number
}

export interface InvoicePayment {
  id: number
  date: string
  mode: PaymentMode
  amount: number
  note: string
  createdAt: string
}

export interface Invoice {
  id: number
  customerId: number
  customerName: string
  invoiceNo: string
  invoiceDate: string
  subtotal: number
  tax: number
  total: number
  status: InvoiceStatus
  items: InvoiceItem[]
  createdAt: string
  billFormat: BillFormat
  paymentMode: PaymentMode
  amountPaid: number
  balanceDue: number
  discount: number
  cgst: number
  sgst: number
  igst: number
  isEstimate: boolean
  isHistorical: boolean
  customerPhone: string
  summaryGoldG: number
  summarySilverG: number
  summaryMaking: number
  oldGold: OldGoldItem[]
  oldGoldLinks: OldGoldPurchaseLink[]
  roundOff: number
  amountPayable: number
  payments: InvoicePayment[]
}

export interface HistoricalInvoiceInput {
  invoiceNo: string
  customerId: number
  invoiceDate: string
  billFormat: BillFormat
  paymentMode: PaymentMode
  subtotal: number
  discount?: number
  autoTax?: boolean
  useIgst?: boolean
  tax?: number
  amountPaid: number
  goldWeight?: number
  silverWeight?: number
  makingCharges?: number
}

export interface InvoiceInput {
  customerId: number
  invoiceDate: string
  tax: number
  items: InvoiceItemInput[]
  billFormat?: BillFormat
  paymentMode?: PaymentMode
  amountPaid?: number
  discount?: number
  autoTax?: boolean
  useIgst?: boolean
  isEstimate?: boolean
  oldGold?: OldGoldItemInput[]
  oldGoldLinks?: OldGoldPurchaseLinkInput[]
  roundOff?: number
  mixedPayments?: MixedPaymentPart[]
}

export interface InvoiceUpdateInput {
  id: number
  customerId: number
  invoiceDate: string
  tax: number
  items: InvoiceItemInput[]
  billFormat?: BillFormat
  paymentMode?: PaymentMode
  amountPaid?: number
  discount?: number
  autoTax?: boolean
  useIgst?: boolean
  isEstimate?: boolean
  oldGold?: OldGoldItemInput[]
  oldGoldLinks?: OldGoldPurchaseLinkInput[]
  roundOff?: number
  mixedPayments?: MixedPaymentPart[]
}

export interface InvoicePaymentInput {
  amount: number
  entryDate: string
  note?: string
  mode?: Extract<PaymentMode, 'cash' | 'upi' | 'card'>
}

export interface ShopSettings {
  shopName: string
  tagline: string
  appSubtitle: string
  gstin: string
  phone1: string
  phone2: string
  addressLine1: string
  addressLine2: string
  addressLine3: string
  city: string
  state: string
  pincode: string
  proprietorLine1: string
  proprietorLine2: string
  proprietorLine3: string
  promoLine: string
  logoImagePath: string
  signatureImagePath: string
  bisLogoPath: string
  qrCodePath: string
  defaultPrinterCash: string
  defaultPrinterTax: string
  paperSizeCash: PaperSize
  paperSizeTax: PaperSize
  copiesCash: number
  copiesTax: number
  openCashDrawer: boolean
  lastPrinted: LastPrintedBill
  billTemplate: BillTemplateSettings
  cashPreset: TemplatePreset
  taxPreset: TemplatePreset
  cashVisibility: CashBillVisibility
  taxVisibility: TaxInvoiceVisibility
  quickProductIds: number[]
  pledgeLtvPct: number
  adaguInterestPct: number
}

export interface MetalRates {
  id: number
  effectiveDate: string
  gold22k: number
  gold24k: number
  gold20k: number
  gold18k: number
  silverFine: number
  silver925: number
  createdAt: string
}

export interface MetalRatesInput {
  effectiveDate: string
  gold22k: number
  gold24k: number
  gold20k?: number
  gold18k?: number
  silverFine: number
  silver925?: number
}

export interface TaxReportRow {
  month: string
  taxableSales: number
  cgst: number
  sgst: number
  igst: number
  invoiceCount: number
}

export type DueEntryKind = 'due' | 'payment'

export interface DueInvoiceItemSummary {
  productName: string
  netWeight: number
  lineTotal: number
}

export interface DueEntry {
  id: number
  customerId: number
  entryDate: string
  kind: DueEntryKind
  amount: number
  note: string
  invoiceId: number | null
  invoiceNo: string | null
  pledgeId: number | null
  pledgeReceiptNo: string | null
  createdAt: string
  invoiceTotal: number | null
  amountPaid: number | null
  balanceDue: number | null
  items: DueInvoiceItemSummary[]
}

export interface DueEntryUpdateInput {
  id: number
  entryDate: string
  kind: DueEntryKind
  amount: number
  note: string
}

export interface DueEntryInput {
  customerId: number
  entryDate: string
  kind: DueEntryKind
  amount: number
  note: string
}

export interface DuePaymentInput {
  dueEntryId: number
  amount: number
  entryDate: string
  note: string
}

export interface CustomerDuesColumn {
  customerId: number
  customerName: string
  customerPhone: string
  balance: number
  entries: DueEntry[]
}

export interface AdaguDueSummary {
  pledgeId: number
  dueEntryId: number | null
  customerId: number
  customerName: string
  customerPhone: string
  receiptNo: string
  pledgeDate: string
  principal: number
  interestPct: number
  monthlyInterest: number
  daysActive: number
  nextInterestDue: string
  isInterestOverdue: boolean
  totalDue: number
  amountCollected: number
  remaining: number
  status: PledgeStatus
  topups: PledgeTopup[]
}

export interface DuesLedger {
  columns: CustomerDuesColumn[]
  totalOutstanding: number
  adaguDues?: AdaguDueSummary[]
  adaguOutstanding?: number
}

export interface AppInfo {
  version: string
  dbPath: string
  logsPath: string
}

export interface BackupStatus {
  lastBackupAt: string | null
  frequency: 'daily' | 'weekly'
  time: string
  nextBackupAt: string | null
}

export interface BackupFile {
  name: string
  createdAt: string
  sizeBytes: number
  kind: 'daily' | 'manual'
}

export type UserRole = 'admin' | 'staff'

export type FeatureKey =
  | 'dashboard'
  | 'billing'
  | 'products'
  | 'stock'
  | 'inward'
  | 'customers'
  | 'dues'
  | 'reports'
  | 'rates'
  | 'settings'

export const FEATURE_KEYS: FeatureKey[] = [
  'dashboard',
  'billing',
  'products',
  'stock',
  'inward',
  'customers',
  'dues',
  'reports',
  'rates',
  'settings',
]

export interface User {
  id: number
  username: string
  role: UserRole
  mustChangePassword: boolean
  active: boolean
  features: FeatureKey[]
  createdAt: string
}

export type AuthUser = User

export interface LoginInput {
  username: string
  password: string
}

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

export interface CreateUserInput {
  username: string
  password: string
  role: UserRole
  features?: FeatureKey[]
}

export interface UpdatePermissionsInput {
  features: FeatureKey[]
}

export interface ResetPasswordInput {
  newPassword: string
}

export interface ItemStockRow {
  itemName: string
  openingWeight: number
  autoPurchaseIn: number
  autoSales: number
  autoExchangeIn: number
  salesOverride: number | null
  overrideReason: string
  overrideReferenceId: number | null
  effectiveSales: number
  closingWeight: number
}

export interface ItemStockListInput {
  stockDate: string
  metal: string
}

export interface ItemStockUpsertInput {
  stockDate: string
  metal: string
  itemName: string
  openingWeight?: number
  salesOverride?: number | null
  overrideReason?: string
  overrideReferenceId?: number | null
}

export interface StockCategory {
  id: number
  name: string
  sortOrder: number
}

export interface StockCategoryCreateInput {
  name: string
  stockDate?: string
  metal?: string
  openingWeight?: number
}

export interface StockCategoryUpdateInput {
  currentName: string
  newName: string
}

export interface StockClearOverridesInput {
  stockDate: string
  metal: string
}

export interface StockHistoryInput {
  metal: string
}

export interface StockHistoryRow {
  stockDate: string
  openingWeight: number
  inwardWeight: number
  salesWeight: number
  closingWeight: number
}

export type StockDayLineKind = 'inward' | 'sales'

export interface StockDayLine {
  kind: StockDayLineKind
  documentId: number
  documentNo: string
  documentDate: string
  productName: string | null
  qty: number
  netWeight: number
  weightTotal: number
}

export interface StockDayLinesInput {
  stockDate: string
  metal: string
  itemName: string
  kind: StockDayLineKind
}

export type MetalDayClosingStatus = 'open' | 'closed'

export interface MetalDayClosingSheet {
  businessDate: string
  metal: string
  status: MetalDayClosingStatus
  operatorName: string
  note: string
  closedAt: string | null
  rows: ItemStockRow[]
  pieceRows: MetalDayPieceRow[]
}

export interface MetalDayPieceRow {
  productId: number
  productName: string
  qtyIn: number
  qtyOut: number
  netQty: number
}

export interface MetalDayClosingHistoryRow {
  businessDate: string
  metal: string
  status: MetalDayClosingStatus
  operatorName: string
  closedAt: string | null
  openingWeight: number
  inwardWeight: number
  salesWeight: number
  closingWeight: number
}

export interface MetalDayCloseInput {
  businessDate: string
  metal: string
  operatorName: string
  note?: string
}

export interface MetalDayReopenInput {
  businessDate: string
  metal: string
  reason: string
}

export type StockMovementType =
  | 'opening'
  | 'purchase'
  | 'sale'
  | 'sales_return'
  | 'purchase_return'
  | 'adjustment'
  | 'damaged'
  | 'lost'
  | 'transfer_out'
  | 'transfer_in'
  | 'exchange_in'
  | 'stocktake_adjustment'

export interface StockMovement {
  id: number
  movementDate: string
  movementType: StockMovementType
  productId: number | null
  qtyDelta: number
  weightDelta: number
  metal: string
  category: string
  referenceType: string | null
  referenceId: number | null
  operatorId: number | null
  reason: string
  note: string
  createdAt: string
}

export interface StockReconciliationRow {
  metal: string
  category: string
  ledgerClosing: number
  pieceImpliedWeight: number
  rawMetalInward: number
  expectedDelta: number
  actualDelta: number
  unexplained: number
  flagged: boolean
}

export interface DayClosePrecheck {
  businessDate: string
  metal: string
  openDrafts: number
  openInwards: number
  unpaidDues: number
}

export interface StockAdjustmentLine {
  id: number
  adjustmentId: number
  productId: number | null
  metal: string
  category: string
  qtyDelta: number
  weightDelta: number
  reason: string
}

export interface StockAdjustment {
  id: number
  adjustmentDate: string
  reason: string
  note: string
  operatorId: number | null
  createdAt: string
  lines: StockAdjustmentLine[]
}

export interface StockAdjustmentLineInput {
  productId?: number | null
  metal: string
  category: string
  qtyDelta: number
  weightDelta: number
  reason?: string
}

export interface StockAdjustmentInput {
  adjustmentDate: string
  reason: string
  note?: string
  lines: StockAdjustmentLineInput[]
}

export type StocktakeStatus = 'open' | 'posted'

export interface StocktakeLine {
  id: number
  stocktakeId: number
  itemName: string
  countedWeight: number | null
  ledgerWeight: number
  variance: number
  productId: number | null
  countedQty: number | null
  ledgerQty: number
  qtyVariance: number
}

export interface Stocktake {
  id: number
  businessDate: string
  metal: string
  status: StocktakeStatus
  operatorName: string
  note: string
  createdAt: string
  postedAt: string | null
  lines: StocktakeLine[]
}

export interface StocktakeCreateInput {
  businessDate: string
  metal: string
  operatorName: string
  note?: string
}

export interface StocktakeLineUpdateItem {
  id: number
  countedWeight?: number | null
  countedQty?: number | null
  productId?: number | null
}

export interface StocktakeLineUpdateInput {
  lines: StocktakeLineUpdateItem[]
}

export interface Supplier {
  id: number
  name: string
  phone: string
  address: string
  notes: string
  gstin: string
  createdAt: string
}

export interface SupplierInput {
  name: string
  phone: string
  address: string
  notes: string
  gstin?: string
}

export type InwardStatus = 'draft' | 'final'
export type PurchasePaymentMode = Extract<PaymentMode, 'cash' | 'upi' | 'card'>

export interface InwardItem {
  id: number
  inwardId: number
  productId: number | null
  productName: string | null
  metal: string
  category: string
  purity: string
  qty: number
  grossWeight: number
  netWeight: number
  rate: number
  makingCharges: number
  hsnCode: string
  lineTotal: number
}

export interface InwardItemInput {
  productId?: number | null
  metal: string
  category: string
  purity: string
  qty: number
  grossWeight?: number
  netWeight: number
  rate: number
  makingCharges?: number
  hsnCode?: string
}

export interface Inward {
  id: number
  supplierId: number
  supplierName: string
  supplierPhone: string
  supplierAddress: string
  supplierGstin: string
  inwardNo: string
  inwardDate: string
  status: InwardStatus
  paymentMode: PurchasePaymentMode
  subtotal: number
  cgst: number
  sgst: number
  igst: number
  roundOff: number
  total: number
  notes: string
  createdAt: string
  finalizedAt: string | null
  items: InwardItem[]
}

export interface InwardInput {
  supplierId: number
  inwardDate: string
  notes?: string
  paymentMode?: PurchasePaymentMode
  roundOff?: number
  items: InwardItemInput[]
}

export interface InwardUpdateInput extends InwardInput {
  id: number
}

export type DayClosingStatus = 'open' | 'closed'

export interface DayClosingSheet {
  businessDate: string
  status: DayClosingStatus
  openingCash: number
  cashSales: number
  upiSales: number
  cardSales: number
  mixedSales: number
  dueCollection: number
  expectedCash: number
  actualCash: number | null
  difference: number | null
  operatorName: string | null
  note: string
  closedAt: string | null
  draftCount: number
}

export interface DayClosingHistoryRow {
  businessDate: string
  expectedCash: number
  actualCash: number
  difference: number
  operatorName: string
}

export interface DayClosingSetOpeningInput {
  businessDate: string
  openingCash: number
}

export interface DayClosingCloseInput {
  businessDate: string
  actualCash: number
  operatorName: string
  note?: string
}

export type PledgeStatus = 'draft' | 'active' | 'redeemed' | 'forfeited'

export interface PledgeItem {
  id: number
  pledgeId: number
  description: string
  identification: string
  metal: string
  purity: string
  grossWeight: number
  stoneWeight: number
  netWeight: number
  pieces: number
}

export interface PledgeItemInput {
  description: string
  identification?: string
  metal: string
  purity: string
  grossWeight: number
  stoneWeight?: number
  netWeight: number
  pieces: number
}

export interface Pledge {
  id: number
  customerId: number
  customerName: string
  customerPhone: string
  customerAddress: string
  guardianName: string
  receiptNo: string
  pledgeDate: string
  pledgeType: string
  assessedValue: number
  loanAmount: number
  charges: number
  interestPct: number
  repaymentDueDate: string | null
  status: PledgeStatus
  redeemedDate: string | null
  amountCollected: number
  notes: string
  createdAt: string
  items: PledgeItem[]
  topups: PledgeTopup[]
}

export interface PledgeTopup {
  id: number
  pledgeId: number
  topupDate: string
  amount: number
  interestPct: number
  note: string
  createdAt: string
}

export interface PledgeTopupInput {
  pledgeId: number
  topupDate: string
  amount: number
  note?: string
}

export interface PledgeInput {
  customerId: number
  pledgeDate: string
  pledgeType?: string
  guardianName?: string
  customerAddress?: string
  assessedValue: number
  loanAmount: number
  charges?: number
  interestPct: number
  repaymentDueDate?: string | null
  notes?: string
  items: PledgeItemInput[]
}

export interface PledgeUpdateInput extends PledgeInput {
  id: number
}

export interface PledgeRedeemInput {
  id: number
  redeemedDate: string
  amountCollected: number
}

export interface PledgeCollectInput {
  id: number
  collectedDate: string
  amount: number
}

export interface PledgeForfeitInput {
  id: number
  forfeitedDate: string
}
