import { createApp } from './app'
import { tickScheduledBackup } from './db/backup'
import { initDatabase } from './db'
import { logDiagnostic, logInfo } from './lib/logger'

const isSidecar = process.env.JEWELTRACKERPRO_SIDECAR === '1'
const port = isSidecar
  ? Number.parseInt(process.env.PORT ?? '0', 10) || 0
  : Number.parseInt(process.env.PORT ?? '3000', 10)

initDatabase()
const runScheduledBackup = () =>
  tickScheduledBackup().catch((error) => {
    logDiagnostic('backup', 'Scheduled database backup failed', error)
  })
runScheduledBackup()
setInterval(runScheduledBackup, 60_000)

const app = createApp()
const server = isSidecar ? app.listen(port, '127.0.0.1', onListening) : app.listen(port, onListening)

function onListening() {
  const address = server.address()
  const boundPort = typeof address === 'object' && address ? address.port : port
  const host = isSidecar ? '127.0.0.1' : 'localhost'
  const message = `JewelTrackerPro API listening on http://${host}:${boundPort}`
  logInfo('application', message)
  console.log(message)
}
