/**
 * Live Tauri E2E: inventory stock → billing, with real jewellery shop scenarios.
 * Requires the Tauri dev app: npm run tauri:dev
 * Login: admin / admin456
 *
 * Pricing (shared/billing/pricing.ts):
 *   line = (netWeight × qty × metalRate) + (makingCharges × qty)
 *   GST 3% applies on tax invoices only
 *   cash bills auto-round the payable to the nearest rupee
 */
import { expect, test } from './fixtures/tauri-live'
import { openInventoryTab } from './helpers/nav'
import {
  addCustomerOnBill,
  addProduct,
  addProductToBill,
  closeFinalizedBill,
  expectGrandTotal,
  expectLineAmount,
  expectProductStock,
  finalizeBill,
  inr,
  openNewBill,
  setDiscountAmount,
  setLineMetalRate,
  setPaymentMode,
} from './helpers/inventoryBilling'

const GOLD_RATE = '6200'
const SILVER_RATE = '88'
const OLD_GOLD_RATE = '6000'

test.describe('Inventory to billing — live Tauri scenarios', () => {
  test.describe.configure({ mode: 'serial' })

  test('S1 — Ravi gold ring, cash bill, stock 5 → 4', async ({ window }) => {
    const stamp = Date.now()
    const productName = `Gold Ring 22K ${stamp}`
    const customerName = `Ravi Kumar ${stamp}`

    await addProduct(window, {
      name: productName,
      category: 'Ring',
      grossWeight: '4.8',
      netWeight: '4.2',
      makingCharges: '450',
      stockQty: '5',
    })

    await openNewBill(window, 'cash')
    await addCustomerOnBill(window, customerName, '9876500001')
    const row = await addProductToBill(window, productName)
    await setLineMetalRate(row, GOLD_RATE)

    // 4.2 × 6200 + 450 = 26,490
    await expectLineAmount(row, 26_490)
    await expectGrandTotal(window, 26_490)

    await setPaymentMode(window, 'Cash')
    const success = await finalizeBill(window)
    await expect(success.getByText(inr(26_490)).first()).toBeVisible()
    await closeFinalizedBill(window)

    await expectProductStock(window, productName, '4')
  })

  test('S2 — Priya wedding set, 5% discount, UPI', async ({ window }) => {
    const stamp = Date.now()
    const chainName = `Gold Chain 22K ${stamp}`
    const earringName = `Gold Earrings 22K ${stamp}`
    const customerName = `Priya Nair ${stamp}`

    await addProduct(window, {
      name: chainName,
      category: 'Chain',
      grossWeight: '14.6',
      netWeight: '14',
      makingCharges: '900',
      stockQty: '3',
    })
    await addProduct(window, {
      name: earringName,
      category: 'Stud',
      grossWeight: '3.8',
      netWeight: '3.5',
      makingCharges: '300',
      stockQty: '5',
    })

    await openNewBill(window, 'cash')
    await addCustomerOnBill(window, customerName, '9876500002')
    const chainRow = await addProductToBill(window, chainName)
    await setLineMetalRate(chainRow, GOLD_RATE)
    const earringRow = await addProductToBill(window, earringName)
    await setLineMetalRate(earringRow, GOLD_RATE)

    // Chain 14 × 6200 + 900 = 87,700
    // Earrings 3.5 × 6200 + 300 = 22,000
    // Subtotal 109,700; 5% = 5,485; payable 104,215
    await expectLineAmount(chainRow, 87_700)
    await expectLineAmount(earringRow, 22_000)
    await setDiscountAmount(window, '5485')
    await expectGrandTotal(window, 104_215)

    await setPaymentMode(window, 'UPI')
    const success = await finalizeBill(window)
    await expect(success.getByText(inr(104_215)).first()).toBeVisible()
    await closeFinalizedBill(window)

    await expectProductStock(window, chainName, '2')
    await expectProductStock(window, earringName, '4')
  })

  test('S3 — Meena necklace, inward 2 pcs then bill 1', async ({ window }) => {
    const stamp = Date.now()
    const productName = `Gold Necklace 22K ${stamp}`
    const supplierName = `Prabhu Exports ${stamp}`
    const customerName = `Meena Devi ${stamp}`

    await addProduct(window, {
      name: productName,
      category: 'Necklace',
      grossWeight: '32',
      netWeight: '30',
      makingCharges: '2800',
      stockQty: '1',
    })

    await openInventoryTab(window, 'Suppliers')
    await window.getByRole('button', { name: 'Add supplier' }).click()
    const supplierDialog = window.getByRole('dialog', { name: 'Add supplier' })
    await supplierDialog.getByLabel('Name').fill(supplierName)
    await supplierDialog.getByRole('button', { name: 'Save' }).click()
    await expect(supplierDialog).toBeHidden()

    await openInventoryTab(window, 'Purchase')
    await window.getByRole('button', { name: 'New purchase' }).click()
    const purchase = window.getByRole('dialog', { name: 'New purchase' })
    await purchase.getByLabel('Supplier').selectOption({ label: supplierName })
    await purchase.getByLabel('Product').selectOption({ label: productName })
    await purchase.getByLabel('Qty').fill('2')
    await purchase.getByLabel('Net weight').fill('30')
    await purchase.getByLabel('Rate').fill(GOLD_RATE)
    await purchase.getByRole('button', { name: 'Save & finalize' }).click()
    await window.getByRole('dialog', { name: 'Finalize purchase?' }).getByRole('button', { name: 'Finalize' }).click()
    await expect(window.getByText('Purchase finalized — stock updated')).toBeVisible()

    await expectProductStock(window, productName, '3')

    await openNewBill(window, 'cash')
    await addCustomerOnBill(window, customerName, '9876500003')
    const row = await addProductToBill(window, productName)
    await setLineMetalRate(row, GOLD_RATE)

    // 30 × 6200 + 2800 = 188,800
    await expectLineAmount(row, 188_800)
    await expectGrandTotal(window, 188_800)

    await setPaymentMode(window, 'Cash')
    await finalizeBill(window)
    await closeFinalizedBill(window)

    await expectProductStock(window, productName, '2')
  })

  test('S4 — Silver anklets tax invoice, GST 3%', async ({ window }) => {
    const stamp = Date.now()
    const productName = `Silver Anklet 925 ${stamp}`
    const customerName = `Arun Silver ${stamp}`

    await addProduct(window, {
      name: productName,
      category: 'Bangle',
      metal: 'Silver',
      purity: '925',
      grossWeight: '28',
      netWeight: '26',
      makingCharges: '180',
      stockQty: '6',
    })

    await openNewBill(window, 'tax')
    await addCustomerOnBill(window, customerName, '9876500004')
    const first = await addProductToBill(window, productName)
    await setLineMetalRate(first, SILVER_RATE)
    const second = await addProductToBill(window, productName)
    await setLineMetalRate(second, SILVER_RATE)

    // Each line: 26 × 88 + 180 = 2,468  → two pcs = 4,936
    // CGST 1.5% = 74.04, SGST 1.5% = 74.04, tax 148.08, before round-off 5,084.08
    // App auto-rounds payable to ₹5,084
    await expectLineAmount(first, 2_468)
    await expectLineAmount(second, 2_468)
    await expect(window.locator('.adagu-calculated-row').filter({ hasText: 'Taxable Amount' }).locator('.value')).toHaveText(
      inr(4_936),
    )
    await expect(window.locator('.adagu-calculated-row').filter({ hasText: 'CGST 1.5%' }).locator('.value')).toHaveText(
      inr(74.04),
    )
    await expect(window.locator('.adagu-calculated-row').filter({ hasText: 'SGST 1.5%' }).locator('.value')).toHaveText(
      inr(74.04),
    )
    await expect(window.locator('.adagu-calculated-row').filter({ hasText: 'Total Tax (3%)' }).locator('.value')).toHaveText(
      inr(148.08),
    )
    await expectGrandTotal(window, 5_084)

    await setPaymentMode(window, 'UPI')
    const success = await finalizeBill(window)
    await expect(success.getByText(inr(5_084)).first()).toBeVisible()
    await closeFinalizedBill(window)

    await expectProductStock(window, productName, '4')
  })

  test('S5 — Sundari old gold exchange against new bangle', async ({ window }) => {
    const stamp = Date.now()
    const productName = `Gold Bangle 22K ${stamp}`
    const customerName = `Sundari ${stamp}`

    await addProduct(window, {
      name: productName,
      category: 'Bangle',
      grossWeight: '18.8',
      netWeight: '18',
      makingCharges: '1400',
      stockQty: '4',
    })

    await openInventoryTab(window, 'Old Gold Purchase')
    await window.getByRole('button', { name: 'New purchase' }).click()
    const ogp = window.getByRole('dialog', { name: 'New old gold purchase' })
    await ogp.getByLabel('Customer name').fill(customerName)
    await ogp.getByLabel('Phone').fill('9876500005')
    const ogRow = ogp.locator('.old-gold-table tbody tr').first()
    await ogRow.locator('input').first().fill('Old gold chain')
    await ogRow.locator('input[type="number"]').nth(0).fill('5')
    await ogRow.locator('input[type="number"]').nth(3).fill(OLD_GOLD_RATE)
    await ogRow.locator('input[type="number"]').nth(4).fill('0')
    await expect(ogp.getByText(`Total ${inr(30_000)}`, { exact: false })).toBeVisible()
    await ogp.getByRole('button', { name: 'Save & finalize' }).click()
    await window.getByRole('dialog', { name: 'Finalize old gold purchase?' }).getByRole('button', { name: 'Finalize' }).click()
    await expect(ogp).toBeHidden()

    const purchaseRow = window.getByRole('row').filter({ hasText: customerName }).first()
    const purchaseNo = (await purchaseRow.locator('td').first().innerText()).trim()
    expect(purchaseNo).toMatch(/^OGP-/)

    await openNewBill(window, 'cash')
    await addCustomerOnBill(window, customerName, '9876500005')
    const saleRow = await addProductToBill(window, productName)
    await setLineMetalRate(saleRow, GOLD_RATE)

    // New item: 18 × 6200 + 1400 = 113,000
    await expectLineAmount(saleRow, 113_000)

    await window.getByPlaceholder('OGP-2026-0001').fill(purchaseNo)
    await window.locator('.old-gold-link-form').getByRole('button', { name: 'Add' }).click()
    await expect(window.getByText('Old gold total').locator('..').getByRole('strong')).toHaveText(inr(30_000))
    await expect(window.locator('.adagu-calculated-row').filter({ hasText: 'Old gold exchange' }).locator('.value')).toHaveText(
      `-${inr(30_000)}`,
    )
    await expectGrandTotal(window, 83_000)

    await setPaymentMode(window, 'Cash')
    const success = await finalizeBill(window)
    await expect(success.getByText(inr(83_000)).first()).toBeVisible()
    await closeFinalizedBill(window)

    await expectProductStock(window, productName, '3')
  })

  test('S6 — product search shows stock and blocks a sold-out piece', async ({ window }) => {
    const stamp = Date.now()
    const soldOut = `Gold Ring Sold Out ${stamp}`
    const inStock = `Gold Ring In Stock ${stamp}`
    const customerName = `Kavya ${stamp}`

    await addProduct(window, {
      name: soldOut,
      category: 'Ring',
      grossWeight: '4.8',
      netWeight: '4.2',
      makingCharges: '450',
      stockQty: '0',
    })
    await addProduct(window, {
      name: inStock,
      category: 'Ring',
      grossWeight: '3.6',
      netWeight: '3.2',
      makingCharges: '350',
      stockQty: '1',
    })

    await openNewBill(window, 'cash')
    await addCustomerOnBill(window, customerName, '9876500006')

    const search = window.getByPlaceholder('Search product by name, metal, category, SKU…')

    await search.fill(soldOut)
    const soldOutOption = window.getByRole('option', { name: new RegExp(soldOut) })
    await expect(soldOutOption).toBeVisible()
    await expect(soldOutOption).toContainText('Out of stock')
    await expect(soldOutOption).toBeDisabled()

    await search.fill(inStock)
    const inStockOption = window.getByRole('option', { name: new RegExp(inStock) })
    await expect(inStockOption).toBeVisible()
    await expect(inStockOption).toContainText('1 in stock')
    await inStockOption.click()

    // The picked piece uses the whole stock, so it cannot be picked again.
    await search.fill(inStock)
    const usedUp = window.getByRole('option', { name: new RegExp(inStock) })
    await expect(usedUp).toContainText('All 1 on this bill')
    await expect(usedUp).toBeDisabled()
  })
})
