# JewelTrackerPro — Project Scope

Fullstack web software for jewellery shop inventory, billing, gold/silver weight tracking, pledges, gold savings, inwards, and customer dues. Ships as a Tauri desktop app that runs a local API on localhost, and is ready for later cloud deployment.

---

## 1. Product overview

| Aspect | Detail |
|--------|--------|
| **Product name** | JewelTrackerPro |
| **Type** | Fullstack app (Express + React) packaged as a Tauri desktop app |
| **Platforms** | Windows and macOS desktop; also runs in a browser on localhost |
| **Data** | SQLite database, one file per installation |
| **Primary users** | Shop counter staff and owners (admin and staff roles) |
| **Core purpose** | Manage products, customers, daily billing (quotation / tax invoice / Adagu pledge), inwards, old-gold purchase, piece stock, gold & silver weight stock with a unified ledger, pledges, gold savings schemes, reports, and outstanding dues |
| **Version** | 1.0.0 |

### How it runs

- In production, the Tauri shell (`src-tauri/src/main.rs`) starts the bundled Node API sidecar on a random `127.0.0.1` port, waits for `GET /api/version`, then opens the webview at that URL.
- The same Express app serves the built `dist/` front end, so a plain `npm run dev` browser session works too (Vite on 5173, API on 3000).
- The window receives an injected `window.desktopAPI` (`src-tauri/src/desktop_api.js`) for native save-file and folder pickers. In a browser those fall back to normal downloads.
- Database location: `%APPDATA%/JewelTrackerPro/jeweltrackerpro.db` in the desktop build (`JEWELTRACKERPRO_DATA_DIR`), or `data/jeweltrackerpro.db` in dev.

### Main modules (sidebar)

1. Dashboard
2. Billing (Quotation / Tax Invoice / Adagu)
3. Gold Savings
4. Inventory (top tabs: Products, Gold & Silver, Purchase, Old Gold Purchase, Suppliers)
5. Dues
6. Customers
7. Reports
8. Gold & Silver Rates
9. Users (admin only)
10. Settings

---

## 2. Authentication & users

Role-based access for shop staff and owners.

### Capabilities

- **Login** with username + password (HttpOnly session cookie, 12-hour expiry)
- **Change password** flow
- **Roles**: **admin** (full access) and **staff** (feature-scoped)
- **Feature permissions** per staff user: dashboard, billing, products, stock, inward, customers, dues, reports, rates, settings, gold_savings
- **Users page** (admin only): add, edit, activate/deactivate, set role and feature access, reset password, delete
- A default `admin` account (`admin123`, must change on first sign-in) is created on first run

### Session notes

- Sessions are held in memory on the server, so restarting the API or app signs everyone out.
- Every request resolves the session and loads the current user; deactivating a user immediately signs them out.

---

## 3. Dashboard

Counter summary with a selectable period, sales overview, metal closing, dues snapshot, and shortcuts.

### KPIs

| Metric | Description |
|--------|-------------|
| **Sales** | Sum of finalized, non-estimate, non-historical bill totals in the selected period |
| **Collections** | Amount paid on bills in the period, plus period-dated due payments (including collections against older bills) |
| **Outstanding** | Total customer balance from the dues ledger (links to Dues) |
| **Draft bills** | Count of draft invoices (links to Billing) |
| **Gold closing** | Sum of the period's gold closing weights (links to Stock) |
| **Silver closing** | Sum of the period's silver closing weights (links to Stock) |

### Period and chart

- Period selector: **today / week / month / year / custom**
- Sales overview chart adapts granularity: **hour** (today, 9 AM–8 PM), **day** (week / month / short custom), or **month** (year or long custom)
- Bills generated, average bill value, customers billed, items sold

### Other

- **Metal stock cards**: opening / inward / sold / closing for Gold and Silver
- **Due collections** list and outstanding customer count
- **Recent bills** table (up to 3): bill number, customer, date, total, status, estimate badge
- Quick actions: new bill, Billing, Customers, Products, Dues
- Refresh control

---

## 4. Products

Catalogue and piece-quantity inventory for saleable items, with variants and HUID hallmarks.

### Capabilities

- List, search (name / category / variant code / HUID), add, edit, delete
- Filters: metal, category, purity, stock status
- Grid and table views; detail drawer
- Stock badges: **In** / **Low** (≤ 5) / **Out**
- Category options seeded from stock categories plus existing product categories
- Product create writes an **opening** movement to the unified stock ledger
- **Variants**: a product can have child variants with their own variant code, size, stone weight/details, and attributes
- **HUIDs**: hallmark IDs can be recorded per piece; inward finalize requires HUIDs for new pieces
- Optional product image

### Fields

| Field | Notes |
|-------|--------|
| Name | Required |
| Category | Used for Gold & Silver stock matching when it matches a stock category name |
| Metal | e.g. Gold, Silver |
| Purity | Gold: 24K / 22K / 20K / 18K; Silver: 925 / fine |
| Gross weight | Grams |
| Net weight | Grams |
| Making charges | Per piece |
| Stock qty | Piece count (separate from weight stock) |
| Variant code | Optional, unique |
| Size | Optional |
| Stone weight / details | Optional |
| Attributes | Optional key/value set |
| HUIDs | Hallmark IDs, one per piece |
| Active | Hide from billing without deleting |

---

## 5. Gold & Silver stock

Daily weight ledger for gold and silver by stock category, backed by a single `stock_movements` ledger.

### Capabilities

- Filter by **date** and **metal** (Gold / Silver)
- Search within categories
- Per-item **opening weight** (editable; carries forward from the prior day's closing when unset; product-create opening stock appears here on day 1)
- **Inward** weight auto-calculated from finalized inwards for that date (finished pieces + raw metal)
- **Sales** weight auto-calculated from finalized, non-estimate, **non-historical** invoices that day (by metal + category)
- Optional **sales override** when auto sales need correction
- **Clear sales overrides** for the selected date + metal
- **Closing weight** = Opening + opening movements + Inward − Sales (read-only)
- **History** tab: daily opening / inward / sales / closing aggregates per metal

### Tabs

- **Stock by Category** — per-category opening/inward/sales/closing with edit panel and drill-down
- **Closing Summary** — printable day-closing summary
- **Inward Stock** — finalized inwards for the date/metal
- **Pieces Today** — piece in/out/net by product
- **Stock History** — daily aggregates
- **Reconciliation** — ledger vs piece-implied weight, flags unexplained variance

### Stock categories

- Default categories: Chain, Necklace, Haram, Bangle, Ring, Stud, Mattal, Nosepin, Thali, Gundu, L. Coin, P. Coin, Nanal, Backchain, D Stud
- **Add / rename / delete** categories (`stock_categories` table)

### Adjustments

- **Adjustments** (damaged / lost / correction) post ledger movements and, for product lines, update piece stock
- Available from Products and Stock; the adjustment date is blocked if the metal day is closed

### Day close / reopen

- **Close day** per metal writes a snapshot (`metal_day_closings` / `metal_day_closing_lines`)
- Precheck blocks close when open drafts/inwards exist for that metal/date
- Finalizing bills, inwards, or adjustments for a closed metal/day is blocked until an admin **reopens** it
- Reopen requires a reason
- Printable day-closing and stock-closing summary print routes

### Note on exchange

- **Old-gold exchange is not tracked in weight stock.** Exchange lines on a bill still affect the bill amount (₹ credit) but do **not** add to gold/silver weight stock. Separately purchased old gold is tracked under Inventory → Old Gold Purchase, with a running balance that payouts and bill applications draw down, and an Old Gold Lot → refiner batch flow for melting and settlement.

---

## 6. Inward (purchase) & suppliers

Purchase inward of finished pieces and raw metal, feeding the unified stock ledger.

### Inward

Primary screen is **Inventory → Purchase**. Products still has an **Add inward stock** shortcut that creates and finalizes a purchase for selected products.

- List drafts and finalized purchases; search by inward number or supplier
- Create or edit a draft against a supplier; add finished-piece lines (product-linked) and raw-metal lines (no product, by metal/category/purity)
- **Save draft** or **Save & finalize**. Finalize writes `purchase` movements to the ledger (pieces + raw weight) and updates product piece stock
- Finished-piece lines require **HUIDs** for the new pieces
- Draft inward can be edited/deleted; finalized inward is read-only
- Inward number: `IN-{YYYY}-{####}`
- Blocked if the metal day is closed
- Printable purchase invoice

### Supplier

- List, add, edit, delete suppliers
- Fields: name, phone, address, notes

---

## 7. Old Gold Purchase

Buying old gold from a customer as a standalone document (separate from exchange lines on a bill).

### Capabilities

- List, create, edit, finalize, delete
- Lines with description, gross / stone / net weight, purity, rate per gram, deduction %, and an optional **touch %**
- Per-line gross value, deduction amount, fine weight, and final value, plus a document total
- Purity uses the **old gold buying rate** from Metal Rates, falling back to the selling rate when unset
- Optional customer link, name, phone, and notes
- **Draft** is editable; **final** is read-only; **cancelled** keeps the number but is void
- Purchase number: `OGP-{YYYY}-{####}`, taken from the purchase date's year
- **Running balance.** A finalized purchase is worth `totalAmount`; cash / UPI / bank **payouts** and **applications to sale bills** both draw it down. The balance is computed on read as `total - active payouts - applied`, so it is never stale.
- A finalized purchase can be **partly applied to one or more sale bills** as a ₹ credit (via the bill's old-gold linker). The bill applies only what it needs; the remainder stays as balance for a later payout.
- Payouts are dated, always ≤ the balance, and can be voided with a reason; bill cancellation restores the linked amount.
- Cancel is blocked while the purchase is applied to a bill, has an active payout, or has an item in a refiner batch
- A printable **A4 purchase voucher** (shop header, customer KYC and ID, items, payouts, bills applied, signatures)
- Purchases can be recorded inline from a sale bill and auto-linked
- Used by the Old Gold Purchase tab under Inventory (`inward` or `billing` to create / finalize / pay out; `inward` to void, cancel or delete)

### Old gold lot and refiner settlement

- Every item of a finalized, non-cancelled purchase that is not claimed by a sale bill is in the **Old Gold Lot**, grouped by metal (Inventory → Old Gold Lot, `inward`).
- Items are gathered into a **refiner batch** (`OGB-{YYYY}-{####}`) of a single metal and moved through **open → melted → sent → settled**; a batch can be cancelled before settlement, which releases its items back to the lot.
- The batch records melt weight, sent weight, and the settlement: fine weight received, fine rate and cash received. **Gain / loss = cash received + fine weight received × fine rate − cost.**
- Received fine weight is **settlement only** and never adds to the Gold & Silver weight stock; the lot is separate from `stock_movements`.

---

## 8. Customers

Customer master for billing and dues.

### Capabilities

- List, search (name / phone), add, edit, delete
- Delete blocked if the customer has invoices or dues entries
- **Purchase history** and **due history** in the detail drawer
- Last bill date shown in the list

### Fields

| Field | Notes |
|-------|--------|
| Name | Required |
| Phone | Optional, 10 digits |
| Address | Optional |
| Guardian name | Optional |
| GSTIN | Optional, for tax invoices |
| Aadhaar | Optional, 12 digits (prints masked on pledges) |
| PAN | Optional, format `AAAAA9999A` |
| ID proof type | Optional: not recorded / Aadhaar / PAN / Voter ID / Driving Licence / Other |
| Notes | Optional |

Customers with an Aadhaar or PAN satisfy the Adagu *Require KYC* rule before a loan can be sanctioned.

Note: the earlier system walk-in customer has been removed.

---

## 9. Billing (invoices & pledges)

Create, edit, finalize, print, and export bills. Legacy `/invoices` routes redirect here.

### Bill modes

| Mode | Use |
|------|-----|
| **Quotation** (cash bill, `cash_bill`) | Everyday counter bill without GST, prefix `CB-{YYYY}-{####}` |
| **Tax invoice** | GST tax invoice, prefix `TI-{YYYY}-{####}` |
| **Adagu (pledge)** | Pledge loan against gold, receipt `ADG0001`, `ADG0002`, … (four digits, wider past 9999) |

The Billing landing page shows large mode tiles; the editor shows compact tabs. Switching modes with unsaved changes prompts to confirm.

### Bill lifecycle (invoices)

| Status | Behavior |
|--------|----------|
| **Draft** | Fully editable; can be deleted |
| **Estimate** | Can be saved and printed; cannot be finalized; excluded from sales and auto stock sales |
| **Final** | Read-only; piece stock deducted (product lines); dues synced when a balance remains; cannot update or delete |

Historical bills use a **user-entered** bill number and are saved as `final` + `is_historical`.

### Payment

- Modes: **Cash**, **UPI**, **Card**, **Mixed** (mixed stores a set of parts)
- **Amount paid** and computed **balance due**
- Later payments can be recorded on a final bill (they stay in sync with the customer's dues)

### Line items

- Add products by dropdown or **variant code / HUID** search
- Fields in editor: quantity, net weight, metal rate, making charges
- Metal rate auto-filled from the latest daily rates using the product metal/purity
- Line total from metal value + making (+ stone/wastage when stored on the line)
- **Old-gold exchange lines** for ₹ credit on the bill (no weight-stock effect)
- **Linked old-gold purchases** for extra ₹ credit
- Backend also stores (defaults; limited editor UI): gross weight, stone weight/rate, wastage %, HSN `7113`, metal/category snapshot, other charges

**Pricing formula (backend):**

`(netWeight × qty × (1 + wastage%/100) × metalRate) + (makingCharges × qty) + (stoneWeight × qty × stoneRate)`

### Tax & discounts

- Invoice-level **discount**
- Tax invoices: optional **auto GST 3%** on (subtotal − discount)
- Split as **CGST + SGST** (1.5% + 1.5%) or full **IGST**
- Manual tax when auto GST is off
- **Round-off** amount applied to the payable total
- Default HSN `7113` for jewellery lines

### Finalize

- Requires a customer and at least one line
- Deducts product **piece stock**; fails if stock is insufficient
- Writes `sale` movements to the unified ledger (weight) for product-backed lines
- Creates dues ledger entries when balance due > 0
- Blocked if the metal day is closed for the bill's date

### Record old / historical bills

- Route: `/billing/old`
- Enter summary totals (optional gold / silver / making weight summaries) without line items
- Saved as `final` + `is_historical`
- Syncs dues when an unpaid balance remains
- **Does not** deduct piece stock
- **Excluded** from auto gold/silver weight sales
- Printable as an "Old bill" summary

### List & actions

- Day KPIs on the billing list
- Filters: format (All / Quotation / Tax), status (draft / estimate / final), period (today / month / all), payment mode, due/paid
- Search, date picker, sort, pagination
- Open, Preview, Print, Export PDF
- Delete drafts only
- Link to **Record old bill**

### Print & PDF

- Preview and print via the browser print dialog
- A5 / A4 / thermal 80mm layouts with print background
- Save as PDF from the preview
- Dedicated print routes: `/print/cash-bill/:id`, `/print/tax-invoice/:id`, `/print/pledge/:id`, `/print/pledge-release/:id`, `/print/pledge-notice/:id`, `/print/metal-day/:date/:metal`, `/print/stock-closing/:date`, `/print/purchase/:id`, `/print/gs-receipt/:id`, `/print/gs-passbook/:id`, `/print/sample/:kind`, `/print/test/:role`
- Print routes are served by a separate lightweight document (`print.html` → `src/print/`) instead of the application shell, so opening a preview loads only that route's own chunk — not the dashboard, auth, or shop-branding bundles
- Labels are driven by **bill template** settings; shop identity prints on every template

### Adagu / Pledge (invoices side)

Pledges are created from the Billing **Adagu** tab but tracked as their own documents — see the Pledges section below.

---

## 10. Pledges (Adagu)

Loan against gold or silver, with period interest, top-ups, renewal, a real auction flow, KYC, photos, and reminders.

### Interest (period engine)

Interest is charged per 30-day period, not per day, by the pure engine in `shared/billing/pledgeLedger.ts`:

- the first 30 days of a loan always cost one month, including a same-day charge (the minimum month applies from day 0, so a loan closed the same day still pays one month);
- after that, part-periods of 1–15 days cost half a month and 16–29 days cost a full month;
- the original loan and every top-up are separate **tranches**, each with its own "interest paid up to" date, so a top-up accrues its own minimum month from its own date;
- payments are replayed in order, so the state can be rebuilt from the stored rows at any time.

Each payment splits into interest and principal: it pays the accrued interest first (a **discount** is applied to interest first), and only the remainder reduces principal. Interest paid before its period completes is held as **interest credit**.

### Capabilities

- Create a pledge for a customer with one or more pledged items (description, identification, metal, purity, gross/net weight, stones, pieces)
- Loan amount, assessed value, interest %, repayment due date, charges, notes
- **Assessed value** from the latest Rates (rate per gram for the item's metal and purity, with the item rate and value stored for audit), an editable override, a **max loan (LTV %)** line and a **Use max** helper
- **Sanction** (activate) a draft pledge; sanctioning creates the customer due. It is rejected above the LTV max unless an admin sets the override, and rejected without a borrower Aadhaar or PAN when *Require KYC* is on
- Sanctioned loans are **locked**: only drafts can be edited or deleted
- **Collect** interest or part payments with a date and a mode (cash / UPI / card / bank transfer / transfer / auction)
- **Redeem** with an amount collected, a **discount** that applies to interest first, and a mode; the payoff is `principal + interest − discount`
- **Top-ups** (extra loan) are their own tranche with their own date, amount, rate, and note
- **Renewal** (`/renew`) collects the interest due, moves the outstanding principal to a new linked ticket, and marks the old one `renewed`; both tickets link to each other
- **Auction** flow: send an auction **notice** (date plus the shop notice period), print the notice letter, then record the auction with the buyer (`outside` or `shop`), the sale amount, a surplus to refund, or a shortfall kept as a due or written off. A shop buyback writes the pledged weights into weight stock as a `purchase` for the category chosen per item
- **Payment history** in the dues drawer and the interest/principal/discount split on the release receipt
- Pledge number: `ADG0001`, `ADG0002`, … (four digits, wider past 9999)
- Printable pledge receipt (`/print/pledge/:id`), release receipt (`/print/pledge-release/:id`) and auction notice (`/print/pledge-notice/:id`)
- Status: `draft` → `active` → `redeemed` / `forfeited` / `renewed`
- **Photos**: item, borrower and ID-proof uploads (PNG/JPEG, 2 MB, never overwritten) shown in the editor, the dues drawer and the print; Aadhaar prints masked as `XXXX XXXX 1234`
- **Reminders**: the Adagu Dues **Reminders** view lists loans whose interest is due within 3 days or overdue, loans maturing within 30 days, and loans eligible for an auction notice or auction; the WhatsApp button opens a `wa.me` link built from the reminder template through the API and logs the reminder
- Adagu **LTV %**, **monthly interest %**, **auction notice period (days)**, **Require KYC** and the **WhatsApp reminder message** are configurable in Settings → Invoice Settings → Adagu Bill

### Money ledger

- `pledge_payments` is the single source of truth for pledge money (`kind`, `mode`, `amount`, `interest_part`, `principal_part`, `discount`, `note`); the linked `customer_dues` row carries the same amount
- `recordPledgePayment` (`server/pledges/payments.ts`) is the only write path: it replays the engine, inserts both rows in one transaction, refreshes the `pledges.amount_collected` cache, and closes the loan when the principal reaches zero
- A linked payment can only be deleted when it is the latest one; deleting it rebuilds the pledge state
- The due row amount is `principal + interest charged − discount`, so an auctioned or discounted loan shows a zero balance

### Adagu routes

`GET /api/pledges` (list), `GET /next-receipt-no`, `GET /reminders`, `GET|POST /`, `PUT /:id`, `DELETE /:id` (draft only), `POST /:id/sanction`, `/:id/collect`, `/:id/redeem`, `/:id/topup`, `/:id/renew`, `GET /:id/payments`, `GET /:id/payoff?date=`, `GET|POST /:id/photos`, `DELETE /:id/photos/:photoId`, `GET /:id/auction`, `POST /:id/auction-notice`, `POST /:id/auction`, `POST /:id/auction-surplus-paid`, and `POST /api/system/open-whatsapp` (validates a `https://wa.me/…` link, opens it in the default browser, and logs a reminder).

---

## 11. Gold Savings

Monthly gold-accumulation schemes with installments, gold-weight accounting, bonuses, and maturity/redemption.

### Top tabs

`/gold-savings/dashboard`, `schemes`, `enroll`, `accounts`, `collections`, `ledger`, `maturity`, `overdue`, `reports`

### Capabilities

- **Schemes**: name, code, description, monthly amount, duration, min/max installment, purity, gold-rate source and unit, bonus type/value/eligibility, late/missed-installment and early-closure rules, partial redemption, multiple accounts, redemption type, making/wastage rules, availability window, terms, status
- **Enrollment**: pick a customer and scheme, set enrolment and first-installment dates, maturity date, preferred payment day, nominee details, accept terms
- **Accounts**: list and detail, status (`active` / `matured` / `redeemed` / `cancelled` / `closed`), paid and pending installments, total paid, gold accumulated, next due
- **Collections**: post a payment against an installment with amount, late fee, discount, payment mode, transaction ref, and gold rate (with optional override and reason). Payments carry an **idempotency key** and write a ledger entry
- **Reverse a payment** with a reason; restores the installment to due and writes a reversal ledger entry
- **Cancel an account** with a reason
- **Ledger / passbook**: per-account running entries (payment, reversal, bonus, redemption, correction) with cumulative gold
- **Maturity**: process a redemption as **gold**, **jewellery**, or **invoice**, including bonus gold, making/wastage/tax, remaining gold, and whether the account closes
- **Overdue aging** and account audit log
- **Gold Savings reports**: daily collections, monthly collections, customer ledger, scheme performance, active/matured/cancelled schemes, overdue installments, overdue aging, gold accumulation, redemption history, outstanding obligations
- Printable **receipt** (`/print/gs-receipt/:id`) and **passbook** (`/print/gs-passbook/:id`); passbook banner/side images are configurable in Settings

---

## 12. Dues

Customer-wise outstanding ledger with payments.

### Capabilities

- Searchable, filterable **table** with detail drawer (balance per customer)
- Filters: all / overdue (≥ 30 days) / due / paid / this month
- Pagination
- Manual **due** and **payment** entries
- Auto dues from finalized bills with a remaining balance
- **Record payment** against a due (partial or full)
- **Mark paid** (settle remaining balance)
- Edit/remove rules: invoice-linked due lines are protected; payments stay in sync with invoice `amount_paid` / `balance_due`
- Pledge collections and redemptions also sync here

### Adagu dues tab

- Adagu tickets with principal, monthly interest, next due, days active, total due and remaining
- Filters: all / interest due / active / notice sent / auctioned / reminders / closed
- Quick actions on the detail drawer: open loan, collect interest, extra loan, redeem, renew, auction notice, print notice, record auction, release receipt
- The drawer shows the due summary (interest paid up to, next due), payment history with the interest/principal/discount split, top-ups, and the pledge/Borrower/ID-proof photos
- The **Reminders** view lists loans needing a nudge with the reason, due date, interest due and last reminded time, plus WhatsApp and collect-interest buttons

### Entry details

- Date, kind (due / payment), amount, note
- Linked invoice number, line-item summary, net weight when from a bill

---

## 13. Reports

A standalone Reports module with grouped, parameterised reports.

### Cadence

- Sidebar **Reports** entry (`reports` permission) → `ReportsLayout` group list → `ReportViewPage`
- Date scope per report: **range**, **as-of**, or none
- Filters: customer, supplier, product, metal, quantity cutoff
- Results render a table with totals; columns declare text / money / weight / qty / date formats

### Groups

Sales, Purchase, Stock, Customer, Payment, Gold & Silver, Adagu / Pledge, Tax, Business Summary.

Examples: Daily Sales, Date-wise Sales, Cash / Tax Invoice Sales, Product-wise and Customer-wise Sales, Purchase Register, Supplier-wise Purchases, Current / Gold / Silver / Product Stock, Stock Movement, Stock Inward, Stock Outward, Low Stock, Customer Transactions / Outstanding / Purchase History, Daily Collection, Cash / UPI / Card Collection, Credit Outstanding, Payment History, Gold / Silver Stock Summary, Purity-wise Stock, Metal-wise Inward / Outward, Weight Movement, Active / Closed / Due Pledges, Customer-wise Pledges, Pledge Transactions, Adagu Interest Income, Adagu Collections by Mode, Adagu Discounts, Adagu Auctions, GST Sales, GST Purchase, Tax Summary, Invoice Register, Sales Summary, Purchase Summary, Outstanding Summary, Daily Business Summary.

A few reports are intentionally unavailable and show the reason, e.g. Adagu Sales (pledges are not sales), Sales Return and Purchase Return (no such documents), Variant/Size Stock, and Gross Profit (sold lines do not store purchase cost).

The Settings → Invoice Settings tab also shows a monthly **GST tax summary** with CSV export.

---

## 14. Gold & Silver Rates

Standalone rate page (sidebar **Gold & Silver Rates**, `rates` permission).

- Effective date
- Gold 22K, Gold 24K, Gold 20K, Gold 18K, Silver fine, Silver 925
- Upsert by date; billing and Gold Savings use the latest rates by effective date
- **History table** of saved rates

---

## 15. Settings

Tabs: **Invoice Settings | Printers | Backup | Data**.

### Invoice Settings

- **Shop Identity**: shop name, tagline, app subtitle, GSTIN, phone 1 / phone 2, address lines, city, state, pincode
- **Images**: business logo, signature (prints on bills, pledges, and Gold Savings receipts), BIS logo, QR code
- **Proprietor lines** (1–3) and a **promo line**
- **Gold Savings Passbook** images: banner and side image
- **Bill template** sections for Cash Bill / Tax Invoice / Adagu with Test Print preview and customizable labels
- **Adagu POS settings**: LTV % of assessed value, monthly interest %, auction notice period (days), Require KYC, and the WhatsApp reminder message template
- **GST tax summary** table with CSV export

### Printers

- Paper size and copies for **cash bill** and **tax invoice** (A5 / A4 / thermal 80mm, 1–5 copies)
- Bills print through the browser print dialog

### Backup

- **Back up now**, **Export copy** (`.db`), **Export Excel** (every table), **Restore from file**
- **Automatic backup**: daily or weekly at a chosen time; catches up on next launch if the app was closed through the slot
- **Off-machine copy**: after each local backup the newest `.db`, its Excel workbook and the **uploads folder** (shop images, passbook images, pledge photos) are copied to a chosen folder (e.g. a USB drive) and the `.db` copy is opened to verify it can restore; a restore from that folder puts the uploads back
- **Saved backups** list with restore / delete; the last **14** automatic copies are kept, manual backups are never auto-deleted
- Health indicator shows how current the backup is

### Data

- App version and database file path
- Log folder, where the `logs/crash.log` quoted by `JTP-ERR-…` reports is written
- Product / customer record counts

### Backup defaults (server)

- Automatic backups are stored under `{data}/backups/`; scheduled checks run every minute while the server is up.

---

## 16. Platform & technical capabilities

| Area | Capability |
|------|------------|
| **Local-first** | All data stored in a server-side SQLite file; no third-party cloud required |
| **Desktop** | Tauri 2 shell starts the Node sidecar, injects `desktopAPI`, and stops the sidecar on exit; a WebView2 renderer crash or blank window is caught, logged, and reported with a `JTP-ERR-…` reference ID |
| **Database** | SQLite (`jeweltrackerpro.db`); WAL; foreign keys; versioned migrations `001`–`060` |
| **Unified stock ledger** | `stock_movements` is the single source of truth for opening, purchase, and sale |
| **Money ledger** | `customer_dues` holds due and payment rows synced from invoices, pledges, and manual entries; `pledge_payments` holds every Adagu payment with its interest/principal/discount split |
| **Stack** | Express, Vite, React 19, TypeScript, better-sqlite3, Zod validation on REST, react-router (browser) |
| **Security** | Session auth, role-based access, feature permissions, validated Express handlers |
| **Printing** | Browser print dialog; A5 / A4 / thermal; PDF export built from the preview; print routes render in a dedicated lightweight `print.html` document, not the app shell |
| **Asset delivery** | Hashed assets and shop images are served immutable with a one-year cache; uploaded images are downscaled to 1200px in the browser before upload |
| **Testing** | Vitest (HTTP/SQLite integration) and Playwright web E2E; a Tauri Playwright config is also present; an E2E guard asserts a print route loads the print document and never the app bundle |
| **Build scripts** | Sidecar build/package/verify, Tauri resource preparation, Windows/macOS packaging |

---

## 17. Out of scope (current version)

- Cloud sync, multi-store, or online backup
- Silent OS printer integration and ESC/POS cash drawer kick
- Editing or unfinalizing finalized bills
- Linux packaging as a supported desktop target
- Full stone weight / wastage / HSN editing in the bill editor UI (schema/backend support exists)
- Bulk actions on the billing list
- Sales return and purchase return documents
- Gross-profit reporting (sold lines do not store purchase cost)
- In-app "Load sample data" button (seed helpers exist for tests only)
- Weight tracking for old-gold exchange on bills (exchange affects bill amount only; standalone old-gold purchase is tracked separately)

---

## 18. Summary of functional areas

| Module | Key functionalities |
|--------|---------------------|
| **Auth/Users** | Login, change password, admin/staff roles, per-feature permissions, users management |
| **Dashboard** | Period-based sales/collections, adaptive sales chart, outstanding, drafts, metal cards, due collections, recent bills |
| **Inventory** | Hub with top tabs for products, gold & silver weight stock, purchase (inwards), old gold purchase, old gold lot, and suppliers |
| **Products** | CRUD, variants, HUIDs, search/filters, piece stock badges, metal/purity/weights/making; opening movement on create |
| **Gold & Silver** | Daily opening/inward/sales/closing by category; editable categories; auto sales from bills; overrides; history; reconciliation; adjustments; day close/reopen |
| **Inward & Suppliers** | Draft/final inwards; finished + raw metal lines; HUIDs; supplier CRUD; ledger purchase movements |
| **Old Gold Purchase** | Draft/final/cancelled old-gold purchase documents; per-line weights, purity, rate, deduction, touch % and fine weight; running balance with payouts and partial bill application; printable voucher; inline purchase from a bill; Old Gold Lot → refiner batch melt/send/settle |
| **Customers** | CRUD, search; GSTIN/Aadhaar/PAN/ID-proof type; delete guards; purchase & due history |
| **Billing** | Draft/estimate/final; quotation, tax invoice, Adagu; GST and round-off; mixed payments; print/PDF; stock deduction; record old/historical bills; exchange and linked old-gold credit |
| **Pledges (Adagu)** | Create, sanction, collect, redeem, renew, top-up, auction notice and settlement; period interest ledger with discounts and modes; assessed value and LTV; KYC, photos and WhatsApp reminders; printable receipt, release and notice |
| **Gold Savings** | Schemes, enrollment, accounts, installment collections (idempotent), reversals, ledger/passbook, maturity/redemption, overdue aging, audit, reports, prints |
| **Dues** | Table ledger, filters, auto from bills, record/mark paid, balances |
| **Reports** | Grouped reports across sales, purchase, stock, customer, payment, metal, pledge, tax, and business summary |
| **Rates** | Daily gold/silver selling rates (22K/24K/20K/18K, silver fine/925) and old-gold buying rates, with history |
| **Settings** | Shop identity and images, bill templates, Adagu POS defaults, printers, backup/restore/offsite/Excel, GST summary, data info |

---

*This document describes the features and functionalities implemented in the JewelTrackerPro fullstack desktop application as of the current codebase (version 1.0.0, migrations through 057).*
