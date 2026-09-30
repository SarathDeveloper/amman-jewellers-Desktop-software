import { describe, expect, it } from 'vitest'
import { DEFAULT_BILL_TEMPLATE, DEFAULT_CASH_VISIBILITY, DEFAULT_TAX_VISIBILITY } from '@shared/billTemplate'
import type { ShopSettings } from '@shared/types'
import { composeShopAddressLines, localImageSrc, shopSettingsToDisplay } from '../../src/features/invoices/mapShopDisplay'

function shop(overrides: Partial<ShopSettings> = {}): ShopSettings {
  return {
    shopName: 'AMMAN JEWELLERS',
    tagline: 'GOLD - SILVER JEWELLERY',
    appSubtitle: 'Billing & inventory',
    gstin: '33BKJPP1190A1ZJ',
    phone1: '8903457570',
    phone2: '9583512688',
    addressLine1: 'No. 4, Kavitha Complex',
    addressLine2: 'Karumandurai, Salem Main Road, Periya Karaiyan Hills',
    addressLine3: 'Vadakku Nadu, Salem, Tamil Nadu - 636 138',
    city: '',
    state: '',
    pincode: '',
    proprietorLine1: '',
    proprietorLine2: '',
    proprietorLine3: '',
    promoLine: '',
    logoImagePath: '',
    signatureImagePath: '',
    bisLogoPath: '',
    qrCodePath: '',
    defaultPrinterCash: '',
    defaultPrinterTax: '',
    paperSizeCash: 'a5',
    paperSizeTax: 'a5',
    copiesCash: 1,
    copiesTax: 1,
    openCashDrawer: false,
    lastPrinted: { invoiceId: null, invoiceNo: '', billFormat: '' },
    billTemplate: DEFAULT_BILL_TEMPLATE,
    cashPreset: 'detailed',
    taxPreset: 'detailed',
    cashVisibility: DEFAULT_CASH_VISIBILITY,
    taxVisibility: DEFAULT_TAX_VISIBILITY,
    quickProductIds: [],
    pledgeLtvPct: 75,
    adaguInterestPct: 2.1,
    ...overrides,
  }
}

describe('composeShopAddressLines', () => {
  it('keeps the third address line when city, state, and pincode are empty', () => {
    expect(composeShopAddressLines(shop())).toEqual([
      'No. 4, Kavitha Complex',
      'Karumandurai, Salem Main Road, Periya Karaiyan Hills',
      'Vadakku Nadu, Salem, Tamil Nadu - 636 138',
    ])
  })

  it('prints city, state, and pincode instead of the third address line', () => {
    expect(
      composeShopAddressLines(
        shop({
          city: 'Salem',
          state: 'Tamil Nadu',
          pincode: '636138',
        }),
      ),
    ).toEqual([
      'No. 4, Kavitha Complex',
      'Karumandurai, Salem Main Road, Periya Karaiyan Hills',
      'Salem, Tamil Nadu - 636138',
    ])
  })
})

describe('shopSettingsToDisplay', () => {
  it('returns empty identity when settings are missing', () => {
    const display = shopSettingsToDisplay(null)
    expect(display.name).toBe('')
    expect(display.gstin).toBe('')
    expect(display.phones).toEqual([])
    expect(display.addressLines).toEqual([])
    expect(display.place).toBe('')
    expect(display.proprietorLines).toEqual([])
    expect(display.promoLine).toBe('')
  })

  it('includes the saved logo path', () => {
    const display = shopSettingsToDisplay(shop({ logoImagePath: '/tmp/logo.png' }))
    expect(display.logoImagePath).toBe('/tmp/logo.png')
    expect(display.name).toBe('AMMAN JEWELLERS')
  })

  it('includes BIS logo and QR code paths', () => {
    const display = shopSettingsToDisplay(
      shop({ bisLogoPath: '/tmp/bis.png', qrCodePath: '/tmp/qr.png' }),
    )
    expect(display.bisLogoPath).toBe('/tmp/bis.png')
    expect(display.qrCodePath).toBe('/tmp/qr.png')
  })

  it('maps city, proprietor lines, and promo from settings', () => {
    const display = shopSettingsToDisplay(
      shop({
        city: 'Salem',
        proprietorLine1: 'A. Owner',
        proprietorLine2: '',
        proprietorLine3: 'Gold Loan',
        promoLine: 'Hallmarked jewellery',
      }),
    )
    expect(display.place).toBe('Salem')
    expect(display.proprietorLines).toEqual(['A. Owner', 'Gold Loan'])
    expect(display.promoLine).toBe('Hallmarked jewellery')
  })

  it('uses saved bill template labels from shop settings', () => {
    const display = shopSettingsToDisplay(
      shop({ billTemplate: { ...DEFAULT_BILL_TEMPLATE, cashTitle: 'ESTIMATE' } }),
    )
    expect(display.billTemplate.cashTitle).toBe('ESTIMATE')
    expect(display.billTemplate.cashCustomerPrefix).toBe('Thiru')
  })

  it('uses saved cash and tax visibility from shop settings', () => {
    const display = shopSettingsToDisplay(
      shop({
        cashVisibility: { ...DEFAULT_CASH_VISIBILITY, showWastageCol: false },
        taxVisibility: { ...DEFAULT_TAX_VISIBILITY, showWastageCol: false },
      }),
    )
    expect(display.cashVisibility.showWastageCol).toBe(false)
    expect(display.cashVisibility.showLogo).toBe(true)
    expect(display.taxVisibility.showWastageCol).toBe(false)
  })
})

describe('localImageSrc', () => {
  it('returns the fallback when no file path is set', () => {
    expect(localImageSrc('', '/fallback.svg')).toBe('/fallback.svg')
    expect(localImageSrc(undefined, '/fallback.svg')).toBe('/fallback.svg')
  })

  it('serves stored files from /uploads', () => {
    expect(localImageSrc('/tmp/logo.png', '/fallback.svg')).toBe('/uploads/logo.png')
    expect(localImageSrc('/uploads/logo.png', '/fallback.svg')).toBe('/uploads/logo.png')
  })

  it('leaves already-renderable URLs unchanged', () => {
    expect(localImageSrc('data:image/png;base64,abc', '/fallback.svg')).toBe(
      'data:image/png;base64,abc',
    )
  })
})
