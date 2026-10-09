import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import type { DashboardAlert } from './dashboardStats'

export function DashboardAlertsMenu({ alerts }: { alerts: DashboardAlert[] }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const count = alerts.length

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="dashboard-alerts-wrap" ref={rootRef}>
      <button
        type="button"
        className="btn ghost dashboard-icon-btn dashboard-bell-btn"
        aria-label={count > 0 ? `Notifications (${count})` : 'Notifications'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={18} strokeWidth={1.75} />
        {count > 0 ? (
          <span className="dashboard-bell-badge" aria-hidden>
            {count > 9 ? '9+' : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="dashboard-alerts-menu" role="menu" aria-label="Notifications">
          {count === 0 ? (
            <p className="dashboard-alerts-empty">No alerts right now</p>
          ) : (
            alerts.map((alert) => (
              <Link
                key={alert.id}
                to={alert.to}
                role="menuitem"
                className="dashboard-alert-item"
                onClick={() => setOpen(false)}
              >
                <span className={`dashboard-alert-dot dashboard-alert-dot-${alert.tone}`} aria-hidden />
                <span className="dashboard-alert-text">
                  <span className="dashboard-alert-title" title={alert.title}>{alert.title}</span>
                  {alert.detail ? (
                    <span className="dashboard-alert-detail" title={alert.detail}>{alert.detail}</span>
                  ) : null}
                </span>
              </Link>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
