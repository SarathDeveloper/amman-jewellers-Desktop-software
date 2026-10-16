import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

export function HuidSuggestInput({
  value,
  suggestions,
  disabled,
  invalid,
  placeholder,
  onChange,
}: {
  value: string
  suggestions: readonly string[]
  disabled?: boolean
  invalid?: boolean
  placeholder?: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const current = value.trim().toUpperCase()
  const useSelect = suggestions.length >= 2
  const selectOptions = useMemo(() => {
    if (!useSelect) return suggestions
    if (!current || suggestions.some((huid) => huid.toUpperCase() === current)) return suggestions
    return [...suggestions, current]
  }, [current, suggestions, useSelect])

  const matches = useMemo(() => {
    if (useSelect) return []
    if (!current) return suggestions
    return suggestions.filter((huid) => huid.toUpperCase().startsWith(current))
  }, [current, suggestions, useSelect])

  const showMenu = open && !disabled && !useSelect && matches.length > 0

  useLayoutEffect(() => {
    if (!showMenu || !inputRef.current) return
    const rect = inputRef.current.getBoundingClientRect()
    const estimatedHeight = matches.length * 36 + 16
    const spaceBelow = window.innerHeight - rect.bottom - 8
    const openUp = spaceBelow < estimatedHeight && rect.top > estimatedHeight
    setMenuStyle({
      top: openUp ? rect.top - estimatedHeight - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    })
  }, [showMenu, matches.length])

  useEffect(() => {
    if (!showMenu) return

    function onDocClick(event: MouseEvent) {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [showMenu])

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  if (useSelect) {
    return (
      <select
        className={`sale-bill-huid-select${invalid ? ' is-missing' : ''}`}
        disabled={disabled}
        aria-label="Hallmark Unique ID"
        value={selectOptions.some((huid) => huid.toUpperCase() === current) ? current : ''}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value=""></option>
        {selectOptions.map((huid) => (
          <option key={huid} value={huid}>
            {huid}
          </option>
        ))}
      </select>
    )
  }

  return (
    <div className="sale-bill-huid" ref={rootRef}>
      <input
        ref={inputRef}
        type="text"
        className={`sale-bill-huid-input${invalid ? ' is-missing' : ''}`}
        disabled={disabled}
        aria-label="Hallmark Unique ID"
        aria-autocomplete="list"
        aria-expanded={showMenu}
        aria-controls={showMenu ? listId : undefined}
        placeholder={placeholder}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value)
          setOpen(true)
        }}
      />
      {showMenu
        ? createPortal(
            <div
              ref={menuRef}
              id={listId}
              className="sale-bill-huid-menu"
              role="listbox"
              aria-label="Hallmark Unique ID suggestions"
              style={menuStyle}
            >
              {matches.map((huid) => {
                const selected = huid.toUpperCase() === value.trim().toUpperCase()
                return (
                  <button
                    key={huid}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`sale-bill-huid-option${selected ? ' is-selected' : ''}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onChange(huid)
                      setOpen(false)
                    }}
                  >
                    {huid}
                  </button>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
