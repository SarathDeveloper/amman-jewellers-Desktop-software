import { Boxes, ClipboardList, Coins, Gem, Scale, Truck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { FeatureKey } from '@shared/types'

export const INVENTORY_TABS: {
  to: string
  label: string
  feature: FeatureKey
  icon: LucideIcon
}[] = [
  { to: '/inventory/products', label: 'Products', feature: 'products', icon: Gem },
  { to: '/inventory/stock', label: 'Gold & Silver', feature: 'stock', icon: Scale },
  { to: '/inventory/inwards', label: 'Purchase', feature: 'inward', icon: ClipboardList },
  { to: '/inventory/old-gold', label: 'Old Gold Purchase', feature: 'inward', icon: Coins },
  { to: '/inventory/old-gold-lot', label: 'Old Gold Lot', feature: 'inward', icon: Boxes },
  { to: '/inventory/suppliers', label: 'Suppliers', feature: 'inward', icon: Truck },
]

export function firstInventoryPath(can: (feature: FeatureKey) => boolean): string | null {
  return INVENTORY_TABS.find((tab) => can(tab.feature))?.to ?? null
}

export function canAccessInventory(can: (feature: FeatureKey) => boolean): boolean {
  return INVENTORY_TABS.some((tab) => can(tab.feature))
}
