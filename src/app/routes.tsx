import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from './layout/AppLayout'
import { RequireAuth } from '../features/auth/RequireAuth'
import { LoginPage } from '../features/auth/LoginPage'
import { BillingLayout } from '../features/invoices/BillingLayout'
import { InvoiceRouteRedirect } from '../features/invoices/InvoiceRouteRedirect'
import { InventoryIndexRedirect, InventoryLayout } from '../features/inventory/InventoryLayout'
import { ReportsLayout } from '../features/reports/ReportsLayout'
import {
  GoldSavingsIndexRedirect,
  GoldSavingsLayout,
} from '../features/goldSavings/GoldSavingsLayout'
import { RouteErrorPage } from '../components/RouteErrorPage'
import { NotFoundPage } from '../components/NotFoundPage'
import {
  AccountDetailPage,
  AccountsListPage,
  ChangePasswordPage,
  CollectionsPage,
  CustomersPage,
  DashboardPage,
  DuesPage,
  EnrollmentPage,
  GoldSavingsDashboardPage,
  GoldSavingsReportsPage,
  InvoicesPage,
  InvoiceEditorPage,
  InwardsPage,
  MetalRatesPage,
  MaturityPage,
  OldBillPage,
  OldGoldLotPage,
  OldGoldPurchasesPage,
  OverdueAgingPage,
  PledgeEditorPage,
  ProductsPage,
  ReportViewPage,
  SchemeConfigPage,
  SchemeLedgerPage,
  SettingsPage,
  StockPage,
  SuppliersPage,
  UsersPage,
} from './lazyPages'

/**
 * The application's routes.
 *
 * Layouts and the auth gate are static because they wrap everything. Pages come
 * from `lazyPages.ts`. The `/print/*` routes are not here: they are served by a
 * separate `print.html` document, see `src/print/printRoutes.tsx`.
 */
export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    children: [
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
              { path: 'old-gold-lot', element: <OldGoldLotPage /> },
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
          {
            path: 'reports',
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
