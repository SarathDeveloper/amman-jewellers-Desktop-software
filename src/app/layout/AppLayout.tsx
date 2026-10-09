import { useEffect, useState, Suspense } from 'react'
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom'
import {
  BarChart3,
  ChartNoAxesCombined,
  Gem,
  House,
  LogOut,
  Menu,
  Package,
  PiggyBank,
  Receipt,
  Settings,
  Users,
  UserCog,
  Wallet,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { FeatureKey } from '@shared/types'
import { useAuth } from '../../features/auth/authContext'
import { canAccessInventory } from '../../features/inventory/inventoryTabs'
import { useShopBranding } from '../../features/settings/shopBrandingContext'
import { BackupHealthBanner } from '../../features/settings/BackupHealthBanner'
import { localImageSrc } from '../../features/invoices/mapShopDisplay'
import { LoadingState } from '../../components/LoadingState'
import { warmPrintPreview } from '../../print/warmPrint'

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
  { to: '/gold-savings', label: 'Gold Savings', icon: PiggyBank, feature: 'gold_savings' },
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
  if (pathname.startsWith('/gold-savings')) return 'gold_savings'
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

  const [navOpen, setNavOpen] = useState(false)
  const [navTip, setNavTip] = useState<{ label: string; top: number; left: number } | null>(null)

  useEffect(() => {
    if (!navOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setNavOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [navOpen])

  // Print previews load a separate document. Fetch and preload its modules once
  // the app is idle, so opening the first preview does not wait on the network.
  useEffect(() => {
    const idle = window.requestIdleCallback
    if (typeof idle === 'function') {
      const handle = idle(() => warmPrintPreview())
      return () => window.cancelIdleCallback?.(handle)
    }
    const timer = window.setTimeout(() => warmPrintPreview(), 2000)
    return () => window.clearTimeout(timer)
  }, [])

  if (denied) {
    return <Navigate to={visibleLinks[0]?.to ?? '/login'} replace />
  }

  const brandIcon = logoSrc ? (
    <img src={logoSrc} alt="" />
  ) : (
    <Gem size={20} strokeWidth={1.75} />
  )

  // Desktop keeps the rail at its collapsed width, so a hovered icon surfaces its
  // label as a chip beside the rail instead of widening the rail over the content.
  // The chip is fixed-position on purpose: the rail clips its own contents and the
  // nav list scrolls, so a chip laid out inside either would be cut off or scroll
  // away from its icon.
  function placeTip(label: string, anchor: HTMLElement) {
    const rect = anchor.getBoundingClientRect()
    // Anchor horizontally to the rail's edge, not the hovered element's: elements are
    // inset by the rail's padding, so their own right edge sits inside the rail.
    const left = (anchor.closest('.sidebar')?.getBoundingClientRect().right ?? rect.right) + 8
    setNavTip({ label, top: rect.top + rect.height / 2, left })
  }

  function hideTip() {
    setNavTip(null)
  }

  /** Show the chip for `label` while the pointer or keyboard focus is on the element. */
  function tipHandlers(label: string) {
    const show = (event: { currentTarget: HTMLElement }) => placeTip(label, event.currentTarget)
    return { onMouseEnter: show, onMouseLeave: hideTip, onFocus: show, onBlur: hideTip }
  }

  return (
    <div className="app-shell">
      <header className="mobile-topbar">
        <div className="mobile-topbar-start">
          <button
            type="button"
            className="mobile-topbar-toggle"
            aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={navOpen}
            aria-controls="app-sidebar"
            onClick={() => setNavOpen((open) => !open)}
          >
            {navOpen ? <X size={20} strokeWidth={1.75} /> : <Menu size={20} strokeWidth={1.75} />}
          </button>
          <div className="mobile-topbar-brand">
            <span className={`mobile-topbar-brand-icon${logoSrc ? ' has-logo' : ''}`} aria-hidden="true">
              {brandIcon}
            </span>
            <span className="mobile-topbar-brand-text">
              <strong>{shopName}</strong>
              <span>{appSubtitle}</span>
            </span>
          </div>
        </div>
        <span className="mobile-topbar-user">{user?.username}</span>
      </header>
      <div
        className={`sidebar-backdrop${navOpen ? ' open' : ''}`}
        role="presentation"
        onClick={() => setNavOpen(false)}
      />
      <aside id="app-sidebar" className={`sidebar${navOpen ? ' open' : ''}`}>
        <div className="brand" {...tipHandlers(shopName)}>
          <span className={`brand-icon${logoSrc ? ' has-logo' : ''}`} aria-hidden="true">
            {brandIcon}
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
                  onClick={() => setNavOpen(false)}
                  {...tipHandlers(link.label)}
                >
                  <link.icon className="nav-link-icon" size={20} strokeWidth={1.75} aria-hidden />
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-footer">
          <span className="sidebar-user" {...tipHandlers(user?.username ?? '')}>{user?.username}</span>
          <button
            type="button"
            className="btn secondary sidebar-logout"
            {...tipHandlers('Sign out')}
            onClick={() => void logout()}
          >
            <LogOut size={20} strokeWidth={1.75} aria-hidden />
            <span className="sidebar-logout-label">Sign out</span>
          </button>
          <span className="sidebar-version">v{APP_VERSION}</span>
        </div>
        {navTip ? (
          <span
            className="nav-tooltip"
            aria-hidden="true"
            style={{ top: `${navTip.top}px`, left: `${navTip.left}px` }}
          >
            {navTip.label}
          </span>
        ) : null}
      </aside>
      <main className="content">
        <BackupHealthBanner />
        {/* Pages load on demand, so keep the sidebar and the module tabs in
            place while a page chunk arrives instead of blanking the shell. */}
        <Suspense fallback={<LoadingState />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
