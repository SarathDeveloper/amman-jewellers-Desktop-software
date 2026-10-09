import type {
  AppInfo,
  AuthUser,
  BackupFile,
  BackupInspection,
  BackupStatus,
  BillFormat,
  ChangePasswordInput,
  CreateUserInput,
  Customer,
  CustomerInput,
  DueEntry,
  DueEntryInput,
  DueEntryUpdateInput,
  DuePaymentInput,
  DuesLedger,
  HistoricalInvoiceInput,
  Invoice,
  InvoiceCancelInput,
  InvoiceInput,
  InvoiceListQuery,
  InvoiceListStats,
  InvoicePaymentInput,
  InvoiceUpdateInput,
  ItemStockListInput,
  ItemStockRow,
  ItemStockUpsertInput,
  LoginInput,
  MetalRates,
  MetalRatesInput,
  OldGoldBatch,
  OldGoldBatchCancelInput,
  OldGoldBatchCreateInput,
  OldGoldBatchMeltInput,
  OldGoldBatchSendInput,
  OldGoldBatchSettleInput,
  OldGoldLot,
  OldGoldPayoutInput,
  OldGoldPurchase,
  OldGoldPurchaseInput,
  OldGoldPurchaseUpdateInput,
  PagedList,
  Pledge,
  PledgeAuction,
  PledgeAuctionInput,
  PledgeAuctionNoticeInput,
  PledgeAuctionSurplusInput,
  PledgeCollectInput,
  PledgeForfeitInput,
  PledgeInput,
  PledgeListQuery,
  PledgePayment,
  PledgePayoff,
  PledgePhoto,
  PledgePhotoKind,
  PledgeRedeemInput,
  PledgeReminderEntry,
  PledgeRenewInput,
  PledgeTopup,
  PledgeTopupInput,
  PledgeUpdateInput,
  PledgeWhatsAppOpenInput,
  Product,
  ProductInput,
  ResetPasswordInput,
  RecordCounts,
  ShopSettings,
  StockCategory,
  StockCategoryCreateInput,
  StockCategoryUpdateInput,
  StockClearOverridesInput,
  StockDayLine,
  StockDayLinesInput,
  StockHistoryInput,
  StockHistoryRow,
  Supplier,
  SupplierInput,
  TaxReportRow,
  UpdatePermissionsInput,
  User,
  Inward,
  InwardInput,
  InwardUpdateInput,
  MetalDayCloseInput,
  MetalDayCloseResult,
  MetalDayClosingHistoryRow,
  MetalDayClosingSheet,
  MetalDayReopenInput,
  DayClosePrecheck,
  StockReconciliationRow,
  StockAdjustment,
  StockAdjustmentInput,
  GoldSavingAccount,
  GoldSavingAccountDetail,
  GoldSavingAccountInput,
  GoldSavingAuditLog,
  GoldSavingCancelInput,
  GoldSavingDashboard,
  GoldSavingLedgerEntry,
  GoldSavingPassbook,
  GoldSavingPayment,
  GoldSavingPaymentInput,
  GoldSavingRate,
  GoldSavingRedemption,
  GoldSavingRedemptionInput,
  GoldSavingRefund,
  GoldSavingReportId,
  GoldSavingReportResult,
  GoldSavingScheme,
  GoldSavingSchemeCreditPreview,
  GoldSavingSchemeInput,
} from '@shared/types'
import type { ReportDefinition, ReportId, ReportLookups, ReportResult } from '@shared/reportsCatalog'
import { downscaleImageFile } from './downscaleImage'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: {
        ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...init?.headers,
      },
    })
  } catch {
    throw new Error(
      'Cannot reach the API. Run `npm run dev` and confirm the server is listening on port 3000.',
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  const contentType = response.headers.get('content-type') ?? ''
  const isJson = contentType.includes('application/json')
  const payload = isJson ? await response.json() : await response.text()

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload && 'error' in payload
        ? String((payload as { error: string }).error)
        : typeof payload === 'string' && payload
          ? payload
          : `Request failed (${response.status})`
    throw new Error(message)
  }

  return payload as T
}

function asPaged<T>(payload: unknown): PagedList<T> {
  if (Array.isArray(payload)) {
    return { items: payload, total: payload.length, page: 1, pageSize: payload.length }
  }
  const page = payload && typeof payload === 'object' ? (payload as Partial<PagedList<T>>) : {}
  const items = Array.isArray(page.items) ? page.items : []
  return {
    items,
    total: typeof page.total === 'number' ? page.total : items.length,
    page: typeof page.page === 'number' ? page.page : 1,
    pageSize: typeof page.pageSize === 'number' ? page.pageSize : items.length,
  }
}

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, String(value))
  }
  const encoded = search.toString()
  return encoded ? `?${encoded}` : ''
}

export const api = {
  getVersion: () => request<AppInfo>('/api/version'),

  login: (input: LoginInput) =>
    request<AuthUser>('/api/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  me: () => request<AuthUser>('/api/auth/me'),
  changePassword: (input: ChangePasswordInput) =>
    request<AuthUser>('/api/auth/change-password', { method: 'POST', body: JSON.stringify(input) }),

  listUsers: () => request<User[]>('/api/users'),
  createUser: (input: CreateUserInput) =>
    request<User>('/api/users', { method: 'POST', body: JSON.stringify(input) }),
  updateUserPermissions: (id: number, input: UpdatePermissionsInput) =>
    request<User>(`/api/users/${id}/permissions`, { method: 'PUT', body: JSON.stringify(input) }),
  resetUserPassword: (id: number, input: ResetPasswordInput) =>
    request<User>(`/api/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify(input) }),
  deleteUser: (id: number) => request<void>(`/api/users/${id}`, { method: 'DELETE' }),

  listProducts: (search?: string, parentId?: number) =>
    request<Product[]>(
      `/api/products${qs({ q: search, parentId: parentId != null ? String(parentId) : undefined })}`,
    ),
  listProductVariants: (id: number) => request<Product[]>(`/api/products/${id}/variants`),
  listProductCategories: () => request<StockCategory[]>('/api/products/categories'),
  getProduct: (id: number) => request<Product>(`/api/products/${id}`),
  createProduct: (input: ProductInput) =>
    request<Product>('/api/products', { method: 'POST', body: JSON.stringify(input) }),
  updateProduct: (id: number, input: ProductInput) =>
    request<Product>(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteProduct: (id: number) => request<void>(`/api/products/${id}`, { method: 'DELETE' }),

  listItemStock: (input: ItemStockListInput) =>
    request<ItemStockRow[]>(`/api/stock${qs({ stockDate: input.stockDate, metal: input.metal })}`),
  upsertItemStock: (input: ItemStockUpsertInput) =>
    request<ItemStockRow>('/api/stock', { method: 'POST', body: JSON.stringify(input) }),
  listStockCategories: () => request<StockCategory[]>('/api/stock/categories'),
  getDayClosePrecheck: (businessDate: string, metal: string) =>
    request<DayClosePrecheck>(`/api/stock/day-closings/precheck${qs({ businessDate, metal })}`),
  getStockReconciliation: (date: string) =>
    request<StockReconciliationRow[]>(`/api/stock/reconciliation${qs({ date })}`),
  createStockCategory: (input: StockCategoryCreateInput) =>
    request<StockCategory>('/api/stock/categories', { method: 'POST', body: JSON.stringify(input) }),
  updateStockCategory: (input: StockCategoryUpdateInput) =>
    request<StockCategory>('/api/stock/categories', { method: 'PUT', body: JSON.stringify(input) }),
  deleteStockCategory: (name: string) =>
    request<void>('/api/stock/categories', { method: 'DELETE', body: JSON.stringify({ name }) }),
  clearStockSalesOverrides: (input: StockClearOverridesInput) =>
    request<ItemStockRow[]>('/api/stock/clear-overrides', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  listStockHistory: (input: StockHistoryInput) =>
    request<StockHistoryRow[]>(`/api/stock/history${qs({ metal: input.metal })}`),
  listStockDayLines: (input: StockDayLinesInput) =>
    request<StockDayLine[]>(
      `/api/stock/day-lines${qs({
        stockDate: input.stockDate,
        metal: input.metal,
        itemName: input.itemName,
        kind: input.kind,
      })}`,
    ),
  getMetalDayClosing: (businessDate: string, metal: string) =>
    request<MetalDayClosingSheet>(
      `/api/stock/day-closings${qs({ businessDate, metal })}`,
    ),
  listMetalDayClosingHistory: (metal?: string) =>
    request<MetalDayClosingHistoryRow[]>(
      `/api/stock/day-closings/history${qs({ metal })}`,
    ),
  closeMetalDay: (input: MetalDayCloseInput) =>
    request<MetalDayCloseResult>('/api/stock/day-closings/close', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  reopenMetalDay: (input: MetalDayReopenInput) =>
    request<MetalDayClosingSheet>('/api/stock/day-closings/reopen', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  createStockAdjustment: (input: StockAdjustmentInput) =>
    request<StockAdjustment>('/api/stock/adjustments', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  listCustomers: (search?: string) => request<Customer[]>(`/api/customers${qs({ q: search })}`),
  getCustomer: (id: number) => request<Customer>(`/api/customers/${id}`),
  createCustomer: (input: CustomerInput) =>
    request<Customer>('/api/customers', { method: 'POST', body: JSON.stringify(input) }),
  updateCustomer: (id: number, input: CustomerInput) =>
    request<Customer>(`/api/customers/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteCustomer: (id: number) => request<void>(`/api/customers/${id}`, { method: 'DELETE' }),

  listSuppliers: (search?: string) => request<Supplier[]>(`/api/suppliers${qs({ q: search })}`),
  getSupplier: (id: number) => request<Supplier>(`/api/suppliers/${id}`),
  createSupplier: (input: SupplierInput) =>
    request<Supplier>('/api/suppliers', { method: 'POST', body: JSON.stringify(input) }),
  updateSupplier: (id: number, input: SupplierInput) =>
    request<Supplier>(`/api/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteSupplier: (id: number) => request<void>(`/api/suppliers/${id}`, { method: 'DELETE' }),

  listInwards: () => request<Inward[]>('/api/inwards'),
  getInward: (id: number) => request<Inward>(`/api/inwards/${id}`),
  createInward: (input: InwardInput) =>
    request<Inward>('/api/inwards', { method: 'POST', body: JSON.stringify(input) }),
  updateInward: (input: InwardUpdateInput) =>
    request<Inward>(`/api/inwards/${input.id}`, { method: 'PUT', body: JSON.stringify(input) }),
  finalizeInward: (id: number) =>
    request<Inward>(`/api/inwards/${id}/finalize`, { method: 'POST' }),
  deleteInward: (id: number) => request<void>(`/api/inwards/${id}`, { method: 'DELETE' }),

  listOldGoldPurchases: (params: {
    customerId?: number | null
    status?: string
    from?: string
    to?: string
    available?: boolean
  } = {}) =>
    request<OldGoldPurchase[]>(
      `/api/old-gold-purchases${qs({
        customerId: params.customerId ?? undefined,
        status: params.status,
        from: params.from,
        to: params.to,
        available: params.available ? 1 : undefined,
      })}`,
    ),
  getOldGoldPurchase: (id: number) => request<OldGoldPurchase>(`/api/old-gold-purchases/${id}`),
  getOldGoldPurchaseStats: (date: string) =>
    request<{
      date: string
      count: number
      amount: number
      netWeight: number
      paidOut: number
      openBalance: number
    }>(`/api/old-gold-purchases/stats${qs({ date })}`),
  getNextOldGoldPurchaseNo: (date?: string) =>
    request<{ purchaseNo: string }>(`/api/old-gold-purchases/next-purchase-no${qs({ date })}`),
  lookupOldGoldPurchaseByNo: (purchaseNo: string) =>
    request<OldGoldPurchase>(`/api/old-gold-purchases/by-no/${encodeURIComponent(purchaseNo)}`),
  createOldGoldPurchase: (input: OldGoldPurchaseInput) =>
    request<OldGoldPurchase>('/api/old-gold-purchases', { method: 'POST', body: JSON.stringify(input) }),
  updateOldGoldPurchase: (input: OldGoldPurchaseUpdateInput) =>
    request<OldGoldPurchase>(`/api/old-gold-purchases/${input.id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  finalizeOldGoldPurchase: (id: number) =>
    request<OldGoldPurchase>(`/api/old-gold-purchases/${id}/finalize`, { method: 'POST' }),
  createOldGoldPayout: (id: number, input: OldGoldPayoutInput) =>
    request<OldGoldPurchase>(`/api/old-gold-purchases/${id}/payouts`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  voidOldGoldPayout: (id: number, payoutId: number, reason: string) =>
    request<OldGoldPurchase>(`/api/old-gold-purchases/${id}/payouts/${payoutId}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  cancelOldGoldPurchase: (id: number, reason: string) =>
    request<OldGoldPurchase>(`/api/old-gold-purchases/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  deleteOldGoldPurchase: (id: number) =>
    request<void>(`/api/old-gold-purchases/${id}`, { method: 'DELETE' }),

  getOldGoldLot: () => request<OldGoldLot>('/api/old-gold-batches/lot'),
  listOldGoldBatches: (params: { status?: string; from?: string; to?: string } = {}) =>
    request<OldGoldBatch[]>(
      `/api/old-gold-batches${qs({ status: params.status, from: params.from, to: params.to })}`,
    ),
  getOldGoldBatch: (id: number) => request<OldGoldBatch>(`/api/old-gold-batches/${id}`),
  getNextOldGoldBatchNo: (date?: string) =>
    request<{ batchNo: string }>(`/api/old-gold-batches/next-batch-no${qs({ date })}`),
  createOldGoldBatch: (input: OldGoldBatchCreateInput) =>
    request<OldGoldBatch>('/api/old-gold-batches', { method: 'POST', body: JSON.stringify(input) }),
  meltOldGoldBatch: (id: number, input: OldGoldBatchMeltInput) =>
    request<OldGoldBatch>(`/api/old-gold-batches/${id}/melt`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  sendOldGoldBatch: (id: number, input: OldGoldBatchSendInput) =>
    request<OldGoldBatch>(`/api/old-gold-batches/${id}/send`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  settleOldGoldBatch: (id: number, input: OldGoldBatchSettleInput) =>
    request<OldGoldBatch>(`/api/old-gold-batches/${id}/settle`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  cancelOldGoldBatch: (id: number, input: OldGoldBatchCancelInput) =>
    request<OldGoldBatch>(`/api/old-gold-batches/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  listDues: (search?: string) => request<DuesLedger>(`/api/dues${qs({ q: search })}`),
  createDueEntry: (input: DueEntryInput) =>
    request<DueEntry>('/api/dues', { method: 'POST', body: JSON.stringify(input) }),
  updateDueEntry: (input: DueEntryUpdateInput) =>
    request<DueEntry>(`/api/dues/${input.id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteDueEntry: (id: number) => request<void>(`/api/dues/${id}`, { method: 'DELETE' }),
  recordDuePayment: (input: DuePaymentInput) =>
    request<DueEntry>(`/api/dues/${input.dueEntryId}/payment`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  markDuePaid: (id: number) => request<DueEntry>(`/api/dues/${id}/mark-paid`, { method: 'POST' }),

  listInvoices: async (input?: InvoiceListQuery) =>
    asPaged<Invoice>(
      await request<unknown>(
        `/api/invoices${qs({
          page: input?.page != null ? String(input.page) : undefined,
          pageSize: input?.pageSize != null ? String(input.pageSize) : undefined,
          from: input?.from ?? undefined,
          to: input?.to ?? undefined,
          q: input?.q,
          format: input?.format && input.format !== 'all' ? input.format : undefined,
          status: input?.status && input.status !== 'all' ? input.status : undefined,
          paymentMode: input?.paymentMode && input.paymentMode !== 'all' ? input.paymentMode : undefined,
          duePaid: input?.duePaid && input.duePaid !== 'all' ? input.duePaid : undefined,
          sort: input?.sort,
          customerId: input?.customerId != null ? String(input.customerId) : undefined,
        })}`,
      ),
    ),
  getInvoiceStats: (input: { from: string; to: string; granularity?: string }) =>
    request<InvoiceListStats>(
      `/api/invoices/stats${qs({
        from: input.from,
        to: input.to,
        granularity: input.granularity,
      })}`,
    ),
  getInvoice: (id: number) => request<Invoice>(`/api/invoices/${id}`),
  getNextInvoiceNo: (format: BillFormat) =>
    request<{ invoiceNo: string }>(`/api/invoices/next-invoice-no?format=${encodeURIComponent(format)}`),
  createInvoice: (input: InvoiceInput) =>
    request<Invoice>('/api/invoices', { method: 'POST', body: JSON.stringify(input) }),
  recordHistoricalInvoice: (input: HistoricalInvoiceInput) =>
    request<Invoice>('/api/invoices/historical', { method: 'POST', body: JSON.stringify(input) }),
  updateInvoice: (input: InvoiceUpdateInput) =>
    request<Invoice>(`/api/invoices/${input.id}`, { method: 'PUT', body: JSON.stringify(input) }),
  finalizeInvoice: (id: number) =>
    request<Invoice>(`/api/invoices/${id}/finalize`, { method: 'POST' }),
  cancelInvoice: (id: number, input: InvoiceCancelInput) =>
    request<Invoice>(`/api/invoices/${id}/cancel`, { method: 'POST', body: JSON.stringify(input) }),
  markInvoicePrinted: (invoiceId: number) =>
    request<{ invoiceNo: string }>(`/api/invoices/${invoiceId}/printed`, { method: 'POST' }),
  recordInvoicePayment: (id: number, input: InvoicePaymentInput) =>
    request<Invoice>(`/api/invoices/${id}/payments`, { method: 'POST', body: JSON.stringify(input) }),
  deleteInvoice: (id: number) => request<void>(`/api/invoices/${id}`, { method: 'DELETE' }),
  getTaxReport: () => request<TaxReportRow[]>('/api/invoices/tax-report'),

  listPledges: async (input?: PledgeListQuery) =>
    asPaged<Pledge>(
      await request<unknown>(
        `/api/pledges${qs({
          page: input?.page != null ? String(input.page) : undefined,
          pageSize: input?.pageSize != null ? String(input.pageSize) : undefined,
          from: input?.from ?? undefined,
          to: input?.to ?? undefined,
          q: input?.q,
          status: input?.status && input.status !== 'all' ? input.status : undefined,
          sort: input?.sort,
        })}`,
      ),
    ),
  getNextPledgeReceiptNo: () => request<{ receiptNo: string }>('/api/pledges/next-receipt-no'),
  getPledge: (id: number) => request<Pledge>(`/api/pledges/${id}`),
  createPledge: (input: PledgeInput) =>
    request<Pledge>('/api/pledges', { method: 'POST', body: JSON.stringify(input) }),
  updatePledge: (input: PledgeUpdateInput) =>
    request<Pledge>(`/api/pledges/${input.id}`, { method: 'PUT', body: JSON.stringify(input) }),
  sanctionPledge: (id: number, input: { allowAboveLtv?: boolean } = {}) =>
    request<Pledge>(`/api/pledges/${id}/sanction`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  redeemPledge: (input: PledgeRedeemInput) =>
    request<Pledge>(`/api/pledges/${input.id}/redeem`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  collectPledge: (input: PledgeCollectInput) =>
    request<Pledge>(`/api/pledges/${input.id}/collect`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  forfeitPledge: (input: PledgeForfeitInput) =>
    request<Pledge>(`/api/pledges/${input.id}/forfeit`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  renewPledge: (input: PledgeRenewInput) =>
    request<Pledge>(`/api/pledges/${input.id}/renew`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  deletePledge: (id: number) =>
    request<{ id: number }>(`/api/pledges/${id}`, { method: 'DELETE' }),
  listPledgeTopups: (id: number) => request<PledgeTopup[]>(`/api/pledges/${id}/topups`),
  addPledgeTopup: (input: PledgeTopupInput) =>
    request<Pledge>(`/api/pledges/${input.pledgeId}/topup`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  getPledgeAuction: (id: number) => request<PledgeAuction | null>(`/api/pledges/${id}/auction`),
  sendPledgeAuctionNotice: (input: PledgeAuctionNoticeInput) =>
    request<PledgeAuction>(`/api/pledges/${input.id}/auction-notice`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  recordPledgeAuction: (input: PledgeAuctionInput) =>
    request<Pledge>(`/api/pledges/${input.id}/auction`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  markPledgeAuctionSurplusPaid: (input: PledgeAuctionSurplusInput) =>
    request<PledgeAuction>(`/api/pledges/${input.id}/auction-surplus-paid`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  listPledgePayments: (id: number) => request<PledgePayment[]>(`/api/pledges/${id}/payments`),
  getPledgePayoff: (id: number, date?: string) =>
    request<PledgePayoff>(`/api/pledges/${id}/payoff${qs({ date })}`),
  listPledgeReminders: (date?: string) =>
    request<PledgeReminderEntry[]>(`/api/pledges/reminders${qs({ date })}`),
  listPledgePhotos: (id: number) => request<PledgePhoto[]>(`/api/pledges/${id}/photos`),
  uploadPledgePhoto: async (id: number, kind: PledgePhotoKind, file: File) => {
    const body = new FormData()
    body.append('kind', kind)
    // Photos print a few centimetres wide, so shrink before upload.
    body.append('file', await downscaleImageFile(file))
    return request<PledgePhoto>(`/api/pledges/${id}/photos`, { method: 'POST', body })
  },
  deletePledgePhoto: (id: number, photoId: number) =>
    request<PledgePhoto>(`/api/pledges/${id}/photos/${photoId}`, { method: 'DELETE' }),
  openWhatsAppReminder: (input: PledgeWhatsAppOpenInput) =>
    request<{ ok: boolean }>('/api/system/open-whatsapp', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  getShopSettings: () => request<ShopSettings>('/api/settings'),
  getRecordCounts: () => request<RecordCounts>('/api/settings/counts'),
  updateShopSettings: (input: ShopSettings) =>
    request<ShopSettings>('/api/settings', { method: 'PUT', body: JSON.stringify(input) }),
  uploadShopImage: async (file: File) => {
    const body = new FormData()
    // Uploaded images are shrunk first: they print a few centimetres wide but
    // are decoded on every print preview.
    body.append('file', await downscaleImageFile(file))
    return request<{ path: string }>('/api/settings/image', { method: 'POST', body })
  },

  getLatestMetalRates: () => request<MetalRates | null>('/api/metal-rates/latest'),
  listMetalRates: (days?: number) =>
    request<MetalRates[]>(days ? `/api/metal-rates?days=${days}` : '/api/metal-rates'),
  upsertMetalRates: (input: MetalRatesInput) =>
    request<MetalRates>('/api/metal-rates', { method: 'POST', body: JSON.stringify(input) }),

  getReportCatalog: () => request<ReportDefinition[]>('/api/reports'),
  getReportLookups: () => request<ReportLookups>('/api/reports/lookups'),
  runReport: (
    id: ReportId,
    query: {
      from?: string
      to?: string
      customerId?: number
      supplierId?: number
      productId?: number
      metal?: string
      qtyCutoff?: number
    },
  ) =>
    request<ReportResult>(
      `/api/reports/${id}${qs({
        from: query.from,
        to: query.to,
        customerId: query.customerId ? String(query.customerId) : undefined,
        supplierId: query.supplierId ? String(query.supplierId) : undefined,
        productId: query.productId ? String(query.productId) : undefined,
        metal: query.metal,
        qtyCutoff: query.qtyCutoff !== undefined ? String(query.qtyCutoff) : undefined,
      })}`,
    ),

  listGsSchemes: () => request<GoldSavingScheme[]>('/api/gold-savings/schemes'),
  getGsScheme: (id: number) => request<GoldSavingScheme>(`/api/gold-savings/schemes/${id}`),
  createGsScheme: (input: GoldSavingSchemeInput) =>
    request<GoldSavingScheme>('/api/gold-savings/schemes', { method: 'POST', body: JSON.stringify(input) }),
  updateGsScheme: (id: number, input: GoldSavingSchemeInput) =>
    request<GoldSavingScheme>(`/api/gold-savings/schemes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  listGsAccounts: (search?: string) =>
    request<GoldSavingAccount[]>(`/api/gold-savings/accounts${qs({ q: search })}`),
  previewGsBillingCredit: (customerId: number, invoiceId?: number | null, date?: string | null) =>
    request<GoldSavingSchemeCreditPreview[]>(
      `/api/gold-savings/billing-preview${qs({
        customerId: String(customerId),
        invoiceId: invoiceId ? String(invoiceId) : undefined,
        date: date ?? undefined,
      })}`,
    ),
  getGsRate: (date: string, purity: string) =>
    request<GoldSavingRate>(`/api/gold-savings/rate${qs({ date, purity })}`),
  getGsAccount: (id: number) => request<GoldSavingAccountDetail>(`/api/gold-savings/accounts/${id}`),
  createGsAccount: (input: GoldSavingAccountInput) =>
    request<GoldSavingAccountDetail>('/api/gold-savings/accounts', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  cancelGsAccount: (id: number, input: GoldSavingCancelInput) =>
    request<GoldSavingAccountDetail>(`/api/gold-savings/accounts/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  getGsRefund: (id: number) => request<GoldSavingRefund>(`/api/gold-savings/refunds/${id}`),
  collectGsPayment: (input: GoldSavingPaymentInput) =>
    request<GoldSavingPayment>('/api/gold-savings/payments', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  getGsPayment: (id: number) => request<GoldSavingPayment>(`/api/gold-savings/payments/${id}`),
  reverseGsPayment: (id: number, reason: string) =>
    request<GoldSavingPayment>(`/api/gold-savings/payments/${id}/reverse`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  waiveGsInstallment: (installmentId: number, reason: string) =>
    request<GoldSavingAccountDetail>(`/api/gold-savings/installments/${installmentId}/waive`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  getGsLedger: (accountId: number, query?: { from?: string; to?: string }) =>
    request<GoldSavingLedgerEntry[]>(
      `/api/gold-savings/accounts/${accountId}/ledger${qs({ from: query?.from, to: query?.to })}`,
    ),
  getGsPassbook: (accountId: number) =>
    request<GoldSavingPassbook>(`/api/gold-savings/accounts/${accountId}/passbook`),
  getGsAudit: (accountId: number) =>
    request<GoldSavingAuditLog[]>(`/api/gold-savings/accounts/${accountId}/audit`),
  processGsRedemption: (input: GoldSavingRedemptionInput) =>
    request<GoldSavingRedemption>('/api/gold-savings/redemptions', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  listGsRedemptions: (accountId?: number) =>
    request<GoldSavingRedemption[]>(
      `/api/gold-savings/redemptions${qs({ accountId: accountId ? String(accountId) : undefined })}`,
    ),
  getGsDashboard: () => request<GoldSavingDashboard>('/api/gold-savings/dashboard'),
  runGsReport: (
    id: GoldSavingReportId,
    query?: { from?: string; to?: string; schemeId?: number; q?: string; customerId?: number },
  ) =>
    request<GoldSavingReportResult>(
      `/api/gold-savings/reports/${id}${qs({
        from: query?.from,
        to: query?.to,
        schemeId: query?.schemeId ? String(query.schemeId) : undefined,
        q: query?.q,
        customerId: query?.customerId ? String(query.customerId) : undefined,
      })}`,
    ),

  getBackupStatus: () => request<BackupStatus>('/api/backup/status'),
  updateBackupSettings: (input: {
    frequency: BackupStatus['frequency']
    time: string
    offsiteDir?: string
  }) => request<BackupStatus>('/api/backup/settings', { method: 'PUT', body: JSON.stringify(input) }),
  copyBackupOffsite: () => request<BackupStatus>('/api/backup/offsite-copy', { method: 'POST' }),
  listBackups: () => request<BackupFile[]>('/api/backup/list'),
  inspectBackup: (name: string) =>
    request<BackupInspection>('/api/backup/inspect', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  createBackup: () => request<BackupFile>('/api/backup/create', { method: 'POST' }),
  restoreBackupByName: (name: string) =>
    request<BackupStatus>('/api/backup/restore-local', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  deleteBackup: (name: string) =>
    request<void>(`/api/backup/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  exportDatabase: async () => {
    if (window.desktopAPI) {
      const result = await window.desktopAPI.exportDatabase()
      if (result.canceled) {
        throw new Error('Export cancelled')
      }
      return
    }
    const response = await fetch('/api/backup/export', { credentials: 'same-origin' })
    if (!response.ok) {
      throw new Error('Export failed')
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `jeweltrackerpro-backup-${new Date().toISOString().slice(0, 10)}.db`
    link.click()
    URL.revokeObjectURL(url)
  },
  exportExcel: async () => {
    if (window.desktopAPI) {
      const result = await window.desktopAPI.exportExcel()
      if (result.canceled) {
        throw new Error('Export cancelled')
      }
      return
    }
    const response = await fetch('/api/backup/export-excel', { credentials: 'same-origin' })
    if (!response.ok) {
      throw new Error('Excel export failed')
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `jeweltrackerpro-tables-${new Date().toISOString().slice(0, 10)}.xlsx`
    link.click()
    URL.revokeObjectURL(url)
  },
  restoreDatabase: async (file: File) => {
    const body = new FormData()
    body.append('file', file)
    return request<BackupStatus>('/api/backup/restore', { method: 'POST', body })
  },
}

export function printPath(invoiceId: number, format: BillFormat): string {
  return format === 'tax_invoice' ? `/print/tax-invoice/${invoiceId}` : `/print/cash-bill/${invoiceId}`
}
