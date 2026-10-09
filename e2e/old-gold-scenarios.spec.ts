/**
 * Live Tauri E2E: standalone Old Gold Purchase flow with hard-coded totals.
 * Requires the Tauri dev app: npm run tauri:dev
 * Login: admin / admin456
 *
 * computeOldGoldValue: gross = net × rate; deduction = gross × ded%/100; final = gross − deduction
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
  fillOldGoldRow,
  finalizeBill,
  inr,
  openNewBill,
  openNewOldGoldPurchase,
  setLineMetalRate,
  setPaymentMode,
} from './helpers/inventoryBilling'

const OG_RATE = '5800'
const SALE_RATE = '5800'

let sharedStamp = 0
let sharedPurchaseNo = ''
let sharedCustomerName = ''

test.describe('Old gold purchase — live Tauri scenarios', () => {
  test.describe.configure({ mode: 'serial' })

  test('S9 — draft math, draft-link guard, finalize, no stock', async ({ window }) => {
    sharedStamp = Date.now()
    sharedCustomerName = `Lakshmi OGP ${sharedStamp}`
    const chainName = `Old chain ${sharedStamp}`
    const ringName = `Old ring ${sharedStamp}`

    const ogp = await openNewOldGoldPurchase(window)
    await ogp.getByLabel('Customer name').fill(sharedCustomerName)
    await ogp.getByLabel('Phone').fill(`8${String(sharedStamp).slice(-9)}`)

    const first = ogp.locator('.old-gold-table tbody tr').first()
    await fillOldGoldRow(first, {
      description: chainName,
      grossWeight: '12',
      stoneWeight: '2',
      ratePerGram: OG_RATE,
      deductionPct: '8',
    })
    await expect(first.locator('input[type="number"]').nth(2)).toHaveValue('10')
    // 10 × 5800 = 58,000; 8% = 4,640; final = 53,360
    await expect(first.locator('.old-gold-col-amount')).toHaveText(inr(53_360))

    await ogp.getByRole('button', { name: 'Add item' }).click()
    const second = ogp.locator('.old-gold-table tbody tr').nth(1)
    await fillOldGoldRow(second, {
      description: ringName,
      grossWeight: '5',
      stoneWeight: '0',
      ratePerGram: OG_RATE,
      deductionPct: '0',
    })
    await expect(second.locator('.old-gold-col-amount')).toHaveText(inr(29_000))

    await expect(ogp.locator('.old-gold-total strong')).toHaveText(inr(82_360))
    await expect(ogp.getByText(`Total ${inr(82_360)}`, { exact: false })).toBeVisible()

    await ogp.getByRole('button', { name: 'Save draft' }).click()
    await expect(window.getByText('Draft saved')).toBeVisible()
    await expect(ogp).toBeHidden()

    await window.getByPlaceholder('Search bill no or customer...').fill(sharedCustomerName)
    const listRow = window.getByRole('row').filter({ hasText: sharedCustomerName }).first()
    await expect(listRow).toBeVisible()
    sharedPurchaseNo = (await listRow.locator('td').first().innerText()).trim()
    expect(sharedPurchaseNo).toMatch(/^OGP-/)
    await expect(listRow.getByText('Draft', { exact: true })).toBeVisible()
    await expect(listRow.locator('td.num').last()).toHaveText(inr(82_360))
    await expect(listRow.locator('td').nth(7)).toHaveText('—')
    await expect(listRow.locator('td.num').first()).toHaveText('15.00 g')

    await listRow.getByRole('button', { name: `Edit ${sharedPurchaseNo}` }).click()
    const edit = window.getByRole('dialog', { name: new RegExp(`Edit ${sharedPurchaseNo}`) })
    await expect(edit).toBeVisible()
    await expect(edit.locator('.old-gold-table tbody tr').first().locator('.old-gold-col-amount')).toHaveText(
      inr(53_360),
    )
    await expect(edit.locator('.old-gold-table tbody tr').nth(1).locator('.old-gold-col-amount')).toHaveText(
      inr(29_000),
    )
    await expect(edit.locator('.old-gold-total strong')).toHaveText(inr(82_360))
    await edit.getByRole('button', { name: 'Cancel' }).click()
    await expect(edit).toBeHidden()

    await openNewBill(window, 'cash')
    await window.getByPlaceholder('OGP-2026-0001').fill(sharedPurchaseNo)
    await window.locator('.old-gold-link-form').getByRole('button', { name: 'Add' }).click()
    await expect(window.locator('.old-gold-link-error')).toContainText(
      'is still a draft. Finalize it before applying to a sale bill.',
    )
    await expect(window.locator('.old-gold-table--links tbody tr')).toHaveCount(0)

    await openInventoryTab(window, 'Old Gold Purchase')
    await window.getByPlaceholder('Search bill no or customer...').fill(sharedCustomerName)
    const draftRow = window.getByRole('row').filter({ hasText: sharedCustomerName }).first()
    await draftRow.getByRole('button', { name: 'Finalize' }).click()
    const confirm = window.getByRole('dialog', { name: 'Finalize purchase?' })
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: 'Finalize' }).click()
    await expect(window.getByText('Old gold purchase finalized')).toBeVisible()
    await expect(draftRow.getByText('Final', { exact: true })).toBeVisible()
    await expect(draftRow.locator('td.num').last()).toHaveText(inr(82_360))

    await openInventoryTab(window, 'Products')
    await window.getByPlaceholder('Search products, variants, size or code...').fill(chainName)
    await expect(window.getByRole('row').filter({ hasText: chainName })).toHaveCount(0)
  })

  test('S10 — apply finalized old gold to a bill and block a duplicate link', async ({ window }) => {
    expect(sharedPurchaseNo).toMatch(/^OGP-/)
    const productName = `Gold Necklace ${sharedStamp}`
    const customerName = `Buyer OGP ${sharedStamp}`

    await addProduct(window, {
      name: productName,
      category: 'Necklace',
      grossWeight: '18.5',
      netWeight: '18',
      makingCharges: '4000',
      stockQty: '2',
    })

    await openNewBill(window, 'cash')
    await addCustomerOnBill(window, customerName, `7${String(sharedStamp).slice(-9)}`)
    const saleRow = await addProductToBill(window, productName)
    await setLineMetalRate(saleRow, SALE_RATE)
    // 18 × 5800 + 4,000 = 1,08,400
    await expectLineAmount(saleRow, 108_400)

    await window.getByPlaceholder('OGP-2026-0001').fill(sharedPurchaseNo)
    await window.locator('.old-gold-link-form').getByRole('button', { name: 'Add' }).click()
    // The purchase belongs to a different customer than the bill, so confirm it.
    const mismatch = window.getByRole('dialog', { name: 'Different customer' })
    await expect(mismatch).toBeVisible()
    await mismatch.getByRole('button', { name: 'Apply anyway' }).click()
    await expect(window.getByText('Old gold total').locator('..').getByRole('strong')).toHaveText(inr(82_360))
    await expect(
      window.locator('.adagu-calculated-row').filter({ hasText: 'Old gold exchange' }).locator('.value'),
    ).toHaveText(`-${inr(82_360)}`)
    await expectGrandTotal(window, 26_040)

    await setPaymentMode(window, 'Cash')
    const success = await finalizeBill(window)
    await expect(success.getByText(inr(26_040)).first()).toBeVisible()
    const invoiceNo = (await success.locator('h3').innerText()).trim()
    await closeFinalizedBill(window)

    await openNewBill(window, 'cash')
    await window.getByPlaceholder('OGP-2026-0001').fill(sharedPurchaseNo)
    await window.locator('.old-gold-link-form').getByRole('button', { name: 'Add' }).click()
    await expect(window.locator('.old-gold-link-error')).toContainText('is already applied to')
    await expect(window.locator('.old-gold-link-error')).toContainText(invoiceNo)
  })

  test('S11 — buy old gold inside the bill, apply partially and pay the balance', async ({ window }) => {
    const stamp = Date.now()
    const productName = `Gold Ring ${stamp}`
    const customerName = `Inline OGP ${stamp}`

    await addProduct(window, {
      name: productName,
      category: 'Ring',
      grossWeight: '5.5',
      netWeight: '5',
      makingCharges: '1000',
      stockQty: '2',
    })

    await openNewBill(window, 'cash')
    await addCustomerOnBill(window, customerName, `9${String(stamp).slice(-9)}`)
    const saleRow = await addProductToBill(window, productName)
    await setLineMetalRate(saleRow, SALE_RATE)
    // 5 × 5800 + 1,000 = 30,000
    await expectLineAmount(saleRow, 30_000)

    // Buy old gold from inside the bill. The purchase form is prefilled with the bill's customer.
    await window.getByRole('button', { name: 'New old gold' }).click()
    const ogp = window.getByRole('dialog', { name: 'New old gold purchase' })
    await expect(ogp).toBeVisible()
    await expect(ogp.getByPlaceholder('Name')).toHaveValue(customerName)

    const ogpRow = ogp.locator('.old-gold-table tbody tr').first()
    await fillOldGoldRow(ogpRow, {
      description: `Inline chain ${stamp}`,
      grossWeight: '20',
      stoneWeight: '0',
      ratePerGram: OG_RATE,
      deductionPct: '0',
    })
    // 20 × 5800 = 1,16,000 — far more than the bill.
    await expect(ogpRow.locator('.old-gold-col-amount')).toHaveText(inr(116_000))

    await ogp.getByRole('button', { name: 'Save & finalize' }).click()
    const confirm = window.getByRole('dialog', { name: 'Finalize old gold purchase?' })
    await confirm.getByRole('button', { name: 'Finalize' }).click()

    // Finalizing auto-links it: the bill takes only what it needs and the rest stays as the balance.
    await expect(window.getByText('Old gold total').locator('..').getByRole('strong')).toHaveText(inr(30_000))
    await expectGrandTotal(window, 0)
    const linkRow = window.locator('.old-gold-table--links tbody tr').first()
    await expect(linkRow.locator('.adagu-col-amount').nth(1)).toHaveText(inr(86_000))

    // Pay the leftover balance out to the customer without leaving the bill.
    await linkRow.getByRole('button', { name: /Pay out balance of OGP-/ }).click()
    const payout = window.getByRole('dialog', { name: /^Pay out OGP-/ })
    await expect(payout).toBeVisible()
    await payout.getByLabel('Amount').fill('86000')
    await payout.getByRole('button', { name: 'Record payout' }).click()
    await expect(window.getByText('Payout recorded')).toBeVisible()
  })
})
