import type { PaperSize, ShopSettings } from '@shared/types'

function paperLabel(size: PaperSize): string {
  if (size === 'a4') return 'A4'
  if (size === 'thermal') return 'Thermal 80mm'
  return 'A5'
}

export function PrintersSettings({
  shop,
  onChange,
  onSave,
}: {
  shop: ShopSettings
  onChange: (shop: ShopSettings) => void
  onSave: () => void
}) {
  return (
    <div className="card padded">
      <div className="settings-card-head">
        <div>
          <h2 className="settings-section-title">Printers</h2>
          <p className="muted settings-card-subtitle">
            Bills print from the browser. Choose paper sizes and copy counts for each bill type.
          </p>
        </div>
      </div>

      <div className="printer-role-grid">
        <PaperRoleCard
          title="Cash bill"
          paperValue={shop.paperSizeCash}
          copiesValue={shop.copiesCash}
          onPaperChange={(value) => onChange({ ...shop, paperSizeCash: value })}
          onCopiesChange={(value) => onChange({ ...shop, copiesCash: value })}
        />
        <PaperRoleCard
          title="Tax invoice"
          paperValue={shop.paperSizeTax}
          copiesValue={shop.copiesTax}
          onPaperChange={(value) => onChange({ ...shop, paperSizeTax: value })}
          onCopiesChange={(value) => onChange({ ...shop, copiesTax: value })}
        />
      </div>

      <button type="button" className="btn settings-save-btn" onClick={onSave}>
        Save Changes
      </button>
    </div>
  )
}

function PaperRoleCard({
  title,
  paperValue,
  copiesValue,
  onPaperChange,
  onCopiesChange,
}: {
  title: string
  paperValue: PaperSize
  copiesValue: number
  onPaperChange: (value: PaperSize) => void
  onCopiesChange: (value: number) => void
}) {
  return (
    <section className="printer-role-card">
      <h3 className="settings-section-title">{title}</h3>
      <div className="form-grid">
        <label>
          Paper size
          <select
            className="input"
            aria-label={`${title} paper size`}
            value={paperValue}
            onChange={(event) => onPaperChange(event.target.value as PaperSize)}
          >
            <option value="a5">{paperLabel('a5')}</option>
            <option value="a4">{paperLabel('a4')}</option>
            <option value="thermal">{paperLabel('thermal')}</option>
          </select>
        </label>
        <label>
          Copies
          <select
            className="input"
            aria-label={`${title} copies`}
            value={copiesValue}
            onChange={(event) => onCopiesChange(Number(event.target.value))}
          >
            {[1, 2, 3, 4, 5].map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  )
}
