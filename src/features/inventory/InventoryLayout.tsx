import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { INVENTORY_TABS, firstInventoryPath } from './inventoryTabs'

export function InventoryIndexRedirect() {
  const { can } = useAuth()
  return <Navigate to={firstInventoryPath(can) ?? '/dashboard'} replace />
}

export function InventoryLayout() {
  const { can } = useAuth()
  const location = useLocation()
  const tabs = INVENTORY_TABS.filter((tab) => can(tab.feature))
  const active = INVENTORY_TABS.find(
    (tab) => location.pathname === tab.to || location.pathname.startsWith(`${tab.to}/`),
  )

  if (tabs.length === 0) {
    return <Navigate to="/dashboard" replace />
  }
  if (active && !can(active.feature)) {
    return <Navigate to={tabs[0].to} replace />
  }

  return (
    <div className="inventory-shell">
      <div className="billing-chrome">
        <div className="billing-chrome-tabs" role="tablist" aria-label="Inventory">
          {tabs.map((tab) => {
            const selected =
              location.pathname === tab.to || location.pathname.startsWith(`${tab.to}/`)
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end
                role="tab"
                aria-selected={selected}
                className={() => `billing-chrome-tab${selected ? ' active' : ''}`}
              >
                <span className="billing-chrome-tab-icon" aria-hidden>
                  <tab.icon size={18} strokeWidth={1.75} />
                </span>
                <span className="billing-chrome-tab-label">{tab.label}</span>
              </NavLink>
            )
          })}
        </div>
      </div>
      <Outlet />
    </div>
  )
}
