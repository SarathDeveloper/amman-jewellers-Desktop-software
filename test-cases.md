# JewelTrackerPro — Manual QA Test Cases

Offline-first Tauri desktop app for jewellery shop inventory, billing, gold/silver weight tracking, customer dues, and staff PIN security. This catalog covers **all implemented user-facing features** as of the current codebase (v1.0.0).

**How to use:** Run cases against a built or `npm run dev` desktop window (not a browser). Prefer an isolated/test database for destructive cases (backup/restore, delete). PIN is disabled automatically in E2E (`JEWELTRACKERPRO_E2E=1`); for AUTH cases, use a normal launch.

**Access control note:** There are no multi-user roles. Security is a single shared **staff PIN** (4–8 digits). “Permission” cases below refer to PIN lock / unlocked session and finalize/read-only bill rules—not role matrices.

---

## Feature inventory

| Area | Routes / entry | Summary |
|------|----------------|---------|
| **Auth (PIN)** | App launch overlay; Settings → Data | First-run set PIN; unlock; change PIN; print routes skip overlay |
| **Shell / navigation** | Sidebar | Dashboard, Billing, Products, Gold & Silver, Customers, Dues, Settings; branding; offline footer |
| **Dashboard** | `/dashboard` | Today KPIs, sales chart, metal cards, dues snapshot, recent bills, quick links |
| **Products** | `/products` | CRUD, search/filters, grid/table, stock badges, editable piece qty |
| **Gold & Silver** | `/stock` | Daily opening / auto sales / override / closing by category; history; category CRUD |
| **Customers** | `/customers` | CRUD, search, profile drawer; delete guards |
| **Billing** | `/billing`, `/billing/new`, `/billing/:id`, `/billing/old` | Draft / estimate / final; cash & tax; GST; payments; print/PDF; old bills; stock & dues sync |
| **Dues** | `/dues` | Ledger, filters, manual due/payment, record payment, mark paid |
| **Settings** | `/settings` | Shop, Invoice (templates + GST report), Metal rates, Printers, Backup, Data (PIN) |
| **Print routes** | `/print/cash-bill/:id`, `/print/tax-invoice/:id`, `/print/test/:role` | Silent/print windows; skip PIN |
| **Platform** | App-wide | Offline SQLite, fatal error gate, diagnostics/logs, packaging |

**Not in current UI (backend/API stubs only):** Day cash closing (`closing:*` channels / schemas exist; no sidebar page or preload wiring for shop use). Covered under **Gaps** at the end—do not treat as shippable feature until exposed.

---

## 1. Authentication & PIN (`AUTH`)

### AUTH-01 — First-run set staff PIN
- **Preconditions:** Fresh userData / no PIN configured; not running with `JEWELTRACKERPRO_E2E=1`.
- **Steps:**
  1. Launch the app.
  2. On “Set staff PIN”, enter a 4–8 digit PIN and matching confirmation.
  3. Submit.
- **Expected Result:** PIN is saved; lock clears; main app (sidebar + Dashboard) is usable.

### AUTH-02 — Unlock with correct PIN
- **Preconditions:** PIN already configured; app locked on launch.
- **Steps:** Enter the correct PIN and submit.
- **Expected Result:** App unlocks; previous data is available.

### AUTH-03 — Reject incorrect PIN
- **Preconditions:** PIN configured.
- **Steps:** Enter a wrong PIN and submit.
- **Expected Result:** Error shown; app remains locked; no access to shop data.

### AUTH-04 — PIN length validation
- **Preconditions:** Setup or change-PIN flow.
- **Steps:** Try PINs with fewer than 4 digits, more than 8 digits, and non-digit characters.
- **Expected Result:** Each attempt is rejected with a clear validation message; PIN is not set/changed.

### AUTH-05 — Confirmation mismatch on first setup
- **Preconditions:** First-run setup screen.
- **Steps:** Enter PIN and a different confirm PIN; submit.
- **Expected Result:** Error such as confirmation mismatch; PIN not configured.

### AUTH-06 — Change PIN from Settings (requires current PIN)
- **Preconditions:** Unlocked session; PIN configured.
- **Steps:**
  1. Open Settings → Data.
  2. Enter current PIN, new PIN, and confirm new PIN.
  3. Save / set.
  4. Quit and relaunch; unlock with the **new** PIN.
- **Expected Result:** Change succeeds only with correct current PIN; old PIN no longer unlocks; new PIN does.

### AUTH-07 — Change PIN rejects wrong current PIN
- **Preconditions:** PIN configured.
- **Steps:** In Settings → Data, enter wrong current PIN with a valid new PIN pair; submit.
- **Expected Result:** Change fails; original PIN still works on next launch.

### AUTH-08 — Print routes skip PIN overlay
- **Preconditions:** PIN required on main app; a finalized invoice exists.
- **Steps:** Navigate or open hash route `/print/cash-bill/{id}` (or tax equivalent) without unlocking, if reachable via print window.
- **Expected Result:** Print content can load without the PIN form blocking the print window.

### AUTH-09 — Locked session cannot reach shop modules
- **Preconditions:** PIN required and not yet verified.
- **Steps:** Observe UI while locked; attempt any navigation if possible.
- **Expected Result:** Only PIN UI is usable; Dashboard/Billing/etc. are not interactive until unlock.

---

## 2. App shell & navigation (`NAV`)

### NAV-01 — Sidebar links open correct modules
- **Steps:** Click each sidebar item: Dashboard, Billing, Products, Stock, Gold & Silver, Customers, Dues, Settings.
- **Expected Result:** Each opens the matching page; active nav state highlights the current item (Stock vs Gold & Silver distinguished).

### NAV-02 — Branding reflects shop settings
- **Preconditions:** Shop name, app subtitle, and optional logo saved in Settings → Shop.
- **Steps:** Open any main page; check sidebar brand block.
- **Expected Result:** Shop name and subtitle (and logo if set) match Settings; default gem icon if no logo.

### NAV-03 — Legacy invoice routes redirect
- **Steps:** Navigate to `#/invoices` and `#/invoices/new`.
- **Expected Result:** Redirect to Billing list / new bill respectively.

### NAV-04 — Root redirects to Dashboard
- **Steps:** Open `#/`.
- **Expected Result:** Lands on Dashboard.

### NAV-05 — Offline / version footer
- **Steps:** View sidebar footer.
- **Expected Result:** Shows offline mode, local SQLite hint, and app version (e.g. v1.0.0).

---

## 3. Dashboard (`DASH`)

### DASH-01 — KPI cards load for today
- **Preconditions:** At least one finalized non-estimate bill dated today (optional for empty-state check).
- **Steps:** Open Dashboard; note Today’s sales, collections, outstanding, draft bills, gold/silver closing.
- **Expected Result:** Cards render without error; values match today’s finalized activity / dues / stock (0 when empty).

### DASH-02 — Today’s sales excludes estimates and drafts
- **Preconditions:** Today has a draft, an estimate, and a finalized bill.
- **Steps:** Compare Dashboard “Today’s sales” to bill totals.
- **Expected Result:** Only finalized non-estimate totals are included.

### DASH-03 — Collections include follow-up due payments
- **Preconditions:** Older unpaid bill; record a payment on dues dated today.
- **Steps:** Refresh Dashboard collections KPI.
- **Expected Result:** Today’s collections include that payment (and today’s bill payments without double-counting same-day ledger duplicates).

### DASH-04 — Outstanding links to Dues
- **Steps:** Click Outstanding (or related control) on Dashboard.
- **Expected Result:** Navigates to Dues; outstanding amount aligns with dues ledger total.

### DASH-05 — Draft bills link to Billing
- **Steps:** Click Draft bills KPI / link.
- **Expected Result:** Opens Billing list; draft count matches drafts in billing.

### DASH-06 — Metal stock cards and links
- **Steps:** View Gold / Silver opening, sold, closing; use links to Stock if present.
- **Expected Result:** Weights display; navigation to Gold & Silver / Stock works; closing matches day’s stock summary.

### DASH-07 — Sales overview chart and day stats
- **Steps:** View hourly chart and bills generated / average / customers / items.
- **Expected Result:** Chart and stats update for today’s finalized sales; empty day shows zeros without crash.

### DASH-08 — Recent bills table
- **Preconditions:** Several invoices exist.
- **Steps:** Review Recent bills (up to 8).
- **Expected Result:** Shows bill no., customer, date, total, status, estimate badge when applicable; open/navigation works if provided.

### DASH-09 — Quick actions
- **Steps:** Use shortcuts: new bill, Billing, Customers, Products, Dues (and Record payment if shown).
- **Expected Result:** Each navigates to the correct screen.

### DASH-10 — Refresh control
- **Steps:** Create a new finalized bill elsewhere; return and refresh Dashboard.
- **Expected Result:** KPIs and recent bills update without restarting the app.

---

## 4. Products (`PROD`)

### PROD-01 — Create product with opening stock
- **Steps:**
  1. Products → Add product.
  2. Fill SKU, name, category (e.g. Ring), metal Gold, purity 22K, gross/net weights, making charges, stock qty &gt; 0.
  3. Save.
- **Expected Result:** Product appears in list with correct fields and the entered piece stock qty.

### PROD-02 — Required field validation
- **Steps:** Attempt save with empty SKU and/or name.
- **Expected Result:** Validation errors; product not created.

### PROD-03 — Duplicate SKU rejected
- **Preconditions:** Product with SKU `TEST-001` exists.
- **Steps:** Create another product with the same SKU.
- **Expected Result:** Error; unique SKU enforced.

### PROD-04 — Net weight cannot exceed gross weight
- **Steps:** Enter gross 5, net 6; save.
- **Expected Result:** Form validation rejects save.

### PROD-05 — Edit product including stock qty
- **Preconditions:** Existing product.
- **Steps:** Edit name, making charges, weights, and stock qty; save.
- **Expected Result:** Updates persist; list/detail show the new piece qty.

### PROD-06 — Delete product
- **Preconditions:** Product with no blocking references (or as allowed by app).
- **Steps:** Delete and confirm.
- **Expected Result:** Product removed from catalogue.

### PROD-07 — Search by name / SKU / category
- **Steps:** Type partial name, SKU, and category into search.
- **Expected Result:** List filters correctly; clear search restores full list.

### PROD-08 — Filters: metal, category, purity, stock status
- **Steps:** Apply Gold / Silver chips; category; purity; In / Low / Out stock filters.
- **Expected Result:** Only matching products shown; Low = qty ≤ 5; Out = 0.

### PROD-09 — Grid vs table view and detail drawer
- **Steps:** Toggle grid and table; open a product detail drawer if available.
- **Expected Result:** Both views show consistent data; drawer shows product details.

### PROD-10 — Stock badges In / Low / Out
- **Preconditions:** Products with qty 10, 3, and 0.
- **Steps:** View badges on list/cards.
- **Expected Result:** Correct In / Low / Out presentation.

### PROD-11 — Bulk selection delete (if UI exposes multi-select)
- **Preconditions:** Two disposable products selected.
- **Steps:** Delete selected; confirm.
- **Expected Result:** Both removed; toast confirms.

### PROD-12 — Purity options follow metal
- **Steps:** Select Gold → purity options include 24K/22K/18K; switch to Silver → 925 (and catalogue extras as designed).
- **Expected Result:** Purity resets/defaults appropriately when metal changes.

### PROD-13 — Category options include stock categories
- **Steps:** Open category dropdown on add form.
- **Expected Result:** Seeded stock categories (Chain, Ring, etc.) plus any custom product categories appear.

---

## 5. Gold & Silver weight stock (`GS`)

### GS-01 — Filter by date and metal
- **Steps:** On Gold & Silver, pick a date; switch Gold / Silver; search categories.
- **Expected Result:** Category rows refresh for that date/metal; search filters names.

### GS-02 — Set / correct opening weight
- **Steps:** Edit opening for a category on a date; save.
- **Expected Result:** Opening persists; closing recalculates as opening − effective sales.

### GS-03 — Auto sales from finalized bills
- **Preconditions:** Product category matches a stock category name; finalize gold/silver bill with net weight.
- **Steps:** View that date’s category sales/closing.
- **Expected Result:** Sales weight reflects billed grams; estimates/historical bills excluded from auto sales.

### GS-04 — Stock History tab
- **Steps:** Open Stock History; click a date row if clickable.
- **Expected Result:** Daily aggregates opening/sales/closing per metal; selecting a date can jump to category view for that day.

### GS-05 — Sales override and Auto Calculate Sales
- **Steps:** Enter a sales override for a category; save; then click Auto Calculate Sales / clear overrides.
- **Expected Result:** Override replaces auto sales in closing; clearing restores auto sales from finalized bills.

### GS-06 — Add stock category
- **Steps:** Add category with name (and optional opening for date/metal).
- **Expected Result:** Category appears in list and product category options.

### GS-07 — Rename stock category
- **Steps:** Rename category to a new unique name.
- **Expected Result:** Name updates across stock UI; linked rows follow rename rules.

### GS-08 — Delete category two-step confirm
- **Steps:** Start delete; enter wrong name; then enter matching name and confirm.
- **Expected Result:** Wrong name blocked; matching name deletes category and its daily rows (per warning copy).

---

## 7. Customers (`CUST`)

### CUST-01 — Create customer
- **Steps:** Add customer with name (required); optional phone, address, notes; save.
- **Expected Result:** Appears in list; searchable.

### CUST-02 — Name required
- **Steps:** Save with empty name.
- **Expected Result:** Validation error; not created.

### CUST-03 — Edit customer
- **Steps:** Update phone/address/notes; save.
- **Expected Result:** Changes persist.

### CUST-04 — Search by name and phone
- **Steps:** Search partial name and phone.
- **Expected Result:** Matching rows only.

### CUST-05 — Delete customer without history
- **Preconditions:** Customer with no invoices or dues.
- **Steps:** Delete and confirm.
- **Expected Result:** Removed successfully.

### CUST-06 — Delete blocked when invoices exist
- **Preconditions:** Customer has at least one invoice.
- **Steps:** Attempt delete.
- **Expected Result:** Error: cannot delete customer with existing invoices.

### CUST-07 — Delete blocked when dues entries exist
- **Preconditions:** Customer has dues ledger entries (and no invoices if testing dues-only path).
- **Steps:** Attempt delete.
- **Expected Result:** Error: cannot delete with existing dues entries.

### CUST-08 — Customer profile drawer
- **Preconditions:** Customer with finalized purchases and/or payments/dues.
- **Steps:** Open profile/drawer.
- **Expected Result:** Shows contact info; Total Purchases / Paid / Outstanding; purchase list excludes drafts/estimates; payment and dues history accurate (no double-count of invoice-linked payments).

---

## 8. Billing — list & lifecycle (`BILL`)

### BILL-01 — Create cash bill draft
- **Steps:** Billing → New bill; select customer; add line (product); save draft.
- **Expected Result:** Status draft; bill number assigned (`CB-{YYYY}-{####}` or `TI-{YYYY}-{####}`); appears in list.

### BILL-02 — Create tax invoice draft
- **Steps:** Set format to tax invoice; add lines; save draft.
- **Expected Result:** Saved as tax invoice draft; tax fields available.

### BILL-03 — SKU scan adds product
- **Preconditions:** Product with known SKU.
- **Steps:** Focus scan field; type exact SKU; press Enter.
- **Expected Result:** Line added/filled with product; metal rate from latest rates when available.

### BILL-04 — Line pricing formula
- **Preconditions:** Known net weight, qty, metal rate, making charges (wastage/other if exposed).
- **Steps:** Enter values; observe line and bill totals.
- **Expected Result:** Matches `(netWeight × qty × (1 + wastage%/100) × metalRate) + (makingCharges × qty) + (stoneWeight × qty × stoneRate) + (otherCharges × qty)` (backend); UI totals consistent. Editor columns: Ornament, Purity, N.T, G.W, Rate, Wastage %, Labour, Other, Amount.

### BILL-05 — Discount and balance due
- **Steps:** Enter discount and amount paid less than total.
- **Expected Result:** Total and balance due compute correctly; balance due highlighted when &gt; 0.

### BILL-06 — Payment modes
- **Steps:** Save/finalize with Cash, UPI, Card, and Mixed (separately).
- **Expected Result:** Mode stored and shown on list/print.

### BILL-07 — F2 sets amount paid to total
- **Steps:** On editor with lines totaling T; press F2.
- **Expected Result:** Amount paid becomes T; balance due 0.

### BILL-08 — F4 triggers print
- **Preconditions:** Saved bill; printer configured or system dialog acceptable.
- **Steps:** Press F4.
- **Expected Result:** Print/preview flow starts for the bill format without crash.

### BILL-09 — Finalize happy path deducts stock
- **Preconditions:** Customer + ≥1 line; sufficient piece stock.
- **Steps:** Finalize.
- **Expected Result:** Status final (read-only); piece stock reduced; dues created if balance due &gt; 0.

### BILL-10 — Finalize requires customer and lines
- **Steps:** Attempt finalize without customer or without items.
- **Expected Result:** Blocked with clear error.

### BILL-11 — Finalize blocked on insufficient stock
- **Preconditions:** Product stock 1; bill qty 2.
- **Steps:** Finalize.
- **Expected Result:** Error; bill remains draft; stock unchanged.

### BILL-12 — Finalize rejected for estimates
- **Steps:** Save as estimate; try Finalize (button disabled or API reject).
- **Expected Result:** Cannot finalize; excluded from sales and auto stock sales.

### BILL-13 — Save estimate printable but not sales
- **Steps:** Save estimate; print/preview; check Dashboard sales and stock.
- **Expected Result:** Estimate printable; no piece deduction; not in today’s sales KPI.

### BILL-14 — Final bill is read-only
- **Preconditions:** Finalized invoice.
- **Steps:** Open bill; attempt edit fields / update / delete.
- **Expected Result:** Cannot update or delete; UI reflects read-only.

### BILL-15 — Delete draft only
- **Steps:** Delete a draft; attempt delete on final (and estimate per rules).
- **Expected Result:** Draft deleted; final cannot be deleted.

### BILL-16 — Auto GST 3% (CGST+SGST)
- **Steps:** Tax invoice; enable auto GST; enter subtotal/discount; observe tax.
- **Expected Result:** ~3% on (subtotal − discount); split 1.5% + 1.5% CGST/SGST when not IGST.

### BILL-17 — IGST mode
- **Steps:** Enable use IGST on tax invoice with auto tax.
- **Expected Result:** Full IGST instead of CGST/SGST split; totals correct.

### BILL-18 — Manual tax when auto GST off
- **Steps:** Disable auto tax; enter manual tax; save/finalize.
- **Expected Result:** Manual tax used in total.

### BILL-19 — Metal rates auto-fill on line
- **Preconditions:** Latest metal rates saved for 22K/24K/silver.
- **Steps:** Add Gold 22K product line.
- **Expected Result:** Metal rate prefilled from latest effective rates.

### BILL-20 — List filters and search
- **Steps:** Filter by format (cash/tax), status (draft/estimate/final), period (today/month/all), payment mode, due/paid; search; sort; paginate.
- **Expected Result:** List matches filters; day KPIs reflect selected day.

### BILL-21 — Preview, Print, Export PDF
- **Preconditions:** Saved invoice.
- **Steps:** From list/editor: Preview, Print, Export PDF (save dialog).
- **Expected Result:** Preview modal/window shows shop branding; print invokes configured printer or dialog; PDF export succeeds or cancel is handled cleanly.

### BILL-22 — Reprint last bill
- **Preconditions:** At least one bill printed previously (last printed recorded).
- **Steps:** Click Reprint last on Billing (and/or Settings → Printers).
- **Expected Result:** Last printed invoice reprints; toast/info shows invoice number.

### BILL-23 — Day KPIs on billing list
- **Steps:** View billing list KPIs for selected date.
- **Expected Result:** Sales, collections, bill mix align with finalized non-estimate bills for that day.

---

## 9. Old / historical bills (`OLD`)

### OLD-01 — Record old cash bill
- **Steps:** Billing → Record old bill; enter invoice no., customer, date, format cash, payment, subtotal, amount paid; optional weight summaries; save.
- **Expected Result:** Saved as final + historical; opens in editor/read view; **no piece stock deduction**.

### OLD-02 — Old bill with unpaid balance creates dues
- **Steps:** Record old bill with amount paid &lt; total.
- **Expected Result:** Dues ledger shows balance for customer; bill balance due &gt; 0.

### OLD-03 — Old tax invoice in GST report; old cash excluded
- **Steps:** Record one old cash and one old tax invoice; open Settings → Invoice GST summary.
- **Expected Result:** Old tax counts in GST report; old cash does not.

### OLD-04 — Old bills excluded from auto metal sales
- **Steps:** After recording old bill with gold/silver weight summaries, check Gold & Silver auto sales for that date.
- **Expected Result:** Auto sales not driven by historical bill weights.

### OLD-05 — Validation: customer and invoice number required
- **Steps:** Save without customer or blank invoice number.
- **Expected Result:** Errors; not saved.

### OLD-06 — Printable as old bill summary
- **Steps:** Preview/print historical bill.
- **Expected Result:** Renders as old/summary style without requiring line items.

---

## 10. Dues (`DUE`)

### DUE-01 — Auto due from finalized unpaid bill
- **Preconditions:** Finalize bill with balance due &gt; 0.
- **Steps:** Open Dues; find customer.
- **Expected Result:** Due entry linked to invoice; customer balance increases; line summary/net weight when from bill.

### DUE-02 — Record partial payment
- **Steps:** Record payment for less than remaining balance.
- **Expected Result:** Balance reduces; invoice `amount_paid` / `balance_due` stay in sync for linked dues.

### DUE-03 — Mark paid settles remaining
- **Steps:** Mark paid on a due with remaining balance.
- **Expected Result:** Remaining cleared; customer column paid as applicable.

### DUE-04 — Manual due entry
- **Steps:** Add manual due (date, amount, note) for a customer.
- **Expected Result:** Appears in ledger; increases outstanding.

### DUE-05 — Manual payment entry
- **Steps:** Add manual payment (unlinked) for customer.
- **Expected Result:** Outstanding decreases; customer profile Total Paid includes it.

### DUE-06 — Filters: all / overdue / due / paid / this month
- **Steps:** Apply each filter; use overdue (≥ 30 days) data if available.
- **Expected Result:** Rows match filter definitions; pagination works.

### DUE-07 — Search customers in dues
- **Steps:** Search by customer name/phone.
- **Expected Result:** Ledger filters to matches.

### DUE-08 — Detail drawer per customer
- **Steps:** Open customer dues drawer/detail.
- **Expected Result:** Running entries, balances, linked invoice numbers visible.

### DUE-09 — Invoice-linked due lines protected
- **Steps:** Attempt edit/delete of invoice-linked due in ways the UI forbids.
- **Expected Result:** Protected lines cannot be freely removed/edited; payments sync rules enforced.

### DUE-10 — Delete linked payment restores invoice balance
- **Preconditions:** Payment recorded against invoice-linked due.
- **Steps:** Delete that payment entry (if allowed).
- **Expected Result:** Invoice balance due restored accordingly.

### DUE-11 — Edit/remove manual entries
- **Steps:** Edit amount/date/note on a manual entry; delete with confirm.
- **Expected Result:** Updates/deletes apply; totals refresh.

---

## 11. Settings — Shop (`SET-SHOP`)

### SET-SHOP-01 — Save shop branding fields
- **Steps:** Settings → Shop; set shop name, tagline, app subtitle, GSTIN, phones, address lines, city, state, pincode; save.
- **Expected Result:** Persist across restart; appear on prints and sidebar (name/subtitle).

### SET-SHOP-02 — Logo and signature image pick
- **Steps:** Pick logo and signature images; save; open tax invoice preview.
- **Expected Result:** Paths stored; images show on print layouts when supported.

### SET-SHOP-03 — Shop name required
- **Steps:** Clear shop name; save.
- **Expected Result:** Validation prevents empty shop name.

---

## 12. Settings — Invoice templates & GST (`SET-INV`)

### SET-INV-01 — Customize cash bill labels
- **Steps:** Invoice tab; change cash title/column labels; watch live sample preview; save.
- **Expected Result:** Preview updates; real cash bill print uses new labels.

### SET-INV-02 — Customize tax invoice labels
- **Steps:** Change tax labels (GSTIN, columns, thanks text, etc.); save; preview tax sample / real tax bill.
- **Expected Result:** Labels persist and print correctly.

### SET-INV-03 — GST monthly summary
- **Preconditions:** Finalized tax invoices in a month (non-estimate).
- **Steps:** View GST tax summary; note taxable, CGST, SGST, IGST, bill count.
- **Expected Result:** Aggregates match finalized tax bills for the period.

### SET-INV-04 — Export GST summary CSV
- **Steps:** Export CSV via UI.
- **Expected Result:** File saved with expected columns/rows; cancel handled.

### SET-INV-05 — Deep link to GST summary tab
- **Steps:** Open settings hash including `gst-summary` if supported.
- **Expected Result:** Invoice tab opens focused on GST summary.

---

## 13. Settings — Metal rates (`RATE`)

### RATE-01 — Upsert today’s rates
- **Steps:** Settings → Metal Rates; set effective date, Gold 22K, 24K, Silver; save.
- **Expected Result:** Saved; shown as latest; history table includes row.

### RATE-02 — Upsert same date overwrites
- **Steps:** Save rates for date D; save again with different values for D.
- **Expected Result:** Single history row for D with latest values.

### RATE-03 — Billing uses latest by effective date
- **Preconditions:** Rates for yesterday and today differ.
- **Steps:** Create bill line today.
- **Expected Result:** Prefill uses latest effective rates (today if present).

### RATE-04 — Reject negative rates
- **Steps:** Enter negative gold/silver rate; save.
- **Expected Result:** Validation error.

### RATE-05 — Rate history table
- **Steps:** Save multiple dates; open history.
- **Expected Result:** Chronological list of saved rates.

---

## 14. Settings — Printers (`PRINT`)

### PRINT-01 — List and refresh printers
- **Steps:** Settings → Printers; Refresh.
- **Expected Result:** Installed printers listed; status Ready/Offline/etc. shown.

### PRINT-02 — Assign cash and tax printers
- **Steps:** Choose default printer for cash and for tax; set paper size (A5/A4/thermal) and copies (1–5); save.
- **Expected Result:** Settings persist; status shows not_installed if chosen printer missing.

### PRINT-03 — Test print cash and tax
- **Steps:** Test print for each role.
- **Expected Result:** Test page prints or clear error if printer unavailable; app does not crash.

### PRINT-04 — Open cash drawer
- **Preconditions:** Hardware/drawer support; option enabled.
- **Steps:** Toggle open cash drawer setting; use Open drawer control.
- **Expected Result:** Command sent when enabled; no-op/safe when disabled or unsupported.

### PRINT-05 — Copies clamped 1–5
- **Steps:** Attempt invalid copy counts if UI allows free entry.
- **Expected Result:** Values clamped to 1–5.

### PRINT-06 — Cash bill print content
- **Preconditions:** Finalized cash bill; shop branding set.
- **Steps:** Print or open `/print/cash-bill/:id`.
- **Expected Result:** Shop name/phones/address/logo; bill no., date, customer; particulars, weight, amount; payment/balance; signature lines; template labels.

### PRINT-07 — Tax invoice print content
- **Steps:** Print or open `/print/tax-invoice/:id` on A4.
- **Expected Result:** GSTIN; columns S.No, Ornaments, HSN/SAC, N.T, G.W, Rate, Wastage %, Labour, Other, Amount; subtotal, CGST/SGST or IGST, discount, grand total, amount in words, payment/balance, signature lines at the bottom of the A4 sheet.

### PRINT-08 — Silent print uses role printer
- **Preconditions:** Distinct cash vs tax printers configured.
- **Steps:** Print one cash and one tax bill.
- **Expected Result:** Jobs target the configured printer for each role (or system dialog when unset).

---

## 15. Settings — Backup & Data (`DATA`)

### DATA-01 — Export database backup
- **Steps:** Settings → Backup; Export; choose destination.
- **Expected Result:** SQLite copy saved; last backup timestamp updates; integrity OK.

### DATA-02 — Restore database
- **Preconditions:** Known-good backup file; note current record counts.
- **Steps:** Restore via dialog; confirm; app reloads windows.
- **Expected Result:** Data matches backup; previous live DB replaced after integrity check.

### DATA-03 — Restore cancelled / bad file
- **Steps:** Cancel dialog; or select non-DB / corrupt file.
- **Expected Result:** Cancel is safe; corrupt file rejected with error; live DB intact.

### DATA-04 — Automatic daily backup on start
- **Steps:** Launch app; inspect `{userData}/backups/` for `jeweltrackerpro-YYYY-MM-DD.db`.
- **Expected Result:** Daily file created; retention keeps last ~14 days.

### DATA-05 — Data tab shows version, path, counts
- **Steps:** Settings → Data.
- **Expected Result:** App version, DB path, product/customer counts accurate.

### DATA-06 — Show logs folder (diagnostics)
- **Steps:** Trigger “show logs folder” if exposed on fatal/error UI or settings.
- **Expected Result:** OS opens logs directory.

### DATA-07 — Fatal error screen
- **Preconditions:** Difficult to force; optional for release QA.
- **Steps:** If a pending fatal exists after crash, relaunch.
- **Expected Result:** FatalErrorGate shows reference/support info; print routes still skip gate.

---

## 16. Cross-feature workflows (`FLOW`)

### FLOW-01 — End-to-end counter sale
- **Steps:** Set rates → create product with stock → create customer → new cash bill → F2 pay full → finalize → print → verify Products stock, Gold & Silver auto sales, Dashboard sales, no dues.
- **Expected Result:** All modules consistent.

### FLOW-02 — Partial pay → dues → collect later
- **Steps:** Finalize with partial payment → Dues shows balance → record payment next day → Dashboard collections & customer profile update.
- **Expected Result:** Balances and KPIs stay consistent across modules.

### FLOW-03 — Product qty edit then finalize deducts pieces
- **Steps:** Set product stock qty on the product form → finalize a bill for that product.
- **Expected Result:** Piece qty decreases by billed qty; bill total and dues are unchanged by the qty edit.

### FLOW-04 — Gold & Silver opening and auto sales
- **Steps:** Set category opening weight → finalize a matching gold/silver sale → view that date.
- **Expected Result:** Sales = billed grams; closing = opening − sales (or override).

### FLOW-05 — Tax invoice GST path
- **Steps:** Tax bill with auto GST → finalize → GST summary includes bill → tax print shows CGST/SGST.
- **Expected Result:** Tax math and report alignment.

### FLOW-06 — Estimate then convert path (as allowed)
- **Steps:** Save estimate; confirm cannot finalize; create separate final bill if convert-not-supported.
- **Expected Result:** Estimates never affect stock/sales; staff can still create a real final bill.

---

## 17. Platform & packaging (`PLAT`)

### PLAT-01 — Offline operation
- **Steps:** Disconnect network; perform create product, bill, dues.
- **Expected Result:** All core flows work offline.

### PLAT-02 — Single-instance lock
- **Steps:** Launch second instance while first is open.
- **Expected Result:** Second instance focuses first / does not open a conflicting second shop window (per Tauri single-instance design).

### PLAT-03 — Window min size
- **Steps:** Resize window toward minimum.
- **Expected Result:** Enforces min ~1024×640; UI remains usable.

### PLAT-04 — Installer smoke (macOS DMG / Windows NSIS)
- **Steps:** Install packaged build; launch; set PIN; create one bill.
- **Expected Result:** App runs; DB in userData; icons present if resources provided.

### PLAT-05 — Data survives app update/reinstall of app binary
- **Steps:** With existing userData DB, replace app build and relaunch.
- **Expected Result:** Same shop data loads (userData preserved).

---

## Automated vs manual coverage

| Area | Automated (approx.) | Manual focus |
|------|---------------------|--------------|
| PIN | Integration (`pin.test.ts`) | AUTH UI, first-run, print-route skip |
| Products | Integration + E2E CRUD; unit form validation | Filters, grid, badges, bulk delete |
| Gold & Silver | Integration opening/auto-sales/category CRUD; E2E opening/sales/delete | History tab, sales override, Auto Calculate Sales |
| Customers | Integration + E2E CRUD/profile | Delete guards with dues-only |
| Billing | Integration finalize/stock/old/GST; E2E create+finalize | Estimates, GST/IGST UI, F2/F4, PDF, printers, filters |
| Dues | Integration sync/pay/delete payment; E2E after finalize | Filters, mark paid, manual entries, drawer |
| Settings | Integration settings/backup; E2E shop/template/printers tabs | Restore UI, rates history, GST CSV, cash drawer hardware |
| Dashboard | Unit stats; E2E KPI cards | Chart, metal cards, refresh, quick links |
| Print routes | E2E header render | Real printer hardware, thermal/A4, copies |
| Diagnostics | Unit + integration | Fatal screen UX |
| Day closing | Schemas/helpers only | **Not testable in UI** until feature ships |

**Suggested priority for release QA:** FLOW-01–05, BILL-09–12, DUE-01–03, DATA-01–02, AUTH-01–06, PRINT-06–08, GS-03/GS-05.

---

## Gaps / high-risk areas

1. **Finalize ↔ stock ↔ dues consistency** — highest business risk; cover insufficient stock and partial pay.
2. **GST / tax invoice** — auto vs manual, IGST vs CGST/SGST, old tax vs old cash in reports.
3. **Backup/restore** — data loss risk; always test on a copy of production DB.
4. **Printers / cash drawer / paper sizes** — hardware-dependent; automate only lightly.
5. **Gold & Silver vs product category naming** — mismatched categories silently miss weight sales.
6. **Estimates vs finals** — ensure estimates never hit sales KPIs or auto weight sales.
7. **Day closing** — IPC/types/migration exist but **no shop UI**; do not mark as done for v1.0 user acceptance until exposed.
8. **No role-based permissions** — only shared PIN; do not invent multi-user ACL tests.

---

*Generated from codebase exploration of routes, sidebar, IPC API, `PROJECT_SCOPE.md`, and existing Vitest/Playwright suites. Update this file when features ship or change.*
