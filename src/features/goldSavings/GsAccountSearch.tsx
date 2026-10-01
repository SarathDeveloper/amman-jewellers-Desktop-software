import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { GoldSavingAccount } from '@shared/types'
import { api } from '../../lib/api'

export function GsAccountSearch({
  selected,
  onSelect,
  onClear,
}: {
  selected: GoldSavingAccount | null
  onSelect: (account: GoldSavingAccount) => void
  onClear: () => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<GoldSavingAccount[]>([])
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void api.listGsAccounts(query).then(setResults).catch(() => setResults([]))
    }, 200)
    return () => window.clearTimeout(handle)
  }, [query])

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const shown = useMemo(() => results.slice(0, 20), [results])

  return (
    <div className="billing-customer-search" ref={rootRef}>
      <label className="billing-card-label">Scheme account</label>
      <div className="billing-customer-input-row">
        <span className="billing-customer-search-icon" aria-hidden>
          <Search size={18} strokeWidth={1.75} />
        </span>
        <input
          className="input billing-customer-input"
          value={selected && !open ? `${selected.customerName} · ${selected.accountNo}` : query}
          placeholder="Search account number, name, mobile or customer ID…"
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
            if (selected) onClear()
          }}
          onFocus={() => {
            if (selected) setQuery(`${selected.customerName} · ${selected.accountNo}`)
            setOpen(true)
          }}
        />
        {selected ? (
          <button
            type="button"
            className="btn ghost billing-customer-clear"
            aria-label="Clear account"
            onClick={() => {
              onClear()
              setQuery('')
            }}
          >
            <X size={16} strokeWidth={2} />
          </button>
        ) : null}
      </div>
      {selected ? (
        <p className="billing-customer-meta muted">
          {selected.schemeName} · {selected.customerPhone || 'No mobile'}
        </p>
      ) : null}
      {open && !selected ? (
        <div className="billing-customer-dropdown">
          {shown.length === 0 ? (
            <div className="billing-customer-option">
              <span className="billing-customer-option-meta">No matching accounts</span>
            </div>
          ) : (
            shown.map((account) => (
              <button
                key={account.id}
                type="button"
                className="billing-customer-option"
                onClick={() => {
                  onSelect(account)
                  setOpen(false)
                  setQuery('')
                }}
              >
                <span className="billing-customer-option-name">{account.customerName}</span>
                <span className="billing-customer-option-meta">
                  {account.accountNo} · {account.schemeName} · {account.customerPhone}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
