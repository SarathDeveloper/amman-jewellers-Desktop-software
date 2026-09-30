import { BILLING_TYPE_OPTIONS, type SaleBillingType } from './billingType'

interface BillingTypeSelectProps {
  value: SaleBillingType
  onChange: (value: SaleBillingType) => void
  disabled?: boolean
}

export function BillingTypeSelect({ value, onChange, disabled }: BillingTypeSelectProps) {
  return (
    <label className="billing-type-field">
      <span className="billing-type-label">Billing type</span>
      <select
        className="select billing-type-select"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value as SaleBillingType)}
      >
        {BILLING_TYPE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}
