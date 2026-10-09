export const STOCK_METALS = ['Gold', 'Silver'] as const
export type StockMetal = (typeof STOCK_METALS)[number]

export const STOCK_ITEM_NAMES = [
  'Chain',
  'Necklace',
  'Haram',
  'Bangle',
  'Ring',
  'Stud',
  'Mattal',
  'Nosepin',
  'Thali',
  'Gundu',
  'L. Coin',
  'P. Coin',
  'Nanal',
  'Backchain',
  'D Studs',
] as const

export const DEFAULT_STOCK_ITEM_NAMES = STOCK_ITEM_NAMES

export type StockItemName = (typeof STOCK_ITEM_NAMES)[number]

export const GOLD_PURITIES = ['24K', '22K', '18K'] as const
export const SILVER_PURITIES = ['925'] as const

/** Hallmarking is mandatory for gold; silver pieces may be stocked and sold untagged. */
export function isHuidMandatory(metal: string): boolean {
  return !metal.trim().toLowerCase().includes('silver')
}

/** Why `count` HUIDs are not acceptable for `qty` new pieces of `metal`, or null when they are. */
export function newPieceHuidError(metal: string, count: number, qty: number): string | null {
  if (count > qty) {
    return qty === 1 ? 'Only 1 HUID can be added for 1 piece' : `Only ${qty} HUIDs can be added for ${qty} pieces`
  }
  if (isHuidMandatory(metal) && count !== qty) {
    return qty === 1 ? 'Add 1 HUID for the new piece' : `Add ${qty} HUIDs for the new pieces`
  }
  return null
}

/**
 * How many tagged HUIDs must (min) and may (max) be removed when `qty` pieces leave stock.
 * Silver only has to drop tags once more pieces are tagged than remain in stock.
 */
export function huidRemovalRange(
  metal: string,
  taggedCount: number,
  stockQty: number,
  qty: number,
): { min: number; max: number } {
  const max = Math.min(qty, taggedCount)
  if (isHuidMandatory(metal)) return { min: max, max }
  return { min: Math.min(max, Math.max(0, taggedCount - Math.max(0, stockQty - qty))), max }
}
