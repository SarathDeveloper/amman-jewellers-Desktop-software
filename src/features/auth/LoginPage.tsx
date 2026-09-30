import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './authContext'
import { useShopBranding } from '../settings/shopBrandingContext'
import { localImageSrc } from '../invoices/mapShopDisplay'
import logoUrl from '../../assets/jeweltrackerpro-logo.svg'

export function LoginPage() {
  const { login, user, loading } = useAuth()
  const { shopName, logoImagePath } = useShopBranding()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const logoSrc = localImageSrc(logoImagePath, logoUrl)

  if (!loading && user) {
    return <Navigate to={user.mustChangePassword ? '/change-password' : '/dashboard'} replace />
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const next = await login({ username: username.trim(), password })
      navigate(next.mustChangePassword ? '/change-password' : '/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <form className="card padded auth-card" onSubmit={(event) => void onSubmit(event)}>
        <div className="auth-brand">
          <img src={logoSrc} alt="" className="auth-logo" />
          {shopName ? <h1>{shopName}</h1> : null}
          <p className="muted">Sign in to continue</p>
        </div>
        <label>
          Username
          <input
            className="input"
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
