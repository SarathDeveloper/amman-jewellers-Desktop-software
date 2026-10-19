import {
  GOLD_PURITIES,
  SILVER_PURITIES,
  STOCK_ITEM_NAMES,
  STOCK_METALS,
} from '@shared/itemTypes'
import {
  type InventoryPiece,
  type InventoryPieceStatus,
  type InventoryPieceUpdateInput,
  type Product,
  type ProductInput,
} from '@shared/types'
import { numericFieldToNumber, type NumericField } from '../../lib/numericField'
import { resizeHuidRows } from './HuidEntryList'
import { isGold, isSilver, stockTone, type StockTone } from './productDisplay'

export type ProductAttributeRow = { id: string; key: string; value: string }

/** One opening ornament typed on the product form. Tags are assigned on save. */
export type OpeningPieceRow = {
  id: string
  grossWeight: NumericField
  stoneWeight: NumericField
  netWeight: NumericField
  huid: string
  /** Copies the design weights until this row is edited. */
  followsDesign: boolean
}

let attributeIdSeq = 0
let openingPieceSeq = 0

/** Stable row id so React keeps input focus when a row in the middle is removed. */
export function newAttributeRow(key = '', value = ''): ProductAttributeRow {
  attributeIdSeq += 1
  return { id: `attr-${attributeIdSeq}`, key, value }
}

export function newOpeningPiece(
  template: Pick<OpeningPieceRow, 'grossWeight' | 'stoneWeight' | 'netWeight'> = {
    grossWeight: '',
    stoneWeight: '',
    netWeight: '',
  },
  huid = '',
): OpeningPieceRow {
  openingPieceSeq += 1
  return {
    id: `piece-${openingPieceSeq}`,
    grossWeight: template.grossWeight,
    stoneWeight: template.stoneWeight,
    netWeight: template.netWeight,
    huid,
    followsDesign: true,
  }
}

/** Grows or shrinks the piece rows to match the stock quantity. */
export function resizeOpeningPieces(
  current: OpeningPieceRow[],
  qty: number,
  template: Pick<OpeningPieceRow, 'grossWeight' | 'stoneWeight' | 'netWeight'>,
): OpeningPieceRow[] {
  const count = Math.max(0, Math.trunc(qty))
  if (current.length === count) return current
  if (current.length > count) return current.slice(0, count)
  const extra = Array.from({ length: count - current.length }, () => newOpeningPiece(template))
  return [...current, ...extra]
}

/** Piece rows that still follow the design pick up its latest weights. */
export function syncFollowingPieces(form: ProductFormState): ProductFormState {
  return {
    ...form,
    openingPieces: form.openingPieces.map((piece) =>
      piece.followsDesign
        ? {
            ...piece,
            grossWeight: form.grossWeight,
            stoneWeight: form.stoneWeight,
            netWeight: form.netWeight,
          }
        : piece,
    ),
  }
}

export type ProductFormState = Omit<
  ProductInput,
  'grossWeight' | 'netWeight' | 'makingCharges' | 'stockQty' | 'stoneWeight' | 'attributes' | 'huids'
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
  huids: string[]
  /** One row per ornament; stock is then changed only through pieces. */
  trackPieces: boolean
  /** Opening pieces typed with the product. Empty once the product already tracks pieces. */
  openingPieces: OpeningPieceRow[]
}

export type ProductFormErrors = Partial<
  Record<
    'name' | 'category' | 'metal' | 'purity' | 'netWeight' | 'stoneWeight' | 'huids' | 'pieces',
    string
  >
>

/** One existing inventory piece shown on the product edit form. */
export type ExistingPieceEditRow = {
  id: number
  tagCode: string
  status: InventoryPieceStatus
  huid: string
  grossWeight: NumericField
  stoneWeight: NumericField
  netWeight: NumericField
  cost: NumericField
  editable: boolean
}

export function inventoryPieceToEditRow(piece: InventoryPiece): ExistingPieceEditRow {
  return {
    id: piece.id,
    tagCode: piece.tagCode,
    status: piece.status,
    huid: piece.huid ?? '',
    grossWeight: piece.grossWeight,
    stoneWeight: piece.stoneWeight,
    netWeight: piece.netWeight,
    cost: piece.cost == null ? '' : piece.cost,
    editable: piece.status === 'in_stock',
  }
}

export function validateExistingPieceEdits(rows: ExistingPieceEditRow[]): string | undefined {
  const editable = rows.filter((row) => row.editable)
  const seenHuids = new Set<string>()
  for (const [index, piece] of editable.entries()) {
    const label = piece.tagCode || `piece ${index + 1}`
    const huid = piece.huid.trim().toUpperCase()
    const pieceGross = numericFieldToNumber(piece.grossWeight)
    const pieceNet = numericFieldToNumber(piece.netWeight)
    const pieceStone = numericFieldToNumber(piece.stoneWeight)
    const pieceCost = piece.cost === '' ? null : numericFieldToNumber(piece.cost)
    if (pieceNet <= 0) {
      return `Enter the net weight for ${label}`
    }
    if (pieceGross > 0 && pieceNet > pieceGross) {
      return `${label}: net weight cannot exceed gross weight`
    }
    if (pieceGross > 0 && pieceStone > pieceGross) {
      return `${label}: stone weight cannot exceed gross weight`
    }
    if (pieceCost != null && pieceCost < 0) {
      return `${label}: cost cannot be negative`
    }
    if (!huid) continue
    if (!/^[0-9A-Z]+$/.test(huid)) {
      return 'HUID can only be letters and digits'
    }
    if (seenHuids.has(huid)) {
      return `HUID ${huid} is duplicated`
    }
    seenHuids.add(huid)
  }
  return undefined
}

export function existingPiecesToUpdateInput(
  rows: ExistingPieceEditRow[],
): InventoryPieceUpdateInput[] {
  return rows
    .filter((row) => row.editable)
    .map((row) => ({
      id: row.id,
      huid: row.huid.trim().toUpperCase(),
      grossWeight: numericFieldToNumber(row.grossWeight),
      stoneWeight: numericFieldToNumber(row.stoneWeight),
      netWeight: numericFieldToNumber(row.netWeight),
      cost: row.cost === '' ? null : numericFieldToNumber(row.cost),
    }))
}

export const emptyProductForm: ProductFormState = {
  name: '',
  category: STOCK_ITEM_NAMES[0],
  metal: 'Gold',
  purity: '22K',
  grossWeight: '',
  netWeight: '',
  makingCharges: '',
  stockQty: 1,
  imagePath: '',
  parentId: null,
  variantCode: '',
  size: '',
  stoneWeight: '',
  stoneDetails: '',
  attributes: [],
  isActive: true,
  huids: [''],
  trackPieces: true,
  openingPieces: [newOpeningPiece()],
}

export function defaultPurityForMetal(metal: string): string {
  return isSilver(metal) ? SILVER_PURITIES[0] : '22K'
}

function attributesToRows(attributes: Product['attributes'] | undefined): ProductAttributeRow[] {
  return Object.entries(attributes ?? {}).map(([key, value]) => newAttributeRow(key, value))
}

export function productToForm(product: Product | null, parent?: Product | null): ProductFormState {
  if (!product && parent) {
    return {
      ...emptyProductForm,
      openingPieces: [newOpeningPiece()],
      name: parent.name,
      category: parent.category || STOCK_ITEM_NAMES[0],
      metal: parent.metal || 'Gold',
      purity: parent.purity || defaultPurityForMetal(parent.metal || 'Gold'),
      imagePath: parent.imagePath,
      parentId: parent.id,
      makingCharges: parent.makingCharges || '',
    }
  }
  if (!product) return { ...emptyProductForm, openingPieces: [newOpeningPiece()] }
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
    huids: resizeHuidRows(product.huids ?? [], product.stockQty, true),
    trackPieces: product.trackPieces,
    openingPieces: product.trackPieces
      ? []
      : resizeOpeningPieces([], product.stockQty, {
          grossWeight: product.grossWeight,
          stoneWeight: product.stoneWeight,
          netWeight: product.netWeight,
        }).map((piece, index) => ({
          ...piece,
          huid: (product.huids ?? [])[index] ?? '',
        })),
  }
}

export function formToProductInput(form: ProductFormState): ProductInput {
  const attributes = Object.fromEntries(
    form.attributes
      .map((row) => [row.key.trim(), row.value.trim()] as const)
      .filter(([key, value]) => key && value),
  )
  const seen = new Set<string>()
  const huids: string[] = []
  const pieceRows = form.trackPieces ? form.openingPieces : []
  const huidSource = pieceRows.length > 0 ? pieceRows.map((piece) => piece.huid) : form.huids
  for (const raw of huidSource) {
    const huid = raw.trim().toUpperCase()
    if (!huid || seen.has(huid)) continue
    seen.add(huid)
    huids.push(huid)
  }
  const pieces =
    pieceRows.length > 0
      ? pieceRows.map((piece) => ({
          huid: piece.huid.trim().toUpperCase(),
          grossWeight: numericFieldToNumber(piece.grossWeight),
          stoneWeight: numericFieldToNumber(piece.stoneWeight),
          netWeight: numericFieldToNumber(piece.netWeight),
        }))
      : undefined
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
    huids,
    trackPieces: form.trackPieces,
    pieces,
  }
}

/**
 * Turns the form into the create/update payload. A product created from inside
 * a purchase must carry no stock of its own: the purchase line adds the pieces
 * on finalize, so a stock quantity here would count them twice.
 */
export function productInputForSource(
  form: ProductFormState,
  source: 'products' | 'purchase',
): ProductInput {
  const effective =
    source === 'purchase'
      ? { ...form, stockQty: 0, huids: [], trackPieces: true, openingPieces: [] }
      : form
  return formToProductInput(effective)
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
  allowNewCategory = false,
): ProductFormErrors {
  const errors: ProductFormErrors = {}
  const name = form.name.trim()

  if (!name) {
    errors.name = 'Name is required'
  }

  const category = form.category.trim()
  if (!category) {
    errors.category = 'Category is required'
  } else if (allowNewCategory) {
    if (category.length > 80) {
      errors.category = 'Category name must be 80 characters or less'
    }
  } else if (
    allowedCategories.length > 0 &&
    !allowedCategories.some((value) => value.toLowerCase() === category.toLowerCase())
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

  const seenHuids = new Set<string>()
  for (const raw of form.huids) {
    const huid = raw.trim().toUpperCase()
    if (!huid) continue
    if (!/^[0-9A-Z]+$/.test(huid)) {
      errors.huids = 'HUID can only be letters and digits'
      break
    }
    if (seenHuids.has(huid)) {
      errors.huids = `HUID ${huid} is duplicated`
      break
    }
    seenHuids.add(huid)
  }

  const filledHuidCount = form.huids.filter((value) => value.trim()).length
  const stockQty = Math.max(0, Math.trunc(numericFieldToNumber(form.stockQty)))
  if (!errors.huids && filledHuidCount > stockQty) {
    errors.huids = 'A product cannot have more HUIDs than pieces in stock'
  }

  if (form.trackPieces && form.openingPieces.length > 0) {
    if (form.openingPieces.length !== stockQty) {
      errors.pieces = 'Enter one row for each piece in stock'
    }
    const seenPieceHuids = new Set<string>()
    for (const [index, piece] of form.openingPieces.entries()) {
      const huid = piece.huid.trim().toUpperCase()
      const pieceGross = numericFieldToNumber(piece.grossWeight)
      const pieceNet = numericFieldToNumber(piece.netWeight)
      const pieceStone = numericFieldToNumber(piece.stoneWeight)
      if (!errors.pieces && pieceNet <= 0) {
        errors.pieces = `Enter the net weight for piece ${index + 1}`
      }
      if (!errors.pieces && pieceGross > 0 && pieceNet > pieceGross) {
        errors.pieces = `Piece ${index + 1} net weight cannot exceed gross weight`
      }
      if (!errors.pieces && pieceGross > 0 && pieceStone > pieceGross) {
        errors.pieces = `Piece ${index + 1} stone weight cannot exceed gross weight`
      }
      if (!huid) continue
      if (!/^[0-9A-Z]+$/.test(huid)) {
        errors.pieces = 'HUID can only be letters and digits'
        break
      }
      if (seenPieceHuids.has(huid)) {
        errors.pieces = `HUID ${huid} is duplicated`
        break
      }
      seenPieceHuids.add(huid)
    }
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
    ...(input.huids ?? []),
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
