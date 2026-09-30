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
