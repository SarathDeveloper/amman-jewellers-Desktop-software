/**
 * Manual QA harness — exercises CRUD + validation paths from test-cases.md
 * with realistic jewellery-shop sample data. Run via: npx vitest run tests/integration/manualQaCrud.test.ts
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_BILL_TEMPLATE } from '@shared/billTemplate'
import { localTodayIso } from '@shared/localDate'
import { deriveGoldRates, deriveSilverRates } from '@shared/billing/metalRateDerivation'
import type { Customer, Invoice, Product, ShopSettings } from '@shared/types'
import { invokeIpcForTests, withHuids } from './helpers/testEnv'
import { IPC_CHANNELS, ipc, useIntegrationEnv } from './helpers/testEnv'

const TODAY = localTodayIso()

describe('manual QA CRUD catalogue', () => {
  useIntegrationEnv()

  it('SETTINGS + RATES: shop branding, GST labels, metal rates (SET-SHOP, SET-INV, RATE)', async () => {
    const current = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_GET)
    const updated = await ipc<ShopSettings>(IPC_CHANNELS.SETTINGS_UPDATE, {
      ...current,
      shopName: 'JewelTrackerPro',
      tagline: 'Pure gold · Trusted since 1998',
      appSubtitle: 'Billing & stock',
      gstin: '33AAAAA0000A1Z5',
      phone1: '0427-2441000',
      phone2: '98765 43210',
      addressLine1: '12 Bazaar Street',
      addressLine2: 'Near Bus Stand',
      city: 'Salem',
      state: 'Tamil Nadu',
      pincode: '636001',
      billTemplate: {
        ...DEFAULT_BILL_TEMPLATE,
        cashTitle: 'CASH BILL',
        taxThanks: 'Thank you — visit again',
      },
    })
    expect(updated.shopName).toBe('JewelTrackerPro')
    expect(updated.gstin).toBe('33AAAAA0000A1Z5')
    expect(updated.billTemplate.taxThanks).toBe('Thank you — visit again')

    const emptyName = await invokeIpcForTests(IPC_CHANNELS.SETTINGS_UPDATE, {
      ...updated,
      shopName: '',
    })
    expect(emptyName.ok).toBe(false)

    const rates = await ipc(IPC_CHANNELS.METAL_RATES_UPSERT, {
      effectiveDate: TODAY,
      gold22k: 6850,
      gold24k: 7450,
      silverFine: 98,
    })
    expect(rates.gold22k).toBe(6850)
    const derivedGold = deriveGoldRates(24, 7450)
    const derivedSilver = deriveSilverRates(999, 98)
    expect(rates.gold20k).toBe(derivedGold.gold20k)
    expect(rates.gold18k).toBe(derivedGold.gold18k)
    expect(rates.silver925).toBe(derivedSilver.silver925)
    const latest = await ipc(IPC_CHANNELS.METAL_RATES_LATEST)
    expect(latest?.gold22k).toBe(6850)
    expect(latest?.gold18k).toBe(derivedGold.gold18k)
    const history = await ipc(IPC_CHANNELS.METAL_RATES_LIST)
    expect(history.some((r: { effectiveDate: string }) => r.effectiveDate === TODAY)).toBe(true)
  })

  it('PROD + CUST + STK + BILL + DUE + OLD + GS full CRUD loop', async () => {
    // --- Customers (CUST-01..05) ---
    const lakshmi = await ipc<Customer>(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Lakshmi Devi',
      phone: '9843011122',
      address: 'Fairlands, Salem',
      notes: 'Wedding jewellery customer',
    })
    const murugan = await ipc<Customer>(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Murugan Traders',
      phone: '9443312345',
      address: 'Shevapet',
      notes: 'Wholesale silver',
    })
    const disposable = await ipc<Customer>(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Temp Counter',
      phone: '9000011111',
      address: 'Salem',
      notes: '',
    })

    const noName = await invokeIpcForTests(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: '',
      phone: '',
      address: '',
      notes: '',
    })
    expect(noName.ok).toBe(false)

    const lakshmiUpdated = await ipc<Customer>(IPC_CHANNELS.CUSTOMERS_UPDATE, {
      id: lakshmi.id,
      input: {
        name: 'Lakshmi Devi',
        phone: '9843011122',
        address: 'Fairlands Extn, Salem',
        notes: 'Prefers 22K bridal set',
      },
    })
    expect(lakshmiUpdated.address).toContain('Extn')

    await ipc(IPC_CHANNELS.CUSTOMERS_DELETE, disposable.id)

    // --- Products (PROD-01..06, validation) ---
    const ring = await ipc<Product>(IPC_CHANNELS.PRODUCTS_CREATE, withHuids({
      name: '22K Plain Ring',
      category: 'Ring',
      metal: 'Gold',
      purity: '22K',
      grossWeight: 4.2,
      netWeight: 3.85,
      makingCharges: 650,
      stockQty: 12,
      imagePath: '',
    }))
    const chain = await ipc<Product>(IPC_CHANNELS.PRODUCTS_CREATE, withHuids({
      name: '22K Rope Chain',
      category: 'Chain',
      metal: 'Gold',
      purity: '22K',
      grossWeight: 18.5,
      netWeight: 17.2,
      makingCharges: 1800,
      stockQty: 6,
      imagePath: '',
    }))
    const bangle = await ipc<Product>(IPC_CHANNELS.PRODUCTS_CREATE, withHuids({
      name: '22K Screw Bangle Pair',
      category: 'Bangle',
      metal: 'Gold',
      purity: '22K',
      grossWeight: 32.0,
      netWeight: 30.5,
      makingCharges: 4200,
      stockQty: 4,
      imagePath: '',
    }))
    const silverAnklet = await ipc<Product>(IPC_CHANNELS.PRODUCTS_CREATE, withHuids({
      name: '925 Silver Anklet',
      category: 'Stud',
      metal: 'Silver',
      purity: '925',
      grossWeight: 45,
      netWeight: 42,
      makingCharges: 350,
      stockQty: 20,
      imagePath: '',
    }))


    const badWeights = await invokeIpcForTests(IPC_CHANNELS.PRODUCTS_CREATE, withHuids({
      name: 'Bad weights',
      category: 'Ring',
      metal: 'Gold',
      purity: '22K',
      grossWeight: 5,
      netWeight: 6,
      makingCharges: 0,
      stockQty: 1,
      imagePath: '',
    }))
    expect(badWeights.ok).toBe(false)


    const ringEdited = await ipc<Product>(IPC_CHANNELS.PRODUCTS_UPDATE, {
      id: ring.id,
      input: {
        name: '22K Plain Ring (polished)',
        category: 'Ring',
        metal: 'Gold',
        purity: '22K',
        grossWeight: 4.25,
        netWeight: 3.9,
        makingCharges: 700,
        stockQty: 12,
        imagePath: '',
        huids: ring.huids,
      },
    })
    expect(ringEdited.name).toContain('polished')
    expect(ringEdited.stockQty).toBe(12)

    const disposableProduct = await ipc<Product>(IPC_CHANNELS.PRODUCTS_CREATE, withHuids({
      name: 'Disposable sample',
      category: 'Ring',
      metal: 'Gold',
      purity: '22K',
      grossWeight: 2,
      netWeight: 1.8,
      makingCharges: 100,
      stockQty: 1,
      imagePath: '',
    }))
    await ipc(IPC_CHANNELS.PRODUCTS_DELETE, disposableProduct.id)

    // --- Gold & Silver categories (GS-02, GS-07..09) ---
    await ipc(IPC_CHANNELS.STOCK_UPSERT, {
      stockDate: TODAY,
      metal: 'Gold',
      itemName: 'Chain',
      openingWeight: 250,
    })
    await ipc(IPC_CHANNELS.STOCK_UPSERT, {
      stockDate: TODAY,
      metal: 'Gold',
      itemName: 'Ring',
      openingWeight: 80,
    })
    const customCat = await ipc(IPC_CHANNELS.STOCK_CREATE_CATEGORY, {
      name: 'Bracelet Set',
      stockDate: TODAY,
      metal: 'Gold',
      openingWeight: 15,
    })
    expect(customCat.name).toBe('Bracelet Set')
    await ipc(IPC_CHANNELS.STOCK_UPDATE_CATEGORY, {
      currentName: 'Bracelet Set',
      newName: 'Kada Set',
    })
    await ipc(IPC_CHANNELS.STOCK_DELETE_CATEGORY, { name: 'Kada Set' })

    // --- Billing (BILL-01, 09..16, 19) + dues ---
    await ipc(IPC_CHANNELS.METAL_RATES_UPSERT, {
      effectiveDate: TODAY,
      gold22k: 6850,
      gold24k: 7450,
      silverFine: 98,
    })

    const cashDraft = await ipc<Invoice>(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: lakshmi.id,
      invoiceDate: TODAY,
      billFormat: 'cash_bill',
      paymentMode: 'cash',
      tax: 0,
      autoTax: false,
      discount: 500,
      amountPaid: 20000,
      items: [
        {
          productId: ring.id,
          qty: 1,
          rate: 6850,
          metalRate: 6850,
          netWeight: 3.9,
          makingCharges: 700,
          huid: ring.huids[0],
        },
        {
          productId: chain.id,
          qty: 1,
          rate: 6850,
          metalRate: 6850,
          netWeight: 17.2,
          makingCharges: 1800,
          huid: chain.huids[0],
        },
      ],
    })
    expect(cashDraft.status).toBe('draft')
    expect(cashDraft.invoiceNo).toBe(`DRAFT-${cashDraft.id}`)

    const cashFinal = await ipc<Invoice>(IPC_CHANNELS.INVOICES_FINALIZE, cashDraft.id)
    expect(cashFinal.status).toBe('final')
    expect(cashFinal.invoiceNo).toMatch(/^CB-/)
    expect(cashFinal.balanceDue).toBeGreaterThan(0)
    expect((await ipc<Product>(IPC_CHANNELS.PRODUCTS_GET, ring.id)).stockQty).toBe(11)
    expect((await ipc<Product>(IPC_CHANNELS.PRODUCTS_GET, chain.id)).stockQty).toBe(5)

    const taxDraft = await ipc<Invoice>(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: murugan.id,
      invoiceDate: TODAY,
      billFormat: 'tax_invoice',
      paymentMode: 'upi',
      tax: 0,
      autoTax: true,
      useIgst: false,
      discount: 0,
      amountPaid: 0,
      items: [
        {
          productId: silverAnklet.id,
          qty: 2,
          rate: 98,
          metalRate: 98,
          netWeight: 42,
          makingCharges: 350,
        },
      ],
    })
    expect(taxDraft.tax).toBeGreaterThan(0)
    const taxFinal = await ipc<Invoice>(IPC_CHANNELS.INVOICES_FINALIZE, taxDraft.id)
    expect(taxFinal.status).toBe('final')
    expect(taxFinal.cgst).toBeCloseTo(taxFinal.tax / 2, 1)
    expect(taxFinal.sgst).toBeCloseTo(taxFinal.tax / 2, 1)

    const estimate = await ipc<Invoice>(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: lakshmi.id,
      invoiceDate: TODAY,
      isEstimate: true,
      tax: 0,
      autoTax: false,
      items: [
        {
          productId: bangle.id,
          qty: 1,
          rate: 6850,
          metalRate: 6850,
          netWeight: 30.5,
          makingCharges: 4200,
        },
      ],
    })
    const estFinalize = await invokeIpcForTests(IPC_CHANNELS.INVOICES_FINALIZE, estimate.id)
    expect(estFinalize.ok).toBe(false)
    expect((await ipc<Product>(IPC_CHANNELS.PRODUCTS_GET, bangle.id)).stockQty).toBe(4)

    const noCustomer = await invokeIpcForTests(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: null,
      invoiceDate: TODAY,
      tax: 0,
      autoTax: false,
      items: [{ productId: ring.id, qty: 1, rate: 100, metalRate: 100, netWeight: 1 }],
    })
    // May create draft without customer depending on schema — finalize must block
    if (noCustomer.ok && noCustomer.data) {
      const fin = await invokeIpcForTests(IPC_CHANNELS.INVOICES_FINALIZE, (noCustomer.data as Invoice).id)
      expect(fin.ok).toBe(false)
    }

    const lowStock = await ipc<Invoice>(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: lakshmi.id,
      invoiceDate: TODAY,
      tax: 0,
      autoTax: false,
      items: [{ productId: bangle.id, qty: 99, rate: 100, metalRate: 100, netWeight: 1 }],
    })
    const lowFin = await invokeIpcForTests(IPC_CHANNELS.INVOICES_FINALIZE, lowStock.id)
    expect(lowFin.ok).toBe(false)
    expect(lowFin.error).toMatch(/Insufficient stock/i)

    // Final is read-only (BILL-14)
    const editFinal = await invokeIpcForTests(IPC_CHANNELS.INVOICES_UPDATE, {
      id: cashFinal.id,
      customerId: lakshmi.id,
      invoiceDate: TODAY,
      tax: 0,
      autoTax: false,
      items: [{ productId: ring.id, qty: 1, rate: 1, metalRate: 1, netWeight: 1 }],
    })
    expect(editFinal.ok).toBe(false)

    const deleteFinal = await invokeIpcForTests(IPC_CHANNELS.INVOICES_DELETE, cashFinal.id)
    expect(deleteFinal.ok).toBe(false)

    // Delete draft estimate ok
    await ipc(IPC_CHANNELS.INVOICES_DELETE, estimate.id)

    // --- Dues (DUE-01..05, DUE-10) ---
    const ledger = await ipc(IPC_CHANNELS.DUES_LIST)
    expect(ledger.totalOutstanding).toBeGreaterThan(0)
    const lakshmiCol = ledger.columns.find((c: { customerId: number }) => c.customerId === lakshmi.id)
    expect(lakshmiCol).toBeDefined()
    const dueEntry = lakshmiCol!.entries.find(
      (e: { invoiceId: number | null; kind: string }) =>
        e.invoiceId === cashFinal.id && e.kind === 'due',
    )
    expect(dueEntry).toBeDefined()

    const partial = await ipc(IPC_CHANNELS.DUES_RECORD_PAYMENT, {
      dueEntryId: dueEntry!.id,
      amount: 5000,
      entryDate: TODAY,
      note: 'Part payment — cash',
    })
    expect(partial.amount).toBe(5000)

    await ipc(IPC_CHANNELS.DUES_CREATE, {
      customerId: lakshmi.id,
      entryDate: TODAY,
      kind: 'due',
      amount: 2500,
      note: 'Old gold exchange balance',
    })
    await ipc(IPC_CHANNELS.DUES_CREATE, {
      customerId: murugan.id,
      entryDate: TODAY,
      kind: 'payment',
      amount: 1000,
      note: 'Advance against silver order',
    })

    // --- Old / historical bills (OLD-01..05) ---
    const oldCash = await ipc<Invoice>(IPC_CHANNELS.INVOICES_RECORD_HISTORICAL, {
      invoiceNo: 'CB-2024-8841',
      customerId: lakshmi.id,
      invoiceDate: '2024-11-15',
      billFormat: 'cash_bill',
      paymentMode: 'cash',
      subtotal: 45000,
      amountPaid: 30000,
      goldWeight: 12.5,
      makingCharges: 2500,
    })
    expect(oldCash.isHistorical).toBe(true)
    expect(oldCash.balanceDue).toBe(15000)
    // No stock change from historical
    expect((await ipc<Product>(IPC_CHANNELS.PRODUCTS_GET, ring.id)).stockQty).toBe(11)

    const oldTax = await ipc<Invoice>(IPC_CHANNELS.INVOICES_RECORD_HISTORICAL, {
      invoiceNo: 'TI-2024-331',
      customerId: murugan.id,
      invoiceDate: '2024-11-18',
      billFormat: 'tax_invoice',
      paymentMode: 'upi',
      subtotal: 12000,
      autoTax: true,
      amountPaid: 12000,
      silverWeight: 120,
    })
    expect(oldTax.billFormat).toBe('tax_invoice')

    const taxReport = await ipc(IPC_CHANNELS.INVOICES_TAX_REPORT)
    const nov = taxReport.find((r: { month: string }) => r.month === '2024-11')
    expect(nov?.invoiceCount).toBe(1)

    const badOld = await invokeIpcForTests(IPC_CHANNELS.INVOICES_RECORD_HISTORICAL, {
      invoiceNo: '',
      customerId: lakshmi.id,
      invoiceDate: '2024-01-01',
      billFormat: 'cash_bill',
      paymentMode: 'cash',
      subtotal: 100,
      amountPaid: 100,
    })
    expect(badOld.ok).toBe(false)

    // --- Customer delete guards (CUST-06) ---
    const delWithInv = await invokeIpcForTests(IPC_CHANNELS.CUSTOMERS_DELETE, lakshmi.id)
    expect(delWithInv.ok).toBe(false)

    // --- GS auto sales from finalize ---
    const goldRows = await ipc(IPC_CHANNELS.STOCK_LIST, { stockDate: TODAY, metal: 'Gold' })
    const chainRow = goldRows.find((r: { itemName: string }) => r.itemName === 'Chain')
    expect(chainRow?.autoSales).toBeGreaterThan(0)

    // Sanity list counts
    const products = await ipc(IPC_CHANNELS.PRODUCTS_LIST)
    const customers = await ipc(IPC_CHANNELS.CUSTOMERS_LIST)
    const invoices = await ipc(IPC_CHANNELS.INVOICES_LIST)
    expect(products.length).toBeGreaterThanOrEqual(4)
    expect(customers.length).toBeGreaterThanOrEqual(2)
    expect(invoices.length).toBeGreaterThanOrEqual(3)
  })
})
