import { lazy } from 'react'

/**
 * Every page of the application, loaded on demand.
 *
 * These live apart from `routes.tsx` because a module that exports components
 * and something else (a router, in this case) breaks React Fast Refresh. It also
 * keeps the print entry from pulling any of them in, since nothing here imports
 * the application shell.
 */
export const DashboardPage = lazy(() =>
  import('../features/dashboard/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  })),
)
export const InvoicesPage = lazy(() =>
  import('../features/invoices/InvoicesPage').then((module) => ({
    default: module.InvoicesPage,
  })),
)
export const InvoiceEditorPage = lazy(() =>
  import('../features/invoices/InvoiceEditorPage').then((module) => ({
    default: module.InvoiceEditorPage,
  })),
)
export const OldBillPage = lazy(() =>
  import('../features/invoices/OldBillPage').then((module) => ({ default: module.OldBillPage })),
)
export const PledgeEditorPage = lazy(() =>
  import('../features/pledges/PledgeEditorPage').then((module) => ({
    default: module.PledgeEditorPage,
  })),
)
export const ProductsPage = lazy(() =>
  import('../features/products/ProductsPage').then((module) => ({ default: module.ProductsPage })),
)
export const StockPage = lazy(() =>
  import('../features/stock/StockPage').then((module) => ({ default: module.StockPage })),
)
export const InwardsPage = lazy(() =>
  import('../features/inwards/InwardsPage').then((module) => ({ default: module.InwardsPage })),
)
export const OldGoldPurchasesPage = lazy(() =>
  import('../features/oldGoldPurchases/OldGoldPurchasesPage').then((module) => ({
    default: module.OldGoldPurchasesPage,
  })),
)
export const SuppliersPage = lazy(() =>
  import('../features/suppliers/SuppliersPage').then((module) => ({
    default: module.SuppliersPage,
  })),
)
export const CustomersPage = lazy(() =>
  import('../features/customers/CustomersPage').then((module) => ({
    default: module.CustomersPage,
  })),
)
export const DuesPage = lazy(() =>
  import('../features/dues/DuesPage').then((module) => ({ default: module.DuesPage })),
)
export const ReportViewPage = lazy(() =>
  import('../features/reports/ReportViewPage').then((module) => ({
    default: module.ReportViewPage,
  })),
)
export const MetalRatesPage = lazy(() =>
  import('../features/rates/MetalRatesPage').then((module) => ({ default: module.MetalRatesPage })),
)
export const GoldSavingsDashboardPage = lazy(() =>
  import('../features/goldSavings/GoldSavingsDashboardPage').then((module) => ({
    default: module.GoldSavingsDashboardPage,
  })),
)
export const SchemeConfigPage = lazy(() =>
  import('../features/goldSavings/schemes/SchemeConfigPage').then((module) => ({
    default: module.SchemeConfigPage,
  })),
)
export const EnrollmentPage = lazy(() =>
  import('../features/goldSavings/enrollment/EnrollmentPage').then((module) => ({
    default: module.EnrollmentPage,
  })),
)
export const AccountsListPage = lazy(() =>
  import('../features/goldSavings/accounts/AccountsListPage').then((module) => ({
    default: module.AccountsListPage,
  })),
)
export const AccountDetailPage = lazy(() =>
  import('../features/goldSavings/accounts/AccountDetailPage').then((module) => ({
    default: module.AccountDetailPage,
  })),
)
export const CollectionsPage = lazy(() =>
  import('../features/goldSavings/collections/CollectionsPage').then((module) => ({
    default: module.CollectionsPage,
  })),
)
export const SchemeLedgerPage = lazy(() =>
  import('../features/goldSavings/ledger/SchemeLedgerPage').then((module) => ({
    default: module.SchemeLedgerPage,
  })),
)
export const MaturityPage = lazy(() =>
  import('../features/goldSavings/maturity/MaturityPage').then((module) => ({
    default: module.MaturityPage,
  })),
)
export const OverdueAgingPage = lazy(() =>
  import('../features/goldSavings/overdue/OverdueAgingPage').then((module) => ({
    default: module.OverdueAgingPage,
  })),
)
export const GoldSavingsReportsPage = lazy(() =>
  import('../features/goldSavings/reports/GoldSavingsReportsPage').then((module) => ({
    default: module.GoldSavingsReportsPage,
  })),
)
export const ChangePasswordPage = lazy(() =>
  import('../features/auth/ChangePasswordPage').then((module) => ({
    default: module.ChangePasswordPage,
  })),
)
export const SettingsPage = lazy(() =>
  import('../features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })),
)
export const UsersPage = lazy(() =>
  import('../features/users/UsersPage').then((module) => ({ default: module.UsersPage })),
)
