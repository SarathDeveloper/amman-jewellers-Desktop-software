# Tax Invoice billing improvements

Incrementally extend the existing Tax Invoice / Cash Bill flow to support Old Gold/Exchange (dedicated table), Round Off, partial/mixed payments, multiple post-creation payments, a proper Bill Summary, a success screen, and an invoice detail view with payment history. Reuse the existing calculation engine, dues-payment system, and UI components. Rename "Borrower Details" to "Customer Details" on sale bills.

## Existing architecture (reuse, do not duplicate)

- Calculation: [shared/billing/pricing.ts](shared/billing/pricing.ts) — `computeLinePricing`, `computeInvoiceTax` (3% intra-state → 1.5% CGST + 1.5% SGST), `computeInvoiceTotals`, `roundMoney`.
- Server compute: [server/billing/invoiceCompute.ts](server/billing/invoiceCompute.ts) — `computeInvoiceLines` (already handles `lineKind: 'exchange'` as a negative line), `computeInvoiceAmounts`.
- Editor: [src/features/invoices/InvoiceEditorPage.tsx](src/features/invoices/InvoiceEditorPage.tsx) + [src/features/invoices/invoiceEditorHelpers.ts](src/features/invoices/invoiceEditorHelpers.ts).
- API: [server/routes/invoices.routes.ts](server/routes/invoices.routes.ts) — `saveDraftInvoice`, `finalize`, `mapInvoice`.
- Payments after finalize: already supported via dues. [server/dues/invoiceSync.ts](server/dues/invoiceSync.ts) creates a `customer_dues` `due` row on finalize; [server/routes/dues.routes.ts](server/routes/dues.routes.ts) `insertPayment` (around line 248) adds a `payment` row and updates `invoices.amount_paid` / `balance_due`. Client: `api.recordDuePayment`.
- Print: [src/features/invoices/buildTaxInvoiceData.ts](src/features/invoices/buildTaxInvoiceData.ts), `buildCashBillData.ts`, `TaxInvoicePrint.tsx`, `CashBillPrint.tsx`.

```mermaid
flowchart LR
  Items --> LinePricing --> Subtotal
  Subtotal --> Discount --> Taxable
  Taxable --> GST --> InvoiceTotal
  InvoiceTotal --> OldGold --> AmountBeforeRoundOff
  AmountBeforeRoundOff --> RoundOff --> AmountPayable
  AmountPayable --> Payments --> BalanceDue
  BalanceDue --> Status[paid partial unpaid]
```

## Phase 1 — Data model + calculation (no UI breakage)

### 1.1 Migration `027_invoice_old_gold_round_off.sql`
- `CREATE TABLE invoice_old_gold (id INTEGER PK, invoice_id INTEGER NOT NULL, description TEXT, gross_weight REAL, stone_weight REAL, net_weight REAL, purity TEXT, rate_per_gram REAL, deduction_pct REAL, gross_value REAL, deduction_amount REAL, final_value REAL, created_at TEXT, FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE)`.
- `ALTER TABLE invoices ADD COLUMN round_off REAL NOT NULL DEFAULT 0`.
- `ALTER TABLE invoices ADD COLUMN amount_payable REAL NOT NULL DEFAULT 0`.
- Backfill: `UPDATE invoices SET amount_payable = total WHERE amount_payable = 0`.
- Register in [server/db/migrations.ts](server/db/migrations.ts) as version 27.

### 1.2 Shared types — [shared/types.ts](shared/types.ts)
- Add `OldGoldItemInput` and `OldGoldItem` (id, invoiceId, description, grossWeight, stoneWeight, netWeight, purity, ratePerGram, deductionPct, grossValue, deductionAmount, finalValue).
- Add `MixedPaymentPart` `{ mode: 'cash'|'upi'|'card'; amount: number }`.
- Add `InvoicePayment` `{ id, date, mode, amount, note, createdAt }` (read-only view from `customer_dues`).
- Extend `InvoiceInput` / `InvoiceUpdateInput` with `oldGold?: OldGoldItemInput[]`, `roundOff?: number`, `mixedPayments?: MixedPaymentPart[]`.
- Extend `Invoice` with `oldGold: OldGoldItem[]`, `roundOff: number`, `amountPayable: number`, `payments: InvoicePayment[]`.

### 1.3 Schemas — [shared/schemas.ts](shared/schemas.ts)
- `oldGoldItemInputSchema` (positive gross/net weight, nonnegative rate/deduction).
- Extend `invoiceBaseSchema` with `oldGold`, `roundOff` (signed, `|roundOff| < amountBeforeRoundOff`), `mixedPayments` (each amount positive; sum ≤ amountPayable when `paymentMode === 'mixed'`).

### 1.4 Calculation — new `shared/billing/billSummary.ts`
- `computeOldGoldValue(input)` → `{ grossValue, deductionAmount, finalValue }` using `roundMoney`.
- `computeBillSummary({ lineSubtotals, discount, autoTax, useIgst, manualTax, oldGold, roundOff })`:
  - Reuse `computeInvoiceTotals` for `subtotal/discount/tax/total` (= invoiceTotal).
  - `oldGoldTotal = sum(finalValue)`.
  - `amountBeforeRoundOff = invoiceTotal - oldGoldTotal`.
  - `amountPayable = amountBeforeRoundOff + roundOff` (signed roundOff; auto-suggest = nearest rupee − amountBeforeRoundOff).
  - Return all fields for the Bill Summary hierarchy.
- Keep `computeInvoiceTotals` untouched (used by cash bill, reports, historical).

### 1.5 Server — [server/routes/invoices.routes.ts](server/routes/invoices.routes.ts)
- `saveDraftInvoice`: accept `oldGold`, `roundOff`, `mixedPayments`. Compute `amountPayable` via `computeBillSummary`. Insert/update `invoice_old_gold` rows. Store `round_off`, `amount_payable`. For mixed payments, store the sum as `amount_paid`.
- `finalize`: validate old-gold fields, round-off, payment ≤ amountPayable. Existing stock-movement loop unchanged (exchange lines already skipped). Extend `syncDueEntryForFinalInvoice` to write one `customer_dues` payment row per mixed part.
- `mapInvoice`: load `invoice_old_gold` rows and `customer_dues` payment rows into `payments`.
- New `POST /:id/payments` endpoint reusing the existing dues `insertPayment` so multiple later payments keep flowing through the same ledger.

## Phase 2 — Editor UI (InvoiceEditorPage.tsx)

All changes inside the existing `adagu-grid-container` layout; reuse `adagu-design-card`, `adagu-form-fields`, `adagu-calculated-*` classes.

### 2.1 Rename
- "Borrower Details" → "Customer Details" on sale bills (keep "Borrower Details" only on the Adagu/Pledge editor).

### 2.2 Old Gold / Exchange card (below items table)
- New `OldGoldEditor` sub-component in [src/features/invoices/oldGoldEditor.tsx](src/features/invoices/oldGoldEditor.tsx). State: `oldGold: OldGoldItemInput[]`.
- Each row: description, grossWeight, stoneWeight, netWeight (auto = gross − stone), purity (22K/24K/silver), ratePerGram, deductionPct. Auto-compute grossValue, deductionAmount, finalValue per row.
- "+ Add Old Gold" button. Editable + removable. Empty by default.
- `oldGoldTotal` shown at the bottom of the card.

### 2.3 Payment card redesign
- Three highlights: **Amount Payable** (burgundy/gold, largest), **Amount Paid** (editable), **Balance Due** (computed = payable − paid, never manually set).
- Payment method buttons: Cash / UPI / Card / Mixed (existing `paymentModes`).
- When `mixed`: render three amount inputs via a new `MixedPaymentEditor`; validate `sum ≤ amountPayable`; `amountPaid = sum(parts)`.
- Status chip: PAID / PARTIAL / UNPAID derived from `balanceDue`.

### 2.4 Bill Summary card (replace "Calculated Summary")
- New `BillSummaryCard` rendering the hierarchy from `computeBillSummary`:
  - Items / Jewellery Value, Making Charges, Other Charges, Discount → Taxable Amount
  - CGST 1.5%, SGST 1.5% → Invoice Total
  - Old Gold Exchange (−) → Amount Before Round Off
  - Round Off (signed, editable input with auto-suggest) → **AMOUNT PAYABLE**
  - Paid → Balance Due → Status
- Round-off input: auto-calc to nearest rupee; user can override; validate `amountPayable >= 0`.

### 2.5 Finalize validation + success screen
- Extend existing `validatePayload` with old-gold + round-off + mixed-payment checks.
- After `finalize()`, show new `InvoiceSuccessModal` ([src/features/invoices/InvoiceSuccessModal.tsx](src/features/invoices/InvoiceSuccessModal.tsx)): invoice no, customer, payable, paid, balance, status, actions [Print] [WhatsApp] [Download PDF] [View Invoice] [New Bill]. Wire Print/PDF to existing `printBill` / `openPrintWindow`; WhatsApp to `https://wa.me/?text=...`; View Invoice navigates to the detail screen.

### 2.6 Editor state wiring
- Add `oldGold`, `roundOff`, `mixedPayments` state to `InvoiceEditorPage`. Pass into `buildPayload`. Load from `invoice.oldGold` / `invoice.roundOff` when editing.
- Extend `computeEditorTotals` to also return `oldGoldTotal`, `amountBeforeRoundOff`, `amountPayable` by calling `computeBillSummary` (add fields, keep backward-compatible shape).

## Phase 3 — Invoice detail + multiple payments

### 3.1 Invoice detail screen
- Reuse `InvoiceEditorPage` in read-only mode when `status === 'final'` (disable inputs, hide Save/Finalize, show "Record Payment" + "Print" + "PDF").
- Sections: Invoice info, Customer, Items, Old Gold Exchange, Tax breakdown, Round Off, Amount Payable, **Payment History** (from `invoice.payments`), Balance Due, Status, Activity timeline (created/finalized timestamps).
- "+ Record Payment" opens `RecordPaymentModal` calling `api.recordDuePayment` (or the new `POST /:id/payments`). On success, refetch the invoice; `amount_paid` and `balance_due` update from the ledger; never maintain a local balance.

### 3.2 InvoicesPage link
- In [src/features/invoices/InvoicesPage.tsx](src/features/invoices/InvoicesPage.tsx), the row menu "View" navigates to the detail screen for final invoices; "Edit" stays for drafts.

## Phase 4 — Print + reports

### 4.1 Print builders
- [src/features/invoices/buildTaxInvoiceData.ts](src/features/invoices/buildTaxInvoiceData.ts) and `buildCashBillData.ts`: add Old Gold Exchange block, Round Off line, Amount Payable, and Payment History lines. Reuse `invoice.oldGold`, `invoice.roundOff`, `invoice.amountPayable`, `invoice.payments`.
- Update `TaxInvoicePrint.tsx` / `CashBillPrint.tsx` and their CSS to render the new lines without changing the existing layout shell.

### 4.2 Tax report
- The tax report in [server/routes/invoices.routes.ts](server/routes/invoices.routes.ts) (`/tax-report`) uses `subtotal - discount` as taxable. Keep as-is; round-off and old-gold do not affect GST base (old gold is a payment adjustment, not a tax adjustment) — confirm with the shop's existing rule before changing this.

## Phase 5 — Edge cases (validation in schemas + UI)

- No old gold → `oldGoldTotal = 0`, `amountBeforeRoundOff = invoiceTotal`.
- Multiple old gold items → sum `finalValue`.
- Full / partial / zero payment → status derived from `balanceDue`.
- Mixed payment `sum > amountPayable` → schema rejects; UI shows inline error.
- Multiple later payments → each inserts a `customer_dues` payment row; `amount_paid` and `balance_due` recomputed in `insertPayment`.
- Round off positive/negative/zero → signed storage; UI shows `+₹` / `−₹` / `₹0`.
- Finalized invoice not editable → detail screen is read-only; `assertDraft` already blocks edits server-side.
- Prevent negative balance → `balanceDue = max(0, amountPayable − totalPaid)`.

## Verification

- `npx tsc -p tsconfig.app.json --noEmit` and `npx tsc -p tsconfig.server.json --noEmit` (ignoring TS5101 baseUrl deprecation).
- `npm run lint`.
- `npm run build`.
- Manual: create a tax invoice with 2 items + 2 old-gold entries + partial mixed payment; finalize; confirm Bill Summary math; open detail; record 2 later payments; confirm balance reaches 0 and status becomes PAID; print and PDF show old-gold + round-off + payment history.
- Cash bill (no GST): old gold and round-off still apply; tax rows hidden.

## Out of scope

- No changes to Adagu/Pledge flow beyond the "Borrower" rename boundary.
- No new tax rule — reuse 3% intra-state GST.
- No overpayment support (spec says validate `sum ≤ amountPayable` unless already supported; current code rejects `amountPaid > total`).

## Summary the user asked for

- **Files changed**: `shared/types.ts`, `shared/schemas.ts`, new `shared/billing/billSummary.ts`, `server/db/migrations/027_invoice_old_gold_round_off.sql`, `server/db/migrations.ts`, `server/routes/invoices.routes.ts`, `server/dues/invoiceSync.ts`, `src/lib/api.ts`, `src/features/invoices/InvoiceEditorPage.tsx`, `invoiceEditorHelpers.ts`, new `oldGoldEditor.tsx`, new `MixedPaymentEditor.tsx`, new `BillSummaryCard.tsx`, new `InvoiceSuccessModal.tsx`, new `RecordPaymentModal.tsx`, `InvoicesPage.tsx`, `buildTaxInvoiceData.ts`, `buildCashBillData.ts`, `TaxInvoicePrint.tsx`, `CashBillPrint.tsx`, plus CSS.
- **Calculation logic**: new `computeBillSummary` + `computeOldGoldValue` in `shared/billing/billSummary.ts`; `computeInvoiceTotals` reused unchanged.
- **Database/API changes**: new `invoice_old_gold` table; new `round_off` + `amount_payable` columns on `invoices`; new `POST /api/invoices/:id/payments`; `mapInvoice` returns old-gold + payments.
- **UI changes**: Customer rename, Old Gold card, redesigned Payment card with mixed support, Bill Summary hierarchy, success modal, invoice detail with payment history and Record Payment.
- **Migration required**: yes, `027_invoice_old_gold_round_off.sql` (auto-runs on app start via the existing migration runner).
- **Remaining assumptions**: old-gold is a payment adjustment (reduces amount payable, not GST base); round-off is signed and user-editable with auto-suggest; multiple payments reuse the existing `customer_dues` ledger (no separate payments table).
