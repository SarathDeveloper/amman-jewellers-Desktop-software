import { createBrowserRouter } from 'react-router-dom'
import { RouteErrorPage } from '../components/RouteErrorPage'
import {
  CashBillPrintPage,
  ClosingSummaryPrintPage,
  GsPassbookPrintPage,
  GsReceiptPrintPage,
  MetalDayPrintPage,
  PledgePrintPage,
  PledgeReleasePrintPage,
  PurchaseInvoicePrintPage,
  SampleBillPrintPage,
  TaxInvoicePrintPage,
  TestPrintPage,
} from './lazyPrintPages'

/**
 * Routes served by `print.html`.
 *
 * Print documents load in an iframe, and the iframe used to boot the whole
 * application (every page module, the auth session check, and the shop branding
 * provider) just to render one template. That was the dominant cost of opening
 * a preview on a slow machine. These routes are their own entry, so the frame
 * only loads the template it needs.
 *
 * Keep this file free of auth, providers, and app-shell imports: anything
 * imported here also ships in the print bundle.
 */
export const printRouter = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/print/cash-bill/:id', element: <CashBillPrintPage /> },
      { path: '/print/tax-invoice/:id', element: <TaxInvoicePrintPage /> },
      { path: '/print/pledge/:id', element: <PledgePrintPage /> },
      { path: '/print/pledge-release/:id', element: <PledgeReleasePrintPage /> },
      { path: '/print/metal-day/:date/:metal', element: <MetalDayPrintPage /> },
      { path: '/print/stock-closing/:date', element: <ClosingSummaryPrintPage /> },
      { path: '/print/test/:role', element: <TestPrintPage /> },
      { path: '/print/purchase/:id', element: <PurchaseInvoicePrintPage /> },
      { path: '/print/sample/:kind', element: <SampleBillPrintPage /> },
      { path: '/print/gs-receipt/:id', element: <GsReceiptPrintPage /> },
      { path: '/print/gs-passbook/:id', element: <GsPassbookPrintPage /> },
      {
        // A plain message, not the app's not-found page: that one links into the
        // application, which would navigate this frame away from the document.
        path: '*',
        element: <p style={{ padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>Document not found</p>,
      },
    ],
  },
])
