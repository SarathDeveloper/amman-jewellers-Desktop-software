import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  BarChart3,
  ChevronDown,
  ClipboardList,
  Landmark,
  Package,
  Percent,
  Receipt,
  Scale,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import {
  findReport,
  REPORT_GROUPS,
  reportsInGroup,
  type ReportGroupId,
  type ReportLookups,
} from '@shared/reportsCatalog'
import { api } from '../../lib/api'

const GROUP_ICONS: Record<ReportGroupId, LucideIcon> = {
  sales: Receipt,
  purchase: ClipboardList,
  stock: Package,
  customer: Users,
  payment: Wallet,
  metal: Scale,
  pledge: Landmark,
  tax: Percent,
  summary: BarChart3,
}

const LookupsContext = createContext<ReportLookups>({
  customers: [],
  suppliers: [],
  products: [],
})

export function useReportLookups(): ReportLookups {
  return useContext(LookupsContext)
}

function tabLabel(label: string): string {
  return label.replace(/ Reports$/, '')
}

export function ReportsLayout() {
  const location = useLocation()
  const activeReport = findReport(location.pathname.split('/').pop() ?? '')
  const [openGroup, setOpenGroup] = useState<ReportGroupId | null>(null)
  const [lookups, setLookups] = useState<ReportLookups>({
    customers: [],
    suppliers: [],
    products: [],
  })
  const navRef = useRef<HTMLElement>(null)

  useEffect(() => {
    let cancelled = false
    void api.getReportLookups().then((data) => {
      if (!cancelled) setLookups(data)
    }).catch(() => {
      if (!cancelled) {
        setLookups({ customers: [], suppliers: [], products: [] })
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setOpenGroup(null)
  }, [location.pathname])

  useEffect(() => {
    if (!openGroup) return
    function onPointerDown(event: PointerEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenGroup(null)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenGroup(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [openGroup])

  return (
    <LookupsContext.Provider value={lookups}>
      <div className="billing-shell reports-shell">
        <div className="billing-chrome">
          <nav className="billing-chrome-tabs reports-tabs" aria-label="Reports" ref={navRef}>
            {REPORT_GROUPS.map((group) => {
              const reports = reportsInGroup(group.id)
              const selected = activeReport?.group === group.id
              const open = openGroup === group.id
              const destination = selected ? activeReport.id : reports[0]?.id
              const Icon = GROUP_ICONS[group.id]
              return (
              <div key={group.id} className={`billing-chrome-tab reports-tab${selected ? ' active' : ''}${open ? ' open' : ''}`}>
                <NavLink
                  to={destination ? `/reports/${destination}` : '/reports'}
                  className="reports-tab-link"
                  aria-current={selected ? 'page' : undefined}
                >
                  <span className="billing-chrome-tab-icon" aria-hidden>
                    <Icon size={18} strokeWidth={1.75} />
                  </span>
                  <span className="billing-chrome-tab-label">{tabLabel(group.label)}</span>
                </NavLink>
                <button
                  type="button"
                  className="reports-tab-chevron"
                  aria-label={`${group.label} menu`}
                  aria-expanded={open}
                  aria-haspopup="menu"
                  onClick={() => setOpenGroup(open ? null : group.id)}
                >
                  <ChevronDown size={16} strokeWidth={2} aria-hidden />
                </button>
                {open ? (
                  <ul className="reports-submenu" role="menu">
                    {reports.map((report) => (
                      <li key={report.id} role="none">
                        <NavLink
                          to={`/reports/${report.id}`}
                          role="menuitem"
                          className={({ isActive }) =>
                            `reports-submenu-link${isActive ? ' active' : ''}${report.available ? '' : ' unavailable'}`
                          }
                          title={report.available ? report.title : report.unavailableReason}
                          onClick={() => setOpenGroup(null)}
                        >
                          {report.title}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              )
            })}
          </nav>
        </div>
        <div className="reports-main">
          <Outlet />
        </div>
      </div>
    </LookupsContext.Provider>
  )
}
