import {
  BILL_TEMPLATE_FIELDS,
  CASH_VISIBILITY_FIELDS,
  DEFAULT_BILL_TEMPLATE,
  DEFAULT_CASH_VISIBILITY,
  DEFAULT_TAX_VISIBILITY,
  TAX_VISIBILITY_FIELDS,
  parseTemplatePreset,
  templateSettingKey,
  visibilitySettingKey,
} from '@shared/billTemplate'
import type {
  BillFormat,
  BillTemplateSettings,
  CashBillVisibility,
  LastPrintedBill,
  ShopSettings,
  TaxInvoiceVisibility,
} from '@shared/types'
import { getDatabase } from '../db'
import { clampCopies, parseBooleanSetting, parsePaperSize } from './printOptions'

const SHOP_KEYS = {
  shopName: 'shop_name',
  tagline: 'tagline',
  appSubtitle: 'app_subtitle',
  gstin: 'gstin',
  phone1: 'phone1',
  phone2: 'phone2',
  addressLine1: 'address_line1',
  addressLine2: 'address_line2',
  addressLine3: 'address_line3',
  city: 'city',
  state: 'state',
  pincode: 'pincode',
  proprietorLine1: 'proprietor_line1',
  proprietorLine2: 'proprietor_line2',
  proprietorLine3: 'proprietor_line3',
  promoLine: 'promo_line',
  logoImagePath: 'logo_image_path',
  signatureImagePath: 'signature_image_path',
  bisLogoPath: 'bis_logo_path',
  qrCodePath: 'qr_code_path',
  passbookBannerPath: 'passbook_banner_path',
  passbookSideImagePath: 'passbook_side_image_path',
  defaultPrinterCash: 'default_printer_cash',
  defaultPrinterTax: 'default_printer_tax',
  paperSizeCash: 'paper_size_cash',
  paperSizeTax: 'paper_size_tax',
  copiesCash: 'copies_cash',
  copiesTax: 'copies_tax',
  openCashDrawer: 'open_cash_drawer',
  lastPrintedInvoiceId: 'last_printed_invoice_id',
  lastPrintedInvoiceNo: 'last_printed_invoice_no',
  lastPrintedBillFormat: 'last_printed_bill_format',
  quickProductIds: 'quick_product_ids',
  pledgeLtvPct: 'pledge_ltv_pct',
  adaguInterestPct: 'adagu_interest_pct',
  cashPreset: 'cash_preset',
  taxPreset: 'tax_preset',
} as const

const EMPTY_LAST_PRINTED: LastPrintedBill = {
  invoiceId: null,
  invoiceNo: '',
  billFormat: '',
}

const DEFAULT_PLEDGE_LTV_PCT = 75
const DEFAULT_ADAGU_INTEREST_PCT = 2.1

function parseQuickProductIds(raw: string): number[] {
  if (!raw.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
      .slice(0, 12)
  } catch {
    return []
  }
}

function parsePledgeLtvPct(raw: string): number {
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value) || value < 0) return DEFAULT_PLEDGE_LTV_PCT
  return Math.min(100, value)
}

function parseAdaguInterestPct(raw: string): number {
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value) || value < 0) return DEFAULT_ADAGU_INTEREST_PCT
  return Math.min(100, value)
}

export function getShopSetting(db: ReturnType<typeof getDatabase>, key: string, fallback = ''): string {
  const row = db.prepare('SELECT value FROM shop_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? fallback
}

export function setShopSetting(db: ReturnType<typeof getDatabase>, key: string, value: string): void {
  db.prepare(
    `INSERT INTO shop_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value)
}

function loadBillTemplate(db: ReturnType<typeof getDatabase>): BillTemplateSettings {
  const template = { ...DEFAULT_BILL_TEMPLATE }
  for (const field of BILL_TEMPLATE_FIELDS) {
    template[field] = getShopSetting(db, templateSettingKey(field), DEFAULT_BILL_TEMPLATE[field])
  }
  return template
}

function parseVisibilityFlag(raw: string, fallback: boolean): boolean {
  if (raw === '1' || raw === 'true') return true
  if (raw === '0' || raw === 'false') return false
  return fallback
}

function loadCashVisibility(db: ReturnType<typeof getDatabase>): CashBillVisibility {
  const visibility = { ...DEFAULT_CASH_VISIBILITY }
  for (const field of CASH_VISIBILITY_FIELDS) {
    visibility[field] = parseVisibilityFlag(
      getShopSetting(db, visibilitySettingKey('cash', field), ''),
      DEFAULT_CASH_VISIBILITY[field],
    )
  }
  return visibility
}

function loadTaxVisibility(db: ReturnType<typeof getDatabase>): TaxInvoiceVisibility {
  const visibility = { ...DEFAULT_TAX_VISIBILITY }
  for (const field of TAX_VISIBILITY_FIELDS) {
    visibility[field] = parseVisibilityFlag(
      getShopSetting(db, visibilitySettingKey('tax', field), ''),
      DEFAULT_TAX_VISIBILITY[field],
    )
  }
  return visibility
}

function loadLastPrinted(db: ReturnType<typeof getDatabase>): LastPrintedBill {
  const rawId = getShopSetting(db, SHOP_KEYS.lastPrintedInvoiceId, '')
  const invoiceId = Number.parseInt(rawId, 10)
  const invoiceNo = getShopSetting(db, SHOP_KEYS.lastPrintedInvoiceNo, '')
  const billFormat = getShopSetting(db, SHOP_KEYS.lastPrintedBillFormat, '')
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    return EMPTY_LAST_PRINTED
  }
  return {
    invoiceId,
    invoiceNo,
    billFormat: billFormat === 'tax_invoice' || billFormat === 'cash_bill' ? billFormat : '',
  }
}

const DEFAULT_SHOP_NAME = 'AMMAN JEWELLERS'
const DEFAULT_GSTIN = '33BKJPP1190A1ZJ'
const DEFAULT_PHONE1 = '8903457570'
const DEFAULT_PHONE2 = '9583512688'
const DEFAULT_ADDRESS_LINE1 = 'No. 4, Kavitha Complex'
const DEFAULT_ADDRESS_LINE2 = 'Karumandurai, Salem Main Road, Periya Karaiyan Hills, Vadakku Nadu'
const DEFAULT_CITY = 'Salem'
const DEFAULT_STATE = 'Tamil Nadu'
const DEFAULT_PINCODE = '636138'

export function loadShopSettings(db: ReturnType<typeof getDatabase>): ShopSettings {
  return {
    shopName: getShopSetting(db, SHOP_KEYS.shopName, DEFAULT_SHOP_NAME).trim() || DEFAULT_SHOP_NAME,
    tagline: getShopSetting(db, SHOP_KEYS.tagline, ''),
    appSubtitle:
      getShopSetting(db, SHOP_KEYS.appSubtitle, 'Billing & inventory').trim() || 'Billing & inventory',
    gstin: getShopSetting(db, SHOP_KEYS.gstin, DEFAULT_GSTIN),
    phone1: getShopSetting(db, SHOP_KEYS.phone1, DEFAULT_PHONE1),
    phone2: getShopSetting(db, SHOP_KEYS.phone2, DEFAULT_PHONE2),
    addressLine1: getShopSetting(db, SHOP_KEYS.addressLine1, DEFAULT_ADDRESS_LINE1),
    addressLine2: getShopSetting(db, SHOP_KEYS.addressLine2, DEFAULT_ADDRESS_LINE2),
    addressLine3: getShopSetting(db, SHOP_KEYS.addressLine3, ''),
    city: getShopSetting(db, SHOP_KEYS.city, DEFAULT_CITY),
    state: getShopSetting(db, SHOP_KEYS.state, DEFAULT_STATE),
    pincode: getShopSetting(db, SHOP_KEYS.pincode, DEFAULT_PINCODE),
    proprietorLine1: getShopSetting(db, SHOP_KEYS.proprietorLine1, ''),
    proprietorLine2: getShopSetting(db, SHOP_KEYS.proprietorLine2, ''),
    proprietorLine3: getShopSetting(db, SHOP_KEYS.proprietorLine3, ''),
    promoLine: getShopSetting(db, SHOP_KEYS.promoLine, ''),
    logoImagePath: getShopSetting(db, SHOP_KEYS.logoImagePath, ''),
    signatureImagePath: getShopSetting(db, SHOP_KEYS.signatureImagePath, ''),
    bisLogoPath: getShopSetting(db, SHOP_KEYS.bisLogoPath, ''),
    qrCodePath: getShopSetting(db, SHOP_KEYS.qrCodePath, ''),
    passbookBannerPath: getShopSetting(db, SHOP_KEYS.passbookBannerPath, ''),
    passbookSideImagePath: getShopSetting(db, SHOP_KEYS.passbookSideImagePath, ''),
    defaultPrinterCash: getShopSetting(db, SHOP_KEYS.defaultPrinterCash, ''),
    defaultPrinterTax: getShopSetting(db, SHOP_KEYS.defaultPrinterTax, ''),
    paperSizeCash: parsePaperSize(getShopSetting(db, SHOP_KEYS.paperSizeCash, 'a5')),
    paperSizeTax: parsePaperSize(getShopSetting(db, SHOP_KEYS.paperSizeTax, 'a4')),
    copiesCash: clampCopies(getShopSetting(db, SHOP_KEYS.copiesCash, '1')),
    copiesTax: clampCopies(getShopSetting(db, SHOP_KEYS.copiesTax, '1')),
    openCashDrawer: parseBooleanSetting(getShopSetting(db, SHOP_KEYS.openCashDrawer, '')),
    lastPrinted: loadLastPrinted(db),
    billTemplate: loadBillTemplate(db),
    cashPreset: parseTemplatePreset(getShopSetting(db, SHOP_KEYS.cashPreset, 'detailed')),
    taxPreset: parseTemplatePreset(getShopSetting(db, SHOP_KEYS.taxPreset, 'detailed')),
    cashVisibility: loadCashVisibility(db),
    taxVisibility: loadTaxVisibility(db),
    quickProductIds: parseQuickProductIds(getShopSetting(db, SHOP_KEYS.quickProductIds, '[]')),
    pledgeLtvPct: parsePledgeLtvPct(getShopSetting(db, SHOP_KEYS.pledgeLtvPct, String(DEFAULT_PLEDGE_LTV_PCT))),
    adaguInterestPct: parseAdaguInterestPct(
      getShopSetting(db, SHOP_KEYS.adaguInterestPct, String(DEFAULT_ADAGU_INTEREST_PCT)),
    ),
  }
}

export function saveShopSettings(db: ReturnType<typeof getDatabase>, input: ShopSettings): ShopSettings {
  setShopSetting(db, SHOP_KEYS.shopName, input.shopName)
  setShopSetting(db, SHOP_KEYS.tagline, input.tagline)
  setShopSetting(db, SHOP_KEYS.appSubtitle, input.appSubtitle)
  setShopSetting(db, SHOP_KEYS.gstin, input.gstin)
  setShopSetting(db, SHOP_KEYS.phone1, input.phone1)
  setShopSetting(db, SHOP_KEYS.phone2, input.phone2)
  setShopSetting(db, SHOP_KEYS.addressLine1, input.addressLine1)
  setShopSetting(db, SHOP_KEYS.addressLine2, input.addressLine2)
  setShopSetting(db, SHOP_KEYS.addressLine3, input.addressLine3)
  setShopSetting(db, SHOP_KEYS.city, input.city)
  setShopSetting(db, SHOP_KEYS.state, input.state)
  setShopSetting(db, SHOP_KEYS.pincode, input.pincode)
  setShopSetting(db, SHOP_KEYS.proprietorLine1, input.proprietorLine1)
  setShopSetting(db, SHOP_KEYS.proprietorLine2, input.proprietorLine2)
  setShopSetting(db, SHOP_KEYS.proprietorLine3, input.proprietorLine3)
  setShopSetting(db, SHOP_KEYS.promoLine, input.promoLine)
  setShopSetting(db, SHOP_KEYS.logoImagePath, input.logoImagePath)
  setShopSetting(db, SHOP_KEYS.signatureImagePath, input.signatureImagePath)
  setShopSetting(db, SHOP_KEYS.bisLogoPath, input.bisLogoPath ?? '')
  setShopSetting(db, SHOP_KEYS.qrCodePath, input.qrCodePath ?? '')
  setShopSetting(db, SHOP_KEYS.passbookBannerPath, input.passbookBannerPath ?? '')
  setShopSetting(db, SHOP_KEYS.passbookSideImagePath, input.passbookSideImagePath ?? '')
  setShopSetting(db, SHOP_KEYS.defaultPrinterCash, input.defaultPrinterCash)
  setShopSetting(db, SHOP_KEYS.defaultPrinterTax, input.defaultPrinterTax)
  setShopSetting(db, SHOP_KEYS.paperSizeCash, input.paperSizeCash)
  setShopSetting(db, SHOP_KEYS.paperSizeTax, input.paperSizeTax)
  setShopSetting(db, SHOP_KEYS.copiesCash, String(input.copiesCash))
  setShopSetting(db, SHOP_KEYS.copiesTax, String(input.copiesTax))
  setShopSetting(db, SHOP_KEYS.openCashDrawer, input.openCashDrawer ? '1' : '0')
  setShopSetting(
    db,
    SHOP_KEYS.quickProductIds,
    JSON.stringify((input.quickProductIds ?? []).slice(0, 12)),
  )
  setShopSetting(
    db,
    SHOP_KEYS.pledgeLtvPct,
    String(input.pledgeLtvPct ?? DEFAULT_PLEDGE_LTV_PCT),
  )
  setShopSetting(
    db,
    SHOP_KEYS.adaguInterestPct,
    String(input.adaguInterestPct ?? DEFAULT_ADAGU_INTEREST_PCT),
  )
  for (const field of BILL_TEMPLATE_FIELDS) {
    setShopSetting(db, templateSettingKey(field), input.billTemplate[field])
  }
  setShopSetting(db, SHOP_KEYS.cashPreset, parseTemplatePreset(input.cashPreset))
  setShopSetting(db, SHOP_KEYS.taxPreset, parseTemplatePreset(input.taxPreset))
  const cashVisibility = { ...DEFAULT_CASH_VISIBILITY, ...input.cashVisibility }
  const taxVisibility = { ...DEFAULT_TAX_VISIBILITY, ...input.taxVisibility }
  for (const field of CASH_VISIBILITY_FIELDS) {
    setShopSetting(db, visibilitySettingKey('cash', field), cashVisibility[field] ? '1' : '0')
  }
  for (const field of TAX_VISIBILITY_FIELDS) {
    setShopSetting(db, visibilitySettingKey('tax', field), taxVisibility[field] ? '1' : '0')
  }
  return loadShopSettings(db)
}

export function saveLastPrintedBill(
  db: ReturnType<typeof getDatabase>,
  invoiceId: number,
  invoiceNo: string,
  billFormat: BillFormat,
): void {
  setShopSetting(db, SHOP_KEYS.lastPrintedInvoiceId, String(invoiceId))
  setShopSetting(db, SHOP_KEYS.lastPrintedInvoiceNo, invoiceNo)
  setShopSetting(db, SHOP_KEYS.lastPrintedBillFormat, billFormat)
}

export function clearLastPrintedBill(db: ReturnType<typeof getDatabase>): void {
  setShopSetting(db, SHOP_KEYS.lastPrintedInvoiceId, '')
  setShopSetting(db, SHOP_KEYS.lastPrintedInvoiceNo, '')
  setShopSetting(db, SHOP_KEYS.lastPrintedBillFormat, '')
}
