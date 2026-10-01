import {
  DEFAULT_BILL_TEMPLATE,
  DEFAULT_CASH_VISIBILITY,
  DEFAULT_TAX_VISIBILITY,
  type BillTemplateSettings,
  type CashBillVisibility,
  type TaxInvoiceVisibility,
} from '@shared/billTemplate'
import { shopMediaSrc } from '@shared/shopMedia'
import type { ShopSettings } from '@shared/types'

export interface ShopDisplayInfo {
  name: string
  tagline: string
  gstin: string
  phones: string[]
  addressLines: string[]
  place: string
  proprietorLines: string[]
  promoLine: string
  signatureImagePath: string
  logoImagePath: string
  bisLogoPath: string
  qrCodePath: string
  passbookBannerPath: string
  passbookSideImagePath: string
  billTemplate: BillTemplateSettings
  cashVisibility: CashBillVisibility
  taxVisibility: TaxInvoiceVisibility
}

export const EMPTY_SHOP_DISPLAY: ShopDisplayInfo = {
  name: '',
  tagline: '',
  gstin: '',
  phones: [],
  addressLines: [],
  place: '',
  proprietorLines: [],
  promoLine: '',
  signatureImagePath: '',
  logoImagePath: '',
  bisLogoPath: '',
  qrCodePath: '',
  passbookBannerPath: '',
  passbookSideImagePath: '',
  billTemplate: DEFAULT_BILL_TEMPLATE,
  cashVisibility: DEFAULT_CASH_VISIBILITY,
  taxVisibility: DEFAULT_TAX_VISIBILITY,
}

export function composeShopAddressLines(settings: ShopSettings): string[] {
  const lines = [settings.addressLine1, settings.addressLine2].filter((line) => line.trim())
  const locality = [settings.city, settings.state].filter((part) => part.trim()).join(', ')
  const pin = settings.pincode.trim()
  const localityLine = pin ? (locality ? `${locality} - ${pin}` : pin) : locality

  if (localityLine) {
    lines.push(localityLine)
  } else if (settings.addressLine3.trim()) {
    lines.push(settings.addressLine3)
  }

  return lines
}

export function localImageSrc(filePath: string | undefined, fallback: string): string {
  const path = filePath?.trim()
  if (!path) {
    return fallback
  }
  if (
    path.startsWith('data:') ||
    path.startsWith('blob:') ||
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('shop-media:')
  ) {
    return path
  }
  return shopMediaSrc(path)
}

export function shopSettingsToDisplay(settings: ShopSettings | null): ShopDisplayInfo {
  if (!settings) {
    return EMPTY_SHOP_DISPLAY
  }

  const phones = [settings.phone1, settings.phone2].filter(Boolean)
  const proprietorLines = [
    settings.proprietorLine1,
    settings.proprietorLine2,
    settings.proprietorLine3,
  ].filter((line) => line.trim())

  return {
    name: settings.shopName,
    tagline: settings.tagline,
    gstin: settings.gstin,
    phones,
    addressLines: composeShopAddressLines(settings),
    place: settings.city.trim(),
    proprietorLines,
    promoLine: settings.promoLine.trim(),
    signatureImagePath: settings.signatureImagePath,
    logoImagePath: settings.logoImagePath,
    bisLogoPath: settings.bisLogoPath ?? '',
    qrCodePath: settings.qrCodePath ?? '',
    passbookBannerPath: settings.passbookBannerPath ?? '',
    passbookSideImagePath: settings.passbookSideImagePath ?? '',
    billTemplate: settings.billTemplate ?? DEFAULT_BILL_TEMPLATE,
    cashVisibility: settings.cashVisibility ?? DEFAULT_CASH_VISIBILITY,
    taxVisibility: settings.taxVisibility ?? DEFAULT_TAX_VISIBILITY,
  }
}
