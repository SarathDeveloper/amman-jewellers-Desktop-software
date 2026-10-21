import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Calendar,
  ClipboardList,
  Coins,
  FileText,
  FolderKanban,
  Hash,
  Lightbulb,
  Package,
  Percent,
  Plus,
  Printer,
  Save,
  Shield,
  Sparkles,
  StickyNote,
  Trash2,
  Truck,
  Weight,
  X,
} from 'lucide-react'
import {
  BULLION_CATEGORY,
  GOLD_PURITIES,
  newPieceHuidError,
  SILVER_PURITIES,
  STOCK_ITEM_NAMES,
  STOCK_METALS,
} from '@shared/itemTypes'
import { computePurchaseTotals, type PurchaseTotalsResult } from '@shared/billing/billSummary'
import { computePurchaseLineAmount, DEFAULT_HSN } from '@shared/billing/pricing'
import { localTodayIso } from '@shared/localDate'
import type {
  Inward,
  InwardItemInput,
  Product,
  PurchaseGstMode,
  PurchasePaymentMode,
  Supplier,
} from '@shared/types'
import { Modal } from '../../components/Modal'
import { DateInput } from '../../components/DateInput'
import { useToast } from '../../components/toastContext'
import { api } from '../../lib/api'
import { onEnterAdvanceFields } from '../../lib/formKeyboard'
import { formatCurrency, formatDisplayDate, formatWeight } from '../../lib/format'
import { numericFieldToNumber, parseNumericField, type NumericField } from '../../lib/numericField'
import { isSilver } from '../products/productDisplay'
import { HuidEntryList, resizeHuidRows } from '../products/HuidEntryList'
import { SupplierFormModal } from '../suppliers/SupplierFormModal'
import { BillProductSearch } from '../invoices/BillProductSearch'
import { PrintPreviewModal } from '../print/PrintPreviewModal'
import { printPreviewPaths } from '../print/printPreviewPaths'
import type { ProductFormState } from '../products/productForm'
import { defaultPurityForMetal } from '../products/productForm'

type LineKind = 'product' | 'raw'

/** One editable piece row on a tracked product's purchase line. */
type PieceRowState = {
  key: string
  tagCode: string
  huid: string
  grossWeight: NumericField
  stoneWeight: NumericField
  netWeight: NumericField
}

type LineState = {
  key: string
  kind: LineKind
  productId: number | ''
  metal: string
  category: string
  purity: string
  qty: NumericField
  grossWeight: NumericField
  stoneWeight: NumericField
  netWeight: NumericField
  rate: NumericField
  makingCharges: NumericField
  hsnCode: string
  huids: string[]
  /** True when the chosen product tracks each piece; qty then comes from `pieces`. */
  trackPieces: boolean
  pieces: PieceRowState[]
}

let lineSeq = 0
let pieceSeq = 0

function nextKey(): string {
  lineSeq += 1
  return `line-${lineSeq}`
}

function nextPieceKey(): string {
  pieceSeq += 1
  return `piece-${pieceSeq}`
}

function blankPiece(piece?: {
  tagCode?: string
  huid?: string
  grossWeight?: number
  stoneWeight?: number
  netWeight?: number
}): PieceRowState {
  return {
    key: nextPieceKey(),
    tagCode: piece?.tagCode ?? '',
    huid: piece?.huid ?? '',
    grossWeight: piece?.grossWeight ?? '',
    stoneWeight: piece?.stoneWeight ?? '',
    netWeight: piece?.netWeight ?? '',
  }
}

function piecesFromProduct(product: Product): PieceRowState[] {
  return [
    blankPiece({
      grossWeight: product.grossWeight,
      stoneWeight: product.stoneWeight,
      netWeight: product.netWeight,
    }),
  ]
}

/** Pieces on a tracked line, or the plain quantity on every other line. */
function lineQty(line: LineState): number {
  if (line.trackPieces) return Math.max(1, line.pieces.length)
  return Math.max(1, Math.trunc(numericFieldToNumber(line.qty, 1)))
}

/** Per-piece net weight: the sum of the piece rows divided by their count. */
function lineNetWeight(line: LineState): number {
  if (!line.trackPieces) return numericFieldToNumber(line.netWeight)
  if (line.pieces.length === 0) return numericFieldToNumber(line.netWeight)
  const sum = line.pieces.reduce(
    (total, piece) => total + numericFieldToNumber(piece.netWeight),
    0,
  )
  return Math.round((sum / line.pieces.length) * 1000) / 1000
}

function lineGrossWeight(line: LineState): number {
  if (!line.trackPieces) return numericFieldToNumber(line.grossWeight)
  if (line.pieces.length === 0) return numericFieldToNumber(line.grossWeight)
  const sum = line.pieces.reduce(
    (total, piece) => total + numericFieldToNumber(piece.grossWeight),
    0,
  )
  return Math.round((sum / line.pieces.length) * 1000) / 1000
}

function puritiesForMetal(metal: string, current: string): string[] {
  const preferred = isSilver(metal) ? [...SILVER_PURITIES] : [...GOLD_PURITIES]
  if (current && !preferred.includes(current as (typeof preferred)[number])) {
    return [...preferred, current]
  }
  return preferred
}

function blankProductLine(): LineState {
  return {
    key: nextKey(),
    kind: 'product',
    productId: '',
    metal: 'Gold',
    category: '',
    purity: '22K',
    qty: 1,
    grossWeight: '',
    stoneWeight: '',
    netWeight: '',
    rate: '',
    makingCharges: '',
    hsnCode: DEFAULT_HSN,
    huids: [''],
    trackPieces: false,
    pieces: [],
  }
}

function blankRawLine(category?: string): LineState {
  return {
    key: nextKey(),
    kind: 'raw',
    productId: '',
    metal: 'Gold',
    category: category || BULLION_CATEGORY,
    purity: '22K',
    qty: 1,
    grossWeight: '',
    stoneWeight: '',
    netWeight: '',
    rate: '',
    makingCharges: '',
    hsnCode: DEFAULT_HSN,
    huids: [],
    trackPieces: false,
    pieces: [],
  }
}

function lineFromProduct(product: Product): LineState {
  return {
    ...blankProductLine(),
    productId: product.id,
    metal: product.metal,
    category: product.category,
    purity: product.purity || (isSilver(product.metal) ? SILVER_PURITIES[0] : '22K'),
    grossWeight: product.grossWeight || '',
    stoneWeight: product.stoneWeight || '',
    netWeight: product.netWeight || '',
    makingCharges: product.makingCharges || '',
    trackPieces: product.trackPieces,
    pieces: product.trackPieces ? piecesFromProduct(product) : [],
  }
}

function linesFromInward(inward: Inward): LineState[] {
  return inward.items.map((item) => ({
    key: nextKey(),
    kind: item.productId == null ? 'raw' : 'product',
    productId: item.productId ?? '',
    metal: item.metal,
    category: item.category,
    purity: item.purity,
    qty: item.qty,
    grossWeight: item.grossWeight || '',
    stoneWeight:
      item.grossWeight && item.netWeight && item.grossWeight > item.netWeight
        ? Math.round((item.grossWeight - item.netWeight) * 1000) / 1000
        : '',
    netWeight: item.netWeight,
    rate: item.rate,
    makingCharges: item.makingCharges || '',
    hsnCode: item.hsnCode || DEFAULT_HSN,
    huids:
      item.productId == null
        ? []
        : resizeHuidRows(item.huids ?? [], item.qty),
    trackPieces: (item.pieces ?? []).length > 0,
    pieces: (item.pieces ?? []).map((piece) => blankPiece(piece)),
  }))
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="product-form-field">
      {htmlFor ? (
        <>
          <label htmlFor={htmlFor}>
            <span className="product-form-label-text">{label}</span>
          </label>
          {children}
        </>
      ) : (
        <label>
          <span className="product-form-label-text">{label}</span>
          {children}
        </label>
      )}
    </div>
  )
}

function Control({
  icon,
  unit,
  children,
}: {
  icon?: ReactNode
  unit?: string
  children: ReactNode
}) {
  const classes = ['product-form-control', icon ? 'has-icon' : '', unit ? 'has-unit' : '']
    .filter(Boolean)
    .join(' ')
  return (
    <div className={classes}>
      {icon ? (
        <span className="product-form-lead-icon" aria-hidden>
          {icon}
        </span>
      ) : null}
      {children}
      {unit ? (
        <span className="product-form-unit" aria-hidden>
          {unit}
        </span>
      ) : null}
    </div>
  )
}

function SectionHead({
  step,
  title,
  subtitle,
}: {
  step?: number
  title: string
  subtitle: string
}) {
  return (
    <div className="product-section-head">
      {step != null ? (
        <span className="product-section-step" aria-hidden>
          {step}
        </span>
      ) : null}
      <div>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
    </div>
  )
}

function StaticValue({ children }: { children: ReactNode }) {
  return <div className="inward-line-static">{children}</div>
}

export function InwardEditorModal({
  inward,
  readOnly,
  initialProducts,
  onClose,
  onSaved,
}: {
  inward: Inward | null
  readOnly: boolean
  /** Pre-fills one product line per product for a new purchase. */
  initialProducts?: Product[]
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const { showToast } = useToast()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<string[]>([...STOCK_ITEM_NAMES])
  const [supplierId, setSupplierId] = useState<number | ''>(inward?.supplierId ?? '')
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState(inward?.supplierInvoiceNo ?? '')
  const [inwardDate, setInwardDate] = useState(inward?.inwardDate ?? localTodayIso())
  const [notes, setNotes] = useState(inward?.notes ?? '')
  const [paymentMode, setPaymentMode] = useState<PurchasePaymentMode>(inward?.paymentMode ?? 'cash')
  const [gstMode, setGstMode] = useState<PurchaseGstMode>(inward?.gstMode ?? 'none')
  const [discount, setDiscount] = useState<NumericField>(inward?.discount ?? 0)
  const [roundOff, setRoundOff] = useState<NumericField>(inward?.roundOff ?? 0)
  const [roundOffTouched, setRoundOffTouched] = useState(inward != null)
  const [lines, setLines] = useState<LineState[]>(() => {
    if (inward) return linesFromInward(inward)
    if (initialProducts && initialProducts.length > 0) return initialProducts.map(lineFromProduct)
    return [blankProductLine()]
  })
  const [inwardId, setInwardId] = useState<number | null>(inward?.id ?? null)
  const [supplierModalOpen, setSupplierModalOpen] = useState(false)
  const [confirmFinalize, setConfirmFinalize] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const [supplierRows, productRows] = await Promise.all([api.listSuppliers(), api.listProducts()])
        if (!active) return
        setSuppliers(supplierRows)
        setProducts(productRows)
        if (!inward) {
          setSupplierId(
            (current) => current || (supplierRows.find((row) => !row.isSystem)?.id ?? ''),
          )
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load purchase form')
      }
      try {
        const categoryRows = await api.listStockCategories()
        if (!active) return
        if (categoryRows.length > 0) {
          setCategories(categoryRows.map((row) => row.name))
        }
      } catch {
        // Stock permission may be absent; seeded category names still match the ledger.
      }
    })()
    return () => {
      active = false
    }
  }, [inward])

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products])

  // A tracked product always needs piece rows, including when a saved line has
  // none yet (older drafts, or a product switched on after the draft started).
  useEffect(() => {
    // Hydrates drafts saved before the product was switched to piece tracking;
    // this is a one-way fix-up of loaded state, not a render-driven loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLines((current) => {
      let changed = false
      const next = current.map((line) => {
        if (line.kind !== 'product' || line.productId === '' || line.trackPieces) return line
        const product = productById.get(line.productId)
        if (!product?.trackPieces) return line
        changed = true
        return {
          ...line,
          trackPieces: true,
          pieces: line.pieces.length > 0 ? line.pieces : piecesFromProduct(product),
        }
      })
      return changed ? next : current
    })
  }, [productById])
  const supplierOptions = useMemo(
    () => suppliers.filter((supplier) => !supplier.isSystem || supplier.id === supplierId),
    [suppliers, supplierId],
  )

  const liveTotals = useMemo(() => {
    let weight = 0
    const lineAmounts: number[] = []
    for (const line of lines) {
      const qty = lineQty(line)
      const netWeight = lineNetWeight(line)
      const rate = numericFieldToNumber(line.rate)
      const makingCharges = numericFieldToNumber(line.makingCharges)
      weight += netWeight * qty
      lineAmounts.push(computePurchaseLineAmount({ qty, netWeight, rate, makingCharges }))
    }
    const totals = computePurchaseTotals(
      lineAmounts,
      roundOffTouched ? numericFieldToNumber(roundOff) : undefined,
      { discount: numericFieldToNumber(discount), gstMode },
    )
    return { weight, ...totals }
  }, [lines, roundOff, roundOffTouched, discount, gstMode])

  const displayTotals: PurchaseTotalsResult & { weight: number } =
    readOnly && inward
      ? {
          weight: liveTotals.weight,
          subtotal: inward.subtotal,
          discount: inward.discount,
          taxable: inward.taxable,
          cgst: inward.cgst,
          sgst: inward.sgst,
          igst: inward.igst,
          tax: inward.cgst + inward.sgst + inward.igst,
          roundOff: inward.roundOff,
          total: inward.total,
        }
      : liveTotals

  const review = useMemo(() => {
    const byProduct = new Map<string, { name: string; qty: number; weight: number }>()
    const byMetal = new Map<string, number>()
    let rawWeight = 0
    let missingHuids = 0
    let pieceCount = 0
    for (const line of lines) {
      const qty = line.kind === 'product' ? lineQty(line) : Math.max(1, Math.trunc(numericFieldToNumber(line.qty, 1)))
      const net = line.kind === 'product' ? lineNetWeight(line) : numericFieldToNumber(line.netWeight)
      if (line.kind === 'product') {
        const product = line.productId === '' ? undefined : productById.get(line.productId)
        const name = product?.name ?? 'Product not selected'
        const metal = product?.metal ?? line.metal
        const row = byProduct.get(name) ?? { name, qty: 0, weight: 0 }
        row.qty += qty
        row.weight += net * qty
        byProduct.set(name, row)
        byMetal.set(metal, (byMetal.get(metal) ?? 0) + net * qty)
        pieceCount += qty
        const tagged = line.trackPieces
          ? line.pieces.filter((piece) => piece.huid.trim()).length
          : line.huids.filter((value) => value.trim()).length
        missingHuids += Math.max(0, qty - tagged)
      } else {
        rawWeight += net * qty
        byMetal.set(line.metal, (byMetal.get(line.metal) ?? 0) + net * qty)
      }
    }
    return {
      products: [...byProduct.values()],
      metals: [...byMetal.entries()].map(([metal, weight]) => ({ metal, weight })),
      rawWeight,
      missingHuids,
      pieceCount,
    }
  }, [lines, productById])

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
    setError(null)
  }

  function updatePiece(lineKey: string, pieceKey: string, patch: Partial<PieceRowState>) {
    setLines((current) =>
      current.map((line) =>
        line.key === lineKey
          ? {
              ...line,
              pieces: line.pieces.map((piece) =>
                piece.key === pieceKey ? { ...piece, ...patch } : piece,
              ),
            }
          : line,
      ),
    )
    setError(null)
  }

  function addPiece(lineKey: string) {
    setLines((current) =>
      current.map((line) => {
        if (line.key !== lineKey) return line
        const last = line.pieces[line.pieces.length - 1]
        return {
          ...line,
          pieces: [
            ...line.pieces,
            blankPiece({
              grossWeight: last
                ? numericFieldToNumber(last.grossWeight)
                : numericFieldToNumber(line.grossWeight),
              stoneWeight: last
                ? numericFieldToNumber(last.stoneWeight)
                : numericFieldToNumber(line.stoneWeight),
              netWeight: last
                ? numericFieldToNumber(last.netWeight)
                : numericFieldToNumber(line.netWeight),
            }),
          ],
        }
      }),
    )
  }

  function removePiece(lineKey: string, pieceKey: string) {
    setLines((current) =>
      current.map((line) =>
        line.key === lineKey && line.pieces.length > 1
          ? { ...line, pieces: line.pieces.filter((piece) => piece.key !== pieceKey) }
          : line,
      ),
    )
  }

  function applyProduct(key: string, product: Product | undefined) {
    // Read the live line inside the updater: selecting a product can resolve
    // after the user has already changed the quantity.
    setLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line
        const n = Math.max(1, Math.trunc(numericFieldToNumber(line.qty ?? 1, 1)))
        return {
          ...line,
          productId: product ? product.id : '',
          metal: product?.metal ?? 'Gold',
          category: product?.category ?? '',
          purity: product?.purity || (product && isSilver(product.metal) ? SILVER_PURITIES[0] : '22K'),
          grossWeight: product ? product.grossWeight || '' : '',
          stoneWeight: product ? product.stoneWeight || '' : '',
          netWeight: product ? product.netWeight || '' : '',
          makingCharges: product ? product.makingCharges || '' : '',
          hsnCode: DEFAULT_HSN,
          huids: product ? resizeHuidRows(line.huids ?? [], n) : [],
          trackPieces: product?.trackPieces ?? false,
          pieces: product?.trackPieces
            ? line.productId === product.id && (line.pieces?.length ?? 0) > 0
              ? line.pieces
              : piecesFromProduct(product)
            : [],
        }
      }),
    )
    setError(null)
  }

  /** What the inline product form starts with, taken from the purchase line. */
  function newProductDefaultsForLine(line: LineState): Partial<ProductFormState> {
    const metal = line.metal || 'Gold'
    const category =
      line.category &&
      (categories.length === 0 ||
        categories.some((name) => name.toLowerCase() === line.category.toLowerCase()))
        ? line.category
        : (categories[0] ?? STOCK_ITEM_NAMES[0])
    return {
      metal,
      category,
      purity: line.purity || defaultPurityForMetal(metal),
      grossWeight: line.grossWeight,
      stoneWeight: line.stoneWeight,
      netWeight: line.netWeight,
      makingCharges: line.makingCharges,
    }
  }

  function buildItems(finalize: boolean): InwardItemInput[] {
    if (lines.length === 0) {
      throw new Error('Add at least one line')
    }
    const huidsSeen: string[] = []
    return lines.map((line, index) => {
      let qty = Math.max(1, Math.trunc(numericFieldToNumber(line.qty, 1)))
      const netWeight = numericFieldToNumber(line.netWeight)
      const label = `Line ${index + 1}`
      if (line.kind === 'product') {
        const product = line.productId === '' ? undefined : productById.get(line.productId)
        if (!product) {
          throw new Error(`${label} needs a product`)
        }
        if (line.trackPieces) {
          if (line.pieces.length === 0) {
            throw new Error(`${label} (${product.name}) needs at least one piece`)
          }
          const seenOnLine: string[] = []
          const pieces = line.pieces.map((piece, pieceIndex) => {
            const net = numericFieldToNumber(piece.netWeight)
            if (net <= 0) {
              throw new Error(`${label} (${product.name}): piece ${pieceIndex + 1} needs a net weight`)
            }
            const huid = piece.huid.trim().toUpperCase()
            if (huid && !/^[0-9A-Z]+$/.test(huid)) {
              throw new Error(`${label}: HUID ${huid} can only be letters and digits`)
            }
            if (huid && (huidsSeen.includes(huid) || seenOnLine.includes(huid))) {
              throw new Error(`HUID ${huid} is duplicated`)
            }
            if (huid) seenOnLine.push(huid)
            return {
              tagCode: piece.tagCode.trim().toUpperCase(),
              huid,
              grossWeight: numericFieldToNumber(piece.grossWeight),
              stoneWeight: numericFieldToNumber(piece.stoneWeight),
              netWeight: net,
            }
          })
          const tags = pieces.map((piece) => piece.tagCode).filter(Boolean)
          const duplicateTag = tags.find((tag, tagIndex) => tags.indexOf(tag) !== tagIndex)
          if (duplicateTag) {
            throw new Error(`Tag ${duplicateTag} is duplicated`)
          }
          huidsSeen.push(...pieces.map((piece) => piece.huid).filter(Boolean))
          qty = pieces.length
          const netTotal = pieces.reduce((sum, piece) => sum + piece.netWeight, 0)
          const grossTotal = pieces.reduce(
            (sum, piece) => sum + (piece.grossWeight || piece.netWeight),
            0,
          )
          return {
            productId: product.id,
            metal: product.metal,
            category: product.category,
            purity: line.purity || product.purity,
            qty,
            grossWeight: Math.round((grossTotal / qty) * 1000) / 1000,
            netWeight: Math.round((netTotal / qty) * 1000) / 1000,
            rate: numericFieldToNumber(line.rate),
            makingCharges: numericFieldToNumber(line.makingCharges),
            hsnCode: line.hsnCode.trim() || DEFAULT_HSN,
            huids: pieces.map((piece) => piece.huid).filter(Boolean),
            pieces,
          }
        }
        if (netWeight <= 0) {
          throw new Error(`${label} needs a net weight greater than 0`)
        }
        const huids = line.huids.map((value) => value.trim().toUpperCase()).filter(Boolean)
        const countError = finalize
          ? newPieceHuidError(huids.length, qty)
          : huids.length > qty
            ? 'A line cannot have more HUIDs than pieces'
            : null
        if (countError) {
          throw new Error(`${label} (${product.name}): ${countError}`)
        }
        const invalid = huids.find((huid) => !/^[0-9A-Z]+$/.test(huid))
        if (invalid) {
          throw new Error(`${label}: HUID ${invalid} can only be letters and digits`)
        }
        const duplicate = huids.find(
          (huid, index) => huids.indexOf(huid) !== index || huidsSeen.includes(huid),
        )
        if (duplicate) {
          throw new Error(`HUID ${duplicate} is duplicated`)
        }
        huidsSeen.push(...huids)
        return {
          productId: product.id,
          metal: product.metal,
          category: product.category,
          purity: line.purity || product.purity,
          qty,
          grossWeight: numericFieldToNumber(line.grossWeight),
          netWeight,
          rate: numericFieldToNumber(line.rate),
          makingCharges: numericFieldToNumber(line.makingCharges),
          hsnCode: line.hsnCode.trim() || DEFAULT_HSN,
          huids,
          pieces: [],
        }
      }
      if (netWeight <= 0) {
        throw new Error(`${label} needs a net weight greater than 0`)
      }
      if (!line.metal.trim() || !line.category.trim()) {
        throw new Error(`${label} needs a metal and category`)
      }
      return {
        productId: null,
        metal: line.metal,
        category: line.category,
        purity: line.purity,
        qty,
        grossWeight: numericFieldToNumber(line.grossWeight),
        netWeight,
        rate: numericFieldToNumber(line.rate),
        makingCharges: numericFieldToNumber(line.makingCharges),
        hsnCode: line.hsnCode.trim() || DEFAULT_HSN,
        huids: [],
      }
    })
  }

  async function persist(finalize: boolean) {
    if (readOnly) return
    if (supplierId === '') {
      setError('Select a supplier')
      return
    }
    try {
      setSaving(true)
      setError(null)
      const payload = {
        supplierId: Number(supplierId),
        supplierInvoiceNo,
        inwardDate,
        notes,
        paymentMode,
        discount: liveTotals.discount,
        gstMode,
        roundOff: liveTotals.roundOff,
        items: buildItems(finalize),
      }
      const saved =
        inwardId == null
          ? await api.createInward(payload)
          : await api.updateInward({ ...payload, id: inwardId })
      setInwardId(saved.id)
      if (finalize) {
        await api.finalizeInward(saved.id)
        showToast('Purchase finalized — stock updated', 'success')
      } else {
        showToast(inwardId == null ? 'Draft saved' : 'Draft updated', 'success')
      }
      await onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save purchase')
    } finally {
      setSaving(false)
      setConfirmFinalize(false)
    }
  }

  const title = readOnly
    ? `Purchase ${inward?.inwardNo ?? ''}`
    : inwardId == null
      ? 'New purchase'
      : `Edit ${inward?.inwardNo ?? 'draft'}`
  const subtitle = 'Purchase stock. Finalize to update product pieces and gold & silver weight.'

  return (
    <>
      <Modal className="modal-wide product-form-modal purchase-form-modal" title={title} hideTitle footer={null} onClose={onClose}>
        <div className="product-form-shell" data-form-nav onKeyDown={onEnterAdvanceFields}>
          <header className="product-form-header">
            <div className="product-form-header-copy">
              <span className="product-form-header-icon" aria-hidden>
                <ClipboardList size={18} strokeWidth={1.75} />
              </span>
              <div>
                <h2>{title}</h2>
                <p>{subtitle}</p>
              </div>
            </div>
            <button
              type="button"
              className="btn ghost icon-btn product-form-close"
              aria-label="Close"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </header>

          <div className="product-form-layout">
            {error ? <div className="error-banner product-form-banner">{error}</div> : null}

            <section className="product-section">
              <SectionHead
                step={1}
                title="Purchase details"
                subtitle="Supplier, date, and notes"
              />
              <div className="product-form-grid-3">
                <Field label="Supplier" htmlFor="inward-supplier">
                  <div className="inward-supplier-row">
                    <Control icon={<Truck size={14} strokeWidth={1.75} />}>
                      <select
                        id="inward-supplier"
                        className="select"
                        value={supplierId}
                        disabled={readOnly}
                        onChange={(event) =>
                          setSupplierId(event.target.value ? Number(event.target.value) : '')
                        }
                      >
                        <option value="">Select supplier</option>
                        {supplierOptions.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </option>
                        ))}
                      </select>
                    </Control>
                    {readOnly ? null : (
                      <button type="button" className="btn secondary" onClick={() => setSupplierModalOpen(true)}>
                        <Plus size={16} aria-hidden />
                        New
                      </button>
                    )}
                  </div>
                </Field>
                <Field label="Date">
                  <Control icon={<Calendar size={14} strokeWidth={1.75} />}>
                    <DateInput
                      className="input"
                      value={inwardDate}
                      disabled={readOnly}
                      onChange={setInwardDate}
                    />
                  </Control>
                </Field>
                <Field label="Payment" htmlFor="inward-payment">
                  <Control icon={<Coins size={14} strokeWidth={1.75} />}>
                    <select
                      id="inward-payment"
                      className="select"
                      value={paymentMode}
                      disabled={readOnly}
                      onChange={(event) => setPaymentMode(event.target.value as PurchasePaymentMode)}
                    >
                      <option value="cash">Cash</option>
                      <option value="upi">UPI</option>
                      <option value="card">Card</option>
                    </select>
                  </Control>
                </Field>
              </div>
              <div className="product-form-grid-3">
                <Field label="Supplier invoice no." htmlFor="inward-supplier-invoice">
                  <Control icon={<FileText size={14} strokeWidth={1.75} />}>
                    <input
                      id="inward-supplier-invoice"
                      className="input"
                      value={supplierInvoiceNo}
                      disabled={readOnly}
                      placeholder="e.g. ABC-1042"
                      onChange={(event) => setSupplierInvoiceNo(event.target.value)}
                    />
                  </Control>
                </Field>
                <Field label="GST on purchase" htmlFor="inward-gst-mode">
                  <Control icon={<Percent size={14} strokeWidth={1.75} />}>
                    <select
                      id="inward-gst-mode"
                      className="select"
                      value={gstMode}
                      disabled={readOnly}
                      onChange={(event) => setGstMode(event.target.value as PurchaseGstMode)}
                    >
                      <option value="none">No GST</option>
                      <option value="intra">CGST + SGST 3%</option>
                      <option value="inter">IGST 3%</option>
                    </select>
                  </Control>
                </Field>
                <Field label="Discount">
                  <Control icon={<Percent size={14} strokeWidth={1.75} />} unit="₹">
                    <input
                      className="input"
                      aria-label="Purchase discount"
                      type="number"
                      step="0.01"
                      min={0}
                      value={discount}
                      disabled={readOnly}
                      onChange={(event) => setDiscount(parseNumericField(event.target.value))}
                    />
                  </Control>
                </Field>
              </div>
              <Field label="Notes">
                <Control icon={<StickyNote size={14} strokeWidth={1.75} />}>
                  <input
                    className="input"
                    value={notes}
                    disabled={readOnly}
                    placeholder="Optional reference or remarks"
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </Control>
              </Field>
            </section>

            <section className="product-section">
              <div className="inward-lines-head">
                <SectionHead
                  step={2}
                  title="Purchase lines"
                  subtitle="Products and raw metal on this purchase"
                />
                {readOnly ? null : (
                  <div className="inward-lines-actions">
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => setLines((current) => [...current, blankProductLine()])}
                    >
                      <Plus size={14} strokeWidth={2} aria-hidden />
                      Product line
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() =>
                        setLines((current) => [
                          ...current,
                          blankRawLine(
                            categories.find((c) => c.toLowerCase() === BULLION_CATEGORY.toLowerCase()) ??
                              BULLION_CATEGORY,
                          ),
                        ])
                      }
                    >
                      <Plus size={14} strokeWidth={2} aria-hidden />
                      Raw metal
                    </button>
                  </div>
                )}
              </div>

              <div className="inward-line-list">
                {lines.map((line) => {
                  const product = line.productId === '' ? undefined : productById.get(line.productId)
                  const metal = line.kind === 'product' ? (product?.metal ?? line.metal) : line.metal
                  const qty = lineQty(line)
                  const netWeight = lineNetWeight(line)
                  const rate = numericFieldToNumber(line.rate)
                  const makingCharges = numericFieldToNumber(line.makingCharges)
                  const grossWeight = lineGrossWeight(line)
                  const stoneWeight = numericFieldToNumber(line.stoneWeight)
                  const pieceNetTotal = line.trackPieces
                    ? line.pieces.reduce(
                        (sum, piece) => sum + numericFieldToNumber(piece.netWeight),
                        0,
                      )
                    : netWeight
                  const pieceGrossTotal = line.trackPieces
                    ? line.pieces.reduce(
                        (sum, piece) => sum + numericFieldToNumber(piece.grossWeight),
                        0,
                      )
                    : grossWeight
                  const pieceStoneTotal = line.trackPieces
                    ? line.pieces.reduce(
                        (sum, piece) => sum + numericFieldToNumber(piece.stoneWeight),
                        0,
                      )
                    : stoneWeight
                  const lineAmount = computePurchaseLineAmount({
                    qty,
                    netWeight,
                    rate,
                    makingCharges,
                  })
                  const purities = puritiesForMetal(metal, line.purity)
                  const categoryValue = line.kind === 'product' ? product?.category || line.category || '—' : line.category

                  return (
                    <article key={line.key} className="inward-line-card">
                      <div className="inward-line-card-head">
                        <span className="inward-line-kind">
                          {line.kind === 'product' ? 'Product' : 'Raw metal'}
                        </span>
                        <span className="inward-line-amount">{formatCurrency(lineAmount)}</span>
                        {readOnly ? null : (
                          <button
                            type="button"
                            className="btn ghost icon-btn"
                            aria-label="Remove line"
                            onClick={() =>
                              setLines((current) => current.filter((item) => item.key !== line.key))
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>

                      <div className="product-form-grid-3">
                        {line.kind === 'product' ? (
                          <Field label="Product">
                            {readOnly ? (
                              <Control icon={<Package size={14} strokeWidth={1.75} />}>
                                <StaticValue>{product?.name ?? 'Product'}</StaticValue>
                              </Control>
                            ) : (
                              <div className="inward-supplier-row">
                                <BillProductSearch
                                  products={products}
                                  compact
                                  hideLabel
                                  mode="purchase"
                                  selectedProductId={line.productId}
                                  placeholder="Search product by name, HUID or category…"
                                  newProductValues={newProductDefaultsForLine(line)}
                                  onSelect={(picked) => applyProduct(line.key, picked)}
                                  onClear={() => applyProduct(line.key, undefined)}
                                  onProductCreated={(created) => {
                                    setProducts((current) => [created, ...current])
                                    applyProduct(line.key, created)
                                    showToast('Product created', 'success')
                                  }}
                                  onError={(message) => setError(message)}
                                />
                                {product ? (
                                  <button
                                    type="button"
                                    className="btn ghost"
                                    onClick={() => applyProduct(line.key, undefined)}
                                  >
                                    Clear
                                  </button>
                                ) : null}
                              </div>
                            )}
                          </Field>
                        ) : (
                          <Field label="Metal">
                            {readOnly ? (
                              <Control icon={<Coins size={14} strokeWidth={1.75} />}>
                                <StaticValue>{line.metal}</StaticValue>
                              </Control>
                            ) : (
                              <Control icon={<Coins size={14} strokeWidth={1.75} />}>
                                <select
                                  className="select"
                                  aria-label="Metal"
                                  value={line.metal}
                                  onChange={(event) => {
                                    const nextMetal = event.target.value
                                    updateLine(line.key, {
                                      metal: nextMetal,
                                      purity: isSilver(nextMetal) ? SILVER_PURITIES[0] : '22K',
                                    })
                                  }}
                                >
                                  {STOCK_METALS.map((metalName) => (
                                    <option key={metalName} value={metalName}>
                                      {metalName}
                                    </option>
                                  ))}
                                </select>
                              </Control>
                            )}
                          </Field>
                        )}

                        <Field label="Category">
                          {line.kind === 'product' || readOnly ? (
                            <Control icon={<FolderKanban size={14} strokeWidth={1.75} />}>
                              <StaticValue>{categoryValue || '—'}</StaticValue>
                            </Control>
                          ) : (
                            <Control icon={<FolderKanban size={14} strokeWidth={1.75} />}>
                              <StaticValue>{line.category || BULLION_CATEGORY}</StaticValue>
                            </Control>
                          )}
                        </Field>

                        <Field label="Purity">
                          {readOnly ? (
                            <Control icon={<Shield size={14} strokeWidth={1.75} />}>
                              <StaticValue>{line.purity || '—'}</StaticValue>
                            </Control>
                          ) : (
                            <Control icon={<Shield size={14} strokeWidth={1.75} />}>
                              <select
                                className="select"
                                aria-label="Purity"
                                value={line.purity}
                                onChange={(event) =>
                                  updateLine(line.key, { purity: event.target.value })
                                }
                              >
                                {purities.map((purity) => (
                                  <option key={purity} value={purity}>
                                    {purity}
                                  </option>
                                ))}
                              </select>
                            </Control>
                          )}
                        </Field>
                      </div>

                      <div className="product-form-grid-5">
                        <Field label="Qty">
                          {readOnly || line.trackPieces ? (
                            <Control icon={<Package size={14} strokeWidth={1.75} />} unit="pcs">
                              <StaticValue>{qty}</StaticValue>
                            </Control>
                          ) : (
                            <Control icon={<Package size={14} strokeWidth={1.75} />} unit="pcs">
                              <input
                                className="input"
                                aria-label="Qty"
                                type="number"
                                min={1}
                                value={line.qty}
                                onChange={(event) => {
                                  const qty = parseNumericField(event.target.value)
                                  const n = Math.max(1, Math.trunc(numericFieldToNumber(qty, 1)))
                                  updateLine(line.key, {
                                    qty,
                                    huids:
                                      line.kind === 'product'
                                        ? resizeHuidRows(line.huids, n)
                                        : [],
                                  })
                                }}
                              />
                            </Control>
                          )}
                        </Field>
                        <Field label="Gross weight">
                          {readOnly || line.trackPieces ? (
                            <Control icon={<Weight size={14} strokeWidth={1.75} />}>
                              <StaticValue>
                                {formatWeight(
                                  line.trackPieces
                                    ? pieceGrossTotal || pieceNetTotal
                                    : grossWeight || netWeight,
                                )}
                              </StaticValue>
                            </Control>
                          ) : (
                            <Control icon={<Weight size={14} strokeWidth={1.75} />} unit="g">
                              <input
                                className="input"
                                aria-label="Gross weight"
                                type="number"
                                step="0.001"
                                min={0}
                                placeholder="e.g. 8.50"
                                value={line.grossWeight}
                                onChange={(event) => {
                                  const grossField = parseNumericField(event.target.value)
                                  const g = numericFieldToNumber(grossField)
                                  const s = numericFieldToNumber(line.stoneWeight)
                                  updateLine(line.key, {
                                    grossWeight: grossField,
                                    netWeight: g > 0 && s > 0 ? Math.max(0, Math.round((g - s) * 1000) / 1000) : line.netWeight,
                                  })
                                }}
                              />
                            </Control>
                          )}
                        </Field>
                        <Field label="Stone wt">
                          {readOnly || line.trackPieces ? (
                            <Control icon={<Sparkles size={14} strokeWidth={1.75} />}>
                              <StaticValue>
                                {formatWeight(line.trackPieces ? pieceStoneTotal : stoneWeight)}
                              </StaticValue>
                            </Control>
                          ) : (
                            <Control icon={<Sparkles size={14} strokeWidth={1.75} />} unit="g">
                              <input
                                className="input"
                                aria-label="Stone weight"
                                type="number"
                                step="0.001"
                                min={0}
                                placeholder="e.g. 0.50"
                                value={line.stoneWeight}
                                onChange={(event) => {
                                  const stoneField = parseNumericField(event.target.value)
                                  const s = numericFieldToNumber(stoneField)
                                  const g = numericFieldToNumber(line.grossWeight)
                                  updateLine(line.key, {
                                    stoneWeight: stoneField,
                                    netWeight: g > 0 ? Math.max(0, Math.round((g - s) * 1000) / 1000) : line.netWeight,
                                  })
                                }}
                              />
                            </Control>
                          )}
                        </Field>
                        <Field label="Net weight">
                          {readOnly || line.trackPieces ? (
                            <Control icon={<Weight size={14} strokeWidth={1.75} />}>
                              <StaticValue>
                                {formatWeight(line.trackPieces ? pieceNetTotal : netWeight)}
                              </StaticValue>
                            </Control>
                          ) : (
                            <Control icon={<Weight size={14} strokeWidth={1.75} />} unit="g">
                              <input
                                className="input"
                                aria-label="Net weight"
                                type="number"
                                step="0.001"
                                min={0}
                                placeholder="e.g. 8.00"
                                value={line.netWeight}
                                onChange={(event) =>
                                  updateLine(line.key, {
                                    netWeight: parseNumericField(event.target.value),
                                  })
                                }
                              />
                            </Control>
                          )}
                        </Field>
                        <Field label="Rate">
                          {readOnly ? (
                            <Control icon={<Coins size={14} strokeWidth={1.75} />}>
                              <StaticValue>{formatCurrency(rate)}</StaticValue>
                            </Control>
                          ) : (
                            <Control icon={<Coins size={14} strokeWidth={1.75} />} unit="₹">
                              <input
                                className="input"
                                aria-label="Rate"
                                type="number"
                                step="0.01"
                                min={0}
                                placeholder="e.g. 5800"
                                value={line.rate}
                                onChange={(event) =>
                                  updateLine(line.key, { rate: parseNumericField(event.target.value) })
                                }
                              />
                            </Control>
                          )}
                        </Field>
                      </div>

                      <div className="product-form-grid-2">
                        <Field label="Making">
                          {readOnly ? (
                            <Control icon={<Coins size={14} strokeWidth={1.75} />}>
                              <StaticValue>{formatCurrency(makingCharges)}</StaticValue>
                            </Control>
                          ) : (
                            <Control icon={<Coins size={14} strokeWidth={1.75} />} unit="₹">
                              <input
                                className="input"
                                aria-label="Making"
                                type="number"
                                step="0.01"
                                min={0}
                                placeholder="e.g. 250"
                                value={line.makingCharges}
                                onChange={(event) =>
                                  updateLine(line.key, {
                                    makingCharges: parseNumericField(event.target.value),
                                  })
                                }
                              />
                            </Control>
                          )}
                        </Field>
                        <Field label="HSN">
                          {readOnly ? (
                            <Control icon={<Hash size={14} strokeWidth={1.75} />}>
                              <StaticValue>{line.hsnCode || DEFAULT_HSN}</StaticValue>
                            </Control>
                          ) : (
                            <Control icon={<Hash size={14} strokeWidth={1.75} />}>
                              <input
                                className="input"
                                aria-label="HSN"
                                value={line.hsnCode}
                                onChange={(event) =>
                                  updateLine(line.key, { hsnCode: event.target.value })
                                }
                              />
                            </Control>
                          )}
                        </Field>
                      </div>

                      {line.kind === 'product' && line.trackPieces ? (
                        <div className="inward-pieces">
                          <div className="inward-pieces-head">
                            <strong>Pieces ({line.pieces.length})</strong>
                            {readOnly ? null : (
                              <button
                                type="button"
                                className="btn secondary"
                                onClick={() => addPiece(line.key)}
                              >
                                <Plus size={14} strokeWidth={2} aria-hidden />
                                Add piece
                              </button>
                            )}
                          </div>
                          <p className="muted">
                            One row per ornament. Quantity and line weight come from these rows.
                          </p>
                          <div className="inward-pieces-wrap">
                            <table className="inward-pieces-table">
                              <thead>
                                <tr>
                                  <th>Tag</th>
                                  <th>HUID</th>
                                  <th>Gross</th>
                                  <th>Stone</th>
                                  <th>Net</th>
                                  <th />
                                </tr>
                              </thead>
                              <tbody>
                                {line.pieces.map((piece, pieceIndex) => (
                                  <tr key={piece.key}>
                                    <td>
                                      <input
                                        className="input"
                                        aria-label={`Piece ${pieceIndex + 1} tag`}
                                        placeholder="Auto"
                                        disabled={readOnly}
                                        value={piece.tagCode}
                                        onChange={(event) =>
                                          updatePiece(line.key, piece.key, {
                                            tagCode: event.target.value.toUpperCase(),
                                          })
                                        }
                                      />
                                    </td>
                                    <td>
                                      <input
                                        className="input"
                                        aria-label={`Piece ${pieceIndex + 1} HUID`}
                                        placeholder="Optional"
                                        disabled={readOnly}
                                        value={piece.huid}
                                        onChange={(event) =>
                                          updatePiece(line.key, piece.key, {
                                            huid: event.target.value
                                              .toUpperCase()
                                              .replace(/[^0-9A-Z]/g, ''),
                                          })
                                        }
                                      />
                                    </td>
                                    <td>
                                      <input
                                        className="input"
                                        type="number"
                                        step="0.001"
                                        min={0}
                                        aria-label={`Piece ${pieceIndex + 1} gross weight`}
                                        disabled={readOnly}
                                        value={piece.grossWeight}
                                        onChange={(event) => {
                                          const grossField = parseNumericField(event.target.value)
                                          const gross = numericFieldToNumber(grossField)
                                          const stone = numericFieldToNumber(piece.stoneWeight)
                                          updatePiece(line.key, piece.key, {
                                            grossWeight: grossField,
                                            netWeight:
                                              gross > 0
                                                ? Math.max(
                                                    0,
                                                    Math.round((gross - stone) * 1000) / 1000,
                                                  )
                                                : piece.netWeight,
                                          })
                                        }}
                                      />
                                    </td>
                                    <td>
                                      <input
                                        className="input"
                                        type="number"
                                        step="0.001"
                                        min={0}
                                        aria-label={`Piece ${pieceIndex + 1} stone weight`}
                                        disabled={readOnly}
                                        value={piece.stoneWeight}
                                        onChange={(event) => {
                                          const stoneField = parseNumericField(event.target.value)
                                          const stone = numericFieldToNumber(stoneField)
                                          const gross = numericFieldToNumber(piece.grossWeight)
                                          updatePiece(line.key, piece.key, {
                                            stoneWeight: stoneField,
                                            netWeight:
                                              gross > 0
                                                ? Math.max(
                                                    0,
                                                    Math.round((gross - stone) * 1000) / 1000,
                                                  )
                                                : piece.netWeight,
                                          })
                                        }}
                                      />
                                    </td>
                                    <td>
                                      <input
                                        className="input"
                                        type="number"
                                        step="0.001"
                                        min={0}
                                        aria-label={`Piece ${pieceIndex + 1} net weight`}
                                        disabled={readOnly}
                                        value={piece.netWeight}
                                        onChange={(event) =>
                                          updatePiece(line.key, piece.key, {
                                            netWeight: parseNumericField(event.target.value),
                                          })
                                        }
                                      />
                                    </td>
                                    <td>
                                      {readOnly ? null : (
                                        <button
                                          type="button"
                                          className="btn ghost icon-btn"
                                          aria-label={`Remove piece ${pieceIndex + 1}`}
                                          disabled={line.pieces.length <= 1}
                                          onClick={() => removePiece(line.key, piece.key)}
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : line.kind === 'product' ? (
                        <div>
                          <p className="muted">
                            HUID (Hallmark Unique ID) — {line.huids.filter((value) => value.trim()).length} of{' '}
                            {qty} pieces
                            {readOnly ? '' : ' · optional'}
                          </p>
                          <HuidEntryList
                            values={line.huids}
                            disabled={readOnly}
                            onChange={(huids) => updateLine(line.key, { huids })}
                          />
                        </div>
                      ) : null}
                    </article>
                  )
                })}
              </div>

              <div className="purchase-totals">
                <p className="inward-line-totals">Total weight {formatWeight(displayTotals.weight)}</p>
                <div className="purchase-totals-box">
                  <div className="purchase-totals-row">
                    <span>Subtotal</span>
                    <span>{formatCurrency(displayTotals.subtotal)}</span>
                  </div>
                  {displayTotals.discount > 0 ? (
                    <div className="purchase-totals-row">
                      <span>Discount</span>
                      <span>-{formatCurrency(displayTotals.discount)}</span>
                    </div>
                  ) : null}
                  {displayTotals.taxable !== displayTotals.subtotal ? (
                    <div className="purchase-totals-row">
                      <span>Taxable</span>
                      <span>{formatCurrency(displayTotals.taxable)}</span>
                    </div>
                  ) : null}
                  {displayTotals.cgst > 0 ? (
                    <div className="purchase-totals-row">
                      <span>CGST 1.5%</span>
                      <span>{formatCurrency(displayTotals.cgst)}</span>
                    </div>
                  ) : null}
                  {displayTotals.sgst > 0 ? (
                    <div className="purchase-totals-row">
                      <span>SGST 1.5%</span>
                      <span>{formatCurrency(displayTotals.sgst)}</span>
                    </div>
                  ) : null}
                  {displayTotals.igst > 0 ? (
                    <div className="purchase-totals-row">
                      <span>IGST 3%</span>
                      <span>{formatCurrency(displayTotals.igst)}</span>
                    </div>
                  ) : null}
                  <div className="purchase-totals-row">
                    <span>Round off</span>
                    {readOnly ? (
                      <span>{formatCurrency(displayTotals.roundOff)}</span>
                    ) : (
                      <input
                        className="input"
                        aria-label="Round off"
                        type="number"
                        step="0.01"
                        value={roundOffTouched ? roundOff : displayTotals.roundOff}
                        onChange={(event) => {
                          setRoundOffTouched(true)
                          setRoundOff(parseNumericField(event.target.value))
                        }}
                      />
                    )}
                  </div>
                  <div className="purchase-totals-row grand">
                    <span>Grand total</span>
                    <span>{formatCurrency(displayTotals.total)}</span>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <footer className="product-form-footer">
            <p className="product-form-tip">
              <Lightbulb size={14} strokeWidth={1.75} aria-hidden />
              Finalize adds piece stock on products and purchase weight on Gold & Silver.
            </p>
            <div className="product-form-footer-actions">
              <button type="button" className="btn secondary" disabled={saving} onClick={onClose}>
                {readOnly ? 'Close' : 'Cancel'}
              </button>
              {inwardId != null ? (
                <button
                  type="button"
                  className="btn secondary"
                  disabled={saving}
                  onClick={() => setPrintOpen(true)}
                >
                  <Printer size={15} strokeWidth={1.75} aria-hidden />
                  Print
                </button>
              ) : null}
              {readOnly ? null : (
                <>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={saving}
                    onClick={() => void persist(false)}
                  >
                    {saving ? 'Saving…' : 'Save draft'}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={saving}
                    onClick={() => setConfirmFinalize(true)}
                  >
                    <Save size={15} strokeWidth={2} aria-hidden />
                    Save & finalize
                  </button>
                </>
              )}
            </div>
          </footer>
        </div>
      </Modal>

      {confirmFinalize ? (
        <Modal
          title="Finalize purchase?"
          onClose={() => setConfirmFinalize(false)}
          footer={
            <div className="modal-actions">
              <button
                type="button"
                className="btn secondary"
                disabled={saving}
                onClick={() => setConfirmFinalize(false)}
              >
                Cancel
              </button>
              <button type="button" className="btn" disabled={saving} onClick={() => void persist(true)}>
                {saving ? 'Saving…' : 'Finalize'}
              </button>
            </div>
          }
        >
          <div className="purchase-review">
            <p className="confirm-dialog-copy">
              Finalizing adds this stock and cannot be edited afterwards. Check the numbers below.
            </p>
            <div className="purchase-review-meta">
              <span>{supplierOptions.find((row) => row.id === supplierId)?.name ?? 'No supplier'}</span>
              <span>{formatDisplayDate(inwardDate)}</span>
              {supplierInvoiceNo.trim() ? <span>Inv {supplierInvoiceNo.trim()}</span> : null}
            </div>
            <ul className="purchase-review-lines">
              {review.products.map((row) => (
                <li key={row.name}>
                  <span>{row.name}</span>
                  <span>
                    +{row.qty} pcs · {formatWeight(row.weight)}
                  </span>
                </li>
              ))}
              {review.rawWeight > 0 ? (
                <li>
                  <span>Raw metal</span>
                  <span>{formatWeight(review.rawWeight)}</span>
                </li>
              ) : null}
            </ul>
            {review.missingHuids > 0 ? (
              <p className="purchase-review-warning">
                {review.missingHuids} piece{review.missingHuids === 1 ? '' : 's'} without a HUID. You
                can finalize now and tag them later.
              </p>
            ) : null}
            <p className="purchase-review-metals">
              {review.metals
                .filter((row) => row.weight > 0)
                .map((row) => `${row.metal} ${formatWeight(row.weight)}`)
                .join(' · ')}
            </p>
            <div className="purchase-review-totals">
              <div>
                <span>Subtotal</span>
                <span>{formatCurrency(displayTotals.subtotal)}</span>
              </div>
              {displayTotals.discount > 0 ? (
                <div>
                  <span>Discount</span>
                  <span>-{formatCurrency(displayTotals.discount)}</span>
                </div>
              ) : null}
              {displayTotals.tax > 0 ? (
                <div>
                  <span>GST</span>
                  <span>{formatCurrency(displayTotals.tax)}</span>
                </div>
              ) : null}
              <div>
                <span>Round off</span>
                <span>{formatCurrency(displayTotals.roundOff)}</span>
              </div>
              <div className="grand">
                <span>Grand total</span>
                <span>{formatCurrency(displayTotals.total)}</span>
              </div>
            </div>
            <p className="muted">
              Stock impact: +{review.pieceCount} piece{review.pieceCount === 1 ? '' : 's'} across{' '}
              {review.products.length} product{review.products.length === 1 ? '' : 's'}.
            </p>
          </div>
        </Modal>
      ) : null}

      <SupplierFormModal
        open={supplierModalOpen}
        onClose={() => setSupplierModalOpen(false)}
        onSaved={(supplier) => {
          setSuppliers((current) => [supplier, ...current])
          setSupplierId(supplier.id)
          showToast('Supplier added', 'success')
        }}
        onError={(message) => setError(message)}
      />

      {printOpen && inwardId != null ? (
        <PrintPreviewModal
          title="Print preview"
          path={printPreviewPaths.purchase(inwardId)}
          pdfFilename="purchase.pdf"
          onClose={() => setPrintOpen(false)}
        />
      ) : null}
    </>
  )
}
