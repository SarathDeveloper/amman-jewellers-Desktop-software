import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { GOLD_SAVINGS_TABS } from './goldSavingsTabs'

export function GoldSavingsLayout() {
  const location = useLocation()

  return (
    <div className="inventory-shell">
      <div className="billing-chrome">
        <div className="billing-chrome-tabs" role="tablist" aria-label="Monthly Gold Savings">
          {GOLD_SAVINGS_TABS.map((tab) => {
            const selected =
              location.pathname === tab.to || location.pathname.startsWith(`${tab.to}/`)
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.to === '/gold-savings/accounts'}
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

export function GoldSavingsIndexRedirect() {
  return <Navigate to="/gold-savings/dashboard" replace />
}
