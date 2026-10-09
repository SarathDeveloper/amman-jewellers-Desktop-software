import { lazy } from 'react'

/**
 * The print templates, loaded on demand by the print document.
 *
 * Kept apart from `printRoutes.tsx` so that file only exports the router, which
 * React Fast Refresh requires. Anything imported here ends up in the print
 * bundle, so these must stay free of auth and app-shell imports.
 */
export const CashBillPrintPage = lazy(() =>
  import('../features/invoices/CashBillPrintPage').then((module) => ({
    default: module.CashBillPrintPage,
  })),
)
export const TaxInvoicePrintPage = lazy(() =>
  import('../features/invoices/TaxInvoicePrintPage').then((module) => ({
    default: module.TaxInvoicePrintPage,
  })),
)
export const SampleBillPrintPage = lazy(() =>
  import('../features/invoices/SampleBillPrintPage').then((module) => ({
    default: module.SampleBillPrintPage,
  })),
)
export const TestPrintPage = lazy(() =>
  import('../features/invoices/TestPrintPage').then((module) => ({ default: module.TestPrintPage })),
)
export const PledgePrintPage = lazy(() =>
  import('../features/pledges/PledgePrintPage').then((module) => ({
    default: module.PledgePrintPage,
  })),
)
export const PledgeReleasePrintPage = lazy(() =>
  import('../features/pledges/PledgeReleasePrintPage').then((module) => ({
    default: module.PledgeReleasePrintPage,
  })),
)
export const PledgeNoticePrintPage = lazy(() =>
  import('../features/pledges/PledgeNoticePrintPage').then((module) => ({
    default: module.PledgeNoticePrintPage,
  })),
)
export const MetalDayPrintPage = lazy(() =>
  import('../features/stock/MetalDayPrintPage').then((module) => ({
    default: module.MetalDayPrintPage,
  })),
)
export const ClosingSummaryPrintPage = lazy(() =>
  import('../features/stock/ClosingSummaryPrintPage').then((module) => ({
    default: module.ClosingSummaryPrintPage,
  })),
)
export const PurchaseInvoicePrintPage = lazy(() =>
  import('../features/inwards/PurchaseInvoicePrintPage').then((module) => ({
    default: module.PurchaseInvoicePrintPage,
  })),
)
export const OldGoldPurchasePrintPage = lazy(() =>
  import('../features/oldGoldPurchases/print/OldGoldPurchasePrintPage').then((module) => ({
    default: module.OldGoldPurchasePrintPage,
  })),
)
export const GsReceiptPrintPage = lazy(() =>
  import('../features/goldSavings/print/GsReceiptPrintPage').then((module) => ({
    default: module.GsReceiptPrintPage,
  })),
)
export const GsPassbookPrintPage = lazy(() =>
  import('../features/goldSavings/print/GsPassbookPrintPage').then((module) => ({
    default: module.GsPassbookPrintPage,
  })),
)
export const GsRefundPrintPage = lazy(() =>
  import('../features/goldSavings/print/GsRefundPrintPage').then((module) => ({
    default: module.GsRefundPrintPage,
  })),
)
export const GsCallListPrintPage = lazy(() =>
  import('../features/goldSavings/print/GsCallListPrintPage').then((module) => ({
    default: module.GsCallListPrintPage,
  })),
)
export const GsBatchReceiptPrintPage = lazy(() =>
  import('../features/goldSavings/print/GsBatchReceiptPrintPage').then((module) => ({
    default: module.GsBatchReceiptPrintPage,
  })),
)
