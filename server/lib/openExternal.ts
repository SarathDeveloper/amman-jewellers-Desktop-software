import { spawn } from 'node:child_process'
import { isSafeWhatsAppUrl } from '@shared/adagu/reminders'
import { HttpError } from './http'

/**
 * Open a WhatsApp link in the default browser.
 *
 * Tauri capabilities are deliberately left untouched, so the desktop shell
 * cannot open external URLs on its own. Links are strictly validated before
 * they reach the shell, and the Windows call keeps `start` to a single safe
 * argument. Set `JEWELTRACKERPRO_NO_OPEN=1` to skip the launch (tests use it).
 */
export function openExternalUrl(url: string): void {
  if (!isSafeWhatsAppUrl(url)) {
    throw new HttpError(400, 'Only WhatsApp links can be opened')
  }
  if (process.env.JEWELTRACKERPRO_NO_OPEN === '1') return

  const options = { detached: true, stdio: 'ignore' as const, windowsHide: true }
  if (process.platform === 'win32') {
    // `start` is a cmd builtin. The validated URL has no shell metacharacters,
    // and an unquoted argument is opened as-is by the default browser.
    spawn('cmd.exe', ['/d', '/c', 'start', '', url], options).unref()
    return
  }
  const opener = process.platform === 'darwin' ? 'open' : 'xdg-open'
  spawn(opener, [url], options).unref()
}
