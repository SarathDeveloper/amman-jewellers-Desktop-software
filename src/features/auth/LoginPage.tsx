import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { onAuthFieldKeys } from '../../lib/formKeyboard'
import { useAuth } from './authContext'
import { safeReturnPath } from './returnPath'
import { defaultShopLogoUrl } from '../invoices/mapShopDisplay'
import { useShopBranding } from '../settings/shopBrandingContext'

export function LoginPage() {
  const { login, user, loading } = useAuth()
  const { shopName } = useShopBranding()
  const navigate = useNavigate()
  const location = useLocation()
  const returnPath = safeReturnPath(
    (location.state as { from?: unknown; sessionEnded?: boolean } | null)?.from,
  )
  const sessionEnded = Boolean(
    (location.state as { sessionEnded?: boolean } | null)?.sessionEnded,
  )
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!loading && user) {
    return (
      <Navigate
        to={user.mustChangePassword ? '/change-password' : (returnPath ?? '/dashboard')}
        replace
      />
    )
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const next = await login({ username: username.trim(), password })
      navigate(next.mustChangePassword ? '/change-password' : (returnPath ?? '/dashboard'), {
        replace: true,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <form
        className="card padded auth-card"
        onSubmit={(event) => void onSubmit(event)}
        onKeyDown={onAuthFieldKeys}
      >
        <div className="auth-brand">
          <img src={defaultShopLogoUrl} alt="Amman Jewellers" className="auth-logo" />
          {shopName ? <h1>{shopName}</h1> : null}
          <p className="muted">
            {sessionEnded ? 'Your session ended. Sign in to continue.' : 'Sign in to continue'}
          </p>
        </div>
        <label>
          Username
          <input
            className="input"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? <p className="error-banner">{error}</p> : null}
        <button type="submit" className="btn" disabled={busy || !username.trim() || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
