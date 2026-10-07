import { createApp } from './app'
import { tickScheduledBackup } from './db/backup'
import { initDatabase } from './db'
import { logDiagnostic, logInfo } from './lib/logger'

const isSidecar = process.env.JEWELTRACKERPRO_SIDECAR === '1'
const port = isSidecar
  ? Number.parseInt(process.env.PORT ?? '0', 10) || 0
  : Number.parseInt(process.env.PORT ?? '3000', 10)

const host = '127.0.0.1'

try {
  initDatabase()
} catch (error) {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error)
  const message = 'JewelTrackerPro API failed to start: database initialization error.'
  logDiagnostic('application', message, error)
  console.error(`${message}\n${detail}`)
  process.exit(1)
}

const runScheduledBackup = () =>
  tickScheduledBackup().catch((error) => {
    logDiagnostic('backup', 'Scheduled database backup failed', error)
  })
runScheduledBackup()
setInterval(runScheduledBackup, 60_000)

const app = createApp()
const server = app.listen(port, host, onListening)

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    const message = `JewelTrackerPro API failed to start: port ${port} is already in use. Stop the other process using that port and try again.`
    logDiagnostic('application', message, error)
    console.error(message)
    process.exit(1)
  }
  throw error
})

function onListening() {
  const address = server.address()
  const boundPort = typeof address === 'object' && address ? address.port : port
  const message = `JewelTrackerPro API listening on http://${host}:${boundPort}`
  logInfo('application', message)
  console.log(message)
}
