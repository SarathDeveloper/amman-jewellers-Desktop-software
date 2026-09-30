/**
 * Live Electron E2E: Adagu (pledge/loan) billing flow with hard-coded totals.
 * Requires the Electron dev app: npm run electron:dev
 * Login: admin / admin456
 *
 * Sets shop Adagu monthly interest to 2% (persists in this live database).
 * Interest = principal × 2/100 × days/30  (shared/billing/pledgeMath.ts)
 */
import { expect, test } from './fixtures/electron-live'
import {
  adaguDueRow,
  adaguField,
  calculatedValue,
  closePrintPreview,
  fillAdaguBorrower,
  fillPledgeItem,
  inr,
  isoDaysAgo,
  openAdaguDueDrawer,
  openDuesTab,
  openNewAdaguBill,
  receiptNoFromDueRow,
  sanctionAdaguLoan,
  setAdaguInterestPct,
  setBillDate,
} from './helpers/inventoryBilling'

test.describe('Adagu billing — live Electron scenarios', () => {
  test.describe.configure({ mode: 'serial' })

  test('setup — set Adagu monthly interest to 2%', async ({ window }) => {
    await setAdaguInterestPct(window, '2')
  })

  test('S6 — sanction, extra loan, collect interest, then close', async ({ window }) => {
    const stamp = Date.now()
    const customerName = `Kannan Adagu ${stamp}`
    const pledgeDate = isoDaysAgo(60)

    await openNewAdaguBill(window)
    await setBillDate(window, pledgeDate)
    await fillAdaguBorrower(window, { name: customerName, phone: `8${String(stamp).slice(-9)}` })
    await fillPledgeItem(window, {
      description: 'Ladies bangle pair',
      grossWeight: '25',
      stoneWeight: '1',
    })

    await adaguField(window, 'Loan Amount').locator('input').fill('100000')
    await adaguField(window, 'Deduction').locator('input').fill('1000')
    await adaguField(window, 'Deduction').locator('input').blur()

    await expect(adaguField(window, 'Paid Amount').locator('input')).toHaveValue('99000')
    await expect(adaguField(window, 'Interest Rate').locator('input')).toHaveValue('2')
    await expect(window.locator('.adagu-jewellery-table--pledge tbody tr').first().locator('.adagu-col-weight input').nth(2)).toHaveValue('24')

    // 24.000 gms; 2%/month; monthly 100000×0.02 = 2,000
    // one-year payable: 100000 + round(100000×0.02×365/30) = 1,24,333.33
    await expect(calculatedValue(window, 'Net Weight')).toHaveText('24.000 gms')
    await expect(calculatedValue(window, 'Interest Rate')).toHaveText('2% per month')
    await expect(calculatedValue(window, 'Monthly Interest')).toHaveText(inr(2_000))
    await expect(calculatedValue(window, 'Loan Amount')).toHaveText(inr(100_000))
    await expect(calculatedValue(window, 'Total Payable (with interest)')).toHaveText(inr(124_333.33))

    await window.getByRole('button', { name: 'Generate', exact: true }).click()
    const sanction = window.getByRole('dialog', { name: 'Sanction loan' })
    await expect(sanction).toBeVisible()
    await expect(sanction.getByText(`for ${inr(99_000)} net paid`, { exact: false })).toBeVisible()
    await sanction.getByRole('button', { name: 'Sanction loan' }).click()
    const sanctioned = window.getByText('Loan sanctioned')
    const crashed = window.getByRole('heading', { name: 'Something went wrong.' })
    await sanctioned.or(crashed).waitFor({ state: 'visible', timeout: 15_000 })
    await closePrintPreview(window)

    await openDuesTab(window, 'Adagu Dues')
    const row = await adaguDueRow(window, customerName)
    const receiptNo = await receiptNoFromDueRow(row)
    const cells = row.locator('td')
    // 60-day interest: 100000 × 0.02 × 60/30 = 4,000 → total due 1,04,000
    await expect(cells.nth(3)).toHaveText(inr(100_000))
    await expect(cells.nth(4)).toHaveText(inr(2_000))
    await expect(cells.nth(6)).toHaveText('60')
    await expect(cells.nth(7)).toHaveText(inr(104_000))
    await expect(cells.nth(8)).toHaveText(inr(104_000))
    await expect(row.getByText('Interest overdue')).toBeVisible()

    const drawer = await openAdaguDueDrawer(window, receiptNo, customerName)
    await drawer.getByRole('button', { name: 'Extra', exact: true }).click()
    const extra = window.getByRole('dialog', { name: new RegExp(`Extra loan · ${receiptNo}`) })
    await expect(extra).toBeVisible()
    await extra.getByLabel('Extra amount').fill('20000')
    await expect(extra.locator('dt', { hasText: 'Current principal' }).locator('..').locator('dd')).toHaveText(
      inr(100_000),
    )
    await expect(extra.locator('dt', { hasText: 'New principal' }).locator('..').locator('dd')).toHaveText(
      inr(120_000),
    )
    await expect(extra.locator('dt', { hasText: 'Monthly interest' }).locator('..').locator('dd')).toHaveText(
      inr(2_400),
    )
    await extra.getByRole('button', { name: 'Add extra' }).click()
    await expect(window.getByText('Extra loan added')).toBeVisible()

    await expect(drawer.locator('dt', { hasText: 'Principal' }).locator('..').locator('dd').first()).toHaveText(
      inr(120_000),
    )
    // same-day top-up adds no interest: total due 1,20,000 + 4,000 = 1,24,000
    await drawer.getByRole('button', { name: 'Back to Due List' }).click()
    await expect(drawer).toBeHidden()
    const afterExtra = await adaguDueRow(window, receiptNo)
    await expect(afterExtra.locator('td').nth(3)).toHaveText(inr(120_000))
    await expect(afterExtra.locator('td').nth(4)).toHaveText(inr(2_400))
    await expect(afterExtra.locator('td').nth(7)).toHaveText(inr(124_000))
    await expect(afterExtra.locator('td').nth(8)).toHaveText(inr(124_000))

    const afterExtraDrawer = await openAdaguDueDrawer(window, receiptNo, customerName)
    await afterExtraDrawer.getByRole('button', { name: 'Interest', exact: true }).click()
    const interest = window.getByRole('dialog', { name: new RegExp(`Collect interest · ${receiptNo}`) })
    await expect(interest).toBeVisible()
    await interest.getByRole('button', { name: 'Fill monthly interest' }).click()
    await expect(interest.getByLabel('Amount')).toHaveValue('2400')
    await interest.getByRole('button', { name: 'Record collection' }).click()
    await expect(window.getByText('Interest collected')).toBeVisible()

    await afterExtraDrawer.getByRole('button', { name: 'Back to Due List' }).click()
    await expect(afterExtraDrawer).toBeHidden()
    const afterInterest = await adaguDueRow(window, receiptNo)
    await expect(afterInterest.locator('td').nth(8)).toHaveText(inr(121_600))

    const redeemDrawer = await openAdaguDueDrawer(window, receiptNo, customerName)
    await redeemDrawer.getByRole('button', { name: 'Redeem', exact: true }).click()
    const redeem = window.getByRole('dialog', { name: new RegExp(`Close Adagu loan · ${receiptNo}`) })
    await expect(redeem).toBeVisible()
    await redeem.getByRole('button', { name: 'Fill remaining due' }).click()
    await expect(redeem.getByLabel('Amount')).toHaveValue('121600')
    await redeem.getByRole('button', { name: 'Record collection' }).click()
    await expect(window.getByText('Loan closed and gold ready to release')).toBeVisible()
    await closePrintPreview(window)
    const closed = await adaguDueRow(window, customerName)
    await expect(closed.locator('td').nth(8)).toHaveText(inr(0))
  })

  test('S7 — full redeem after a partial collection clears the balance', async ({ window }) => {
    const stamp = Date.now()
    const customerName = `Murugan Adagu ${stamp}`
    const pledgeDate = isoDaysAgo(30)

    await openNewAdaguBill(window)
    await setBillDate(window, pledgeDate)
    await fillAdaguBorrower(window, { name: customerName, phone: `8${String(stamp).slice(-9)}` })
    await fillPledgeItem(window, {
      description: 'Gold chain',
      grossWeight: '12',
      stoneWeight: '0',
    })
    await adaguField(window, 'Loan Amount').locator('input').fill('50000')
    await expect(calculatedValue(window, 'Monthly Interest')).toHaveText(inr(1_000))

    await sanctionAdaguLoan(window)

    await openDuesTab(window, 'Adagu Dues')
    const row = await adaguDueRow(window, customerName)
    const receiptNo = await receiptNoFromDueRow(row)
    // 30-day interest: 50000 × 0.02 × 1 = 1,000 → total due 51,000
    await expect(row.locator('td').nth(6)).toHaveText('30')
    await expect(row.locator('td').nth(7)).toHaveText(inr(51_000))
    await expect(row.locator('td').nth(8)).toHaveText(inr(51_000))

    const drawer = await openAdaguDueDrawer(window, receiptNo, customerName)
    await drawer.getByRole('button', { name: 'Interest', exact: true }).click()
    const interest = window.getByRole('dialog', { name: new RegExp(`Collect interest · ${receiptNo}`) })
    await interest.getByRole('button', { name: 'Fill monthly interest' }).click()
    await expect(interest.getByLabel('Amount')).toHaveValue('1000')
    await interest.getByRole('button', { name: 'Record collection' }).click()
    await expect(window.getByText('Interest collected')).toBeVisible()

    await drawer.getByRole('button', { name: 'Back to Due List' }).click()
    const afterInterest = await adaguDueRow(window, receiptNo)
    await expect(afterInterest.locator('td').nth(8)).toHaveText(inr(50_000))

    const redeemDrawer = await openAdaguDueDrawer(window, receiptNo, customerName)
    await redeemDrawer.getByRole('button', { name: 'Redeem', exact: true }).click()
    const redeem = window.getByRole('dialog', { name: new RegExp(`Close Adagu loan · ${receiptNo}`) })
    await expect(redeem.getByLabel('Amount')).toHaveValue('50000')
    await redeem.getByRole('button', { name: 'Full redeem' }).click()
    await expect(window.getByText('Adagu loan closed')).toBeVisible()
    await closePrintPreview(window)
    const closed = await adaguDueRow(window, customerName)
    await expect(closed.locator('td').nth(8)).toHaveText(inr(0))
  })

  test('S8 — forfeit an active Adagu loan', async ({ window }) => {
    const stamp = Date.now()
    const customerName = `Selvi Adagu ${stamp}`

    await openNewAdaguBill(window)
    await fillAdaguBorrower(window, { name: customerName, phone: `8${String(stamp).slice(-9)}` })
    await fillPledgeItem(window, {
      description: 'Silver anklet',
      grossWeight: '40',
      stoneWeight: '0',
    })
    await adaguField(window, 'Loan Amount').locator('input').fill('30000')
    await expect(calculatedValue(window, 'Monthly Interest')).toHaveText(inr(600))

    await sanctionAdaguLoan(window)

    await openDuesTab(window, 'Adagu Dues')
    const row = await adaguDueRow(window, customerName)
    const receiptNo = await receiptNoFromDueRow(row)
    const drawer = await openAdaguDueDrawer(window, receiptNo, customerName)
    await drawer.getByRole('button', { name: 'Close', exact: true }).click()
    const confirm = window.getByRole('dialog', { name: 'Close / forfeit pledge' })
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: 'Forfeit' }).click()
    await expect(window.getByText('Pledge forfeited / closed')).toBeVisible()
    if (await drawer.isVisible()) {
      await drawer.getByRole('button', { name: 'Back to Due List' }).click()
    }

    await window.locator('.filter-bar').getByRole('tab', { name: 'Closed' }).click()
    const closed = await adaguDueRow(window, customerName)
    await expect(closed.locator('td').nth(8)).toHaveText(inr(0))
  })
})
