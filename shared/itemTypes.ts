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

/** HUID tagging is optional for every metal; pieces may be stocked and sold untagged. */
export function newPieceHuidError(count: number, qty: number): string | null {
  if (count > qty) {
    return qty === 1 ? 'Only 1 HUID can be added for 1 piece' : `Only ${qty} HUIDs can be added for ${qty} pieces`
  }
  return null
}

/**
 * How many tagged HUIDs must (min) and may (max) be removed when `qty` pieces leave stock.
 * Tags only have to be dropped once more pieces are tagged than remain in stock.
 */
export function huidRemovalRange(
  taggedCount: number,
  stockQty: number,
  qty: number,
): { min: number; max: number } {
  const max = Math.min(qty, taggedCount)
  return { min: Math.min(max, Math.max(0, taggedCount - Math.max(0, stockQty - qty))), max }
}
