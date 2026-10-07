import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from './layout/AppLayout'
import { RequireAuth } from '../features/auth/RequireAuth'
import { LoginPage } from '../features/auth/LoginPage'
import { ChangePasswordPage } from '../features/auth/ChangePasswordPage'
import { CustomersPage } from '../features/customers/CustomersPage'
import { DuesPage } from '../features/dues/DuesPage'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { BillingLayout } from '../features/invoices/BillingLayout'
import { InvoiceRouteRedirect } from '../features/invoices/InvoiceRouteRedirect'
import { InvoicesPage } from '../features/invoices/InvoicesPage'
import { InventoryIndexRedirect, InventoryLayout } from '../features/inventory/InventoryLayout'
import { ProductsPage } from '../features/products/ProductsPage'
import { StockPage } from '../features/stock/StockPage'
import { InwardsPage } from '../features/inwards/InwardsPage'
import { OldGoldPurchasesPage } from '../features/oldGoldPurchases/OldGoldPurchasesPage'
import { SuppliersPage } from '../features/suppliers/SuppliersPage'
import { ReportsLayout } from '../features/reports/ReportsLayout'
import { ReportViewPage } from '../features/reports/ReportViewPage'
import { MetalRatesPage } from '../features/rates/MetalRatesPage'
import {
  GoldSavingsIndexRedirect,
  GoldSavingsLayout,
} from '../features/goldSavings/GoldSavingsLayout'
import { GoldSavingsDashboardPage } from '../features/goldSavings/GoldSavingsDashboardPage'
import { SchemeConfigPage } from '../features/goldSavings/schemes/SchemeConfigPage'
import { EnrollmentPage } from '../features/goldSavings/enrollment/EnrollmentPage'
import { AccountsListPage } from '../features/goldSavings/accounts/AccountsListPage'
import { AccountDetailPage } from '../features/goldSavings/accounts/AccountDetailPage'
import { CollectionsPage } from '../features/goldSavings/collections/CollectionsPage'
import { SchemeLedgerPage } from '../features/goldSavings/ledger/SchemeLedgerPage'
import { MaturityPage } from '../features/goldSavings/maturity/MaturityPage'
import { GoldSavingsReportsPage } from '../features/goldSavings/reports/GoldSavingsReportsPage'
import { OverdueAgingPage } from '../features/goldSavings/overdue/OverdueAgingPage'
import { RouteErrorPage } from '../components/RouteErrorPage'
import { NotFoundPage } from '../components/NotFoundPage'

const UsersPage = lazy(() =>
  import('../features/users/UsersPage').then((module) => ({ default: module.UsersPage })),
)
const SettingsPage = lazy(() =>
  import('../features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })),
)
const CashBillPrintPage = lazy(() =>
  import('../features/invoices/CashBillPrintPage').then((module) => ({
    default: module.CashBillPrintPage,
  })),
)
const TaxInvoicePrintPage = lazy(() =>
  import('../features/invoices/TaxInvoicePrintPage').then((module) => ({
    default: module.TaxInvoicePrintPage,
  })),
)
const SampleBillPrintPage = lazy(() =>
  import('../features/invoices/SampleBillPrintPage').then((module) => ({
    default: module.SampleBillPrintPage,
  })),
)
const TestPrintPage = lazy(() =>
  import('../features/invoices/TestPrintPage').then((module) => ({ default: module.TestPrintPage })),
)
const InvoiceEditorPage = lazy(() =>
  import('../features/invoices/InvoiceEditorPage').then((module) => ({
    default: module.InvoiceEditorPage,
  })),
)
const OldBillPage = lazy(() =>
  import('../features/invoices/OldBillPage').then((module) => ({ default: module.OldBillPage })),
)
const PledgeEditorPage = lazy(() =>
  import('../features/pledges/PledgeEditorPage').then((module) => ({
    default: module.PledgeEditorPage,
  })),
)
const PledgePrintPage = lazy(() =>
  import('../features/pledges/PledgePrintPage').then((module) => ({
    default: module.PledgePrintPage,
  })),
)
const PledgeReleasePrintPage = lazy(() =>
  import('../features/pledges/PledgeReleasePrintPage').then((module) => ({
    default: module.PledgeReleasePrintPage,
  })),
)
const MetalDayPrintPage = lazy(() =>
  import('../features/stock/MetalDayPrintPage').then((module) => ({
    default: module.MetalDayPrintPage,
  })),
)
const ClosingSummaryPrintPage = lazy(() =>
  import('../features/stock/ClosingSummaryPrintPage').then((module) => ({
    default: module.ClosingSummaryPrintPage,
  })),
)
const PurchaseInvoicePrintPage = lazy(() =>
  import('../features/inwards/PurchaseInvoicePrintPage').then((module) => ({
    default: module.PurchaseInvoicePrintPage,
  })),
)
const GsReceiptPrintPage = lazy(() =>
  import('../features/goldSavings/print/GsReceiptPrintPage').then((module) => ({
    default: module.GsReceiptPrintPage,
  })),
)
const GsPassbookPrintPage = lazy(() =>
  import('../features/goldSavings/print/GsPassbookPrintPage').then((module) => ({
    default: module.GsPassbookPrintPage,
  })),
)

export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    children: [
  {
    path: '/print/cash-bill/:id',
    element: <CashBillPrintPage />,
  },
  {
    path: '/print/tax-invoice/:id',
    element: <TaxInvoicePrintPage />,
  },
  {
    path: '/print/pledge/:id',
    element: <PledgePrintPage />,
  },
  {
    path: '/print/pledge-release/:id',
    element: <PledgeReleasePrintPage />,
  },
  {
    path: '/print/metal-day/:date/:metal',
    element: <MetalDayPrintPage />,
  },
  {
    path: '/print/stock-closing/:date',
    element: <ClosingSummaryPrintPage />,
  },
  {
    path: '/print/test/:role',
    element: <TestPrintPage />,
  },
  {
    path: '/print/purchase/:id',
    element: <PurchaseInvoicePrintPage />,
  },
  {
    path: '/print/sample/:kind',
    element: <SampleBillPrintPage />,
  },
  {
    path: '/print/gs-receipt/:id',
    element: <GsReceiptPrintPage />,
  },
  {
    path: '/print/gs-passbook/:id',
    element: <GsPassbookPrintPage />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/change-password',
    element: (
      <RequireAuth>
        <ChangePasswordPage />
      </RequireAuth>
    ),
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      {
        path: 'billing',
        element: <BillingLayout />,
        children: [
          { index: true, element: <InvoicesPage /> },
          { path: 'cash', element: <Navigate to="/billing" replace /> },
          { path: 'tax', element: <Navigate to="/billing" replace /> },
          { path: 'adagu', element: <Navigate to="/billing" replace /> },
          { path: 'cash/new', element: <InvoiceEditorPage /> },
          { path: 'tax/new', element: <InvoiceEditorPage /> },
          { path: 'adagu/new', element: <PledgeEditorPage /> },
          { path: 'cash/:id/detail', element: <InvoiceEditorPage /> },
          { path: 'tax/:id/detail', element: <InvoiceEditorPage /> },
          { path: 'cash/:id', element: <InvoiceEditorPage /> },
          { path: 'tax/:id', element: <InvoiceEditorPage /> },
          { path: 'adagu/:id', element: <PledgeEditorPage /> },
          { path: 'new', element: <InvoiceRouteRedirect mode="new" /> },
          { path: 'old', element: <OldBillPage /> },
          { path: ':id', element: <InvoiceRouteRedirect mode="edit" /> },
        ],
      },
      { path: 'invoices', element: <Navigate to="/billing" replace /> },
      { path: 'invoices/new', element: <Navigate to="/billing/cash/new" replace /> },
      { path: 'invoices/:id', element: <InvoiceRouteRedirect mode="edit" /> },
      {
        path: 'inventory',
        element: <InventoryLayout />,
        children: [
          { index: true, element: <InventoryIndexRedirect /> },
          { path: 'products', element: <ProductsPage /> },
          { path: 'stock', element: <StockPage /> },
          { path: 'inwards', element: <InwardsPage /> },
          { path: 'old-gold', element: <OldGoldPurchasesPage /> },
          { path: 'suppliers', element: <SuppliersPage /> },
        ],
      },
      { path: 'products', element: <Navigate to="/inventory/products" replace /> },
      { path: 'stock', element: <Navigate to="/inventory/stock" replace /> },
      { path: 'suppliers', element: <Navigate to="/inventory/suppliers" replace /> },
      { path: 'inwards', element: <Navigate to="/inventory/inwards" replace /> },
      { path: 'inwards/*', element: <Navigate to="/inventory/inwards" replace /> },
      { path: 'customers', element: <CustomersPage /> },
      { path: 'dues', element: <DuesPage /> },
      { path: 'reports',
        element: <ReportsLayout />,
        children: [
          { index: true, element: <Navigate to="/reports/daily-sales" replace /> },
          { path: ':reportId', element: <ReportViewPage /> },
        ],
      },
      { path: 'rates', element: <MetalRatesPage /> },
      {
        path: 'gold-savings',
        element: <GoldSavingsLayout />,
        children: [
          { index: true, element: <GoldSavingsIndexRedirect /> },
          { path: 'dashboard', element: <GoldSavingsDashboardPage /> },
          { path: 'schemes', element: <SchemeConfigPage /> },
          { path: 'enroll', element: <EnrollmentPage /> },
          { path: 'accounts', element: <AccountsListPage /> },
          { path: 'accounts/:id', element: <AccountDetailPage /> },
          { path: 'collections', element: <CollectionsPage /> },
          { path: 'ledger', element: <SchemeLedgerPage /> },
          { path: 'maturity', element: <MaturityPage /> },
          { path: 'overdue', element: <OverdueAgingPage /> },
          { path: 'reports', element: <GoldSavingsReportsPage /> },
        ],
      },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'users', element: <UsersPage /> },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
    ],
  },
])
