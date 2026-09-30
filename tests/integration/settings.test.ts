import { describe, expect, it } from 'vitest'
import { DEFAULT_BILL_TEMPLATE, templateSettingKey } from '@shared/billTemplate'
import type { ShopSettings } from '@shared/types'
import { getDatabase } from '../../server/db'
import { loadShopSettings } from '../../server/lib/settingsStore'
import { IPC_CHANNELS, ipc, useIntegrationEnv } from './helpers/testEnv'
import { invokeIpcForTests } from './helpers/testEnv'

describe('settings IPC', () => {
  useIntegrationEnv()

  it('returns default bill template labels on get', async () => {
    const settings = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    expect(settings.billTemplate).toEqual(DEFAULT_BILL_TEMPLATE)
  })

  it('persists bill template labels through update and reloads from SQLite', async () => {
    const current = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    const updated = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_UPDATE, {
      ...current,
      shopName: 'Template Shop',
      billTemplate: {
        ...current.billTemplate,
        cashTitle: 'ESTIMATE',
        cashCustomerPrefix: 'Mr',
        taxThanks: 'Visit again soon',
      },
    })

    expect(updated.billTemplate.cashTitle).toBe('ESTIMATE')
    expect(updated.billTemplate.cashCustomerPrefix).toBe('Mr')
    expect(updated.billTemplate.taxThanks).toBe('Visit again soon')

    const db = getDatabase()
    expect(
      db
        .prepare('SELECT value FROM shop_settings WHERE key = ?')
        .get(templateSettingKey('cashTitle')) as { value: string },
    ).toEqual({ value: 'ESTIMATE' })

    const reloaded = loadShopSettings(db)
    expect(reloaded.billTemplate.cashTitle).toBe('ESTIMATE')
    expect(reloaded.billTemplate.cashCustomerPrefix).toBe('Mr')

    const viaIpc = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    expect(viaIpc.billTemplate.cashTitle).toBe('ESTIMATE')
  })

  it('returns Amman Jewellers shop identity by default', async () => {
    const settings = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    expect(settings.shopName).toBe('AMMAN JEWELLERS')
    expect(settings.tagline).toBe('')
    expect(settings.gstin).toBe('33BKJPP1190A1ZJ')
    expect(settings.phone1).toBe('8903457570')
    expect(settings.phone2).toBe('9583512688')
    expect(settings.addressLine1).toBe('No. 4, Kavitha Complex')
    expect(settings.addressLine2).toBe(
      'Karumandurai, Salem Main Road, Periya Karaiyan Hills, Vadakku Nadu',
    )
    expect(settings.city).toBe('Salem')
    expect(settings.state).toBe('Tamil Nadu')
    expect(settings.pincode).toBe('636138')
    expect(settings.proprietorLine1).toBe('')
    expect(settings.promoLine).toBe('')
  })

  it('persists proprietor and promo lines', async () => {
    const current = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    const updated = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_UPDATE, {
      ...current,
      shopName: 'Test Shop',
      proprietorLine1: 'A. Owner',
      proprietorLine2: 'Partner',
      promoLine: 'Hallmarked jewellery',
    })
    expect(updated.proprietorLine1).toBe('A. Owner')
    expect(updated.proprietorLine2).toBe('Partner')
    expect(updated.promoLine).toBe('Hallmarked jewellery')

    const reloaded = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    expect(reloaded.proprietorLine1).toBe('A. Owner')
    expect(reloaded.promoLine).toBe('Hallmarked jewellery')
  })

  it('persists app subtitle for sidebar branding', async () => {
    const current = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    expect(current.appSubtitle).toBe('Billing & inventory')

    const updated = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_UPDATE, {
      ...current,
      shopName: 'AMMAN JEWELLERS',
      appSubtitle: 'Gold and silver',
    })
    expect(updated.shopName).toBe('AMMAN JEWELLERS')
    expect(updated.appSubtitle).toBe('Gold and silver')

    const db = getDatabase()
    expect(
      db.prepare('SELECT value FROM shop_settings WHERE key = ?').get('app_subtitle') as {
        value: string
      },
    ).toEqual({ value: 'Gold and silver' })

    const reloaded = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    expect(reloaded.appSubtitle).toBe('Gold and silver')
  })

  it('persists printer paper size, copies, and cash drawer flag', async () => {
    const current = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    expect(current.paperSizeCash).toBe('a5')
    expect(current.paperSizeTax).toBe('a4')
    expect(current.billTemplate.taxColParticulars).toBe('Particulars')
    expect(current.billTemplate.taxColTotWgt).toBe('Tot Wgt')
    expect(current.billTemplate.taxColStnWgt).toBe('Stn Wgt')
    expect(current.billTemplate.taxColVamc).toBe('VA/MC')
    expect(current.billTemplate.taxColStoneRate).toBe('Stone Rate')
    expect(current.billTemplate.taxColMetalRate).toBe('Gld/Slvr Rate')
    expect(current.copiesCash).toBe(1)
    expect(current.openCashDrawer).toBe(false)

    const updated = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_UPDATE, {
      ...current,
      shopName: 'Printer Shop',
      paperSizeCash: 'thermal',
      paperSizeTax: 'a4',
      copiesCash: 2,
      copiesTax: 3,
      openCashDrawer: true,
    })

    expect(updated.paperSizeCash).toBe('thermal')
    expect(updated.paperSizeTax).toBe('a4')
    expect(updated.copiesCash).toBe(2)
    expect(updated.copiesTax).toBe(3)
    expect(updated.openCashDrawer).toBe(true)

    const reloaded = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    expect(reloaded.paperSizeCash).toBe('thermal')
    expect(reloaded.copiesTax).toBe(3)
    expect(reloaded.openCashDrawer).toBe(true)
  })

  it('persists cash and tax template visibility and presets', async () => {
    const current = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    expect(current.cashPreset).toBe('detailed')
    expect(current.cashVisibility.showWastageCol).toBe(true)
    expect(current.taxVisibility.showWastageCol).toBe(true)

    const updated = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_UPDATE, {
      ...current,
      shopName: 'Visibility Shop',
      cashPreset: 'compact',
      taxPreset: 'thermal',
      cashVisibility: { ...current.cashVisibility, showWastageCol: false, showOtherCol: false },
      taxVisibility: { ...current.taxVisibility, showWastageCol: false, showMarketRates: false },
    })

    expect(updated.cashPreset).toBe('compact')
    expect(updated.taxPreset).toBe('thermal')
    expect(updated.cashVisibility.showWastageCol).toBe(false)
    expect(updated.taxVisibility.showWastageCol).toBe(false)

    const reloaded = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    expect(reloaded.cashPreset).toBe('compact')
    expect(reloaded.cashVisibility.showWastageCol).toBe(false)
    expect(reloaded.taxPreset).toBe('thermal')
    expect(reloaded.taxVisibility.showMarketRates).toBe(false)
  })

  it('persists logo image path through update and reloads from SQLite', async () => {
    const current = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    const updated = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_UPDATE, {
      ...current,
      shopName: 'Logo Shop',
      logoImagePath: '/uploads/test-logo.png',
    })

    expect(updated.logoImagePath).toBe('/uploads/test-logo.png')

    const db = getDatabase()
    expect(
      db.prepare('SELECT value FROM shop_settings WHERE key = ?').get('logo_image_path') as {
        value: string
      },
    ).toEqual({ value: '/uploads/test-logo.png' })

    const reloaded = loadShopSettings(db)
    expect(reloaded.logoImagePath).toBe('/uploads/test-logo.png')

    const viaIpc = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    expect(viaIpc.logoImagePath).toBe('/uploads/test-logo.png')
  })

  it('rejects shop settings updates without billTemplate', async () => {
    const current = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    const { billTemplate: _removed, ...withoutTemplate } = current

    const result = await invokeIpcForTests<ShopSettings>(
      IPC_CHANNELS.SETTINGS_UPDATE,
      withoutTemplate,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0)
    }
  })
})
