import type {
  AppInfo,
  AuthUser,
  BackupFile,
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
  PagedList,
  Pledge,
  PledgeCollectInput,
  PledgeForfeitInput,
  PledgeInput,
  PledgeListQuery,
  PledgeRedeemInput,
  PledgeTopup,
  PledgeTopupInput,
  PledgeUpdateInput,
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
  GoldSavingAccount,
  GoldSavingAccountDetail,
  GoldSavingAccountInput,
  GoldSavingAuditLog,
  GoldSavingDashboard,
  GoldSavingLedgerEntry,
  GoldSavingPassbook,
  GoldSavingPayment,
  GoldSavingPaymentInput,
  GoldSavingRedemption,
  GoldSavingRedemptionInput,
  GoldSavingReportId,
  GoldSavingReportResult,
  GoldSavingScheme,
  GoldSavingSchemeInput,
  Inward,
  InwardInput,
  InwardUpdateInput,
  MetalDayCloseInput,
  MetalDayClosingHistoryRow,
  MetalDayClosingSheet,
  MetalDayReopenInput,
  DayClosePrecheck,
  StockReconciliationRow,
  StockAdjustment,
  StockAdjustmentInput,
} from './types'
import type { ReportDefinition, ReportId, ReportLookups, ReportResult } from './reportsCatalog'

export interface JewelTrackerProApi {
  getVersion: () => Promise<AppInfo>
  login: (input: LoginInput) => Promise<AuthUser>
  logout: () => Promise<void>
  me: () => Promise<AuthUser>
  changePassword: (input: ChangePasswordInput) => Promise<AuthUser>
  listUsers: () => Promise<User[]>
  createUser: (input: CreateUserInput) => Promise<User>
  updateUserPermissions: (id: number, input: UpdatePermissionsInput) => Promise<User>
  resetUserPassword: (id: number, input: ResetPasswordInput) => Promise<User>
  deleteUser: (id: number) => Promise<void>
  exportDatabase: () => Promise<void>
  exportExcel: () => Promise<void>
  restoreDatabase: (file: File) => Promise<BackupStatus>
  getBackupStatus: () => Promise<BackupStatus>
  updateBackupSettings: (input: {
    frequency: BackupStatus['frequency']
    time: string
    offsiteDir?: string
  }) => Promise<BackupStatus>
  copyBackupOffsite: () => Promise<BackupStatus>
  listBackups: () => Promise<BackupFile[]>
  createBackup: () => Promise<BackupFile>
  restoreBackupByName: (name: string) => Promise<BackupStatus>
  deleteBackup: (name: string) => Promise<void>

  listProducts: (search?: string, parentId?: number) => Promise<Product[]>
  listProductVariants: (id: number) => Promise<Product[]>
  listProductCategories: () => Promise<StockCategory[]>
  getProduct: (id: number) => Promise<Product>
  createProduct: (input: ProductInput) => Promise<Product>
  updateProduct: (id: number, input: ProductInput) => Promise<Product>
  deleteProduct: (id: number) => Promise<void>

  listItemStock: (input: ItemStockListInput) => Promise<ItemStockRow[]>
  upsertItemStock: (input: ItemStockUpsertInput) => Promise<ItemStockRow>
  listStockCategories: () => Promise<StockCategory[]>
  getDayClosePrecheck: (businessDate: string, metal: string) => Promise<DayClosePrecheck>
  getStockReconciliation: (date: string) => Promise<StockReconciliationRow[]>
  createStockCategory: (input: StockCategoryCreateInput) => Promise<StockCategory>
  updateStockCategory: (input: StockCategoryUpdateInput) => Promise<StockCategory>
  deleteStockCategory: (name: string) => Promise<void>
  clearStockSalesOverrides: (input: StockClearOverridesInput) => Promise<ItemStockRow[]>
  listStockHistory: (input: StockHistoryInput) => Promise<StockHistoryRow[]>
  listStockDayLines: (input: StockDayLinesInput) => Promise<StockDayLine[]>
  getMetalDayClosing: (businessDate: string, metal: string) => Promise<MetalDayClosingSheet>
  listMetalDayClosingHistory: (metal?: string) => Promise<MetalDayClosingHistoryRow[]>
  closeMetalDay: (input: MetalDayCloseInput) => Promise<MetalDayClosingSheet>
  reopenMetalDay: (input: MetalDayReopenInput) => Promise<MetalDayClosingSheet>
  createStockAdjustment: (input: StockAdjustmentInput) => Promise<StockAdjustment>

  listCustomers: (search?: string) => Promise<Customer[]>
  getCustomer: (id: number) => Promise<Customer>
  createCustomer: (input: CustomerInput) => Promise<Customer>
  updateCustomer: (id: number, input: CustomerInput) => Promise<Customer>
  deleteCustomer: (id: number) => Promise<void>

  listSuppliers: (search?: string) => Promise<Supplier[]>
  getSupplier: (id: number) => Promise<Supplier>
  createSupplier: (input: SupplierInput) => Promise<Supplier>
  updateSupplier: (id: number, input: SupplierInput) => Promise<Supplier>
  deleteSupplier: (id: number) => Promise<void>

  listInwards: () => Promise<Inward[]>
  getInward: (id: number) => Promise<Inward>
  createInward: (input: InwardInput) => Promise<Inward>
  updateInward: (input: InwardUpdateInput) => Promise<Inward>
  finalizeInward: (id: number) => Promise<Inward>
  deleteInward: (id: number) => Promise<void>

  listDues: (search?: string) => Promise<DuesLedger>
  createDueEntry: (input: DueEntryInput) => Promise<DueEntry>
  updateDueEntry: (input: DueEntryUpdateInput) => Promise<DueEntry>
  deleteDueEntry: (id: number) => Promise<void>
  recordDuePayment: (input: DuePaymentInput) => Promise<DueEntry>
  markDuePaid: (id: number) => Promise<DueEntry>

  listInvoices: (input?: InvoiceListQuery) => Promise<PagedList<Invoice>>
  getInvoiceStats: (input: { from: string; to: string; granularity?: string }) => Promise<InvoiceListStats>
  getInvoice: (id: number) => Promise<Invoice>
  getNextInvoiceNo: (format: BillFormat) => Promise<{ invoiceNo: string }>
  createInvoice: (input: InvoiceInput) => Promise<Invoice>
  recordHistoricalInvoice: (input: HistoricalInvoiceInput) => Promise<Invoice>
  updateInvoice: (input: InvoiceUpdateInput) => Promise<Invoice>
  finalizeInvoice: (id: number) => Promise<Invoice>
  recordInvoicePayment: (id: number, input: InvoicePaymentInput) => Promise<Invoice>
  deleteInvoice: (id: number) => Promise<void>
  getTaxReport: () => Promise<TaxReportRow[]>

  listPledges: (input?: PledgeListQuery) => Promise<PagedList<Pledge>>
  getNextPledgeReceiptNo: () => Promise<{ receiptNo: string }>
  getPledge: (id: number) => Promise<Pledge>
  createPledge: (input: PledgeInput) => Promise<Pledge>
  updatePledge: (input: PledgeUpdateInput) => Promise<Pledge>
  sanctionPledge: (id: number) => Promise<Pledge>
  redeemPledge: (input: PledgeRedeemInput) => Promise<Pledge>
  collectPledge: (input: PledgeCollectInput) => Promise<Pledge>
  forfeitPledge: (input: PledgeForfeitInput) => Promise<Pledge>
  listPledgeTopups: (id: number) => Promise<PledgeTopup[]>
  addPledgeTopup: (input: PledgeTopupInput) => Promise<Pledge>

  getShopSettings: () => Promise<ShopSettings>
  getRecordCounts: () => Promise<RecordCounts>
  updateShopSettings: (input: ShopSettings) => Promise<ShopSettings>
  uploadShopImage: (file: File) => Promise<{ path: string }>
  getLatestMetalRates: () => Promise<MetalRates | null>
  listMetalRates: (days?: number) => Promise<MetalRates[]>
  upsertMetalRates: (input: MetalRatesInput) => Promise<MetalRates>
  getReportCatalog: () => Promise<ReportDefinition[]>
  getReportLookups: () => Promise<ReportLookups>
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
  ) => Promise<ReportResult>

  listGsSchemes: () => Promise<GoldSavingScheme[]>
  getGsScheme: (id: number) => Promise<GoldSavingScheme>
  createGsScheme: (input: GoldSavingSchemeInput) => Promise<GoldSavingScheme>
  updateGsScheme: (id: number, input: GoldSavingSchemeInput) => Promise<GoldSavingScheme>
  listGsAccounts: (search?: string) => Promise<GoldSavingAccount[]>
  getGsAccount: (id: number) => Promise<GoldSavingAccountDetail>
  createGsAccount: (input: GoldSavingAccountInput) => Promise<GoldSavingAccountDetail>
  cancelGsAccount: (id: number, reason: string) => Promise<GoldSavingAccountDetail>
  collectGsPayment: (input: GoldSavingPaymentInput) => Promise<GoldSavingPayment>
  getGsPayment: (id: number) => Promise<GoldSavingPayment>
  reverseGsPayment: (id: number, reason: string) => Promise<GoldSavingPayment>
  getGsLedger: (accountId: number, query?: { from?: string; to?: string }) => Promise<GoldSavingLedgerEntry[]>
  getGsPassbook: (accountId: number) => Promise<GoldSavingPassbook>
  getGsAudit: (accountId: number) => Promise<GoldSavingAuditLog[]>
  processGsRedemption: (input: GoldSavingRedemptionInput) => Promise<GoldSavingRedemption>
  listGsRedemptions: (accountId?: number) => Promise<GoldSavingRedemption[]>
  getGsDashboard: () => Promise<GoldSavingDashboard>
  runGsReport: (
    id: GoldSavingReportId,
    query?: { from?: string; to?: string; schemeId?: number; q?: string; customerId?: number },
  ) => Promise<GoldSavingReportResult>
}
