import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronDown, Plus, Banknote, FileText, Handshake } from 'lucide-react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import {
  BILLING_TAB_OPTIONS,
  billingTypeFromPath,
  getBillingType,
  setBillingType,
  type BillingType,
} from './billingType'

type PendingLeave = { kind: 'home' } | { kind: 'tab'; type: BillingType }

function TabIcon({ type, size }: { type: BillingType; size: number }) {
  const stroke = size >= 40 ? 1.25 : 1.75
  if (type === 'tax_invoice') return <FileText size={size} strokeWidth={stroke} />
  if (type === 'adagu') return <Handshake size={size} strokeWidth={stroke} />
  return <Banknote size={size} strokeWidth={stroke} />
}

function isEditorPath(pathname: string): boolean {
  return (
    /\/billing\/(cash|tax|adagu)\/(new|\d+)/.test(pathname) ||
    pathname.startsWith('/billing/old')
  )
}

export function BillingLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const pathType = billingTypeFromPath(location.pathname)
  const listMode = useMemo(() => location.pathname === '/billing', [location.pathname])
  const activeType = listMode ? getBillingType() : (pathType ?? getBillingType())
  const activeTab = BILLING_TAB_OPTIONS.find((tab) => tab.value === activeType) ?? BILLING_TAB_OPTIONS[0]
  const [menuOpen, setMenuOpen] = useState(false)
  const [pendingLeave, setPendingLeave] = useState<PendingLeave | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const dirtyRef = useRef(false)

  useEffect(() => {
    if (pathType) setBillingType(pathType)
  }, [pathType])

  useEffect(() => {
    function onDirty(event: Event) {
      const detail = (event as CustomEvent<{ dirty?: boolean }>).detail
      dirtyRef.current = Boolean(detail?.dirty)
    }
    window.addEventListener('billing-editor-dirty', onDirty)
    return () => window.removeEventListener('billing-editor-dirty', onDirty)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  function goHome() {
    navigate('/billing')
  }

  function goToTab(type: BillingType) {
    const tab = BILLING_TAB_OPTIONS.find((item) => item.value === type)
    if (!tab) return
    setBillingType(type)
    navigate(tab.newPath)
  }

  function selectTab(type: BillingType) {
    if (!listMode && type === activeType) return
    if (isEditorPath(location.pathname) && dirtyRef.current) {
      setPendingLeave({ kind: 'tab', type })
      return
    }
    goToTab(type)
  }

  function goToBillingHome() {
    if (isEditorPath(location.pathname) && dirtyRef.current) {
      setPendingLeave({ kind: 'home' })
      return
    }
    goHome()
  }

  function confirmLeave() {
    if (!pendingLeave) return
    const leave = pendingLeave
    setPendingLeave(null)
    if (leave.kind === 'home') {
      goHome()
      return
    }
    goToTab(leave.type)
  }

  const leaveDialog =
    pendingLeave?.kind === 'home'
      ? {
          message: 'You have unsaved changes on this bill. Leave and return to Billing?',
          confirmLabel: 'Leave',
        }
      : {
          message: 'You have unsaved changes on this bill. Leave and switch bill type?',
          confirmLabel: 'Switch',
        }

  return (
    <div className="billing-shell">
      <div className={`billing-chrome${listMode ? ' billing-chrome--list' : ''}`}>
        {!listMode ? (
          <button
            type="button"
            className="billing-chrome-back"
            onClick={goToBillingHome}
            aria-label="Back to Billing"
          >
            <ArrowLeft size={18} strokeWidth={1.75} aria-hidden />
          </button>
        ) : null}
        <div className="billing-chrome-tabs" role="tablist" aria-label="Billing type">
          {BILLING_TAB_OPTIONS.map((tab) => {
            const selected = listMode ? false : tab.value === activeType
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`billing-chrome-tab billing-chrome-tab--${tab.value}${selected ? ' active' : ''}`}
                onClick={() => selectTab(tab.value)}
              >
                <span className="billing-chrome-tab-icon" aria-hidden>
                  <TabIcon type={tab.value} size={listMode ? 56 : 18} />
                </span>
                {listMode ? (
                  <span className="billing-chrome-tab-text">
                    <strong className="billing-chrome-tab-label">{tab.label}</strong>
                    <span className="billing-chrome-tab-subtitle">{tab.subtitle}</span>
                  </span>
                ) : (
                  <span className="billing-chrome-tab-label">{tab.label}</span>
                )}
              </button>
            )
          })}
        </div>
        {listMode ? (
          <div className="billing-chrome-actions" ref={menuRef}>
            <div className="billing-new-split">
              <Link
                to={activeTab.newPath}
                className="btn billing-new-primary"
                onClick={() => setBillingType(activeTab.value)}
              >
                <Plus size={22} strokeWidth={2.25} aria-hidden />
                {activeTab.newLabel}
              </Link>
              <button
                type="button"
                className="btn billing-new-chevron"
                aria-label="More new bill options"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <ChevronDown size={20} strokeWidth={2.25} aria-hidden />
              </button>
              {menuOpen ? (
                <div className="billing-new-menu" role="menu">
                  {BILLING_TAB_OPTIONS.map((tab) => (
                    <Link
                      key={tab.value}
                      to={tab.newPath}
                      role="menuitem"
                      className="billing-new-menu-item"
                      onClick={() => {
                        setBillingType(tab.value)
                        setMenuOpen(false)
                      }}
                    >
                      {tab.newLabel}
                    </Link>
                  ))}
                  <Link
                    to="/billing/old"
                    role="menuitem"
                    className="billing-new-menu-item"
                    onClick={() => setMenuOpen(false)}
                  >
                    Record old bill
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      <Outlet />
      {pendingLeave ? (
        <ConfirmDialog
          title="Unsaved changes"
          message={leaveDialog.message}
          confirmLabel={leaveDialog.confirmLabel}
          danger={false}
          onCancel={() => setPendingLeave(null)}
          onConfirm={confirmLeave}
        />
      ) : null}
    </div>
  )
}
