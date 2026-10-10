import { useEffect, useMemo, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Banknote, FileText, Handshake } from 'lucide-react'
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
  const [preferredType, setPreferredType] = useState<BillingType>(getBillingType)
  const activeType = listMode ? preferredType : (pathType ?? preferredType)
  const [pendingLeave, setPendingLeave] = useState<PendingLeave | null>(null)
  const dirtyRef = useRef(false)

  useEffect(() => {
    if (pathType) {
      setBillingType(pathType)
      setPreferredType(pathType)
    }
  }, [pathType])

  useEffect(() => {
    function onDirty(event: Event) {
      const detail = (event as CustomEvent<{ dirty?: boolean }>).detail
      dirtyRef.current = Boolean(detail?.dirty)
    }
    window.addEventListener('billing-editor-dirty', onDirty)
    return () => window.removeEventListener('billing-editor-dirty', onDirty)
  }, [])

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
    if (listMode) {
      goToTab(type)
      return
    }
    if (type === activeType) return
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
