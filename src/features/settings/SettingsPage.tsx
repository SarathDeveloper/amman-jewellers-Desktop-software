import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  BookOpen,
  Building2,
  Database,
  FileText,
  FolderOpen,
  HardDrive,
  Image,
  Info,
  MapPin,
  Phone,
  Printer,
  Save,
  Store,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type {
  AppInfo,
  PaperSize,
  ShopSettings,
  TaxReportRow,
} from '@shared/types'
import logoUrl from '../../assets/jeweltrackerpro-logo.svg'
import { PageHeader } from '../../components/PageHeader'
import { formatCurrency } from '../../lib/format'
import { api } from '../../lib/api'
import { useToast } from '../../components/toastContext'
import { CashBillPrint } from '../invoices/CashBillPrint'
import { localImageSrc, shopSettingsToDisplay } from '../invoices/mapShopDisplay'
import { paperClassName } from '../invoices/paperSize'
import { TaxInvoicePrint } from '../invoices/TaxInvoicePrint'
import { PledgePrint } from '../pledges/PledgePrint'
import '../invoices/CashBillPrint.css'
import '../invoices/TaxInvoicePrint.css'
import '../pledges/PledgePrint.css'
import { SAMPLE_ADAGU_PLEDGE, SAMPLE_CASH_BILL, SAMPLE_TAX_INVOICE } from './sampleBillPreview'
import { storeSampleBillPrint, type SampleBillKind } from '../invoices/SampleBillPrintPage'
import { PrintPreviewModal } from '../print/PrintPreviewModal'
import { printPreviewPaths } from '../print/printPreviewPaths'
import { PrintersSettings } from './PrintersSettings'
import { BackupSettings } from './BackupSettings'
import { RequiredMark } from './ShopHeaderFields'
import { useShopBranding } from './shopBrandingContext'

type InvoiceSettingsTab = 'cash' | 'tax' | 'adagu'

type SettingsTab = 'invoice' | 'printers' | 'backup' | 'data'

function IconField({
  label,
  required,
  icon: Icon,
  value,
  onChange,
}: {
  label: string
  required?: boolean
  icon: LucideIcon
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="settings-identity-field">
      <span>
        {label}
        {required ? (
          <>
            {' '}
            <RequiredMark />
          </>
        ) : null}
      </span>
      <span className="settings-icon-input">
        <Icon className="settings-icon-input-icon" size={16} strokeWidth={1.75} aria-hidden />
        <input className="input" value={value} onChange={(event) => onChange(event.target.value)} />
      </span>
    </label>
  )
}

function PlainField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="settings-identity-field">
      <span>{label}</span>
      <input className="input" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function pickFile(event: ChangeEvent<HTMLInputElement>, onPick: (file: File) => void) {
  const file = event.target.files?.[0]
  if (file) onPick(file)
  event.target.value = ''
}

function DashedImageField({
  label,
  optional,
  title,
  hint,
  preview,
  onPick,
}: {
  label: string
  optional?: boolean
  title: string
  hint: string
  preview: ReactNode
  onPick: (file: File) => void
}) {
  return (
    <div className="settings-identity-field">
      <span>
        {label}
        {optional ? <span className="settings-optional"> (Optional)</span> : null}
      </span>
      <div className="settings-upload-box">
        <label className="settings-upload-drop">
          {preview}
          <span className="settings-upload-copy">
            <strong>{title}</strong>
            <span>{hint}</span>
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg"
            aria-label={title}
            hidden
            onChange={(event) => pickFile(event, onPick)}
          />
        </label>
        <label className="settings-choose-file">
          <FolderOpen size={16} strokeWidth={1.75} aria-hidden />
          Choose File
          <input
            type="file"
            accept="image/png,image/jpeg"
            aria-label={`${title} file`}
            hidden
            onChange={(event) => pickFile(event, onPick)}
          />
        </label>
      </div>
    </div>
  )
}

export function SettingsPage() {
  const { showToast } = useToast()
  const { refresh: refreshBranding } = useShopBranding()
  const [tab, setTab] = useState<SettingsTab>(() => {
    return 'invoice'
  })
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [counts, setCounts] = useState<{ products: number; customers: number } | null>(null)
  const [shop, setShop] = useState<ShopSettings | null>(null)
  const shopRef = useRef<ShopSettings | null>(null)
  const [invoiceTab, setInvoiceTab] = useState<InvoiceSettingsTab>('cash')
  const [samplePrintKind, setSamplePrintKind] = useState<SampleBillKind | null>(null)
  const [taxReport, setTaxReport] = useState<TaxReportRow[]>([])

  const shopDisplay = shopSettingsToDisplay(shop)
  const previewPaper: PaperSize =
    invoiceTab === 'tax'
      ? (shop?.paperSizeTax ?? 'a4')
      : invoiceTab === 'adagu'
        ? 'a4'
        : (shop?.paperSizeCash ?? 'a5')
  const headerLogoSrc = localImageSrc(shop?.logoImagePath, logoUrl)

  function updateShop(
    next: ShopSettings | null | ((current: ShopSettings | null) => ShopSettings | null),
  ) {
    if (typeof next === 'function') {
      setShop((current) => {
        const resolved = next(current)
        shopRef.current = resolved
        return resolved
      })
      return
    }
    shopRef.current = next
    setShop(next)
  }

  function patchShop(patch: Partial<ShopSettings>) {
    updateShop((current) => (current ? { ...current, ...patch } : current))
  }

  useEffect(() => {
    void (async () => {
      try {
        const [data, products, customers, shopSettings, report] = await Promise.all([
          api.getVersion(),
          api.listProducts(),
          api.listCustomers(),
          api.getShopSettings(),
          api.getTaxReport(),
        ])
        setInfo(data)
        setCounts({ products: products.length, customers: customers.length })
        updateShop(shopSettings)
        setTaxReport(report)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load app info')
      }
    })()
  }, [])

  async function saveShop(
    requireFields: 'name' | 'printHeader' | 'none' = 'none',
    successMessage = 'Shop settings saved',
  ): Promise<boolean> {
    const current = shopRef.current
    if (!current) return false
    if (requireFields === 'name' && !current.shopName.trim()) {
      showToast('Shop name is required', 'error')
      return false
    }
    if (requireFields === 'printHeader') {
      const missing = [current.shopName, current.phone1, current.addressLine1, current.city].some(
        (value) => !value.trim(),
      )
      if (missing) {
        showToast('Shop name, phone 1, address line 1, and city are required', 'error')
        return false
      }
    }
    try {
      const saved = await api.updateShopSettings(current)
      updateShop(saved)
      refreshBranding()
      showToast(successMessage, 'success')
      setError(null)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save shop settings')
      return false
    }
  }

  function handleTestPrint() {
    const current = shopRef.current
    if (!current) return
    const kind: SampleBillKind = invoiceTab
    storeSampleBillPrint(kind, current)
    setSamplePrintKind(kind)
  }

  async function pickImage(
    field:
      | 'logoImagePath'
      | 'signatureImagePath'
      | 'bisLogoPath'
      | 'qrCodePath'
      | 'passbookBannerPath'
      | 'passbookSideImagePath',
    file: File,
  ) {
    try {
      const { path } = await api.uploadShopImage(file)
      const next = shopRef.current ? { ...shopRef.current, [field]: path } : null
      if (!next) return
      updateShop(next)
      setError(null)
      await saveShop('printHeader', 'Image saved')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to choose image'
      setError(message)
      showToast(message, 'error')
    }
  }

  function exportTaxCsv() {
    const header = 'Month,Taxable,CGST,SGST,IGST,Bills\n'
    const rows = taxReport
      .map(
        (row) =>
          `${row.month},${row.taxableSales},${row.cgst},${row.sgst},${row.igst},${row.invoiceCount}`,
      )
      .join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'tax-report.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const tabs: { id: SettingsTab; label: string; icon: LucideIcon }[] = [
    { id: 'invoice', label: 'Invoice Settings', icon: FileText },
    { id: 'printers', label: 'Printers', icon: Printer },
    { id: 'backup', label: 'Backup', icon: Database },
    { id: 'data', label: 'Data', icon: HardDrive },
  ]

  return (
    <div className="app-page settings-page">
      <PageHeader
        title="Settings"
        subtitle="Shop profile, backups, and GST tax summary"
        actions={
          <>
            <div className="settings-header-chip">
              <img className="settings-header-chip-logo" src={headerLogoSrc} alt="" />
              <div className="settings-header-chip-text">
                <strong>{shopDisplay.name}</strong>
                <span>v{info?.version ?? '1.0.0'}</span>
              </div>
            </div>
            <div className="settings-header-chip">
              <Database className="settings-header-chip-icon" size={18} strokeWidth={1.75} aria-hidden />
              <div className="settings-header-chip-text">
                <strong>Database Location</strong>
                <span title={info?.dbPath}>{info?.dbPath ?? '—'}</span>
              </div>
            </div>
          </>
        }
      />

      {error && <div className="error-banner">{error}</div>}

      <div className="settings-layout">
        <div className="billing-chrome">
          <div className="billing-chrome-tabs" role="tablist" aria-label="Settings sections">
            {tabs.map((item) => {
              const selected = tab === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={`billing-chrome-tab${selected ? ' active' : ''}`}
                  onClick={() => setTab(item.id)}
                >
                  <span className="billing-chrome-tab-icon" aria-hidden>
                    <item.icon size={18} strokeWidth={1.75} />
                  </span>
                  <span className="billing-chrome-tab-label">{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="settings-stack">
          {tab === 'invoice' && shop && (
            <div className="settings-invoice-stack">
              <div className="card settings-identity-card">
                <div className="settings-identity-head">
                  <div className="settings-identity-title">
                    <span className="settings-identity-badge" aria-hidden>
                      <Store size={18} strokeWidth={1.75} />
                    </span>
                    <div>
                      <h2 className="settings-section-title">Shop Identity</h2>
                      <p className="muted settings-card-subtitle">
                        Your business identity, location, and contact information. This will be shown
                        in invoices and reports.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void saveShop('printHeader', 'Shop details saved')}
                  >
                    <Save size={16} strokeWidth={1.75} aria-hidden />
                    Save Changes
                  </button>
                </div>

                <section className="settings-identity-panel">
                  <h3 className="settings-identity-panel-title">
                    <Store size={16} strokeWidth={1.75} aria-hidden />
                    Business Details
                  </h3>
                  <div className="settings-identity-grid">
                    <IconField
                      label="Shop Name"
                      required
                      icon={Building2}
                      value={shop.shopName}
                      onChange={(shopName) => patchShop({ shopName })}
                    />
                    <IconField
                      label="GSTIN"
                      icon={FileText}
                      value={shop.gstin}
                      onChange={(gstin) => patchShop({ gstin })}
                    />
                    <IconField
                      label="Tagline"
                      icon={Building2}
                      value={shop.tagline}
                      onChange={(tagline) => patchShop({ tagline })}
                    />
                    <IconField
                      label="Phone 1"
                      required
                      icon={Phone}
                      value={shop.phone1}
                      onChange={(phone1) => patchShop({ phone1 })}
                    />
                    <IconField
                      label="App subtitle"
                      icon={Building2}
                      value={shop.appSubtitle}
                      onChange={(appSubtitle) => patchShop({ appSubtitle })}
                    />
                    <IconField
                      label="Phone 2"
                      icon={Phone}
                      value={shop.phone2}
                      onChange={(phone2) => patchShop({ phone2 })}
                    />
                  </div>
                </section>

                <section className="settings-identity-panel">
                  <h3 className="settings-identity-panel-title">
                    <MapPin size={16} strokeWidth={1.75} aria-hidden />
                    Address Information
                  </h3>
                  <div className="settings-identity-grid">
                    <IconField
                      label="Address Line 1"
                      required
                      icon={Building2}
                      value={shop.addressLine1}
                      onChange={(addressLine1) => patchShop({ addressLine1 })}
                    />
                    <IconField
                      label="Address Line 2"
                      icon={Building2}
                      value={shop.addressLine2}
                      onChange={(addressLine2) => patchShop({ addressLine2 })}
                    />
                  </div>
                  <div className="settings-identity-grid settings-identity-grid-3">
                    <IconField
                      label="City"
                      required
                      icon={Building2}
                      value={shop.city}
                      onChange={(city) => patchShop({ city })}
                    />
                    <IconField
                      label="State"
                      icon={BookOpen}
                      value={shop.state}
                      onChange={(state) => patchShop({ state })}
                    />
                    <IconField
                      label="Pincode"
                      icon={MapPin}
                      value={shop.pincode}
                      onChange={(pincode) => patchShop({ pincode })}
                    />
                  </div>
                </section>

                <section className="settings-identity-panel">
                  <h3 className="settings-identity-panel-title">
                    <Info size={16} strokeWidth={1.75} aria-hidden />
                    Other Information
                  </h3>
                  <div className="settings-identity-grid">
                    <DashedImageField
                      label="Business Logo"
                      optional
                      title="Upload Shop Logo"
                      hint="PNG, JPG (Max 2MB)"
                      preview={
                        <span className="settings-image-preview">
                          <img src={localImageSrc(shop.logoImagePath, logoUrl)} alt="" />
                        </span>
                      }
                      onPick={(file) => void pickImage('logoImagePath', file)}
                    />
                    <DashedImageField
                      label="Signature Image"
                      optional
                      title="Upload Signature"
                      hint="Prints on bills, pledges, and gold savings receipts. PNG, JPG (Max 2MB)"
                      preview={
                        shop.signatureImagePath ? (
                          <span className="settings-upload-thumb">
                            <img src={localImageSrc(shop.signatureImagePath, '')} alt="" />
                          </span>
                        ) : (
                          <Image className="settings-upload-icon" size={18} strokeWidth={1.75} aria-hidden />
                        )
                      }
                      onPick={(file) => void pickImage('signatureImagePath', file)}
                    />
                    <DashedImageField
                      label="BIS Logo"
                      optional
                      title="Upload BIS Logo"
                      hint="Optional hallmark mark. PNG, JPG (Max 2MB)"
                      preview={
                        shop.bisLogoPath ? (
                          <span className="settings-upload-thumb">
                            <img src={localImageSrc(shop.bisLogoPath, '')} alt="" />
                          </span>
                        ) : (
                          <Image className="settings-upload-icon" size={18} strokeWidth={1.75} aria-hidden />
                        )
                      }
                      onPick={(file) => void pickImage('bisLogoPath', file)}
                    />
                    <DashedImageField
                      label="QR Code"
                      optional
                      title="Upload QR Code"
                      hint="Optional QR on printed bills. PNG, JPG (Max 2MB)"
                      preview={
                        shop.qrCodePath ? (
                          <span className="settings-upload-thumb">
                            <img src={localImageSrc(shop.qrCodePath, '')} alt="" />
                          </span>
                        ) : (
                          <Image className="settings-upload-icon" size={18} strokeWidth={1.75} aria-hidden />
                        )
                      }
                      onPick={(file) => void pickImage('qrCodePath', file)}
                    />
                    <PlainField
                      label="Proprietor line 1"
                      value={shop.proprietorLine1}
                      onChange={(proprietorLine1) => patchShop({ proprietorLine1 })}
                    />
                    <PlainField
                      label="Proprietor line 2"
                      value={shop.proprietorLine2}
                      onChange={(proprietorLine2) => patchShop({ proprietorLine2 })}
                    />
                    <PlainField
                      label="Proprietor line 3"
                      value={shop.proprietorLine3}
                      onChange={(proprietorLine3) => patchShop({ proprietorLine3 })}
                    />
                    <PlainField
                      label="Promo line"
                      value={shop.promoLine}
                      onChange={(promoLine) => patchShop({ promoLine })}
                    />
                  </div>
                </section>

                <section className="settings-identity-panel">
                  <h3 className="settings-identity-panel-title">
                    <BookOpen size={16} strokeWidth={1.75} aria-hidden />
                    Gold Savings Passbook
                  </h3>
                  <p className="muted settings-card-subtitle">
                    Optional decorative images for the gold savings passbook print. Leave empty to hide the slots.
                  </p>
                  <div className="settings-identity-grid">
                    <DashedImageField
                      label="Passbook banner"
                      optional
                      title="Upload Passbook Banner"
                      hint="Jewellery strip at the top of the passbook. PNG, JPG (Max 2MB)"
                      preview={
                        shop.passbookBannerPath ? (
                          <span className="settings-upload-thumb">
                            <img src={localImageSrc(shop.passbookBannerPath, '')} alt="" />
                          </span>
                        ) : (
                          <Image className="settings-upload-icon" size={18} strokeWidth={1.75} aria-hidden />
                        )
                      }
                      onPick={(file) => void pickImage('passbookBannerPath', file)}
                    />
                    <DashedImageField
                      label="Passbook side image"
                      optional
                      title="Upload Passbook Side Image"
                      hint="Photo beside the customer form. PNG, JPG (Max 2MB)"
                      preview={
                        shop.passbookSideImagePath ? (
                          <span className="settings-upload-thumb">
                            <img src={localImageSrc(shop.passbookSideImagePath, '')} alt="" />
                          </span>
                        ) : (
                          <Image className="settings-upload-icon" size={18} strokeWidth={1.75} aria-hidden />
                        )
                      }
                      onPick={(file) => void pickImage('passbookSideImagePath', file)}
                    />
                  </div>
                </section>
              </div>

              <div className="card padded">
                <div className="settings-card-head">
                  <div>
                    <h2 className="settings-section-title">Invoice Settings</h2>
                    <p className="muted settings-card-subtitle">
                      Shop details print on cash bills, tax invoices, and Adagu bills. Preview each template below.
                    </p>
                  </div>
                  <div className="toolbar settings-toolbar">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => void saveShop('printHeader', 'Invoice settings saved')}
                    >
                      <Save size={16} strokeWidth={1.75} aria-hidden />
                      Save Changes
                    </button>
                  </div>
                </div>

                <div className="billing-chrome billing-chrome--list" style={{ marginBottom: '1.25rem' }}>
                  <div className="billing-chrome-tabs">
                    <button
                      type="button"
                      className={`billing-chrome-tab${invoiceTab === 'cash' ? ' active' : ''}`}
                      onClick={() => setInvoiceTab('cash')}
                    >
                      Cash Bill
                    </button>
                    <button
                      type="button"
                      className={`billing-chrome-tab${invoiceTab === 'tax' ? ' active' : ''}`}
                      onClick={() => setInvoiceTab('tax')}
                    >
                      Tax Invoice
                    </button>
                    <button
                      type="button"
                      className={`billing-chrome-tab${invoiceTab === 'adagu' ? ' active' : ''}`}
                      onClick={() => setInvoiceTab('adagu')}
                    >
                      Adagu Bill
                    </button>
                  </div>
                </div>

                <div className="settings-bill-preview-card">
                  <div className="settings-bill-preview-head">
                    <div>
                      <h3 className="settings-subsection-title">Live template</h3>
                      <p className="muted settings-card-subtitle">
                        This is the AVR bill that prints. Shop details above apply to every template.
                      </p>
                    </div>
                    <button type="button" className="btn secondary" onClick={handleTestPrint}>
                      <Printer size={16} strokeWidth={1.75} aria-hidden />
                      Test Print
                    </button>
                  </div>
                  <div className="settings-bill-preview-frame">
                    <div className={`settings-bill-preview-scale ${paperClassName(previewPaper)}`}>
                      {invoiceTab === 'cash' ? (
                        <CashBillPrint
                          data={SAMPLE_CASH_BILL}
                          shop={shopDisplay}
                          paperSize={shop.paperSizeCash}
                        />
                      ) : invoiceTab === 'tax' ? (
                        <TaxInvoicePrint
                          data={SAMPLE_TAX_INVOICE}
                          shop={shopDisplay}
                          paperSize={shop.paperSizeTax}
                        />
                      ) : (
                        <PledgePrint pledge={SAMPLE_ADAGU_PLEDGE} shop={shopDisplay} />
                      )}
                    </div>
                  </div>
                </div>

                {invoiceTab === 'adagu' && (
                  <>
                    <h3 className="settings-subsection-title">Adagu POS Settings</h3>
                    <div className="settings-form-grid">
                      <label className="span-3">
                        Adagu LTV (% of assessed value)
                        <input
                          className="input"
                          type="number"
                          min={0}
                          max={100}
                          step="0.1"
                          value={shop.pledgeLtvPct}
                          onChange={(e) =>
                            patchShop({
                              pledgeLtvPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                            })
                          }
                        />
                      </label>
                      <label className="span-3">
                        Adagu monthly interest (%)
                        <input
                          className="input"
                          type="number"
                          min={0}
                          max={100}
                          step="0.1"
                          value={shop.adaguInterestPct}
                          onChange={(e) =>
                            patchShop({
                              adaguInterestPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                            })
                          }
                        />
                      </label>
                    </div>
                  </>
                )}
              </div>

              <div className="card padded" id="gst-summary">
                <div className="section-head">
                  <h3 className="settings-section-title settings-section-title-inline">GST tax summary</h3>
                  <div className="settings-gst-actions">
                    <button type="button" className="btn secondary" onClick={exportTaxCsv}>
                      Export CSV
                    </button>
                  </div>
                </div>
                <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th className="num">Taxable</th>
                      <th className="num">CGST</th>
                      <th className="num">SGST</th>
                      <th className="num">IGST</th>
                      <th className="num">Bills</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxReport.map((row) => (
                      <tr key={row.month}>
                        <td>{row.month}</td>
                        <td className="num">{formatCurrency(row.taxableSales)}</td>
                        <td className="num">{formatCurrency(row.cgst)}</td>
                        <td className="num">{formatCurrency(row.sgst)}</td>
                        <td className="num">{formatCurrency(row.igst)}</td>
                        <td className="num">{row.invoiceCount}</td>
                      </tr>
                    ))}
                    {taxReport.length === 0 && (
                      <tr>
                        <td colSpan={6} className="empty-cell">No finalized tax invoices yet</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          )}

          {tab === 'printers' && shop && (
            <PrintersSettings
              shop={shop}
              onChange={(next) => updateShop(next)}
              onSave={() => void saveShop()}
            />
          )}

          {tab === 'backup' && <BackupSettings />}

          {tab === 'data' && (
            <div className="card padded">
              <h2 className="settings-section-title">Data</h2>
              <p className="settings-row">
                <strong>App version</strong>
                {info?.version ?? '—'}
              </p>
              {counts && (
                <p className="settings-row">
                  <strong>Records</strong>
                  <span className="muted">
                    {counts.products} products, {counts.customers} customers
                  </span>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      {samplePrintKind ? (
        <PrintPreviewModal
          title="Print preview"
          path={printPreviewPaths.sample(samplePrintKind)}
          pdfFilename="sample.pdf"
          onClose={() => setSamplePrintKind(null)}
        />
      ) : null}
    </div>
  )
}

