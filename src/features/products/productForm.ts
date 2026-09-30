import {
  GOLD_PURITIES,
  SILVER_PURITIES,
  STOCK_ITEM_NAMES,
  STOCK_METALS,
} from '@shared/itemTypes'
import { EMPTY_PRODUCT_VARIANT_FIELDS, type Product, type ProductInput } from '@shared/types'
import { numericFieldToNumber, type NumericField } from '../../lib/numericField'
import { isGold, isSilver, stockTone, type StockTone } from './productDisplay'

export type ProductAttributeRow = { key: string; value: string }

export type ProductFormState = Omit<
  ProductInput,
  'grossWeight' | 'netWeight' | 'makingCharges' | 'stockQty' | 'stoneWeight' | 'attributes'
> & {
  grossWeight: NumericField
  netWeight: NumericField
  makingCharges: NumericField
  stockQty: NumericField
  stoneWeight: NumericField
  attributes: ProductAttributeRow[]
  parentId: number | null
  variantCode: string
  size: string
  stoneDetails: string
  isActive: boolean
}

export type ProductFormErrors = Partial<
  Record<'name' | 'category' | 'metal' | 'purity' | 'netWeight' | 'stoneWeight', string>
>

export const emptyProductForm: ProductFormState = {
  name: '',
  category: STOCK_ITEM_NAMES[0],
  metal: 'Gold',
  purity: '22K',
  grossWeight: '',
  netWeight: '',
  makingCharges: '',
  stockQty: '',
  imagePath: '',
  parentId: null,
  variantCode: '',
  size: '',
  stoneWeight: '',
  stoneDetails: '',
  attributes: [],
  isActive: true,
}

export function defaultPurityForMetal(metal: string): string {
  return isSilver(metal) ? SILVER_PURITIES[0] : '22K'
}

function attributesToRows(attributes: Product['attributes'] | undefined): ProductAttributeRow[] {
  return Object.entries(attributes ?? {}).map(([key, value]) => ({ key, value }))
}

export function productToForm(product: Product | null, parent?: Product | null): ProductFormState {
  if (!product && parent) {
    return {
      ...emptyProductForm,
      name: parent.name,
      category: parent.category || STOCK_ITEM_NAMES[0],
      metal: parent.metal || 'Gold',
      purity: parent.purity || defaultPurityForMetal(parent.metal || 'Gold'),
      imagePath: parent.imagePath,
      parentId: parent.id,
      makingCharges: parent.makingCharges || '',
    }
  }
  if (!product) return emptyProductForm
  const metal = product.metal || 'Gold'
  return {
    name: product.name,
    category: product.category || STOCK_ITEM_NAMES[0],
    metal,
    purity: product.purity || defaultPurityForMetal(metal),
    grossWeight: product.grossWeight,
    netWeight: product.netWeight,
    makingCharges: product.makingCharges,
    stockQty: product.stockQty,
    imagePath: product.imagePath,
    parentId: product.parentId,
    variantCode: product.variantCode,
    size: product.size,
    stoneWeight: product.stoneWeight,
    stoneDetails: product.stoneDetails,
    attributes: attributesToRows(product.attributes),
    isActive: product.isActive,
  }
}

export function formToProductInput(form: ProductFormState): ProductInput {
  const attributes = Object.fromEntries(
    form.attributes
      .map((row) => [row.key.trim(), row.value.trim()] as const)
      .filter(([key, value]) => key && value),
  )
  return {
    name: form.name.trim(),
    category: form.category.trim(),
    metal: form.metal.trim(),
    purity: form.purity.trim(),
    grossWeight: numericFieldToNumber(form.grossWeight),
    netWeight: numericFieldToNumber(form.netWeight),
    makingCharges: numericFieldToNumber(form.makingCharges),
    stockQty: Math.max(0, Math.trunc(numericFieldToNumber(form.stockQty))),
    imagePath: form.imagePath.trim(),
    parentId: form.parentId,
    variantCode: form.variantCode.trim(),
    size: form.size.trim(),
    stoneWeight: numericFieldToNumber(form.stoneWeight),
    stoneDetails: form.stoneDetails.trim(),
    attributes,
    isActive: form.isActive,
  }
}

function mergePreferred(preferred: readonly string[], extras: string[]): string[] {
  const seen = new Set<string>()
  const values: string[] = []
  for (const value of [...preferred, ...extras]) {
    if (!value || seen.has(value)) continue
    seen.add(value)
    values.push(value)
  }
  return values
}

export function metalOptions(current: string): string[] {
  return mergePreferred(STOCK_METALS, [current])
}

export function categoryOptions(categoryNames: string[], current: string): string[] {
  return mergePreferred(categoryNames, current ? [current] : [])
}

export function resolvePurityForMetal(metal: string, current: string, products: Product[]): string {
  const allowed = purityOptions(metal, products, '')
  return allowed.includes(current) ? current : defaultPurityForMetal(metal)
}

export function purityOptions(metal: string, products: Product[], current: string): string[] {
  const preferred = isSilver(metal) ? SILVER_PURITIES : GOLD_PURITIES
  const related = products
    .filter((product) => (isSilver(metal) ? isSilver(product.metal) : isGold(product.metal)))
    .map((product) => product.purity)
  return mergePreferred(preferred, [...related, current])
}

export function validateProductForm(
  form: ProductFormState,
  _products: Product[],
  _editingId: number | null,
  allowedCategories: string[] = [],
): ProductFormErrors {
  const errors: ProductFormErrors = {}
  const name = form.name.trim()

  if (!name) {
    errors.name = 'Name is required'
  }

  if (!form.category.trim()) {
    errors.category = 'Category is required'
  } else if (
    allowedCategories.length > 0 &&
    !allowedCategories.some((value) => value.toLowerCase() === form.category.trim().toLowerCase())
  ) {
    errors.category = 'Category does not exist. Create it in Stock first.'
  }

  if (!form.metal.trim()) {
    errors.metal = 'Metal is required'
  }

  if (!form.purity.trim()) {
    errors.purity = 'Purity is required'
  }

  const grossWeight = numericFieldToNumber(form.grossWeight)
  const netWeight = numericFieldToNumber(form.netWeight)
  const stoneWeight = numericFieldToNumber(form.stoneWeight)
  if (netWeight > grossWeight) {
    errors.netWeight = 'Net weight cannot exceed gross weight'
  }
  if (stoneWeight > grossWeight) {
    errors.stoneWeight = 'Stone weight cannot exceed gross weight'
  }

  return errors
}

export function productMatchesListContext(
  input: ProductInput,
  context: {
    search: string
    metal: string
    category: string
    purity: string
    stockStatus: 'all' | StockTone
  },
): boolean {
  const query = context.search.trim().toLowerCase()
  const haystack = [
    input.name,
    input.category,
    input.variantCode ?? '',
    input.size ?? '',
    input.stoneDetails ?? '',
  ]
  if (query && !haystack.some((value) => value.toLowerCase().includes(query))) {
    return false
  }
  if (context.metal !== 'all' && !input.metal.toLowerCase().includes(context.metal)) return false
  if (context.category !== 'all' && input.category !== context.category) return false
  if (context.purity !== 'all' && input.purity !== context.purity) return false
  if (context.stockStatus !== 'all' && stockTone(input.stockQty) !== context.stockStatus) return false
  return true
}
