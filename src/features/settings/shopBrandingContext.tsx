import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../../lib/api'

export const DEFAULT_APP_SUBTITLE = 'Billing & inventory'
export const DEFAULT_WINDOW_TITLE = 'JewelTrackerPro'

interface ShopBranding {
  shopName: string
  appSubtitle: string
  logoImagePath: string
  refresh: () => void
}

const ShopBrandingContext = createContext<ShopBranding>({
  shopName: '',
  appSubtitle: DEFAULT_APP_SUBTITLE,
  logoImagePath: '',
  refresh: () => undefined,
})

function applyWindowTitle(shopName: string) {
  document.title = shopName.trim() || DEFAULT_WINDOW_TITLE
}

export function ShopBrandingProvider({ children }: { children: ReactNode }) {
  const [shopName, setShopName] = useState('')
  const [appSubtitle, setAppSubtitle] = useState(DEFAULT_APP_SUBTITLE)
  const [logoImagePath, setLogoImagePath] = useState('')

  const refresh = useCallback(() => {
    void (async () => {
      try {
        const settings = await api.getShopSettings()
        const nextName = settings.shopName.trim()
        setShopName(nextName)
        setAppSubtitle(settings.appSubtitle.trim() || DEFAULT_APP_SUBTITLE)
        setLogoImagePath(settings.logoImagePath.trim())
        applyWindowTitle(nextName)
      } catch {
        /* keep last branding */
      }
    })()
  }, [])

  useEffect(() => {
    applyWindowTitle('')
    refresh()
  }, [refresh])

  const value = useMemo(
    () => ({ shopName, appSubtitle, logoImagePath, refresh }),
    [shopName, appSubtitle, logoImagePath, refresh],
  )

  return <ShopBrandingContext.Provider value={value}>{children}</ShopBrandingContext.Provider>
}

export function useShopBranding() {
  return useContext(ShopBrandingContext)
}
