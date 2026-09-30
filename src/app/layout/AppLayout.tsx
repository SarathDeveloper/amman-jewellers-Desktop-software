import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom'
import {
  BarChart3,
  ChartNoAxesCombined,
  Gem,
  House,
  LogOut,
  Package,
  Receipt,
  Settings,
  Users,
  UserCog,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { FeatureKey } from '@shared/types'
import { useAuth } from '../../features/auth/authContext'
import { canAccessInventory } from '../../features/inventory/inventoryTabs'
import { useShopBranding } from '../../features/settings/shopBrandingContext'
import { localImageSrc } from '../../features/invoices/mapShopDisplay'

const APP_VERSION = '1.0.0'

const links: {
  to: string
  label: string
  icon: LucideIcon
  feature: FeatureKey | 'inventory' | 'users'
  adminOnly?: boolean
}[] = [
  { to: '/dashboard', label: 'Dashboard', icon: House, feature: 'dashboard' },
  { to: '/billing', label: 'Billing', icon: Receipt, feature: 'billing' },
  { to: '/inventory', label: 'Inventory', icon: Package, feature: 'inventory' },
  { to: '/dues', label: 'Dues', icon: Wallet, feature: 'dues' },
  { to: '/customers', label: 'Customers', icon: Users, feature: 'customers' },
  { to: '/reports', label: 'Reports', icon: BarChart3, feature: 'reports' },
  { to: '/rates', label: 'Gold & Silver Rates', icon: ChartNoAxesCombined, feature: 'rates' },
  { to: '/users', label: 'Users', icon: UserCog, feature: 'users', adminOnly: true },
  { to: '/settings', label: 'Settings', icon: Settings, feature: 'settings' },
]

function featureForPath(pathname: string): FeatureKey | 'users' | null {
  if (pathname.startsWith('/users')) return 'users'
  if (pathname.startsWith('/dashboard')) return 'dashboard'
  if (pathname.startsWith('/billing') || pathname.startsWith('/invoices')) return 'billing'
  if (pathname.startsWith('/inventory/products')) return 'products'
  if (pathname.startsWith('/inventory/stock')) return 'stock'
  if (pathname.startsWith('/inventory/inwards') || pathname.startsWith('/inventory/suppliers') || pathname.startsWith('/inventory/old-gold')) {
    return 'inward'
  }
  if (pathname.startsWith('/products')) return 'products'
  if (pathname.startsWith('/stock')) return 'stock'
  if (pathname.startsWith('/suppliers') || pathname.startsWith('/inwards')) return 'inward'
  if (pathname.startsWith('/customers')) return 'customers'
  if (pathname.startsWith('/dues')) return 'dues'
  if (pathname.startsWith('/reports')) return 'reports'
  if (pathname.startsWith('/rates')) return 'rates'
  if (pathname.startsWith('/settings')) return 'settings'
  return null
}

export function AppLayout() {
  const { shopName, appSubtitle, logoImagePath } = useShopBranding()
  const { user, can, isAdmin, logout } = useAuth()
  const location = useLocation()
  const logoSrc = logoImagePath ? localImageSrc(logoImagePath, '') : ''
  const visibleLinks = links.filter((link) => {
    if (link.adminOnly || link.feature === 'users') return isAdmin
    if (link.feature === 'inventory') return canAccessInventory(can)
    return can(link.feature)
  })
  const required = featureForPath(location.pathname)
  const onInventory = location.pathname === '/inventory' || location.pathname.startsWith('/inventory/')
  const inventoryAllowed = canAccessInventory(can)
  const denied =
    (required === 'users' && !isAdmin) ||
    (onInventory && !inventoryAllowed) ||
    (required &&
      required !== 'users' &&
      !can(required) &&
      !(onInventory && inventoryAllowed))

  if (denied) {
    return <Navigate to={visibleLinks[0]?.to ?? '/login'} replace />
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className={`brand-icon${logoSrc ? ' has-logo' : ''}`} aria-hidden="true">
            {logoSrc ? <img src={logoSrc} alt="" /> : <Gem size={20} strokeWidth={1.75} />}
          </span>
          <div className="brand-text">
            {shopName}
            <span>{appSubtitle}</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          <ul className="nav-list">
            {visibleLinks.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                  <link.icon className="nav-link-icon" size={20} strokeWidth={1.75} aria-hidden />
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-footer">
          <span className="sidebar-user">{user?.username}</span>
          <button
            type="button"
            className="btn secondary sidebar-logout"
            onClick={() => void logout()}
          >
            <LogOut size={20} strokeWidth={1.75} aria-hidden />
            <span className="sidebar-logout-label">Sign out</span>
          </button>
          <span className="sidebar-version">v{APP_VERSION}</span>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
