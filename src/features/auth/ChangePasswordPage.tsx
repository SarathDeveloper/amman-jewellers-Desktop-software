import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from './authContext'

export function ChangePasswordPage() {
  const { refresh, user } = useAuth()
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (newPassword !== confirmPassword) {
      setError('New password confirmation does not match')
      return
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters')
      return
    }
    setBusy(true)
    try {
      await api.changePassword({ currentPassword, newPassword })
      await refresh()
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <form className="card padded auth-card" onSubmit={(event) => void onSubmit(event)}>
        <h1>Change password</h1>
        <p className="muted">
          {user?.mustChangePassword
            ? 'You must set a new password before continuing.'
            : 'Update your account password.'}
        </p>
        <label>
          Current password
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>
        <label>
          New password
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </label>
        <label>
          Confirm new password
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </label>
        {error ? <p className="error-banner">{error}</p> : null}
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Saving…' : 'Save password'}
        </button>
      </form>
    </div>
  )
}
