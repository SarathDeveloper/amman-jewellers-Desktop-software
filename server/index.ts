import { createApp } from './app'
import { tickScheduledBackup } from './db/backup'
import { initDatabase } from './db'
import { logDiagnostic, logInfo } from './lib/logger'

const port = Number.parseInt(process.env.PORT ?? '3000', 10)

initDatabase()
const runScheduledBackup = () =>
  tickScheduledBackup().catch((error) => {
    logDiagnostic('backup', 'Scheduled database backup failed', error)
  })
runScheduledBackup()
setInterval(runScheduledBackup, 60_000)

const app = createApp()
app.listen(port, () => {
  logInfo('application', `API listening on http://localhost:${port}`)
  console.log(`Listening on http://localhost:${port}`)
})
