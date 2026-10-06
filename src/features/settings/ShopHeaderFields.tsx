import { Upload } from 'lucide-react'
import type { ShopSettings } from '@shared/types'
import { defaultShopLogoUrl, localImageSrc } from '../invoices/mapShopDisplay'

export function RequiredMark() {
  return (
    <span className="settings-required" aria-hidden>
      *
    </span>
  )
}

export function ShopHeaderFields({
  shop,
  onChange,
  onPickImage,
}: {
  shop: ShopSettings
  onChange: (shop: ShopSettings) => void
  onPickImage: (field: 'logoImagePath' | 'signatureImagePath', file: File) => void
}) {
  return (
    <div className="settings-form-grid">
      <label className="full">
        <span>
          Shop Name <RequiredMark />
        </span>
        <input
          className="input"
          value={shop.shopName}
          onChange={(e) => onChange({ ...shop, shopName: e.target.value })}
        />
      </label>
      <label className="full">
        Tagline
        <input
          className="input"
          value={shop.tagline}
          onChange={(e) => onChange({ ...shop, tagline: e.target.value })}
        />
      </label>
      <label className="full">
        App subtitle
        <input
          className="input"
          value={shop.appSubtitle}
          onChange={(e) => onChange({ ...shop, appSubtitle: e.target.value })}
        />
      </label>
      <label className="span-2">
        GSTIN
        <input
          className="input"
          value={shop.gstin}
          onChange={(e) => onChange({ ...shop, gstin: e.target.value })}
        />
      </label>
      <label className="span-2">
        <span>
          Phone 1 <RequiredMark />
        </span>
        <input
          className="input"
          value={shop.phone1}
          onChange={(e) => onChange({ ...shop, phone1: e.target.value })}
        />
      </label>
      <label className="span-2">
        Phone 2
        <input
          className="input"
          value={shop.phone2}
          onChange={(e) => onChange({ ...shop, phone2: e.target.value })}
        />
      </label>
      <label className="full">
        <span>
          Address Line 1 <RequiredMark />
        </span>
        <input
          className="input"
          value={shop.addressLine1}
          onChange={(e) => onChange({ ...shop, addressLine1: e.target.value })}
        />
      </label>
      <label className="full">
        Address Line 2
        <input
          className="input"
          value={shop.addressLine2}
          onChange={(e) => onChange({ ...shop, addressLine2: e.target.value })}
        />
      </label>
      <label className="span-2">
        <span>
          City <RequiredMark />
        </span>
        <input
          className="input"
          value={shop.city}
          onChange={(e) => onChange({ ...shop, city: e.target.value })}
        />
      </label>
      <label className="span-2">
        State
        <input
          className="input"
          value={shop.state}
          onChange={(e) => onChange({ ...shop, state: e.target.value })}
        />
      </label>
      <label className="span-2">
        Pincode
        <input
          className="input"
          value={shop.pincode}
          onChange={(e) => onChange({ ...shop, pincode: e.target.value })}
        />
      </label>
      <label className="full">
        Proprietor line 1
        <input
          className="input"
          value={shop.proprietorLine1}
          onChange={(e) => onChange({ ...shop, proprietorLine1: e.target.value })}
        />
      </label>
      <label className="full">
        Proprietor line 2
        <input
          className="input"
          value={shop.proprietorLine2}
          onChange={(e) => onChange({ ...shop, proprietorLine2: e.target.value })}
        />
      </label>
      <label className="full">
        Proprietor line 3
        <input
          className="input"
          value={shop.proprietorLine3}
          onChange={(e) => onChange({ ...shop, proprietorLine3: e.target.value })}
        />
      </label>
      <label className="full">
        Promo line
        <input
          className="input"
          value={shop.promoLine}
          onChange={(e) => onChange({ ...shop, promoLine: e.target.value })}
        />
      </label>
      <div className="span-3 settings-image-field">
        <span>Shop Logo</span>
        <div className="settings-image-picker">
          <div className="settings-image-preview">
            <img src={localImageSrc(shop.logoImagePath, defaultShopLogoUrl)} alt="" />
          </div>
          <div className="settings-image-meta">
            <label className="btn secondary">
              <Upload size={15} strokeWidth={1.75} aria-hidden />
              Change Logo
              <input
                type="file"
                accept="image/png,image/jpeg"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) onPickImage('logoImagePath', file)
                  event.target.value = ''
                }}
              />
            </label>
            <p className="muted">Recommended size: 300 × 300 px PNG or JPEG (Max 2MB)</p>
          </div>
        </div>
      </div>
      <div className="span-3 settings-image-field">
        <span>Signature Image</span>
        <div className="settings-image-picker">
          <div className="settings-image-preview settings-image-preview-wide">
            {shop.signatureImagePath ? (
              <img src={localImageSrc(shop.signatureImagePath, '')} alt="" />
            ) : (
              <span className="settings-signature-placeholder muted">No signature</span>
            )}
          </div>
          <div className="settings-image-meta">
            <label className="btn secondary">
              <Upload size={15} strokeWidth={1.75} aria-hidden />
              Change Signature
              <input
                type="file"
                accept="image/png,image/jpeg"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) onPickImage('signatureImagePath', file)
                  event.target.value = ''
                }}
              />
            </label>
            <p className="muted">Recommended size: 300 × 150 px PNG or JPEG (Max 2MB)</p>
          </div>
        </div>
      </div>
    </div>
  )
}
