import type Database from 'better-sqlite3'

type ProductSeed = {
  name: string
  category: string
  metal: string
  purity: string
  grossWeight: number
  netWeight: number
  makingCharges: number
  stockQty: number
}

type CustomerSeed = {
  name: string
  phone: string
  address: string
  notes: string
}

export const SAMPLE_PRODUCTS: ProductSeed[] = [
  {
    name: 'Gold chain 22K',
    category: 'Chain',
    metal: 'Gold',
    purity: '22K',
    grossWeight: 12.5,
    netWeight: 11.8,
    makingCharges: 850,
    stockQty: 4,
  },
  {
    name: 'Traditional necklace',
    category: 'Necklace',
    metal: 'Gold',
    purity: '22K',
    grossWeight: 28,
    netWeight: 26.5,
    makingCharges: 2200,
    stockQty: 2,
  },
  {
    name: 'Long haram',
    category: 'Haram',
    metal: 'Gold',
    purity: '22K',
    grossWeight: 45,
    netWeight: 42,
    makingCharges: 3500,
    stockQty: 1,
  },
  {
    name: 'Plain gold bangle',
    category: 'Bangle',
    metal: 'Gold',
    purity: '22K',
    grossWeight: 16,
    netWeight: 15.2,
    makingCharges: 1200,
    stockQty: 6,
  },
  {
    name: 'Ladies ring 18K',
    category: 'Ring',
    metal: 'Gold',
    purity: '18K',
    grossWeight: 4.2,
    netWeight: 3.8,
    makingCharges: 650,
    stockQty: 8,
  },
  {
    name: 'Gold stud pair',
    category: 'Stud',
    metal: 'Gold',
    purity: '22K',
    grossWeight: 3.5,
    netWeight: 3.1,
    makingCharges: 500,
    stockQty: 5,
  },
  {
    name: 'Thali kodi',
    category: 'Thali',
    metal: 'Gold',
    purity: '22K',
    grossWeight: 8,
    netWeight: 7.4,
    makingCharges: 900,
    stockQty: 3,
  },
  {
    name: 'Silver chain',
    category: 'Chain',
    metal: 'Silver',
    purity: '925',
    grossWeight: 35,
    netWeight: 34,
    makingCharges: 400,
    stockQty: 10,
  },
  {
    name: 'Silver bangle set',
    category: 'Bangle',
    metal: 'Silver',
    purity: '925',
    grossWeight: 120,
    netWeight: 118,
    makingCharges: 1500,
    stockQty: 4,
  },
  {
    name: 'Lakshmi coin 4g',
    category: 'L. Coin',
    metal: 'Gold',
    purity: '24K',
    grossWeight: 4,
    netWeight: 4,
    makingCharges: 200,
    stockQty: 12,
  },
]

export const SAMPLE_CUSTOMERS: CustomerSeed[] = [
  {
    name: 'Ravi Kumar',
    phone: '9876500001',
    address: 'Salem Main Road',
    notes: 'Regular customer',
  },
  {
    name: 'Priya',
    phone: '9876500002',
    address: 'Attur',
    notes: '',
  },
  {
    name: 'Suresh',
    phone: '9876500003',
    address: 'Salem',
    notes: '',
  },
  {
    name: 'Meena',
    phone: '9876500004',
    address: 'Mettur',
    notes: 'Festival season',
  },
  {
    name: 'Kumar',
    phone: '9876500005',
    address: 'Namakkal',
    notes: '',
  },
  {
    name: 'Anitha',
    phone: '9876500006',
    address: 'Salem',
    notes: '',
  },
  {
    name: 'Murugesan',
    phone: '9876543210',
    address: 'Salem Main Road, Karumendurai',
    notes: 'Regular customer',
  },
  {
    name: 'Lakshmi Devi',
    phone: '9789012345',
    address: 'Attur, Salem district',
    notes: '',
  },
  {
    name: 'Ramesh Kumar',
    phone: '9443322110',
    address: 'Periya Kalrayan Hills',
    notes: 'Wholesale enquiries',
  },
  {
    name: 'Selvam Jewellers',
    phone: '8903457570',
    address: 'Namakkal',
    notes: 'Trade account',
  },
  {
    name: 'Karthik',
    phone: '9123456780',
    address: 'Yercaud road',
    notes: '',
  },
  {
    name: 'Deepa',
    phone: '9345678901',
    address: 'Mettur',
    notes: '',
  },
  {
    name: 'Senthil',
    phone: '9585351268',
    address: 'Salem',
    notes: '',
  },
  {
    name: 'Kavitha',
    phone: '9003011223',
    address: 'Vadakku Nadu',
    notes: '',
  },
  {
    name: 'Govind',
    phone: '9098765432',
    address: 'Rasipuram',
    notes: '',
  },
  {
    name: 'Vijay',
    phone: '8012345678',
    address: 'Sankagiri',
    notes: 'Cash preferred',
  },
]

export function isDatabaseEmpty(database: Database.Database): boolean {
  const products = database.prepare('SELECT COUNT(*) AS count FROM products').get() as {
    count: number
  }
  const customers = database
    .prepare('SELECT COUNT(*) AS count FROM customers')
    .get() as { count: number }
  return products.count === 0 && customers.count === 0
}

/** Inserts sample products and customers. Skips if any products or customers already exist. */
export function seedSampleDataIfEmpty(database: Database.Database): boolean {
  if (!isDatabaseEmpty(database)) {
    return false
  }

  const insertProduct = database.prepare(
    `INSERT INTO products (
      name, category, metal, purity, gross_weight, net_weight, making_charges, stock_qty, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  )

  const insertCustomer = database.prepare(
    `INSERT INTO customers (name, phone, address, notes, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
  )

  const tx = database.transaction(() => {
    for (const product of SAMPLE_PRODUCTS) {
      insertProduct.run(
        product.name,
        product.category,
        product.metal,
        product.purity,
        product.grossWeight,
        product.netWeight,
        product.makingCharges,
        product.stockQty,
      )
    }
    for (const customer of SAMPLE_CUSTOMERS) {
      insertCustomer.run(customer.name, customer.phone, customer.address, customer.notes)
    }
  })

  tx()
  return true
}

export { seedSampleDashboardIfEmpty, countSeededInvoices } from './sampleDashboard'
export {
  seedSampleGoldSavingsIfEmpty,
  countSeededGoldSavingAccounts,
  countSeededGoldSavingSchemes,
} from './sampleGoldSavings'
