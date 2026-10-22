import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { AuthUser, FeatureKey, LoginInput } from '@shared/types'
import { api, setUnauthorizedHandler } from '../../lib/api'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  sessionEnded: boolean
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
  const [sessionEnded, setSessionEnded] = useState(false)
  const userRef = useRef(user)
  userRef.current = user

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (!userRef.current) return
      userRef.current = null
      setSessionEnded(true)
      setUser(null)
    })
    return () => setUnauthorizedHandler(null)
  }, [])

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
    setSessionEnded(false)
    setUser(next)
    return next
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setSessionEnded(false)
      setUser(null)
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      sessionEnded,
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
    [user, loading, sessionEnded, login, logout, refresh],
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
