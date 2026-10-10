import type { BillTemplateSettings, CashBillVisibility, TaxInvoiceVisibility, TemplatePreset } from './billTemplate'

export type { BillTemplateSettings, CashBillVisibility, TaxInvoiceVisibility, TemplatePreset } from './billTemplate'

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; referenceId?: string }

export interface PagedList<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

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

export type InvoiceStatus = 'draft' | 'final' | 'cancelled'
export type BillFormat = 'cash_bill' | 'tax_invoice'
export type PaymentMode = 'cash' | 'upi' | 'card' | 'mixed'
export type PaperSize = 'a5' | 'a4' | 'thermal'
export type PrinterRole = 'cash' | 'tax'
export type PrinterState = 'ready' | 'printing' | 'offline'
/** Diagonal stamp printed across a bill that is not a real, final sale. */
export type BillPrintWatermark = 'DRAFT' | 'ESTIMATE' | 'CANCELLED'

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
  huids: [] as string[],
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
  huids: string[]
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
  huids?: string[]
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
  idProofType: string
  createdAt: string
  lastBillDate?: string | null
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
  idProofType?: string
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
  /** Purity as sold, captured on the line so a reprint never changes. */
  purity: string
  /** Hallmark Unique ID chosen for this piece, empty when not tagged. */
  huid: string
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
  purity?: string
  huid?: string
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

export type OldGoldPurchaseStatus = 'draft' | 'final' | 'cancelled'

export type OldGoldPayoutMode = 'cash' | 'upi' | 'bank'

export interface OldGoldPurchaseItemInput {
  description?: string
  grossWeight: number
  stoneWeight?: number
  netWeight: number
  purity?: string
  ratePerGram: number
  deductionPct?: number
  /** Touch / assay percentage. 0 or omitted means the full net weight is valued. */
  touchPct?: number
  fineWeight?: number
  metal?: 'Gold' | 'Silver'
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
  touchPct: number
  fineWeight: number
  metal: string
  grossValue: number
  deductionAmount: number
  finalValue: number
}

/** A bill that drew part of a purchase's value. */
export interface OldGoldPurchaseBillLink {
  invoiceId: number
  invoiceNo: string
  invoiceDate: string
  invoiceStatus: string
  amount: number
}

export interface OldGoldPurchasePayout {
  id: number
  purchaseId: number
  payoutDate: string
  amount: number
  mode: OldGoldPayoutMode
  note: string
  invoiceId: number | null
  invoiceNo: string | null
  createdAt: string
  voidedAt: string | null
  voidReason: string
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
  cancelledAt: string | null
  cancelReason: string
  items: OldGoldPurchaseItem[]
  /** Amount already drawn by payouts and bill links. */
  paidOut: number
  applied: number
  /** totalAmount - paidOut - applied, never below zero. */
  balance: number
  links: OldGoldPurchaseBillLink[]
  payouts: OldGoldPurchasePayout[]
  /** First bill the purchase was applied to, kept for the list view. */
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

export interface OldGoldPurchaseCancelInput {
  reason: string
}

export interface OldGoldPayoutInput {
  payoutDate: string
  amount: number
  mode: OldGoldPayoutMode
  note?: string
  invoiceId?: number | null
}

export interface OldGoldPayoutVoidInput {
  reason: string
}

export interface OldGoldPurchaseLinkInput {
  purchaseId: number
  /** Rupees of the purchase to apply. Omitted means the full available balance. */
  amount?: number
}

export type OldGoldBatchStatus = 'open' | 'melted' | 'sent' | 'settled' | 'cancelled'

export type OldGoldSettlementMode = 'cash' | 'bank' | 'fine'

/** An unbatched (lot) or batched old gold purchase item. */
export interface OldGoldBatchItem {
  id: number
  purchaseId: number
  purchaseNo: string
  purchaseDate: string
  customerName: string
  description: string
  metal: string
  grossWeight: number
  netWeight: number
  purity: string
  fineWeight: number
  finalValue: number
  batchId: number | null
}

export interface OldGoldBatch {
  id: number
  batchNo: string
  metal: string
  status: OldGoldBatchStatus
  supplierId: number | null
  supplierName: string
  createdDate: string
  grossWeight: number
  fineWeightExpected: number
  costAmount: number
  meltDate: string | null
  meltedWeight: number | null
  sentDate: string | null
  sentWeight: number | null
  settledDate: string | null
  fineWeightReceived: number | null
  fineRate: number | null
  cashReceived: number | null
  settlementMode: OldGoldSettlementMode
  notes: string
  cancelledAt: string | null
  cancelReason: string
  createdAt: string
  items: OldGoldBatchItem[]
  /** cashReceived + fineWeightReceived * fineRate - costAmount. */
  gainLoss: number
}

export interface OldGoldLotGroup {
  metal: string
  items: number
  grossWeight: number
  netWeight: number
  fineWeight: number
  costAmount: number
}

/** Items of finalized purchases that are not in a batch yet, grouped by metal. */
export interface OldGoldLot {
  groups: OldGoldLotGroup[]
  items: OldGoldBatchItem[]
}

export interface OldGoldBatchCreateInput {
  itemIds: number[]
  createdDate: string
  supplierId?: number | null
  notes?: string
}

export interface OldGoldBatchMeltInput {
  meltDate: string
  meltedWeight: number
  notes?: string
}

export interface OldGoldBatchSendInput {
  sentDate: string
  sentWeight: number
  notes?: string
}

export interface OldGoldBatchSettleInput {
  settledDate: string
  fineWeightReceived: number
  fineRate: number
  cashReceived: number
  settlementMode?: OldGoldSettlementMode
  notes?: string
}

export interface OldGoldBatchCancelInput {
  reason: string
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
  /** Full value of the purchase, for showing how much is used. */
  purchaseTotal: number
  /** Value left on the purchase after this bill's link and any payout. */
  balance: number
}

export interface MixedPaymentPart {
  mode: Extract<PaymentMode, 'cash' | 'upi' | 'card'>
  amount: number
}

/** A gold savings account applied as a credit on a sale bill. */
export interface GoldSavingInvoiceLinkInput {
  accountId: number
}

export interface GoldSavingInvoiceLink {
  id: number
  invoiceId: number
  accountId: number
  accountNo: string
  customerName: string
  goldWeight: number
  bonusGoldWeight: number
  goldRate: number
  amountApplied: number
  redemptionId: number | null
}

/** A redeemable scheme account shown on the sale bill before it is applied. */
export interface GoldSavingSchemeCreditPreview {
  accountId: number
  accountNo: string
  customerName: string
  schemeName: string
  purity: string
  accumulatedGold: number
  bonusGoldWeight: number
  goldWeight: number
  goldRate: number
  credit: number
  allowPartialRedemption: boolean
  /** Effective date of the rate used for this preview. */
  rateDate: string
  /** True when the rate on file is not dated the bill date. */
  rateStale: boolean
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
  itemCount?: number
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
  goldSavingLinks: GoldSavingInvoiceLink[]
  roundOff: number
  amountPayable: number
  payments: InvoicePayment[]
  /** Customer details captured at finalize; null on drafts and legacy rows. */
  customerSnapshot?: BillCustomerInfo | null
  /** Metal rates captured at finalize; null on drafts and legacy rows. */
  ratesSnapshot?: MetalRates | null
  /** When the whole bill was cancelled, and by whom. */
  cancelledAt?: string | null
  cancelReason?: string
  cancelledBy?: number | null
}

export interface InvoiceCancelInput {
  reason: string
}

/** Customer details as they appeared on the bill when it was finalized. */
export interface BillCustomerInfo {
  name: string
  phone: string
  address: string
  gstin: string
}

export interface InvoiceListQuery {
  page?: number
  pageSize?: number
  from?: string | null
  to?: string | null
  q?: string
  format?: BillFormat | 'all'
  status?: string
  paymentMode?: PaymentMode | 'all'
  duePaid?: 'all' | 'due' | 'paid'
  sort?: 'asc' | 'desc'
  customerId?: number
}

export interface InvoiceListStats {
  sales: number
  collections: number
  draftCount: number
  billsGenerated: number
  customersBilled: number
  totalItemsSold: number
  chart: Array<{ key: string; total: number }>
  collectionsChart: Array<{ key: string; total: number }>
}

export interface PledgeListQuery {
  page?: number
  pageSize?: number
  from?: string | null
  to?: string | null
  q?: string
  status?: string
  sort?: 'asc' | 'desc'
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
  goldSavingLinks?: GoldSavingInvoiceLinkInput[]
  acceptRateDate?: boolean
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
  goldSavingLinks?: GoldSavingInvoiceLinkInput[]
  acceptRateDate?: boolean
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
  passbookBannerPath: string
  passbookSideImagePath: string
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
  adaguAuctionNoticeDays: number
  adaguRequireKyc: boolean
  adaguReminderTemplate: string
  pawnbrokerLicenseNo: string
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
  /** Buying rates for old gold. Zero or unset falls back to the matching selling rate. */
  gold22kBuy?: number
  gold24kBuy?: number
  gold20kBuy?: number
  gold18kBuy?: number
  silverFineBuy?: number
  silver925Buy?: number
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
  gold22kBuy?: number
  gold24kBuy?: number
  gold20kBuy?: number
  gold18kBuy?: number
  silverFineBuy?: number
  silver925Buy?: number
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
  mode?: PledgePaymentMode
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
  principalOutstanding: number
  interestPct: number
  monthlyInterest: number
  daysActive: number
  interestDue: number
  interestPaidUpto: string
  nextInterestDue: string
  isInterestOverdue: boolean
  totalDue: number
  amountCollected: number
  remaining: number
  status: PledgeStatus
  auctionNoticeDate?: string | null
  auctionDate?: string | null
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

export interface RecordCounts {
  products: number
  customers: number
}

export interface BackupStatus {
  lastBackupAt: string | null
  frequency: 'daily' | 'weekly'
  time: string
  nextBackupAt: string | null
  offsiteDir: string
  lastOffsiteAt: string | null
  lastOffsiteError: string | null
}

export type BackupKind = 'daily' | 'manual' | 'dayclose' | 'prerestore' | 'premigrate'

export interface BackupFile {
  name: string
  createdAt: string
  sizeBytes: number
  kind: BackupKind
}

export interface BackupInspection {
  name: string
  schemaVersion: number
  appSchemaVersion: number
  restorable: boolean
  latestInvoiceAt: string | null
  counts: {
    customers: number
    invoices: number
    pledges: number
    products: number
    goldSavingAccounts: number
  }
  issues: string[]
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
  | 'gold_savings'

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
  'gold_savings',
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

export interface MetalDayCloseResult extends MetalDayClosingSheet {
  backupSaved: boolean
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
  huids?: string[]
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
  huids: string[]
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
  huids?: string[]
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

export type PledgeStatus = 'draft' | 'active' | 'redeemed' | 'forfeited' | 'renewed'

export type PledgePaymentKind =
  | 'interest'
  | 'part'
  | 'redeem'
  | 'renewal'
  | 'transfer'
  | 'auction'
  | 'legacy'

export type PledgePaymentMode =
  | 'cash'
  | 'upi'
  | 'card'
  | 'bank_transfer'
  | 'transfer'
  | 'auction'

export interface PledgePayment {
  id: number
  pledgeId: number
  paymentDate: string
  kind: PledgePaymentKind
  mode: PledgePaymentMode
  amount: number
  interestPart: number
  principalPart: number
  discount: number
  note: string
  createdAt: string
}

/** Replayed interest state of a pledge at a given date. */
export interface PledgePayoff {
  asOfDate: string
  principalOutstanding: number
  assessedInterest: number
  currentInterest: number
  interestCredit: number
  interestDue: number
  totalDiscount: number
  grossDue: number
  payoff: number
  daysActive: number
  interestPaidUpto: string
  nextInterestDue: string
  isInterestOverdue: boolean
  monthlyInterest: number
}

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
  ratePerGram: number
  itemValue: number
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
  ratePerGram?: number
  itemValue?: number
}

export type PledgePhotoKind = 'item' | 'customer' | 'id_proof'

export interface PledgePhoto {
  id: number
  pledgeId: number
  kind: PledgePhotoKind
  path: string
  createdAt: string
}

export interface PledgeReminder {
  id: number
  pledgeId: number
  kind: string
  channel: string
  sentAt: string
}

/** Why a loan appears in the reminder list. */
export type PledgeReminderReason =
  | 'interest_due'
  | 'interest_overdue'
  | 'maturity'
  | 'auction_notice'
  | 'auction_due'

export interface PledgeReminderEntry {
  pledgeId: number
  receiptNo: string
  customerId: number
  customerName: string
  customerPhone: string
  status: PledgeStatus
  reason: PledgeReminderReason
  /** The date that drives the reminder (next interest due or repayment due). */
  dueDate: string | null
  /** Negative when the date is already in the past. */
  daysUntil: number
  interestDue: number
  principalOutstanding: number
  totalDue: number
  nextInterestDue: string
  isInterestOverdue: boolean
  lastRemindedAt: string | null
  /** Ready-to-open WhatsApp link built from the shop reminder template. */
  whatsappUrl: string | null
}

export interface PledgeWhatsAppOpenInput {
  pledgeId: number
  url: string
  kind?: string
}

export interface Pledge {
  id: number
  customerId: number
  customerName: string
  customerPhone: string
  customerAddress: string
  guardianName: string
  /** Borrower KYC, echoed for printing (Aadhaar is masked on the print). */
  customerAadhaar?: string
  customerPan?: string
  customerIdProofType?: string
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
  renewedFromId: number | null
  renewedToId: number | null
  renewedFromReceiptNo?: string
  renewedToReceiptNo?: string
  createdAt: string
  items: PledgeItem[]
  itemCount?: number
  topups: PledgeTopup[]
  payments: PledgePayment[]
  photos: PledgePhoto[]
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
  allowAboveLtv?: boolean
}

export interface PledgeUpdateInput extends PledgeInput {
  id: number
}

export interface PledgeRedeemInput {
  id: number
  redeemedDate: string
  amountCollected: number
  discount?: number
  mode?: PledgePaymentMode
}

export interface PledgeCollectInput {
  id: number
  collectedDate: string
  amount: number
  mode?: PledgePaymentMode
}

export interface PledgeForfeitInput {
  id: number
  forfeitedDate: string
}

export interface PledgeRenewInput {
  id: number
  renewDate: string
  mode?: PledgePaymentMode
  newLoanAmount?: number
  note?: string
}

export type PledgeAuctionBuyerType = 'outside' | 'shop'

export interface PledgeAuctionItemCategory {
  pledgeItemId: number
  category: string
}

export interface PledgeAuction {
  id: number
  pledgeId: number
  noticeDate: string
  auctionDate: string | null
  buyerType: PledgeAuctionBuyerType | null
  buyerName: string
  saleAmount: number
  payoffAtAuction: number
  surplusAmount: number
  surplusPaidDate: string | null
  surplusMode: PledgePaymentMode | null
  shortfallAmount: number
  shortfallWrittenOff: boolean
  note: string
  /** Days of notice required before an auction (today's shop setting). */
  noticeDays: number
  /** Last date on which the auction may be recorded (noticeDate + noticeDays). */
  auctionEligibleDate: string
}

export interface PledgeAuctionNoticeInput {
  id: number
  noticeDate: string
}

export interface PledgeAuctionInput {
  id: number
  auctionDate: string
  buyerType: PledgeAuctionBuyerType
  buyerName?: string
  saleAmount: number
  writeOffShortfall?: boolean
  note?: string
  items?: PledgeAuctionItemCategory[]
}

export interface PledgeAuctionSurplusInput {
  id: number
  surplusPaidDate: string
  mode?: PledgePaymentMode
}

export type GoldSavingSchemeStatus = 'active' | 'inactive'
export type GoldSavingGoldRateSource = 'configured' | 'manual_allowed'
export type GoldSavingBonusType = 'none' | 'fixed_amount' | 'percentage' | 'additional_gold'
export type GoldSavingRedemptionType = 'gold' | 'jewellery' | 'configurable'
export type GoldSavingAccountStatus = 'active' | 'matured' | 'redeemed' | 'cancelled' | 'closed'
export type GoldSavingInstallmentStatus = 'upcoming' | 'due' | 'paid' | 'overdue' | 'waived'
export type GoldSavingPaymentStatus = 'posted' | 'reversed'
export type GoldSavingPaymentMode = 'cash' | 'upi' | 'card' | 'bank_transfer' | 'other'
export type GoldSavingLedgerType = 'payment' | 'reversal' | 'bonus' | 'redemption' | 'correction' | 'refund'
export type GoldSavingCancelDeductionType = 'none' | 'percentage' | 'fixed'
export type GoldSavingLateFeeType = 'none' | 'fixed' | 'per_day'
export type GoldSavingRedemptionKind = 'gold' | 'jewellery' | 'invoice'
export type GoldSavingReportId =
  | 'daily-collections'
  | 'monthly-collections'
  | 'customer-ledger'
  | 'scheme-performance'
  | 'active-schemes'
  | 'matured-schemes'
  | 'overdue-installments'
  | 'overdue-aging'
  | 'cancelled-schemes'
  | 'gold-accumulation'
  | 'redemption-history'
  | 'outstanding-obligations'

export interface GoldSavingScheme {
  id: number
  name: string
  code: string
  description: string
  monthlyAmount: number
  durationMonths: number
  minInstallment: number | null
  maxInstallment: number | null
  purity: string
  goldRateSource: GoldSavingGoldRateSource
  goldRateUnit: string
  bonusType: GoldSavingBonusType
  bonusValue: number
  bonusEligibility: string
  allowLatePayments: boolean
  gracePeriodDays: number
  allowMissedInstallments: boolean
  allowEarlyClosure: boolean
  allowPartialRedemption: boolean
  allowMultipleAccounts: boolean
  redemptionType: GoldSavingRedemptionType
  makingChargeRules: string
  wastageRules: string
  availableFrom: string | null
  availableTo: string | null
  terms: string
  status: GoldSavingSchemeStatus
  cancelDeductionType: GoldSavingCancelDeductionType
  cancelDeductionValue: number
  lateFeeType: GoldSavingLateFeeType
  lateFeeValue: number
  createdAt: string
  updatedAt: string
}

export interface GoldSavingSchemeInput {
  name: string
  description?: string
  monthlyAmount: number
  durationMonths: number
  minInstallment?: number | null
  maxInstallment?: number | null
  purity: string
  goldRateSource: GoldSavingGoldRateSource
  bonusType: GoldSavingBonusType
  bonusValue?: number
  bonusEligibility?: string
  allowLatePayments?: boolean
  gracePeriodDays?: number
  allowMissedInstallments?: boolean
  allowEarlyClosure?: boolean
  allowPartialRedemption?: boolean
  allowMultipleAccounts?: boolean
  redemptionType: GoldSavingRedemptionType
  makingChargeRules?: string
  wastageRules?: string
  availableFrom?: string | null
  availableTo?: string | null
  terms?: string
  status?: GoldSavingSchemeStatus
  cancelDeductionType?: GoldSavingCancelDeductionType
  cancelDeductionValue?: number
  lateFeeType?: GoldSavingLateFeeType
  lateFeeValue?: number
}

export interface GoldSavingRefund {
  id: number
  accountId: number
  accountNo: string
  customerId: number
  customerName: string
  customerPhone: string
  schemeName: string
  durationMonths: number
  voucherNo: string
  refundDate: string
  totalPaid: number
  deduction: number
  refundAmount: number
  paymentMode: GoldSavingPaymentMode
  transactionRef: string
  goldForfeited: number
  reason: string
  createdAt: string
}

export interface GoldSavingCancelInput {
  reason: string
  refundDate?: string
  paymentMode?: GoldSavingPaymentMode
  transactionRef?: string
  deductionOverride?: number
}

export interface GoldSavingAccount {
  id: number
  accountNo: string
  customerId: number
  customerName: string
  customerPhone: string
  customerAddress: string
  schemeId: number
  schemeName: string
  schemeCode: string
  monthlyAmount: number
  durationMonths: number
  purity: string
  enrollmentDate: string
  firstInstallmentDate: string
  maturityDate: string
  preferredPaymentDay: number | null
  nomineeName: string
  nomineeRelationship: string
  nomineePhone: string
  termsAccepted: boolean
  status: GoldSavingAccountStatus
  closedAt: string | null
  paidInstallments: number
  pendingInstallments: number
  totalPaid: number
  goldAccumulated: number
  nextDueDate: string | null
  createdAt: string
}

export interface GoldSavingInitialPaymentInput {
  amount: number
  paymentDate: string
  paymentMode: GoldSavingPaymentMode
  transactionRef?: string
  goldRate?: number
  goldRateOverrideReason?: string
  acceptRateDate?: boolean
  remarks?: string
  idempotencyKey?: string
}

export interface GoldSavingAccountInput {
  customerId: number
  schemeId: number
  monthlyAmount?: number
  enrollmentDate: string
  firstInstallmentDate: string
  preferredPaymentDay?: number | null
  nomineeName?: string
  nomineeRelationship?: string
  nomineePhone?: string
  termsAccepted: boolean
  acceptRateDate?: boolean
  initialPayment?: GoldSavingInitialPaymentInput
}

export interface GoldSavingInstallment {
  id: number
  accountId: number
  installmentNo: number
  dueDate: string
  amount: number
  status: GoldSavingInstallmentStatus
  paidAt: string | null
}

export interface GoldSavingPayment {
  id: number
  accountId: number
  accountNo: string
  customerId: number
  customerName: string
  customerPhone: string
  schemeName: string
  durationMonths: number
  installmentId: number | null
  receiptNo: string
  installmentNo: number
  paymentDate: string
  dueDate: string
  amount: number
  lateFee: number
  discount: number
  totalReceived: number
  goldRate: number
  goldWeight: number
  goldRateSource: string
  goldRateOverrideReason: string
  purity: string
  paymentMode: GoldSavingPaymentMode
  transactionRef: string
  remarks: string
  status: GoldSavingPaymentStatus
  /** Shared by every payment written in one multi-installment collection. */
  batchNo: string
  /** Sibling payments of the same batch, present only when the batch has more than one row. */
  batchPayments?: GoldSavingPayment[]
  createdAt: string
  totalPaidToDate: number
  goldAccumulatedToDate: number
}

export interface GoldSavingPaymentInput {
  accountId: number
  installmentId?: number
  /** How many installments to collect in order, starting at `installmentId` or the next unpaid one. */
  installmentCount?: number
  paymentDate: string
  amount: number
  lateFee?: number
  discount?: number
  paymentMode: GoldSavingPaymentMode
  transactionRef?: string
  goldRate?: number
  goldRateOverrideReason?: string
  acceptRateDate?: boolean
  remarks?: string
  idempotencyKey?: string
}

/** Gold rate that applies on a requested date, with its effective date. */
export interface GoldSavingRate {
  rate: number
  effectiveDate: string
  /** True when a rate row exists exactly on the requested date. */
  matchesDate: boolean
  purity: string
}

export interface GoldSavingLedgerEntry {
  id: number
  accountId: number
  entryDate: string
  entryType: GoldSavingLedgerType
  paymentId: number | null
  redemptionId: number | null
  receiptNo: string
  installmentNo: number | null
  amount: number
  goldRate: number
  goldWeight: number
  cumulativeGold: number
  paymentMode: string
  paymentStatus: string
  txnRef: string
  notes: string
  createdAt: string
}

export interface GoldSavingRedemption {
  id: number
  accountId: number
  accountNo: string
  customerName: string
  receiptNo: string
  redemptionDate: string
  redemptionKind: GoldSavingRedemptionKind
  goldWeight: number
  bonusGoldWeight: number
  invoiceId: number | null
  invoiceNo: string
  makingCharges: number
  wastage: number
  taxes: number
  invoiceValue: number
  remainingGold: number
  closesAccount: boolean
  notes: string
  createdAt: string
}

export interface GoldSavingRedemptionInput {
  accountId: number
  redemptionDate: string
  redemptionKind: GoldSavingRedemptionKind
  goldWeight?: number
  invoiceId?: number | null
  makingCharges?: number
  wastage?: number
  taxes?: number
  invoiceValue?: number
  notes?: string
}

export interface GoldSavingAuditLog {
  id: number
  entityType: string
  entityId: number
  action: string
  changedBy: number | null
  beforeJson: string
  afterJson: string
  createdAt: string
}

export interface GoldSavingAccountDetail {
  account: GoldSavingAccount
  scheme: GoldSavingScheme
  installments: GoldSavingInstallment[]
  payments: GoldSavingPayment[]
  ledger: GoldSavingLedgerEntry[]
  redemptions: GoldSavingRedemption[]
  refund: GoldSavingRefund | null
  audit: GoldSavingAuditLog[]
}

export interface GoldSavingDashboardChartPoint {
  key: string
  label: string
  amount: number
}

export interface GoldSavingAgingBucket {
  bucket: string
  count: number
  amount: number
}

export interface GoldSavingMaturityPipelineBucket {
  bucket: string
  count: number
  gold: number
}

export interface GoldSavingDashboard {
  activeSchemes: number
  enrolledCustomers: number
  todayCollections: number
  monthCollections: number
  monthTarget: number
  totalCollected: number
  totalGold: number
  upcomingMaturities: number
  overdueInstallments: number
  overdueAging: GoldSavingAgingBucket[]
  maturityPipeline: GoldSavingMaturityPipelineBucket[]
  monthlyChart: GoldSavingDashboardChartPoint[]
  schemeEnrollments: { schemeName: string; count: number }[]
  upcomingDues: GoldSavingAccount[]
  recentCollections: GoldSavingPayment[]
  recentEnrollments: GoldSavingAccount[]
  maturingAccounts: GoldSavingAccount[]
}

export interface GoldSavingReportResult {
  id: GoldSavingReportId
  title: string
  generatedAt: string
  columns: string[]
  rows: Array<Record<string, string | number>>
}

export interface GoldSavingPassbook {
  account: GoldSavingAccount
  scheme: GoldSavingScheme
  rows: GoldSavingLedgerEntry[]
}
