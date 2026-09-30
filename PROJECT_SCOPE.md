# JewelTrackerPro — Project Scope

Fullstack web software for jewellery shop inventory, billing, gold/silver weight tracking, pledges, inwards, and customer dues. Runs on localhost now and is ready for later cloud deployment.

---

## 1. Product overview

| Aspect | Detail |
|--------|--------|
| **Product name** | JewelTrackerPro |
| **Type** | Fullstack web application (Express + React) |
| **Platforms** | Modern browsers; localhost now, cloud later |
| **Data** | SQLite database on the server (`data/jeweltrackerpro.db`) |
| **Primary users** | Shop counter staff and owners (admin and staff roles) |
| **Core purpose** | Manage products, customers, daily billing (cash bill / tax invoice / pledge), inwards, piece stock, gold & silver weight stock with unified ledger, pledges, and outstanding dues |
| **Version** | 1.0.0 |

### Main modules (sidebar)

1. Dashboard
2. Billing (Cash / Tax / Pledge)
3. Inventory (top tabs: Products, Gold & Silver, Inwards, Suppliers)
4. Customers
5. Dues
6. Settings
7. Users (admin only)

---

## 2. Authentication & users

Role-based access for shop staff and owners.

### Capabilities

- **Login** with username + password (session cookie)
- **Change password** flow
- **Roles**: **admin** (full access) and **staff** (feature-scoped)
- **Feature permissions** per staff user: dashboard, billing, products, stock, inward, customers, dues, settings
- **Users page** (admin only): add, edit, activate/deactivate, set role and feature access
- **Walk-in** customer is a system-protected record used for anonymous counter sales

---

## 3. Dashboard

Today's counter summary with sales overview, metal closing, dues snapshot, and shortcuts.

### KPIs

| Metric | Description |
|--------|-------------|
| **Today's sales** | Sum of finalized, non-estimate bill totals dated today |
| **Today's collections** | Amount paid on today's finalized bills, plus today-dated due payments (including collections against older bills) |
| **Outstanding** | Total customer balance from the dues ledger (links to Dues) |
| **Draft bills** | Count of draft invoices (links to Billing) |
| **Gold closing** | Sum of today's gold closing weights (links to Stock) |
| **Silver closing** | Sum of today's silver closing weights (links to Stock) |

### Sales overview

- Hourly sales chart for business hours (with KPI sparklines)
- Bills generated, average bill, customers billed, items sold

### Other

- **Metal stock cards**: opening / inward / sold / closing for Gold and Silver
- **Due collections** list and outstanding customer count
- **Recent bills** table (up to 8): bill number, customer, date, total, status, estimate badge
- Quick actions: new bill, Billing, Customers, Products, Dues
- Refresh control

---

## 4. Products

Catalogue and piece-quantity inventory for saleable items.

### Capabilities

- List, search (name / category), add, edit, delete
- Filters: metal, category, purity, stock status
- Grid and table views; detail drawer
- Stock badges: **In** / **Low** (≤ 5) / **Out**
- Category options seeded from stock categories plus existing product categories
- Product create writes an **opening** movement to the unified stock ledger

### Fields

| Field | Notes |
|-------|--------|
| Name | Required |
| Category | Used for Gold & Silver stock matching when it matches a stock category name |
| Metal | e.g. Gold, Silver |
| Purity | Gold: 24K / 22K / 18K; Silver: 925 |
| Gross weight | Grams |
| Net weight | Grams |
| Making charges | Per piece |
| Stock qty | Piece count (separate from weight stock) |

---

## 5. Gold & Silver stock

Daily weight ledger for gold and silver by stock category, backed by a single `stock_movements` ledger.

### Capabilities

- Filter by **date** and **metal** (Gold / Silver)
- Search within categories
- Per-item **opening weight** (editable; carries forward from prior day's closing when unset; product-create opening stock appears here on day 1)
- **Inward** weight auto-calculated from finalized inwards for that date (finished pieces + raw metal)
- **Sales** weight auto-calculated from finalized, non-estimate, **non-historical** invoices that day (by metal + category)
- Optional **sales override** when auto sales need correction
- **Clear sales overrides** for the selected date + metal
- **Closing weight** = Opening + Inward − Sales (read-only)
- **History** tab: daily opening / inward / sales / closing aggregates per metal

### Tabs

- **Stock by Category** — per-category opening/inward/sales/closing with edit panel and drill-down
- **Inward Stock** — finalized inwards for the date/metal
- **Pieces Today** — piece in/out/net by product
- **Stock History** — daily aggregates
- **Reconciliation** — ledger vs piece-implied weight, flags unexplained variance

### Stock categories

- Default categories: Chain, Necklace, Haram, Bangle, Ring, Stud, Mattal, Nosepin, Thali, Gundu, L. Coin, P. Coin, Nanal, Backchain, D Stud
- **Add / rename / delete** categories (`stock_categories` table)

### Day close / reopen

- **Close day** per metal writes a snapshot (`metal_day_closings` / `metal_day_closing_lines`)
- Precheck blocks close when open drafts/inwards exist for that metal/date
- Finalizing bills or inwards for a closed metal/day is blocked until an admin **reopens** it
- Reopen requires a reason

### Note on exchange

- **Old-gold exchange is no longer tracked in weight stock.** Exchange lines on a bill still affect the bill amount (₹ credit) but do **not** add to gold/silver weight stock.

---

## 6. Inward & suppliers

Purchase inward of finished pieces and raw metal, feeding the unified stock ledger.

### Inward

Primary screen is **Inventory → Inwards**. Products still has an **Add inward stock** shortcut that creates and finalizes a purchase for selected products.

- List drafts and finalized purchases; search by inward number or supplier
- Create or edit a draft against a supplier; add finished-piece lines (product-linked) and raw-metal lines (no product, by metal/category/purity)
- **Save draft** or **Save & finalize**. Finalize writes `purchase` movements to the ledger (pieces + raw weight) and updates product piece stock
- Draft inward can be edited/deleted; finalized inward is read-only
- Inward number: `IN-{YYYY}-{####}`
- Blocked if the metal day is closed

### Supplier

- List, add, edit, delete suppliers
- Fields: name, phone, address, notes

---

## 7. Customers

Customer master for billing and dues.

### Capabilities

- List, search (name / phone), add, edit, delete
- Delete blocked if the customer has invoices or dues entries
- **Purchase history** and **due history** in the detail drawer

### Fields

| Field | Notes |
|-------|--------|
| Name | Required |
| Phone | Optional, 10 digits |
| Address | Optional |
| Guardian name | Optional |
| GSTIN | Optional, for tax invoices |
| Aadhaar | Optional, 12 digits |
| PAN | Optional, format `AAAAA9999A` |
| Notes | Optional |

---

## 8. Billing (invoices & pledges)

Create, edit, finalize, print, and export bills. Legacy `/invoices` routes redirect here.

### Bill modes

| Mode | Use |
|------|-----|
| **Cash bill** | Everyday counter bill (A5), prefix `CB-{YYYY}-{####}` |
| **Tax invoice** | GST tax invoice (A5), prefix `TI-{YYYY}-{####}` |
| **Pledge (Adagu)** | Pledge loan against gold, prefix `PG-{YYYY}-{####}` |

### Bill lifecycle (invoices)

| Status | Behavior |
|--------|----------|
| **Draft** | Fully editable; can be deleted |
| **Estimate** | Can be saved and printed; cannot be finalized; excluded from sales and auto stock sales |
| **Final** | Read-only; piece stock deducted (regular bills); dues synced when balance remains; cannot update or delete |

Historical bills use a **user-entered** bill number and are saved as `final` + `is_historical`.

### Payment

- Modes: **Cash**, **UPI**, **Card**, **Mixed**
- **Amount paid** and computed **balance due**
- Shortcut **F2**: set amount paid to bill total
- Shortcut **F4**: print

### Line items

- Add products by dropdown or **SKU scan** (Enter on exact SKU)
- Fields in editor: quantity, net weight, metal rate, making charges
- Metal rate auto-filled from latest daily rates using product metal/purity
- Line total from metal value + making (+ stone/wastage when stored on the line)
- **Old-gold exchange lines** still supported for ₹ credit on the bill (no weight-stock effect)
- Backend also stores (defaults; limited editor UI): gross weight, stone weight/rate, wastage %, HSN `7113`, metal/category snapshot

**Pricing formula (backend):**

`(netWeight × qty × (1 + wastage%/100) × metalRate) + (makingCharges × qty) + (stoneWeight × qty × stoneRate)`

### Tax & discounts

- Invoice-level **discount**
- Tax invoices: optional **auto GST 3%** on (subtotal − discount)
- Split as **CGST + SGST** (1.5% + 1.5%) or full **IGST**
- Manual tax when auto GST is off
- Default HSN `7113` for jewellery lines

### Finalize

- Requires customer and at least one line
- Deducts product **piece stock**; fails if stock is insufficient
- Writes `sale` movements to the unified ledger (weight)
- Creates dues ledger entries when balance due > 0

### Record old / historical bills

- Route: `/billing/old`
- Enter summary totals (optional gold / silver / making weight summaries) without line items
- Saved as `final` + `is_historical`
- Syncs dues when unpaid balance remains
- **Does not** deduct piece stock
- **Excluded** from auto gold/silver weight sales
- Printable as an "Old bill" summary

### List & actions

- Day KPIs on the billing list
- Filters: format (All / Cash / Tax), status (draft / estimate / final), period (today / month / all), payment mode, due/paid
- Search, date picker, sort, pagination
- Open, Preview, Print, Export PDF
- Delete drafts only
- Link to **Record old bill**

### Print & PDF

- Preview and print via the browser print dialog
- A5/A4 layout with print background
- Save as PDF from the browser print dialog
- Dedicated print routes: `/print/cash-bill/:id`, `/print/tax-invoice/:id`, `/print/pledge/:id`, `/print/metal-day/:date/:metal`
- Label text on prints is driven by **bill template** settings (customizable in Settings)

### Cash bill print contents

- Shop branding (name, phones, address; optional logo)
- Bill no., date, customer
- Particulars, weight, amount
- Payment mode, balance due if any, signature lines

### Tax invoice print contents

- Shop name, tagline, address, GSTIN, phones; optional logo / signature image
- Bill no., date/time, bill-to customer
- Line details (weights, making, rates, amount)
- Subtotal, CGST/SGST (or IGST), discount, grand total
- Amount in words, payment/balance

---

## 9. Pledges (Adagu)

Loan against gold, with interest and repayment tracking.

### Capabilities

- Create pledge for a customer with one or more pledged items (description, metal, purity, gross/net weight, stones, pieces)
- Loan amount, assessed value, interest %, repayment due date, charges, notes
- **Collect** partial payments; auto-redeems when total due is reached
- **Redeem** in full
- **Forfeit** uncollected pledges
- Pledge number: `PG-{YYYY}-{####}`
- Printable pledge receipt via `/print/pledge/:id`

---

## 10. Dues

Customer-wise outstanding ledger with payments.

### Capabilities

- Searchable, filterable **table** with detail drawer (balance per customer)
- Filters: all / overdue (≥ 30 days) / due / paid / this month
- Pagination
- Manual **due** and **payment** entries
- Auto dues from finalized bills with remaining balance
- **Record payment** against a due (partial or full)
- **Mark paid** (settle remaining balance)
- Edit/remove rules: invoice-linked due lines are protected; payments stay in sync with invoice `amount_paid` / `balance_due`

### Entry details

- Date, kind (due / payment), amount, note
- Linked invoice number, line-item summary, net weight when from a bill

---

## 11. Settings

Tabbed shop configuration: **Shop | Invoice | Metal Rates | Printers | Backup | Data**.

### Shop

| Setting | Purpose |
|---------|---------|
| Shop name, tagline | Printed headers / branding |
| App subtitle | Sidebar branding under shop name |
| GSTIN | Tax invoice |
| Phone 1 / Phone 2 | Printed contact |
| Address lines (1–3), city, state, pincode | Printed address |
| Logo image path | Optional branding on prints / sidebar |
| Signature image path | Optional tax invoice signature |

### Invoice

- Fully customizable **cash bill**, **tax invoice**, and **pledge** label fields (`billTemplate`)
- Live sample preview of template labels
- **GST tax summary**: monthly report (taxable sales, CGST, SGST, IGST, bill count) for finalized non-estimate bills
- Export GST summary as CSV

### Daily metal rates (₹/gram)

- Effective date
- Gold 22K, Gold 24K, Silver (fine)
- Upsert by date; billing uses the latest rates by effective date
- **History table** of saved rates

### Printers

| Setting | Purpose |
|---------|---------|
| Paper size / copies (cash) | Browser print layout for cash bills |
| Paper size / copies (tax) | Browser print layout for tax invoices |

### Backup

- **Export database backup** (download SQLite file)
- **Restore database** via file upload (integrity check, then reload)
- Last backup timestamp shown
- **Automatic daily backups** on server start: `{data}/backups/jeweltrackerpro-YYYY-MM-DD.db`, keep last **14** days

### Data

- App version and database file path
- Product / customer record counts

---

## 12. Platform & technical capabilities

| Area | Capability |
|------|------------|
| **Local-first** | All data stored in a server-side SQLite file; no third-party cloud required |
| **Database** | SQLite (`data/jeweltrackerpro.db`); WAL; foreign keys; versioned migrations (`001`–`025`) |
| **Unified stock ledger** | `stock_movements` is the single source of truth for opening, purchase, and sale (legacy adjustment / damaged / lost / stocktake_adjustment rows may remain but no longer affect closing) |
| **Stack** | Express, Vite, React 19, TypeScript, better-sqlite3, Zod validation on REST, react-router (browser) |
| **Security** | Session auth, role-based access, feature permissions, validated Express handlers |
| **Testing** | Vitest (HTTP/SQLite integration) and Playwright web E2E |

---

## 13. Out of scope (current version)

The following are **not** included in the current release:

- Cloud sync, multi-store, or online backup
- Silent OS printer integration and ESC/POS cash drawer kick
- Editing or unfinalizing finalized bills
- Linux packaging as a supported target
- Full stone weight / wastage / HSN editing in the bill editor UI (schema/backend support exists)
- Bulk actions on the billing list (row checkboxes exist without bulk operations)
- In-app "Load sample data" button (seed helpers exist for tests only)
- Weight tracking for old-gold exchange (removed; exchange lines affect bill amount only)

---

## 14. Summary of functional areas

| Module | Key functionalities |
|--------|---------------------|
| **Auth/Users** | Login, change password, admin/staff roles, per-feature permissions, users management |
| **Dashboard** | Today sales/collections, sales overview chart, outstanding, drafts, metal cards, due collections, recent bills |
| **Inventory** | Sidebar hub with top tabs for products, gold & silver weight stock, inwards (purchases), and suppliers. Feature permissions stay `products`, `stock`, and `inward` |
| **Products** | CRUD, search/filters, piece stock badges, metal/purity/weights/making; opening movement on create |
| **Gold & Silver** | Daily opening/inward/sales/closing by category; editable categories; auto sales from bills; overrides; history; reconciliation; day close/reopen |
| **Inward & Suppliers** | Draft/final inwards; finished + raw metal lines; supplier CRUD; ledger purchase movements |
| **Customers** | CRUD, search; GSTIN/Aadhaar/PAN; delete guards; purchase & due history |
| **Billing** | Draft/estimate/final; cash, tax, pledge; GST; payments; print/PDF; stock deduction; record old/historical bills; exchange lines for ₹ credit |
| **Pledges** | Create, collect, redeem, forfeit; interest; printable receipt |
| **Dues** | Table ledger, filters, auto from bills, record/mark paid, balances |
| **Settings** | Shop branding, bill templates, printers, metal rates + history, backup/restore, daily backups, GST report |

---

*This document describes the features and functionalities implemented in the JewelTrackerPro fullstack web application as of the current codebase.*
