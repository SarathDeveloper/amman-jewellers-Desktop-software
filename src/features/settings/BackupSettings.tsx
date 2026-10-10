import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Download, FileSpreadsheet, FolderOpen, ShieldAlert, ShieldCheck, Upload } from 'lucide-react'
import type { BackupFile, BackupInspection, BackupKind, BackupStatus } from '@shared/types'
import { BACKUP_STATUS_EVENT, daysSinceBackup, healthTitle, healthTone, offsiteCopyCurrent } from '@shared/backupHealth'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Modal } from '../../components/Modal'
import { TimeInput } from '../../components/DateInput'
import { LoadingState } from '../../components/LoadingState'
import { useToast } from '../../components/toastContext'
import { api } from '../../lib/api'
import { formatDisplayClock, formatDisplayDateTime } from '../../lib/format'

type PendingAction =
  | { type: 'restore-file'; file: File }
  | { type: 'restore-local'; name: string }
  | { type: 'delete'; name: string }

const KIND_LABEL: Record<BackupKind, string> = {
  daily: 'Auto',
  manual: 'Manual',
  dayclose: 'Day close',
  prerestore: 'Before restore',
  premigrate: 'Before update',
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  }
  const mb = bytes / (1024 * 1024)
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

export function BackupSettings() {
  const { showToast } = useToast()
  const [lastBackup, setLastBackup] = useState<string | null>(null)
  const [frequency, setFrequency] = useState<BackupStatus['frequency']>('daily')
  const [time, setTime] = useState('21:00')
  const [nextBackup, setNextBackup] = useState<string | null>(null)
  const [offsiteDir, setOffsiteDir] = useState('')
  const [lastOffsiteAt, setLastOffsiteAt] = useState<string | null>(null)
  const [lastOffsiteError, setLastOffsiteError] = useState<string | null>(null)
  const [backups, setBackups] = useState<BackupFile[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [inspection, setInspection] = useState<BackupInspection | null>(null)
  const canBrowse = Boolean(window.desktopAPI?.chooseBackupFolder)

  function applyStatus(status: BackupStatus) {
    setLastBackup(status.lastBackupAt)
    setFrequency(status.frequency)
    setTime(status.time)
    setNextBackup(status.nextBackupAt)
    setOffsiteDir(status.offsiteDir ?? '')
    setLastOffsiteAt(status.lastOffsiteAt ?? null)
    setLastOffsiteError(status.lastOffsiteError ?? null)
    window.dispatchEvent(new CustomEvent<BackupStatus>(BACKUP_STATUS_EVENT, { detail: status }))
  }

  const refresh = useCallback(async () => {
    const [status, files] = await Promise.all([api.getBackupStatus(), api.listBackups()])
    applyStatus(status)
    setBackups(files)
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        await refresh()
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load backups')
      } finally {
        setLoading(false)
      }
    })()
  }, [refresh])

  const days = daysSinceBackup(lastBackup)
  const offsiteCurrent = offsiteCopyCurrent(offsiteDir, lastOffsiteAt, lastOffsiteError)
  const tone = healthTone(days, offsiteCurrent)

  async function backupNow() {
    setBusy(true)
    try {
      await api.createBackup()
      await refresh()
      showToast('Backup saved', 'success')
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Backup failed'
      setError(message)
      showToast(message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function checkBackup(name: string) {
    setBusy(true)
    try {
      setInspection(await api.inspectBackup(name))
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read the backup'
      setError(message)
      showToast(message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function exportCopy() {
    setBusy(true)
    try {
      await api.exportDatabase()
      await refresh()
      showToast('Database backup downloaded', 'success')
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed'
      if (message === 'Export cancelled') {
        return
      }
      setError(message)
      showToast(message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function exportExcel() {
    setBusy(true)
    try {
      await api.exportExcel()
      showToast('Excel backup downloaded', 'success')
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Excel export failed'
      if (message === 'Export cancelled') {
        return
      }
      setError(message)
      showToast(message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function saveSchedule() {
    setBusy(true)
    try {
      const status = await api.updateBackupSettings({ frequency, time, offsiteDir })
      applyStatus(status)
      showToast('Backup schedule saved', 'success')
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save schedule'
      setError(message)
      showToast(message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function browseOffsiteFolder() {
    const picked = await window.desktopAPI?.chooseBackupFolder()
    if (!picked) return
    setOffsiteDir(picked)
  }

  async function copyOffsiteNow() {
    setBusy(true)
    try {
      applyStatus(await api.updateBackupSettings({ frequency, time, offsiteDir }))
      const status = await api.copyBackupOffsite()
      applyStatus(status)
      await refresh()
      showToast('Off-machine copy verified', 'success')
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Off-machine copy failed'
      setError(message)
      showToast(message, 'error')
      try {
        await refresh()
      } catch {
        // keep the copy error visible
      }
    } finally {
      setBusy(false)
    }
  }

  async function confirmPending() {
    if (!pending) return
    const action = pending
    setPending(null)
    setBusy(true)
    try {
      if (action.type === 'delete') {
        await api.deleteBackup(action.name)
        await refresh()
        showToast('Backup deleted', 'success')
      } else if (action.type === 'restore-file') {
        await api.restoreDatabase(action.file)
        showToast('Database restored. Reloading…', 'success')
        window.location.reload()
        return
      } else {
        await api.restoreBackupByName(action.name)
        showToast('Database restored. Reloading…', 'success')
        window.location.reload()
        return
      }
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Action failed'
      setError(message)
      showToast(message, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <LoadingState rows={3} />
  }

  const HealthIcon = tone === 'ok' ? ShieldCheck : tone === 'warn' ? AlertTriangle : ShieldAlert
  const frequencyLabel = frequency === 'weekly' ? 'Weekly' : 'Daily'

  return (
    <>
      {error && <div className="error-banner">{error}</div>}

      <div className={`card padded backup-health backup-health--${tone}`}>
        <div className="backup-health-copy">
          <span className="backup-health-icon" aria-hidden>
            <HealthIcon size={22} strokeWidth={1.75} />
          </span>
          <div>
            <h2 className="settings-section-title">Database Backup</h2>
            <p className="backup-health-status">{healthTitle(days, offsiteCurrent)}</p>
            <p className="muted">
              {lastBackup
                ? `Last backup ${formatDisplayDateTime(lastBackup)}`
                : 'Take a backup now so you can restore if this computer fails.'}
            </p>
            <p className="muted">
              Automatic: {frequencyLabel} at {formatDisplayClock(time)}
            </p>
            {offsiteDir.trim() ? (
              <p className="muted">
                {lastOffsiteError
                  ? `Off-machine copy failed: ${lastOffsiteError}`
                  : lastOffsiteAt
                    ? `Off-machine copy ${formatDisplayDateTime(lastOffsiteAt)}`
                    : 'Off-machine folder is set. Copy now or wait for the next backup.'}
              </p>
            ) : (
              <p className="muted">Choose a USB or other folder so a second copy is not on this computer.</p>
            )}
          </div>
        </div>
        <div className="backup-health-actions">
          <button type="button" className="btn" disabled={busy} onClick={() => void backupNow()}>
            Back Up Now
          </button>
          <button type="button" className="btn secondary" disabled={busy} onClick={() => void exportCopy()}>
            <Download size={16} strokeWidth={1.75} aria-hidden />
            Export Copy
          </button>
          <button type="button" className="btn secondary" disabled={busy} onClick={() => void exportExcel()}>
            <FileSpreadsheet size={16} strokeWidth={1.75} aria-hidden />
            Export Excel
          </button>
          <label className={`btn secondary${busy ? ' backup-action-disabled' : ''}`}>
            <Upload size={16} strokeWidth={1.75} aria-hidden />
            Restore from File
            <input
              type="file"
              accept=".db"
              hidden
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) {
                  setPending({ type: 'restore-file', file })
                }
                event.target.value = ''
              }}
            />
          </label>
        </div>
      </div>

      <div className="card padded backup-schedule">
        <div className="settings-card-head">
          <div>
            <h2 className="settings-section-title">Automatic backup</h2>
            <p className="muted settings-card-subtitle">
              The app takes a backup at this time when it is open. If it was closed through the
              scheduled slot, it catches up on the next launch. Each backup includes a .db file for
              restore and an Excel workbook of every table.
            </p>
          </div>
        </div>
        <div className="backup-schedule-grid">
          <label>
            Frequency
            <select
              className="input"
              aria-label="Backup frequency"
              value={frequency}
              disabled={busy}
              onChange={(event) => setFrequency(event.target.value as BackupStatus['frequency'])}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
          <label>
            Time
            <TimeInput
              className="input"
              ariaLabel="Backup time"
              value={time}
              onChange={setTime}
              disabled={busy}
            />
          </label>
        </div>
        <p className="muted backup-schedule-next">
          {nextBackup
            ? `Next backup ${formatDisplayDateTime(nextBackup)}`
            : 'Due now — will run shortly'}
        </p>
        <button type="button" className="btn settings-save-btn" disabled={busy} onClick={() => void saveSchedule()}>
          Save Changes
        </button>
      </div>

      <div className="card padded backup-offsite">
        <div className="settings-card-head">
          <div>
            <h2 className="settings-section-title">Off-machine copy</h2>
            <p className="muted settings-card-subtitle">
              After each local backup, the newest database file and its Excel workbook are copied
              here, together with any shop images that are not already present. The .db copy is
              hashed and opened to prove it can restore. Use a USB drive or another disk, not this
              computer&apos;s app data folder.
            </p>
          </div>
        </div>
        <label className="backup-offsite-path-label">
          Folder
          <div className="backup-offsite-path">
            <input
              className="input"
              aria-label="Off-machine folder"
              placeholder="E:\JewelTrackerPro"
              value={offsiteDir}
              disabled={busy}
              onChange={(event) => setOffsiteDir(event.target.value)}
            />
            {canBrowse ? (
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => void browseOffsiteFolder()}
              >
                <FolderOpen size={16} strokeWidth={1.75} aria-hidden />
                Browse
              </button>
            ) : null}
          </div>
        </label>
        <p className="muted backup-offsite-status">
          {lastOffsiteError
            ? lastOffsiteError
            : lastOffsiteAt
              ? `Last verified copy ${formatDisplayDateTime(lastOffsiteAt)}`
              : offsiteDir.trim()
                ? 'No verified copy yet'
                : 'Leave empty to turn this off'}
        </p>
        <div className="backup-offsite-actions">
          <button type="button" className="btn settings-save-btn" disabled={busy} onClick={() => void saveSchedule()}>
            Save Changes
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={busy || !offsiteDir.trim()}
            onClick={() => void copyOffsiteNow()}
          >
            Copy now
          </button>
        </div>
      </div>

      <div className="card padded backup-list">
        <div className="settings-card-head">
          <div>
            <h2 className="settings-section-title">Saved backups</h2>
            <p className="muted settings-card-subtitle">
              Automatic backups run on the schedule above, after each metal day close, and the
              newest 14 daily copies are kept along with weekly and monthly copies. The newest 30
              manual backups are kept. Restore uses the .db file. Excel is a readable copy of every
              table.
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th className="num">Size</th>
                <th className="backup-list-actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((file) => (
                <tr key={file.name}>
                  <td>{formatDisplayDateTime(file.createdAt)}</td>
                  <td>
                    <span className={`backup-kind backup-kind--${file.kind}`}>
                      {KIND_LABEL[file.kind]}
                    </span>
                  </td>
                  <td className="num">{formatBytes(file.sizeBytes)}</td>
                  <td className="backup-list-actions-col">
                    <div className="backup-list-actions">
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={busy}
                        onClick={() => void checkBackup(file.name)}
                      >
                        Check
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={busy}
                        onClick={() => setPending({ type: 'restore-local', name: file.name })}
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        className="btn link-danger"
                        disabled={busy}
                        onClick={() => setPending({ type: 'delete', name: file.name })}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {backups.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty-cell">
                    No backups saved on this computer yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pending?.type === 'delete' && (
        <ConfirmDialog
          title="Delete backup"
          message="This backup file will be permanently deleted."
          confirmLabel="Delete"
          onConfirm={() => void confirmPending()}
          onCancel={() => setPending(null)}
        />
      )}
      {(pending?.type === 'restore-file' || pending?.type === 'restore-local') && (
        <ConfirmDialog
          title="Restore database"
          message="The current database will be replaced with the selected backup."
          confirmLabel="Restore"
          onConfirm={() => void confirmPending()}
          onCancel={() => setPending(null)}
        />
      )}
      {inspection && (
        <Modal title="Backup check" onClose={() => setInspection(null)}>
          <div className="backup-inspect">
            <p className="muted backup-inspect-name">{inspection.name}</p>
            <ul className="backup-inspect-list">
              <li>
                <span>Can be restored</span>
                <strong>{inspection.restorable ? 'Yes' : 'No'}</strong>
              </li>
              <li>
                <span>Schema version</span>
                <strong>
                  {inspection.schemaVersion} of {inspection.appSchemaVersion}
                </strong>
              </li>
              <li>
                <span>Customers</span>
                <strong>{inspection.counts.customers}</strong>
              </li>
              <li>
                <span>Invoices</span>
                <strong>{inspection.counts.invoices}</strong>
              </li>
              <li>
                <span>Pledges</span>
                <strong>{inspection.counts.pledges}</strong>
              </li>
              <li>
                <span>Products</span>
                <strong>{inspection.counts.products}</strong>
              </li>
              <li>
                <span>Gold saving accounts</span>
                <strong>{inspection.counts.goldSavingAccounts}</strong>
              </li>
              <li>
                <span>Latest bill</span>
                <strong>
                  {inspection.latestInvoiceAt ? formatDisplayDateTime(inspection.latestInvoiceAt) : '—'}
                </strong>
              </li>
            </ul>
            {inspection.issues.length > 0 ? (
              <div className="error-banner">{inspection.issues.join('. ')}</div>
            ) : null}
          </div>
        </Modal>
      )}
    </>
  )
}
