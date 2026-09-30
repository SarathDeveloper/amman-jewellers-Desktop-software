import { describe, expect, it } from 'vitest'
import {
  BILL_TEMPLATE_FIELDS,
  CASH_VISIBILITY_FIELDS,
  DEFAULT_BILL_TEMPLATE,
  DEFAULT_CASH_VISIBILITY,
  DEFAULT_TAX_VISIBILITY,
  PRESET_CASH_VISIBILITY,
  PRESET_TAX_VISIBILITY,
  TAX_VISIBILITY_FIELDS,
  parseTemplatePreset,
  templateSettingKey,
  visibilitySettingKey,
} from '@shared/billTemplate'

describe('billTemplate', () => {
  it('maps every field to a tpl_* shop_settings key', () => {
    expect(BILL_TEMPLATE_FIELDS).toHaveLength(Object.keys(DEFAULT_BILL_TEMPLATE).length)
    for (const field of BILL_TEMPLATE_FIELDS) {
      expect(templateSettingKey(field)).toMatch(/^tpl_[a-z0-9_]+$/)
    }
  })

  it('maps visibility flags to vis_* shop_settings keys', () => {
    expect(CASH_VISIBILITY_FIELDS).toHaveLength(Object.keys(DEFAULT_CASH_VISIBILITY).length)
    expect(TAX_VISIBILITY_FIELDS).toHaveLength(Object.keys(DEFAULT_TAX_VISIBILITY).length)
    for (const field of CASH_VISIBILITY_FIELDS) {
      expect(visibilitySettingKey('cash', field)).toMatch(/^vis_cash_[a-z0-9_]+$/)
    }
    for (const field of TAX_VISIBILITY_FIELDS) {
      expect(visibilitySettingKey('tax', field)).toMatch(/^vis_tax_[a-z0-9_]+$/)
    }
  })

  it('parses known presets and falls back to detailed', () => {
    expect(parseTemplatePreset('compact')).toBe('compact')
    expect(parseTemplatePreset('thermal')).toBe('thermal')
    expect(parseTemplatePreset('custom')).toBe('custom')
    expect(parseTemplatePreset('nope')).toBe('detailed')
  })

  it('hides extra cash columns on compact and thermal presets', () => {
    expect(PRESET_CASH_VISIBILITY.detailed.showWastageCol).toBe(true)
    expect(PRESET_CASH_VISIBILITY.compact.showWastageCol).toBe(false)
    expect(PRESET_CASH_VISIBILITY.compact.showOtherCol).toBe(false)
    expect(PRESET_CASH_VISIBILITY.thermal.showMarketRates).toBe(false)
    expect(PRESET_CASH_VISIBILITY.thermal.showSignatures).toBe(false)
    expect(PRESET_TAX_VISIBILITY.compact.showWastageCol).toBe(false)
    expect(PRESET_TAX_VISIBILITY.thermal.showOtherCol).toBe(false)
  })
})
