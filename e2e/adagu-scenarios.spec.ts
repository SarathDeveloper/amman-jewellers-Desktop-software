/**
 * Live Tauri E2E: Adagu (pledge / loan) scenarios for the real-life upgrade.
 * Requires the Tauri dev app: npm run tauri:dev — login admin / admin456.
 *
 * These scenarios write real rows into the live database and write the shop
 * settings below, so run them against a shop copy you do not mind changing.
 *
 * Interest uses the period engine in shared/billing/pledgeLedger.ts: the first
 * 30 days cost one month (a same-day charge still costs the minimum month),
 * later part-months of 1-15 days cost half a month and 16-29 days cost a full
 * month. The editor's "Total Payable (with interest)" preview still uses the
 * plain days/30 helper in shared/billing/pledgeMath.ts.
 *
 * Phases covered:
 *   P1  pledge_payments ledger: collect interest, extra loan, partial and full
 *       redeem, discount and payment mode, payment history.
 *   P2  sanctioned loans are locked, drafts can be deleted, renewal opens a new
 *       ADG ticket and links both tickets.
 *   P3  assessed value, the LTV max line and the "Use max" helper.
 *   P4  auction notice, then auction settlement to an outside buyer and to the
 *       shop (stock buyback).
 *   P5  KYC enforcement, photo upload and the reminder list with its WhatsApp
 *       opener.
 *
 * The repayment due date is clamped to at least today, so an auction notice can
 * only be dated after today: the auction scenarios use tomorrow + the 14-day
 * notice period, and bid the payoff of that auction date.
 */
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures/tauri-live'
import {
  adaguDueRow,
  adaguField,
  calculatedValue,
  closePrintPreview,
  fillAdaguBorrower,
  fillPledgeItem,
  inr,
  isoDaysAgo,
  localTodayIso,
  openAdaguDueDrawer,
  openDuesTab,
  openNewAdaguBill,
  receiptNoFromDueRow,
  sanctionAdaguLoan,
  setAdaguSettings,
  setBillDate,
} from './helpers/inventoryBilling'

/** A 1x1 PNG, enough for the photo upload endpoints. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
)

function isoDaysFromToday(days: number): string {
  return isoDaysAgo(-days)
}

/** Creates a new Adagu bill and fills borrower, one item and the loan amount. */
async function openPledge(
  window: Page,
  values: {
    name: string
    phone: string
    pledgeDate: string
    amount: string
    gross?: string
    stone?: string
    description?: string
    deduction?: string
    aadhaar?: string
  },
) {
  await openNewAdaguBill(window)
  await setBillDate(window, values.pledgeDate)
  await fillAdaguBorrower(window, { name: values.name, phone: values.phone })
  await fillPledgeItem(window, {
    description: values.description ?? 'Gold chain',
    grossWeight: values.gross ?? '10',
    stoneWeight: values.stone ?? '0',
  })
  if (values.aadhaar) {
    await window.getByPlaceholder('12 digits').fill(values.aadhaar)
  }
  await adaguField(window, 'Loan Amount').locator('input').fill(values.amount)
  if (values.deduction) {
    await adaguField(window, 'Deduction').locator('input').fill(values.deduction)
    await adaguField(window, 'Deduction').locator('input').blur()
  }
}

async function closeDrawer(window: Page, drawer: Locator) {
  await drawer.getByRole('button', { name: 'Back to Due List' }).click()
  await expect(drawer).toBeHidden()
}

/** Sends an auction notice dated tomorrow, which is the earliest allowed date. */
async function sendAuctionNotice(window: Page, drawer: Locator, receiptNo: string) {
  await drawer.getByRole('button', { name: 'Notice', exact: true }).click()
  const notice = window.getByRole('dialog', { name: `Auction notice · ${receiptNo}` })
  await expect(notice).toBeVisible()
  await expect(notice.locator('dt', { hasText: 'Notice period' }).locator('..')).toContainText(
    '14 days',
  )
  await notice.getByLabel('Notice date').fill(isoDaysFromToday(1))
  await notice.getByRole('button', { name: 'Send notice' }).click()
  await expect(window.getByText('Auction notice saved')).toBeVisible()
}

/** Opens the auction modal, which defaults to the first eligible auction date. */
async function openAuctionModal(window: Page, drawer: Locator, receiptNo: string) {
  await drawer.getByRole('button', { name: 'Auction', exact: true }).click()
  const auction = window.getByRole('dialog', { name: `Record auction · ${receiptNo}` })
  await expect(auction).toBeVisible()
  await expect(auction.getByLabel('Auction date')).toHaveValue(isoDaysFromToday(15))
  await expect(
    auction.locator('dt', { hasText: 'Payoff on auction date' }).locator('..').locator('dd'),
  ).toHaveText(inr(38_400))
  await auction.getByLabel('Sale amount').fill('38400')
  return auction
}

test.describe('Adagu billing — live Tauri scenarios', () => {
  test.describe.configure({ mode: 'serial' })

  test('setup — Adagu settings: 2% interest, 75% LTV, 14-day notice period', async ({
    window,
  }) => {
    await setAdaguSettings(window, { interestPct: '2', ltvPct: '75', noticeDays: '14' })
  })

  test('P1a — sanction, extra loan, collect interest, then redeem', async ({ window }) => {
    const stamp = Date.now()
    const customerName = `Kannan Adagu ${stamp}`
    const pledgeDate = isoDaysAgo(60)

    await openPledge(window, {
      name: customerName,
      phone: `8${String(stamp).slice(-9)}`,
      pledgeDate,
      amount: '100000',
      gross: '25',
      stone: '1',
      description: 'Ladies bangle pair',
      deduction: '1000',
    })

    await expect(adaguField(window, 'Paid Amount').locator('input')).toHaveValue('99000')
    await expect(adaguField(window, 'Interest Rate').locator('input')).toHaveValue('2')
    await expect(
      window
        .locator('.adagu-jewellery-table--pledge tbody tr')
        .first()
        .locator('.adagu-col-weight input')
        .nth(2),
    ).toHaveValue('24')

    // 100000 × 2% = 2,000 a month; the one-year preview is the days/30 helper.
    await expect(calculatedValue(window, 'Net Weight')).toHaveText('24.000 gms')
    await expect(calculatedValue(window, 'Interest Rate')).toHaveText('2% per month')
    await expect(calculatedValue(window, 'Monthly Interest')).toHaveText(inr(2_000))
    await expect(calculatedValue(window, 'Loan Amount')).toHaveText(inr(100_000))
    await expect(calculatedValue(window, 'Total Payable (with interest)')).toHaveText(
      inr(124_333.33),
    )

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
    // 60 days is two full periods: 100000 × 0.02 × 2 = 4,000 → due 1,04,000
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

    await expect(
      drawer.locator('dt', { hasText: 'Principal' }).locator('..').locator('dd').first(),
    ).toHaveText(inr(120_000))
    // The top-up is its own tranche, so it charges its own minimum month from today.
    await closeDrawer(window, drawer)
    const afterExtra = await adaguDueRow(window, receiptNo)
    await expect(afterExtra.locator('td').nth(3)).toHaveText(inr(120_000))
    await expect(afterExtra.locator('td').nth(4)).toHaveText(inr(2_400))
    await expect(afterExtra.locator('td').nth(7)).toHaveText(inr(124_400))
    await expect(afterExtra.locator('td').nth(8)).toHaveText(inr(124_400))

    const afterExtraDrawer = await openAdaguDueDrawer(window, receiptNo, customerName)
    await afterExtraDrawer.getByRole('button', { name: 'Interest', exact: true }).click()
    const interest = window.getByRole('dialog', { name: new RegExp(`Collect interest · ${receiptNo}`) })
    await expect(interest).toBeVisible()
    await expect(interest.locator('dt', { hasText: 'Interest due' }).locator('..').locator('dd')).toHaveText(
      inr(4_400),
    )
    await interest.getByRole('button', { name: 'Fill monthly interest' }).click()
    await expect(interest.getByLabel('Amount')).toHaveValue('2400')
    await interest.getByRole('button', { name: 'Record collection' }).click()
    await expect(window.getByText('Interest collected')).toBeVisible()

    await closeDrawer(window, afterExtraDrawer)
    const afterInterest = await adaguDueRow(window, receiptNo)
    await expect(afterInterest.locator('td').nth(8)).toHaveText(inr(122_000))

    const redeemDrawer = await openAdaguDueDrawer(window, receiptNo, customerName)
    // P1 ledger: the drawer lists the money row written by recordPledgePayment.
    const historyRow = redeemDrawer.locator('.adagu-detail-history li').first()
    await expect(historyRow).toContainText('Payment received')
    await expect(historyRow).toContainText(inr(2_400))
    await expect(historyRow).toContainText('Cash')

    await redeemDrawer.getByRole('button', { name: 'Redeem', exact: true }).click()
    const redeem = window.getByRole('dialog', { name: new RegExp(`Close Adagu loan · ${receiptNo}`) })
    await expect(redeem).toBeVisible()
    await expect(redeem.getByLabel('Amount collected')).toHaveValue('122000')
    await redeem.getByRole('button', { name: 'Record collection' }).click()
    await expect(window.getByText('Loan closed and gold ready to release')).toBeVisible()
    await closePrintPreview(window)
    const closed = await adaguDueRow(window, customerName)
    await expect(closed.locator('td').nth(8)).toHaveText(inr(0))
  })

  test('P1b — partial interest then full redeem', async ({ window }) => {
    const stamp = Date.now()
    const customerName = `Murugan Adagu ${stamp}`
    const pledgeDate = isoDaysAgo(30)

    await openPledge(window, {
      name: customerName,
      phone: `8${String(stamp).slice(-9)}`,
      pledgeDate,
      amount: '50000',
      gross: '12',
      stone: '0',
    })
    await expect(calculatedValue(window, 'Monthly Interest')).toHaveText(inr(1_000))

    await sanctionAdaguLoan(window)

    await openDuesTab(window, 'Adagu Dues')
    const row = await adaguDueRow(window, customerName)
    const receiptNo = await receiptNoFromDueRow(row)
    // 30 days is the minimum one month: 50000 × 0.02 × 1 = 1,000 → due 51,000
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

    await closeDrawer(window, drawer)
    const afterInterest = await adaguDueRow(window, receiptNo)
    // The paid month moved "interest paid up to" by 30 days, so only principal is left.
    await expect(afterInterest.locator('td').nth(8)).toHaveText(inr(50_000))

    const redeemDrawer = await openAdaguDueDrawer(window, receiptNo, customerName)
    await redeemDrawer.getByRole('button', { name: 'Redeem', exact: true }).click()
    const redeem = window.getByRole('dialog', { name: new RegExp(`Close Adagu loan · ${receiptNo}`) })
    await expect(redeem.getByLabel('Amount collected')).toHaveValue('50000')
    await redeem.getByRole('button', { name: 'Full redeem' }).click()
    await expect(window.getByText('Adagu loan closed')).toBeVisible()
    await closePrintPreview(window)
    const closed = await adaguDueRow(window, customerName)
    await expect(closed.locator('td').nth(8)).toHaveText(inr(0))
  })

  test('P1c — redeem with a discount and a UPI mode', async ({ window }) => {
    const stamp = Date.now()
    const customerName = `Devi Adagu ${stamp}`

    await openPledge(window, {
      name: customerName,
      phone: `8${String(stamp).slice(-9)}`,
      pledgeDate: isoDaysAgo(30),
      amount: '50000',
      gross: '12',
      stone: '0',
      description: 'Gold necklace',
    })
    await sanctionAdaguLoan(window)

    await openDuesTab(window, 'Adagu Dues')
    const row = await adaguDueRow(window, customerName)
    const receiptNo = await receiptNoFromDueRow(row)

    const drawer = await openAdaguDueDrawer(window, receiptNo, customerName)
    await drawer.getByRole('button', { name: 'Redeem', exact: true }).click()
    const redeem = window.getByRole('dialog', { name: new RegExp(`Close Adagu loan · ${receiptNo}`) })
    await expect(redeem).toBeVisible()
    // The discount applies to interest first and the rest still has to cover the payoff.
    await redeem.getByLabel('Discount').fill('100')
    await expect(redeem.getByLabel('Amount collected')).toHaveValue('50900')
    await redeem.getByLabel('Mode').selectOption('upi')
    await redeem.getByRole('button', { name: 'Full redeem' }).click()
    await expect(window.getByText('Adagu loan closed')).toBeVisible()
    await closePrintPreview(window)

    const closed = await adaguDueRow(window, receiptNo)
    await expect(closed.locator('td').nth(8)).toHaveText(inr(0))

    const settledDrawer = await openAdaguDueDrawer(window, receiptNo, customerName)
    const settled = settledDrawer.locator('.adagu-detail-history li').first()
    await expect(settled).toContainText('Loan settled')
    await expect(settled).toContainText(inr(50_900))
    await expect(settled).toContainText('Discount')
    await expect(settled).toContainText('UPI')
  })

  test('P2a — a draft loan can be deleted', async ({ window }) => {
    const stamp = Date.now()
    const customerName = `Draft Adagu ${stamp}`

    await openPledge(window, {
      name: customerName,
      phone: `8${String(stamp).slice(-9)}`,
      pledgeDate: localTodayIso(),
      amount: '20000',
      gross: '8',
      stone: '0',
    })

    await window.getByRole('button', { name: 'Save draft' }).click()
    await expect(window.getByText('Draft saved')).toBeVisible()
    await window.getByRole('button', { name: 'Delete' }).click()

    const confirm = window.getByRole('dialog', { name: 'Delete draft' })
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: 'Delete' }).click()
    await expect(window.getByText('Draft deleted')).toBeVisible()
  })

  test('P2b — a sanctioned loan is locked against editing', async ({ window }) => {
    const stamp = Date.now()
    const customerName = `Locked Adagu ${stamp}`

    await openPledge(window, {
      name: customerName,
      phone: `8${String(stamp).slice(-9)}`,
      pledgeDate: localTodayIso(),
      amount: '25000',
      gross: '9',
      stone: '0',
    })
    await sanctionAdaguLoan(window)

    await expect(window.locator('.sale-bill-meta-status')).toHaveText('Active')
    await expect(window.getByRole('button', { name: 'Generate', exact: true })).toHaveCount(0)
    await expect(window.getByRole('button', { name: 'Save draft' })).toHaveCount(0)
    await expect(window.getByRole('button', { name: 'Delete' })).toHaveCount(0)
    await expect(window.getByRole('button', { name: 'Renew', exact: true })).toBeVisible()
    await expect(adaguField(window, 'Loan Amount').locator('input')).toBeDisabled()
    await expect(
      window
        .locator('.adagu-jewellery-table--pledge tbody tr')
        .first()
        .locator('.adagu-col-weight input')
        .nth(0),
    ).toBeDisabled()
  })

  test('P2c — renewal moves the balance to a new ADG ticket', async ({ window }) => {
    const stamp = Date.now()
    const customerName = `Renew Adagu ${stamp}`

    await openPledge(window, {
      name: customerName,
      phone: `8${String(stamp).slice(-9)}`,
      pledgeDate: isoDaysAgo(30),
      amount: '50000',
      gross: '12',
      stone: '0',
      description: 'Gold bangles',
    })
    await sanctionAdaguLoan(window)

    await openDuesTab(window, 'Adagu Dues')
    const row = await adaguDueRow(window, customerName)
    const receiptNo = await receiptNoFromDueRow(row)

    const drawer = await openAdaguDueDrawer(window, receiptNo, customerName)
    await drawer.getByRole('button', { name: 'Renew', exact: true }).click()
    const renew = window.getByRole('dialog', { name: `Renew loan · ${receiptNo}` })
    await expect(renew).toBeVisible()
    await expect(renew.locator('dt', { hasText: 'Interest due' }).locator('..').locator('dd')).toHaveText(
      inr(1_000),
    )
    await expect(
      renew.locator('dt', { hasText: 'Outstanding principal' }).locator('..').locator('dd'),
    ).toHaveText(inr(50_000))
    await expect(renew.locator('dt', { hasText: 'Total payoff' }).locator('..').locator('dd')).toHaveText(
      inr(51_000),
    )
    await renew.getByRole('button', { name: 'Renew loan' }).click()
    await expect(window.getByText(/Loan renewed as ADG\d+/)).toBeVisible()
    await closePrintPreview(window)

    // Both tickets are in the dues list: the old one closed, the new one carrying the principal.
    await window.getByPlaceholder('Search customer or ADG no...').fill(customerName)
    const tickets = window.locator('tr.dues-adagu-row').filter({ hasText: customerName })
    await expect(tickets).toHaveCount(2)
    const oldTicket = tickets.filter({ hasText: receiptNo })
    await expect(oldTicket.locator('td').nth(8)).toHaveText(inr(0))

    const oldDrawer = await openAdaguDueDrawer(window, receiptNo, customerName)
    await oldDrawer.getByRole('link', { name: 'Open Loan' }).click()
    const renewLink = window.getByRole('link', { name: /Renewed to ADG/ })
    await expect(renewLink).toBeVisible()
    const newReceiptNo = (await renewLink.innerText()).replace('Renewed to', '').trim()

    await openDuesTab(window, 'Adagu Dues')
    const newTicket = await adaguDueRow(window, newReceiptNo)
    await expect(newTicket.locator('td').nth(3)).toHaveText(inr(50_000))
    // The fresh ticket charges its own minimum month from the renewal date.
    await expect(newTicket.locator('td').nth(8)).toHaveText(inr(51_000))
  })

  test('P3 — assessed value, LTV max and the above-LTV warning', async ({ window }) => {
    const stamp = Date.now()
    const customerName = `Ltv Adagu ${stamp}`

    await openPledge(window, {
      name: customerName,
      phone: `8${String(stamp).slice(-9)}`,
      pledgeDate: localTodayIso(),
      amount: '10000',
      gross: '10',
      stone: '0',
      description: 'Gold ring',
    })

    // Recording the value by hand keeps the scenario independent of today's rates.
    await adaguField(window, 'Assessed Value').locator('input').fill('100000')
    await adaguField(window, 'Assessed Value').locator('input').blur()
    await expect(window.getByText(/Max loan \(75% LTV\)/)).toBeVisible()
    await expect(window.locator('.adagu-ltv-line strong')).toHaveText(inr(75_000))

    await window.getByRole('button', { name: 'Use max' }).click()
    await expect(adaguField(window, 'Loan Amount').locator('input')).toHaveValue('75000')

    await adaguField(window, 'Loan Amount').locator('input').fill('90000')
    await expect(window.getByText('Loan is above the 75% LTV limit')).toBeVisible()
    await expect(window.getByLabel('Admin override (allow above LTV)')).toBeVisible()

    await adaguField(window, 'Loan Amount').locator('input').fill('75000')
    await expect(window.getByText('Loan is above the 75% LTV limit')).toHaveCount(0)
    await sanctionAdaguLoan(window)
  })

  test('P4a — auction notice, then settlement to an outside buyer', async ({ window }) => {
    const stamp = Date.now()
    const customerName = `Auction Adagu ${stamp}`

    // A loan from over a year ago is already past its (clamped) due date.
    await openPledge(window, {
      name: customerName,
      phone: `8${String(stamp).slice(-9)}`,
      pledgeDate: isoDaysAgo(400),
      amount: '30000',
      gross: '20',
      stone: '0',
      description: 'Gold chain',
    })
    await sanctionAdaguLoan(window)

    await openDuesTab(window, 'Adagu Dues')
    const row = await adaguDueRow(window, customerName)
    const receiptNo = await receiptNoFromDueRow(row)

    const drawer = await openAdaguDueDrawer(window, receiptNo, customerName)
    await sendAuctionNotice(window, drawer, receiptNo)

    await drawer.getByRole('button', { name: 'Print notice' }).click()
    const noticePrint = window.getByRole('dialog', { name: 'Auction notice' })
    await expect(noticePrint).toBeVisible()
    await closePrintPreview(window)

    const auction = await openAuctionModal(window, drawer, receiptNo)
    await auction.getByLabel('Buyer name').fill('Walk-in buyer')
    await expect(auction.getByText(/Write off the /)).toHaveCount(0)
    await auction.getByRole('button', { name: 'Record auction' }).click()
    await expect(window.getByText(`Auction recorded for ${receiptNo}`)).toBeVisible()

    await closeDrawer(window, drawer)
    await window.locator('.filter-bar').getByRole('tab', { name: 'Auctioned' }).click()
    const auctioned = await adaguDueRow(window, customerName)
    await expect(auctioned.locator('td').nth(8)).toHaveText(inr(0))

    const auctionedDrawer = await openAdaguDueDrawer(window, receiptNo, customerName)
    await expect(auctionedDrawer.getByText('Forfeited / Closed')).toBeVisible()
    await expect(auctionedDrawer.locator('.adagu-detail-history li').first()).toContainText(
      'Auction settlement',
    )
  })

  test('P4b — a shop buyback needs a stock category for the item', async ({ window }) => {
    const stamp = Date.now()
    const customerName = `Buyback Adagu ${stamp}`

    await openPledge(window, {
      name: customerName,
      phone: `8${String(stamp).slice(-9)}`,
      pledgeDate: isoDaysAgo(400),
      amount: '30000',
      gross: '20',
      stone: '0',
      description: 'Gold anklet',
    })
    await sanctionAdaguLoan(window)

    await openDuesTab(window, 'Adagu Dues')
    const row = await adaguDueRow(window, customerName)
    const receiptNo = await receiptNoFromDueRow(row)

    const drawer = await openAdaguDueDrawer(window, receiptNo, customerName)
    await sendAuctionNotice(window, drawer, receiptNo)

    const auction = await openAuctionModal(window, drawer, receiptNo)
    await auction.getByLabel('Buyer').selectOption('shop')
    const itemCategories = auction.locator('.adagu-auction-item select')
    await expect(itemCategories.first()).toBeVisible()
    const recordButton = auction.getByRole('button', { name: 'Record auction' })

    const categoryOptions = await itemCategories.first().locator('option').count()
    if (categoryOptions > 1) {
      for (let index = 0; index < (await itemCategories.count()); index += 1) {
        await itemCategories.nth(index).selectOption({ index: 1 })
      }
      await expect(recordButton).toBeEnabled()
      await recordButton.click()
      await expect(window.getByText(`Auction recorded for ${receiptNo}`)).toBeVisible()
      await closeDrawer(window, drawer)
    } else {
      // No stock categories in this shop yet, and the metal cannot be bought in without one.
      await expect(recordButton).toBeDisabled()
      await auction.getByRole('button', { name: 'Cancel' }).click()
      await closeDrawer(window, drawer)
    }
  })

  test('P5a — KYC is required, photos upload, then sanction', async ({ window }) => {
    await setAdaguSettings(window, { requireKyc: true })

    const stamp = Date.now()
    const customerName = `Kyc Adagu ${stamp}`

    await openPledge(window, {
      name: customerName,
      phone: `8${String(stamp).slice(-9)}`,
      pledgeDate: localTodayIso(),
      amount: '20000',
      gross: '8',
      stone: '0',
      description: 'Gold ring',
    })
    await expect(window.getByText('KYC is required by settings')).toBeVisible()

    await window.getByRole('button', { name: 'Generate', exact: true }).click()
    const sanction = window.getByRole('dialog', { name: 'Sanction loan' })
    await sanction.getByRole('button', { name: 'Sanction loan' }).click()
    await expect(window.locator('.error-banner')).toContainText('KYC is required')

    // Filling an ID unblocks sanctioning; picking a photo auto-saves the draft first.
    await window.getByPlaceholder('12 digits').fill('123456789012')

    const itemPhoto = window.locator('.pledge-photos').filter({ hasText: 'Item photos' })
    await itemPhoto.locator('input[type="file"]').setInputFiles({
      name: 'item.png',
      mimeType: 'image/png',
      buffer: PNG_1PX,
    })
    await expect(itemPhoto.locator('.pledge-photo-thumb img')).toHaveCount(1)

    await window.getByRole('button', { name: 'Save draft' }).click()
    await expect(window.getByText('Draft saved')).toBeVisible()

    await sanctionAdaguLoan(window)

    await openDuesTab(window, 'Adagu Dues')
    const row = await adaguDueRow(window, customerName)
    const receiptNo = await receiptNoFromDueRow(row)
    const drawer = await openAdaguDueDrawer(window, receiptNo, customerName)
    await expect(drawer.locator('.adagu-detail-photos .pledge-photo-thumb')).toHaveCount(1)
  })

  test('P5b — the Reminders tab opens WhatsApp and records the reminder', async ({ window }) => {
    const stamp = Date.now()
    const customerName = `Remind Adagu ${stamp}`

    // A month old, so the interest period is already overdue.
    await openPledge(window, {
      name: customerName,
      phone: `8${String(stamp).slice(-9)}`,
      pledgeDate: isoDaysAgo(30),
      amount: '12000',
      gross: '6',
      stone: '0',
      description: 'Gold studs',
      aadhaar: '987654321098',
    })
    await sanctionAdaguLoan(window)

    await openDuesTab(window, 'Adagu Dues')
    await window.locator('.filter-bar').getByRole('tab', { name: 'Reminders' }).click()

    const reminderRow = window.locator('tbody tr').filter({ hasText: customerName })
    await expect(reminderRow).toBeVisible()
    await expect(reminderRow.getByText('Interest overdue')).toBeVisible()
    await expect(reminderRow.locator('td').nth(6)).toHaveText('—')

    // The server validates the wa.me link and hands it to the default browser.
    await reminderRow.getByRole('button', { name: 'WhatsApp' }).click()
    await expect(window.getByText('WhatsApp reminder opened')).toBeVisible()
    await expect(reminderRow.locator('td').nth(6)).not.toHaveText('—')
  })

  test('teardown — turn the KYC requirement back off', async ({ window }) => {
    await setAdaguSettings(window, { requireKyc: false })
  })
})
