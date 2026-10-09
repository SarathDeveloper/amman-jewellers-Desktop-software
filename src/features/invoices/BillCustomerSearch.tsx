import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Search, X } from 'lucide-react'
import type { Customer } from '@shared/types'
import { useAnchoredPanel } from '../../lib/useAnchoredPanel'
import {
  CustomerFormModal,
  prefillFromSearch,
} from '../customers/CustomerFormModal'

type BillCustomerSearchProps = {
  customers: Customer[]
  customerId: number
  disabled?: boolean
  label?: string
  hideLabel?: boolean
  hideSelectedMeta?: boolean
  keepSearchEmpty?: boolean
  addButtonLabel?: string
  onSelect: (customer: Customer) => void
  onClear: () => void
  onCustomerCreated: (customer: Customer) => void
  onError?: (message: string) => void
}

export function BillCustomerSearch({
  customers,
  customerId,
  disabled,
  label = 'Customer',
  hideLabel,
  hideSelectedMeta,
  keepSearchEmpty,
  addButtonLabel,
  onSelect,
  onClear,
  onCustomerCreated,
  onError,
}: BillCustomerSearchProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalPrefill, setModalPrefill] = useState<ReturnType<typeof prefillFromSearch> | undefined>()
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelStyle = useAnchoredPanel(rootRef, open)
  const prevCustomerIdRef = useRef(customerId)

  const selected = customers.find((c) => c.id === customerId)

  useEffect(() => {
    if (prevCustomerIdRef.current > 0 && customerId === 0) {
      setQuery('')
    }
    prevCustomerIdRef.current = customerId
  }, [customerId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return customers.slice(0, 50)
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        String(c.id).includes(q),
    )
  }, [customers, query])

  const showNoMatch = query.trim().length > 0 && filtered.length === 0

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function openAddModal() {
    setModalPrefill(prefillFromSearch(query))
    setModalOpen(true)
    setOpen(false)
  }

  function pick(customer: Customer) {
    onSelect(customer)
    setQuery(keepSearchEmpty ? '' : customer.name)
    setOpen(false)
  }

  return (
    <div className="billing-customer-search" ref={rootRef}>
      {hideLabel ? null : <label className="billing-card-label">{label}</label>}
      <div className="billing-customer-input-row">
        <span className="billing-customer-search-icon" aria-hidden>
          <Search size={18} strokeWidth={1.75} />
        </span>
        <input
          className="input billing-customer-input"
          disabled={disabled}
          value={keepSearchEmpty || open || !selected ? query : selected.name}
          placeholder="Search customer by name, phone or ID…"
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            if (customerId && !keepSearchEmpty) onClear()
          }}
          onFocus={() => {
            if (selected && !keepSearchEmpty) setQuery(selected.name)
            setOpen(true)
          }}
        />
        {customerId > 0 && !disabled && !keepSearchEmpty ? (
          <button
            type="button"
            className="btn ghost billing-customer-clear"
            aria-label="Clear customer"
            onClick={() => {
              onClear()
              setQuery('')
            }}
          >
            <X size={18} />
          </button>
        ) : null}
        <button
          type="button"
          className="btn secondary billing-customer-add"
          disabled={disabled}
          aria-label="Add new customer"
          onClick={openAddModal}
        >
          <Plus size={18} strokeWidth={2} />
          {addButtonLabel ? <span>{addButtonLabel}</span> : null}
        </button>
      </div>
      {selected && !hideSelectedMeta ? (
        <p className="billing-customer-meta muted">
          {selected.phone ? `Phone: ${selected.phone}` : 'No phone on file'}
          {selected.address ? ` · ${selected.address}` : ''}
        </p>
      ) : null}
      {open && !disabled
        ? createPortal(
            <div ref={panelRef} className="billing-customer-dropdown" role="listbox" style={panelStyle}>
              {filtered.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  className="billing-customer-option"
                  role="option"
                  onClick={() => pick(customer)}
                >
                  <span className="billing-customer-option-name">{customer.name}</span>
                  <span className="billing-customer-option-meta">
                    {customer.phone || `ID ${customer.id}`}
                  </span>
                </button>
              ))}
              {showNoMatch ? (
                <button
                  type="button"
                  className="billing-customer-option billing-customer-no-match"
                  onClick={openAddModal}
                >
                  No customer found — Add new
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}

      <CustomerFormModal
        open={modalOpen}
        initialValues={modalPrefill}
        onClose={() => setModalOpen(false)}
        onSaved={(customer) => {
          onCustomerCreated(customer)
          pick(customer)
          setModalOpen(false)
        }}
        onError={onError}
      />
    </div>
  )
}
