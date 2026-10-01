import { z } from 'zod'
import { DEFAULT_CASH_VISIBILITY, DEFAULT_TAX_VISIBILITY } from './billTemplate'
import { GOLD_PURITIES, SILVER_PURITIES, STOCK_METALS } from './itemTypes'

export const idSchema = z.number().int().positive()

export const productMetalSchema = z.enum(STOCK_METALS)

export const productAttributesSchema = z.record(z.string().trim().min(1).max(80), z.string().max(200))

export const huidSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9A-Z]{6}$/, 'HUID must be 6 letters or digits')

export const productInputSchema = z
  .object({
    name: z.string().min(1).max(200),
    category: z.string().trim().min(1).max(100),
    metal: productMetalSchema,
    purity: z.string().trim().min(1).max(50),
    grossWeight: z.number().nonnegative(),
    netWeight: z.number().nonnegative(),
    makingCharges: z.number().nonnegative(),
    stockQty: z.number().int().nonnegative(),
    imagePath: z.string().max(500),
    parentId: z.number().int().positive().nullable().optional(),
    variantCode: z.string().trim().max(80).optional().default(''),
    size: z.string().trim().max(50).optional().default(''),
    stoneWeight: z.number().nonnegative().optional().default(0),
    stoneDetails: z.string().trim().max(500).optional().default(''),
    attributes: productAttributesSchema.optional().default({}),
    isActive: z.boolean().optional().default(true),
    huids: z.array(huidSchema).max(500).optional().default([]),
  })
  .refine((data) => data.netWeight <= data.grossWeight, {
    message: 'Net weight cannot exceed gross weight',
    path: ['netWeight'],
  })
  .refine((data) => (data.stoneWeight ?? 0) <= data.grossWeight, {
    message: 'Stone weight cannot exceed gross weight',
    path: ['stoneWeight'],
  })
  .superRefine((data, ctx) => {
    const allowed = data.metal === 'Silver' ? SILVER_PURITIES : GOLD_PURITIES
    if (!allowed.includes(data.purity as (typeof allowed)[number])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Purity must be one of ${allowed.join(', ')} for ${data.metal}`,
        path: ['purity'],
      })
    }

    const seen = new Map<string, number>()
    data.huids.forEach((huid, index) => {
      const previous = seen.get(huid)
      if (previous !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `HUID ${huid} is duplicated`,
          path: ['huids', index],
        })
        return
      }
      seen.set(huid, index)
    })

    if (data.huids.length !== data.stockQty) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Add one HUID for each piece in stock',
        path: ['huids'],
      })
    }
  })

const panPattern = /^[A-Z]{5}[0-9]{4}[A-Z]$/

export const customerInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  phone: z
    .string()
    .regex(/^\d{10}$/, 'Mobile number must be exactly 10 digits'),
  address: z.string().trim().min(1, 'Address is required').max(500),
  guardianName: z.string().max(200).optional(),
  notes: z.string().max(1000).optional().default(''),
  gstin: z.string().max(20).optional(),
  aadhaar: z
    .string()
    .optional()
    .default('')
    .refine((value) => value === '' || /^\d{12}$/.test(value), {
      message: 'Aadhaar must be exactly 12 digits',
    }),
  pan: z
    .string()
    .optional()
    .default('')
    .transform((value) => value.trim().toUpperCase())
    .refine((value) => value === '' || panPattern.test(value), {
      message: 'PAN must be in format AAAAA9999A',
    }),
})

export const billFormatSchema = z.enum(['cash_bill', 'tax_invoice'])
export const paymentModeSchema = z.enum(['cash', 'upi', 'card', 'mixed'])
export const purchasePaymentModeSchema = z.enum(['cash', 'upi', 'card'])
export const paperSizeSchema = z.enum(['a5', 'a4', 'thermal'])
export const printerRoleSchema = z.enum(['cash', 'tax'])
export const printCopiesSchema = z.number().int().min(1).max(5)
export const invoiceLineKindSchema = z.enum(['sale', 'exchange'])
export const mixedPaymentModeSchema = z.enum(['cash', 'upi', 'card'])

export const oldGoldItemInputSchema = z
  .object({
    description: z.string().max(200).optional().default(''),
    grossWeight: z.number().positive(),
    stoneWeight: z.number().nonnegative().optional().default(0),
    netWeight: z.number().positive(),
    purity: z.string().max(50).optional().default(''),
    ratePerGram: z.number().nonnegative(),
    deductionPct: z.number().nonnegative().max(100).optional().default(0),
  })
  .refine((data) => (data.stoneWeight ?? 0) <= data.grossWeight, {
    message: 'Stone/deduction weight cannot exceed gross weight',
    path: ['stoneWeight'],
  })
  .refine((data) => data.netWeight <= data.grossWeight, {
    message: 'Net weight cannot exceed gross weight',
    path: ['netWeight'],
  })

export const mixedPaymentPartSchema = z.object({
  mode: mixedPaymentModeSchema,
  amount: z.number().positive(),
})

export const invoicePaymentInputSchema = z.object({
  amount: z.number().positive(),
  entryDate: z.string().min(1),
  note: z.string().max(500).optional().default(''),
  mode: mixedPaymentModeSchema.optional(),
})

export const invoiceItemInputSchema = z
  .object({
    productId: z.number().int().positive().nullable().optional(),
    qty: z.number().int().positive(),
    rate: z.number().nonnegative(),
    grossWeight: z.number().nonnegative().optional(),
    netWeight: z.number().nonnegative().optional(),
    stoneWeight: z.number().nonnegative().optional(),
    metalRate: z.number().nonnegative().optional(),
    makingCharges: z.number().nonnegative().optional(),
    wastagePct: z.number().nonnegative().optional(),
    stoneRate: z.number().nonnegative().optional(),
    otherCharges: z.number().nonnegative().optional(),
    hsnCode: z.string().max(16).optional(),
    lineKind: invoiceLineKindSchema.optional(),
    description: z.string().max(200).optional(),
    metal: z.string().max(50).optional(),
    category: z.string().max(100).optional(),
  })
  .superRefine((data, ctx) => {
    const kind = data.lineKind ?? 'sale'
    if (kind === 'sale' && (data.productId == null || data.productId <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Sale lines require a product',
        path: ['productId'],
      })
    }
    if (kind === 'sale' && (data.wastagePct ?? 0) > 0 && (data.makingCharges ?? 0) > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'VA/MC accepts either a wastage percent or a labour amount, not both',
        path: ['wastagePct'],
      })
    }
    if (kind === 'exchange') {
      if ((data.netWeight ?? 0) <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Exchange lines require net weight',
          path: ['netWeight'],
        })
      }
      if ((data.metalRate ?? data.rate ?? 0) <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Exchange lines require a metal rate',
          path: ['metalRate'],
        })
      }
    }
  })

const invoiceBaseSchema = z.object({
  customerId: z.number().int().positive(),
  invoiceDate: z.string().min(1),
  tax: z.number().nonnegative(),
  items: z.array(invoiceItemInputSchema).min(1),
  billFormat: billFormatSchema.optional(),
  paymentMode: paymentModeSchema.optional(),
  amountPaid: z.number().nonnegative().optional(),
  discount: z.number().nonnegative().optional(),
  autoTax: z.boolean().optional(),
  useIgst: z.boolean().optional(),
  isEstimate: z.boolean().optional(),
  oldGold: z.array(oldGoldItemInputSchema).optional(),
  oldGoldLinks: z.array(z.object({ purchaseId: idSchema })).optional(),
  roundOff: z.number().optional(),
  mixedPayments: z.array(mixedPaymentPartSchema).optional(),
})

function refineInvoicePayments(
  data: z.infer<typeof invoiceBaseSchema>,
  ctx: z.RefinementCtx,
) {
  const mixed = data.mixedPayments ?? []
  if (data.paymentMode === 'mixed' && mixed.length > 0) {
    const mixedTotal = mixed.reduce((sum, part) => sum + part.amount, 0)
    if (data.amountPaid != null && mixedTotal - data.amountPaid > 0.009) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Mixed payment parts cannot exceed amount paid',
        path: ['mixedPayments'],
      })
    }
  }
  if (mixed.length > 0 && data.paymentMode !== 'mixed' && data.paymentMode != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Mixed payment parts require payment mode Mixed',
      path: ['mixedPayments'],
    })
  }
}

export const invoiceInputSchema = invoiceBaseSchema.superRefine(refineInvoicePayments)

export const historicalInvoiceInputSchema = z.object({
  invoiceNo: z.string().trim().min(1).max(40),
  customerId: z.number().int().positive(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  billFormat: billFormatSchema,
  paymentMode: paymentModeSchema,
  subtotal: z.number().nonnegative(),
  discount: z.number().nonnegative().optional(),
  autoTax: z.boolean().optional(),
  useIgst: z.boolean().optional(),
  tax: z.number().nonnegative().optional(),
  amountPaid: z.number().nonnegative(),
  goldWeight: z.number().nonnegative().optional(),
  silverWeight: z.number().nonnegative().optional(),
  makingCharges: z.number().nonnegative().optional(),
})

export const invoiceUpdateInputSchema = invoiceBaseSchema
  .extend({
    id: z.number().int().positive(),
  })
  .superRefine(refineInvoicePayments)

const billLabel = z.string().max(80)

export const billTemplateSchema = z.object({
  cashTitle: billLabel,
  cashNoLabel: billLabel,
  cashDateLabel: billLabel,
  cashCustomerPrefix: billLabel,
  cashCustomerSign: billLabel,
  cashForPrefix: billLabel,
  taxTitle: billLabel,
  taxGstinLabel: billLabel,
  taxPhoneLabel: billLabel,
  taxMobileLabel: billLabel,
  taxBillNoLabel: billLabel,
  taxDateLabel: billLabel,
  taxBillToLabel: billLabel,
  taxColParticulars: billLabel,
  taxColTotWgt: billLabel,
  taxColGrsWgt: billLabel,
  taxColStnWgt: billLabel,
  taxColVamc: billLabel,
  taxColStoneRate: billLabel,
  taxColMetalRate: billLabel,
  taxColAmount: billLabel,
  taxItemCountLabel: billLabel,
  taxCgstLabel: billLabel,
  taxSgstLabel: billLabel,
  taxLessDiscountLabel: billLabel,
  taxThanks: z.string().max(200),
  taxCustomerSign: billLabel,
  marketRatesLabel: billLabel,
  goldRateLabel: billLabel,
  silverRateLabel: billLabel,
  amountInWordsLabel: z.string().max(120),
  discountBreakdownLabel: billLabel,
  netAmountLabel: billLabel,
  roundOffLabel: billLabel,
  totalLabel: billLabel,
  receivedLabel: billLabel,
  goodsReceivedLabel: z.string().max(200),
  thanksLabel: z.string().max(200),
})

export const templatePresetSchema = z.enum(['detailed', 'compact', 'thermal', 'custom'])

export const cashVisibilitySchema = z.object({
  showLogo: z.boolean(),
  showTagline: z.boolean(),
  showGstin: z.boolean(),
  showBisLogo: z.boolean(),
  showQrCode: z.boolean(),
  showMarketRates: z.boolean(),
  showCustomerAddress: z.boolean(),
  showCustomerPhone: z.boolean(),
  showWastageCol: z.boolean(),
  showOtherCol: z.boolean(),
  showDiscountBreakdown: z.boolean(),
  showSignatures: z.boolean(),
  showThankYou: z.boolean(),
})

export const taxVisibilitySchema = z.object({
  showLogo: z.boolean(),
  showTagline: z.boolean(),
  showBisLogo: z.boolean(),
  showQrCode: z.boolean(),
  showMarketRates: z.boolean(),
  showCustomerAddress: z.boolean(),
  showWastageCol: z.boolean(),
  showOtherCol: z.boolean(),
  showDiscountBreakdown: z.boolean(),
  showSignatures: z.boolean(),
})

export const shopSettingsSchema = z.object({
  shopName: z.string().min(1).max(200),
  tagline: z.string().max(200),
  appSubtitle: z.string().max(200),
  gstin: z.string().max(20),
  phone1: z.string().max(30),
  phone2: z.string().max(30),
  addressLine1: z.string().max(200),
  addressLine2: z.string().max(200),
  addressLine3: z.string().max(200),
  city: z.string().max(80),
  state: z.string().max(80),
  pincode: z.string().max(20),
  proprietorLine1: z.string().max(200).default(''),
  proprietorLine2: z.string().max(200).default(''),
  proprietorLine3: z.string().max(200).default(''),
  promoLine: z.string().max(500).default(''),
  logoImagePath: z.string().max(500),
  signatureImagePath: z.string().max(500),
  bisLogoPath: z.string().max(500).default(''),
  qrCodePath: z.string().max(500).default(''),
  passbookBannerPath: z.string().max(500).default(''),
  passbookSideImagePath: z.string().max(500).default(''),
  defaultPrinterCash: z.string().max(200),
  defaultPrinterTax: z.string().max(200),
  paperSizeCash: paperSizeSchema,
  paperSizeTax: paperSizeSchema,
  copiesCash: printCopiesSchema,
  copiesTax: printCopiesSchema,
  openCashDrawer: z.boolean(),
  billTemplate: billTemplateSchema,
  cashPreset: templatePresetSchema.default('detailed'),
  taxPreset: templatePresetSchema.default('detailed'),
  cashVisibility: cashVisibilitySchema.default(DEFAULT_CASH_VISIBILITY),
  taxVisibility: taxVisibilitySchema.default(DEFAULT_TAX_VISIBILITY),
  quickProductIds: z.array(z.number().int().positive()).max(12).default([]),
  pledgeLtvPct: z.number().nonnegative().max(100).default(75),
  adaguInterestPct: z.number().nonnegative().max(100).default(2.1),
})

export const metalRatesInputSchema = z.object({
  effectiveDate: z.string().min(1),
  gold22k: z.number().nonnegative(),
  gold24k: z.number().nonnegative(),
  gold20k: z.number().nonnegative().optional(),
  gold18k: z.number().nonnegative().optional(),
  silverFine: z.number().nonnegative(),
  silver925: z.number().nonnegative().optional(),
})

export const exportDbSchema = z.object({
  destinationPath: z.string().min(1),
})

export const restoreDbSchema = z.object({
  sourcePath: z.string().min(1),
})

export const FEATURE_KEY_VALUES = [
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
] as const

export const featureKeySchema = z.enum(FEATURE_KEY_VALUES)

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(200),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(6).max(200),
})

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Username may only contain letters, numbers, dots, underscores, and hyphens'),
  password: z.string().min(6).max(200),
  role: z.enum(['admin', 'staff']),
  features: z.array(featureKeySchema).optional(),
})

export const updatePermissionsSchema = z.object({
  features: z.array(featureKeySchema),
})

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(6).max(200),
})

const stockMetalSchema = z.enum(STOCK_METALS)
const stockItemNameSchema = z.string().trim().min(1).max(80)

export const itemStockListSchema = z.object({
  stockDate: z.string().min(1),
  metal: stockMetalSchema,
})

export const itemStockUpsertSchema = z
  .object({
    stockDate: z.string().min(1),
    metal: stockMetalSchema,
    itemName: stockItemNameSchema,
    openingWeight: z.number().nonnegative().optional(),
    salesOverride: z.number().nonnegative().nullable().optional(),
    overrideReason: z.string().trim().max(500).optional(),
    overrideReferenceId: z.number().int().positive().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.salesOverride != null && !data.overrideReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Sales override requires a reason',
        path: ['overrideReason'],
      })
    }
  })

export const stockCategoryCreateSchema = z.object({
  name: stockItemNameSchema,
  stockDate: z.string().min(1).optional(),
  metal: stockMetalSchema.optional(),
  openingWeight: z.number().nonnegative().optional(),
})

export const stockCategoryUpdateSchema = z.object({
  currentName: stockItemNameSchema,
  newName: stockItemNameSchema,
})

export const stockCategoryDeleteSchema = z.object({
  name: stockItemNameSchema,
})

export const stockClearOverridesSchema = z.object({
  stockDate: z.string().min(1),
  metal: stockMetalSchema,
})

export const stockHistorySchema = z.object({
  metal: stockMetalSchema,
})

export const stockDayLineKindSchema = z.enum(['inward', 'sales'])

export const stockDayLinesSchema = z.object({
  stockDate: z.string().min(1),
  metal: stockMetalSchema,
  itemName: stockItemNameSchema,
  kind: stockDayLineKindSchema,
})

export const metalDayClosingGetSchema = z.object({
  businessDate: z.string().min(1),
  metal: stockMetalSchema,
})

export const metalDayCloseSchema = z.object({
  businessDate: z.string().min(1),
  metal: stockMetalSchema,
  operatorName: z.string().trim().min(1).max(120),
  note: z.string().max(1000).optional(),
})

export const metalDayReopenSchema = z.object({
  businessDate: z.string().min(1),
  metal: stockMetalSchema,
  reason: z.string().trim().min(1).max(1000),
})

export const stockReconciliationSchema = z.object({
  date: z.string().min(1),
})

export const stockAdjustmentLineInputSchema = z.object({
  productId: z.number().int().positive().nullable().optional(),
  metal: z.string().trim().min(1).max(50),
  category: z.string().trim().min(1).max(100),
  qtyDelta: z.number().int().default(0),
  weightDelta: z.number().default(0),
  reason: z.string().trim().max(200).optional(),
  huids: z.array(huidSchema).max(500).optional().default([]),
})

export const stockAdjustmentInputSchema = z.object({
  adjustmentDate: z.string().min(1),
  reason: z.string().trim().min(1).max(200),
  note: z.string().max(1000).optional(),
  lines: z.array(stockAdjustmentLineInputSchema).min(1),
})

export const stocktakeCreateSchema = z.object({
  businessDate: z.string().min(1),
  metal: stockMetalSchema,
  operatorName: z.string().trim().min(1).max(120),
  note: z.string().max(1000).optional(),
})

export const stocktakeLineUpdateItemSchema = z.object({
  id: z.number().int().positive(),
  countedWeight: z.number().nullable().optional(),
  countedQty: z.number().int().nullable().optional(),
  productId: z.number().int().positive().nullable().optional(),
})

export const stocktakeLineUpdateSchema = z.object({
  lines: z.array(stocktakeLineUpdateItemSchema).min(1),
})

export const stocktakePostSchema = z.object({
  id: z.number().int().positive(),
})

export const supplierInputSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(30),
  address: z.string().max(500),
  notes: z.string().max(1000),
  gstin: z
    .string()
    .max(20)
    .optional()
    .default('')
    .transform((value) => value.trim().toUpperCase()),
})

export const inwardItemInputSchema = z
  .object({
    productId: z.number().int().positive().nullable().optional(),
    metal: z.string().trim().min(1).max(50),
    category: z.string().trim().min(1).max(100),
    purity: z.string().max(50).default(''),
    qty: z.number().int().positive(),
    grossWeight: z.number().nonnegative().optional().default(0),
    netWeight: z.number().positive(),
    rate: z.number().nonnegative().default(0),
    makingCharges: z.number().nonnegative().optional().default(0),
    hsnCode: z.string().trim().max(20).optional().default('7113'),
    huids: z.array(huidSchema).max(500).optional().default([]),
  })
  .superRefine((data, ctx) => {
    const seen = new Map<string, number>()
    data.huids.forEach((huid, index) => {
      const previous = seen.get(huid)
      if (previous !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `HUID ${huid} is duplicated`,
          path: ['huids', index],
        })
        return
      }
      seen.set(huid, index)
    })
    if (data.productId != null && data.huids.length !== data.qty) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Add one HUID for each piece on this line',
        path: ['huids'],
      })
    }
    if (data.productId == null && data.huids.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Raw metal lines cannot have HUIDs',
        path: ['huids'],
      })
    }
  })

const inwardBaseSchema = z.object({
  supplierId: z.number().int().positive(),
  inwardDate: z.string().min(1),
  notes: z.string().max(1000).optional(),
  paymentMode: purchasePaymentModeSchema.optional().default('cash'),
  roundOff: z.number().optional(),
  items: z.array(inwardItemInputSchema).min(1),
})

export const inwardInputSchema = inwardBaseSchema

export const inwardUpdateInputSchema = inwardBaseSchema.extend({
  id: idSchema,
})

export const oldGoldPurchaseItemInputSchema = oldGoldItemInputSchema

const oldGoldPurchaseBaseSchema = z.object({
  customerId: z.number().int().positive().nullable().optional(),
  customerName: z.string().trim().min(1).max(200),
  customerPhone: z.string().max(30).optional().default(''),
  purchaseDate: z.string().min(1),
  notes: z.string().max(1000).optional().default(''),
  items: z.array(oldGoldPurchaseItemInputSchema).min(1),
})

export const oldGoldPurchaseInputSchema = oldGoldPurchaseBaseSchema

export const oldGoldPurchaseUpdateInputSchema = oldGoldPurchaseBaseSchema.extend({
  id: idSchema,
})

export const dueEntryKindSchema = z.enum(['due', 'payment'])

export const dueEntryInputSchema = z.object({
  customerId: z.number().int().positive(),
  entryDate: z.string().min(1),
  kind: dueEntryKindSchema,
  amount: z.number().positive(),
  note: z.string().max(500),
})

export const dueEntryUpdateInputSchema = z.object({
  id: idSchema,
  entryDate: z.string().min(1),
  kind: dueEntryKindSchema,
  amount: z.number().positive(),
  note: z.string().max(500),
})

export const duePaymentInputSchema = z.object({
  dueEntryId: idSchema,
  amount: z.number().positive(),
  entryDate: z.string().min(1),
  note: z.string().max(500).default(''),
})

export const reportErrorSchema = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(20000).optional(),
  source: z.enum(['boundary', 'window', 'rejection']),
})

export const businessDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const dayClosingGetSchema = z.object({
  businessDate: businessDateSchema,
})

export const dayClosingSetOpeningSchema = z.object({
  businessDate: businessDateSchema,
  openingCash: z.number().nonnegative(),
})

export const dayClosingCloseSchema = z.object({
  businessDate: businessDateSchema,
  actualCash: z.number().nonnegative(),
  operatorName: z.string().trim().min(1).max(80),
  note: z.string().max(500).optional(),
})

export const pledgeStatusSchema = z.enum(['draft', 'active', 'redeemed', 'forfeited'])

export const pledgeItemInputSchema = z
  .object({
    description: z.string().trim().min(1).max(200),
    identification: z.string().max(500).optional(),
    metal: z.string().max(50),
    purity: z.string().max(50),
    grossWeight: z.number().nonnegative(),
    stoneWeight: z.number().nonnegative().optional(),
    netWeight: z.number().nonnegative(),
    pieces: z.number().int().positive(),
  })
  .refine((data) => (data.stoneWeight ?? 0) <= data.grossWeight, {
    message: 'Stone weight cannot exceed gross weight',
    path: ['stoneWeight'],
  })
  .refine((data) => data.netWeight <= data.grossWeight, {
    message: 'Net weight cannot exceed gross weight',
    path: ['netWeight'],
  })

const pledgeBaseSchema = z.object({
  customerId: z.number().int().positive(),
  pledgeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pledgeType: z.string().max(100).optional(),
  guardianName: z.string().max(200).optional(),
  customerAddress: z.string().max(500).optional(),
  assessedValue: z.number().nonnegative(),
  loanAmount: z.number().positive(),
  charges: z.number().nonnegative().optional(),
  interestPct: z.number().nonnegative(),
  repaymentDueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  notes: z.string().max(1000).optional(),
  items: z.array(pledgeItemInputSchema).min(1),
})

export const pledgeInputSchema = pledgeBaseSchema

export const pledgeUpdateInputSchema = pledgeBaseSchema.extend({
  id: z.number().int().positive(),
})

export const pledgeRedeemInputSchema = z.object({
  id: z.number().int().positive(),
  redeemedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amountCollected: z.number().nonnegative(),
})

export const pledgeCollectInputSchema = z.object({
  id: z.number().int().positive(),
  collectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
})

export const pledgeForfeitInputSchema = z.object({
  id: z.number().int().positive(),
  forfeitedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export const pledgeTopupInputSchema = z.object({
  pledgeId: z.number().int().positive(),
  topupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  note: z.string().max(500).optional().default(''),
})

export const restoreBackupNameSchema = z.object({
  name: z.string().trim().min(1).max(120),
})

export const backupSettingsSchema = z.object({
  frequency: z.enum(['daily', 'weekly']),
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be HH:mm'),
})

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')
const optionalIsoDateSchema = z
  .union([isoDateSchema, z.literal(''), z.null()])
  .optional()
  .transform((value) => (value ? value : null))

export const goldSavingPuritySchema = z.enum(['24K', '22K', '18K'])
export const goldSavingRateSourceSchema = z.enum(['configured', 'manual_allowed'])
export const goldSavingBonusTypeSchema = z.enum(['none', 'fixed_amount', 'percentage', 'additional_gold'])
export const goldSavingRedemptionTypeSchema = z.enum(['gold', 'jewellery', 'configurable'])
export const goldSavingSchemeStatusSchema = z.enum(['active', 'inactive'])
export const goldSavingPaymentModeSchema = z.enum(['cash', 'upi', 'card', 'bank_transfer', 'other'])
export const goldSavingRedemptionKindSchema = z.enum(['gold', 'jewellery', 'invoice'])
export const goldSavingReportIdSchema = z.enum([
  'daily-collections',
  'monthly-collections',
  'customer-ledger',
  'scheme-performance',
  'active-schemes',
  'matured-schemes',
  'overdue-installments',
  'cancelled-schemes',
  'gold-accumulation',
  'redemption-history',
  'outstanding-obligations',
])

export const goldSavingSchemeInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Scheme name is required').max(200),
    description: z.string().max(2000).optional().default(''),
    monthlyAmount: z.number().positive('Monthly installment must be greater than zero'),
    durationMonths: z.number().int().min(1).max(120),
    minInstallment: z.number().positive().nullable().optional(),
    maxInstallment: z.number().positive().nullable().optional(),
    purity: goldSavingPuritySchema,
    goldRateSource: goldSavingRateSourceSchema,
    bonusType: goldSavingBonusTypeSchema,
    bonusValue: z.number().nonnegative().optional().default(0),
    bonusEligibility: z.string().max(2000).optional().default(''),
    allowLatePayments: z.boolean().optional().default(true),
    gracePeriodDays: z.number().int().min(0).max(90).optional().default(0),
    allowMissedInstallments: z.boolean().optional().default(false),
    allowEarlyClosure: z.boolean().optional().default(false),
    allowPartialRedemption: z.boolean().optional().default(false),
    allowMultipleAccounts: z.boolean().optional().default(false),
    redemptionType: goldSavingRedemptionTypeSchema,
    makingChargeRules: z.string().max(2000).optional().default(''),
    wastageRules: z.string().max(2000).optional().default(''),
    availableFrom: optionalIsoDateSchema,
    availableTo: optionalIsoDateSchema,
    terms: z.string().max(8000).optional().default(''),
    status: goldSavingSchemeStatusSchema.optional().default('active'),
  })
  .superRefine((data, ctx) => {
    if (data.minInstallment != null && data.minInstallment > data.monthlyAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Minimum installment cannot exceed the monthly amount',
        path: ['minInstallment'],
      })
    }
    if (data.maxInstallment != null && data.maxInstallment < data.monthlyAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Maximum installment cannot be below the monthly amount',
        path: ['maxInstallment'],
      })
    }
    if (data.bonusType !== 'none' && (data.bonusValue ?? 0) <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Bonus value is required when a bonus type is selected',
        path: ['bonusValue'],
      })
    }
  })

export const goldSavingInitialPaymentSchema = z.object({
  amount: z.number().positive(),
  paymentDate: isoDateSchema,
  paymentMode: goldSavingPaymentModeSchema,
  transactionRef: z.string().max(120).optional().default(''),
  goldRate: z.number().positive().optional(),
  goldRateOverrideReason: z.string().max(500).optional().default(''),
  remarks: z.string().max(500).optional().default(''),
  idempotencyKey: z.string().max(80).optional(),
})

export const goldSavingAccountInputSchema = z.object({
  customerId: z.number().int().positive(),
  schemeId: z.number().int().positive(),
  monthlyAmount: z.number().positive().optional(),
  enrollmentDate: isoDateSchema,
  firstInstallmentDate: isoDateSchema,
  preferredPaymentDay: z.number().int().min(1).max(28).nullable().optional(),
  nomineeName: z.string().max(200).optional().default(''),
  nomineeRelationship: z.string().max(80).optional().default(''),
  nomineePhone: z
    .string()
    .optional()
    .default('')
    .refine((value) => value === '' || /^\d{10}$/.test(value), {
      message: 'Nominee mobile number must be exactly 10 digits',
    }),
  termsAccepted: z.boolean().refine((value) => value === true, {
    message: 'Scheme terms must be accepted',
  }),
  initialPayment: goldSavingInitialPaymentSchema.optional(),
})

export const goldSavingPaymentInputSchema = z.object({
  accountId: z.number().int().positive(),
  installmentId: z.number().int().positive().optional(),
  paymentDate: isoDateSchema,
  amount: z.number().positive(),
  lateFee: z.number().nonnegative().optional().default(0),
  discount: z.number().nonnegative().optional().default(0),
  paymentMode: goldSavingPaymentModeSchema,
  transactionRef: z.string().max(120).optional().default(''),
  goldRate: z.number().positive().optional(),
  goldRateOverrideReason: z.string().max(500).optional().default(''),
  remarks: z.string().max(500).optional().default(''),
  idempotencyKey: z.string().max(80).optional(),
})

export const goldSavingReversePaymentSchema = z.object({
  reason: z.string().trim().min(1, 'Reason is required').max(500),
})

export const goldSavingCancelAccountSchema = z.object({
  reason: z.string().trim().min(1, 'Reason is required').max(500),
})

export const goldSavingRedemptionInputSchema = z.object({
  accountId: z.number().int().positive(),
  redemptionDate: isoDateSchema,
  redemptionKind: goldSavingRedemptionKindSchema,
  goldWeight: z.number().positive().optional(),
  invoiceId: z.number().int().positive().nullable().optional(),
  makingCharges: z.number().nonnegative().optional().default(0),
  wastage: z.number().nonnegative().optional().default(0),
  taxes: z.number().nonnegative().optional().default(0),
  invoiceValue: z.number().nonnegative().optional().default(0),
  notes: z.string().max(1000).optional().default(''),
})

const emptyToUndefined = (value: unknown) =>
  value === '' || value === undefined || value === null ? undefined : value

const optionalPositiveId = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().positive().optional(),
)

export const reportQuerySchema = z.object({
  from: z.preprocess(
    emptyToUndefined,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid from date').optional(),
  ),
  to: z.preprocess(
    emptyToUndefined,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid to date').optional(),
  ),
  customerId: optionalPositiveId,
  supplierId: optionalPositiveId,
  productId: optionalPositiveId,
  metal: z.preprocess(emptyToUndefined, z.string().trim().max(40).optional()),
  qtyCutoff: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(0).max(100000).optional(),
  ),
})
