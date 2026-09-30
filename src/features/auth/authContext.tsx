import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AuthUser, FeatureKey, LoginInput } from '@shared/types'
import { api } from '../../lib/api'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (input: LoginInput) => Promise<AuthUser>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  can: (feature: FeatureKey) => boolean
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const next = await api.me()
      setUser(next)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(async (input: LoginInput) => {
    const next = await api.login(input)
    setUser(next)
    return next
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      logout,
      refresh,
      isAdmin: user?.role === 'admin',
      can: (feature) => {
        if (!user) return false
        if (user.role === 'admin') return true
        return user.features.includes(feature)
      },
    }),
    [user, loading, login, logout, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return value
}
