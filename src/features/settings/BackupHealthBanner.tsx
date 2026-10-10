import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, X } from 'lucide-react'
import type { BackupStatus } from '@shared/types'
import { BACKUP_STATUS_EVENT, backupAttentionMessage, needsAttention } from '@shared/backupHealth'
import { useAuth } from '../auth/authContext'
import { api } from '../../lib/api'

const REFRESH_MS = 10 * 60 * 1000

/**
 * Surfaces a stale or failed backup outside the Settings page. Staff rarely
 * open Settings, so a failed off-machine copy would otherwise stay invisible.
 */
export function BackupHealthBanner() {
  const { can } = useAuth()
  const allowed = can('settings')
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!allowed) return
    let cancelled = false
    let generation = 0
    const load = async () => {
      const request = ++generation
      try {
        const next = await api.getBackupStatus()
        if (!cancelled && request === generation) setStatus(next)
      } catch {
        // A status failure must never take the shell down.
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), REFRESH_MS)
    const onStatus = (event: Event) => {
      generation += 1
      const next = (event as CustomEvent<BackupStatus>).detail
      if (next) setStatus(next)
    }
    window.addEventListener(BACKUP_STATUS_EVENT, onStatus)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener(BACKUP_STATUS_EVENT, onStatus)
    }
  }, [allowed])

  if (!allowed || dismissed || !status || !needsAttention(status)) return null

  return (
    <div className="backup-banner" role="status">
      <AlertTriangle size={18} strokeWidth={1.75} aria-hidden />
      <span className="backup-banner-text">{backupAttentionMessage(status)}</span>
      <Link className="backup-banner-link" to="/settings?tab=backup">
        Open Backup settings
      </Link>
      <button
        type="button"
        className="backup-banner-dismiss"
        aria-label="Dismiss backup warning"
        onClick={() => setDismissed(true)}
      >
        <X size={16} strokeWidth={1.75} />
      </button>
    </div>
  )
}
