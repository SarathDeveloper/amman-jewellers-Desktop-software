import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { existsSync } from 'node:fs'
import type { Server } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from '../server/app'
import { backupDatabaseTo, tickScheduledBackup } from '../server/db/backup'
import { closeDatabase, initDatabase } from '../server/db'
import { getAppRoot } from '../server/lib/appPaths'

const here = dirname(fileURLToPath(import.meta.url))
const preloadPath = join(here, 'preload.cjs')

let mainWindow: BrowserWindow | null = null
let apiServer: Server | null = null
let rendererOrigin = ''
let ipcRegistered = false

function isDevMode(): boolean {
  return !app.isPackaged && process.argv.includes('--dev')
}

function configureDesktopPaths(): void {
  const dataDir = join(app.getPath('appData'), 'JewelTrackerPro')
  app.setPath('userData', dataDir)
  const projectRoot = app.isPackaged ? app.getAppPath() : join(here, '..')
  process.env.JEWELTRACKERPRO_DATA_DIR = dataDir
  process.env.JEWELTRACKERPRO_APP_ROOT = projectRoot
  process.env.JEWELTRACKERPRO_MIGRATIONS_DIR = app.isPackaged
    ? join(process.resourcesPath, 'migrations')
    : join(projectRoot, 'server', 'db', 'migrations')
}

function setupMenu(): void {
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        { role: 'appMenu' },
        { role: 'editMenu' },
        { role: 'viewMenu' },
        { role: 'windowMenu' },
      ]),
    )
    return
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'editMenu' },
      ...(isDevMode() ? [{ role: 'viewMenu' as const }] : []),
    ]),
  )
}

function isRendererUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.origin === rendererOrigin
  } catch {
    return false
  }
}

function isPrintUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.origin === rendererOrigin && parsed.pathname.startsWith('/print/')
  } catch {
    return false
  }
}

function attachWindowHandlers(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isPrintUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 900,
          height: 1100,
          autoHideMenuBar: true,
          webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      }
    }
    if (/^https?:/i.test(url) && !isRendererUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('about:')) {
      return
    }
    if (!isRendererUrl(url)) {
      event.preventDefault()
      if (/^https?:/i.test(url)) {
        void shell.openExternal(url)
      }
    }
  })

  if (!isDevMode()) {
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') {
        return
      }
      const key = input.key.toLowerCase()
      const withMod = input.control || input.meta
      const reload = key === 'f5' || (withMod && !input.alt && key === 'r')
      const devtools =
        key === 'f12' || (withMod && input.shift && (key === 'i' || key === 'j'))
      if (reload || devtools) {
        event.preventDefault()
      }
    })
  }
}

function startApiServer(port: number): Promise<number> {
  const expressApp = createApp()
  return new Promise((resolve, reject) => {
    const server = expressApp.listen(port, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to bind the local API server'))
        return
      }
      resolve(address.port)
    })
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        reject(
          new Error(
            `Port ${port} is already in use. Close the other JewelTrackerPro window or web server and try again.`,
          ),
        )
        return
      }
      reject(error)
    })
    apiServer = server
  })
}

async function createMainWindow(loadUrl: string): Promise<void> {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow = win

  win.once('ready-to-show', () => {
    win.show()
  })

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null
    }
  })

  if (isDevMode()) {
    win.webContents.openDevTools({ mode: 'detach' })
  }

  await loadRenderer(win, loadUrl)
}

async function loadRenderer(win: BrowserWindow, url: string): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await win.loadURL(url)
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => {
        setTimeout(resolve, 250)
      })
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Failed to load ${url}`)
}

function registerIpc(): void {
  if (ipcRegistered) {
    return
  }
  ipcRegistered = true
  ipcMain.handle('get-version', () => app.getVersion())
  ipcMain.handle('export-database', async () => {
    const target = BrowserWindow.getFocusedWindow() ?? mainWindow
    const options = {
      title: 'Export database backup',
      defaultPath: `jeweltrackerpro-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'SQLite database', extensions: ['db'] }],
    }
    const result = target
      ? await dialog.showSaveDialog(target, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) {
      return { canceled: true }
    }
    await backupDatabaseTo(result.filePath)
    return { canceled: false, filePath: result.filePath }
  })
}

async function boot(): Promise<void> {
  setupMenu()
  registerIpc()

  initDatabase()
  const runScheduledBackup = () =>
    tickScheduledBackup().catch((error: unknown) => {
      console.error('Scheduled database backup failed', error)
    })
  runScheduledBackup()
  setInterval(runScheduledBackup, 60_000)

  const apiPort = isDevMode() ? Number.parseInt(process.env.PORT ?? '3000', 10) : 0
  const boundPort = await startApiServer(apiPort)
  const rendererUrl = isDevMode() ? 'http://127.0.0.1:5173' : `http://127.0.0.1:${boundPort}`
  rendererOrigin = new URL(rendererUrl).origin
  console.log(`JewelTrackerPro API listening on http://127.0.0.1:${boundPort}`)

  if (!isDevMode()) {
    const distIndex = join(getAppRoot(), 'dist', 'index.html')
    if (!existsSync(distIndex)) {
      dialog.showErrorBox(
        'JewelTrackerPro',
        'Application files are missing (dist/index.html). Please reinstall or rebuild the app.',
      )
      app.quit()
      return
    }
  }

  await createMainWindow(rendererUrl)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.setName('JewelTrackerPro')
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.jeweltrackerpro.desktop')
  }
  configureDesktopPaths()

  app.on('browser-window-created', (_event, win) => {
    attachWindowHandlers(win)
  })

  app.on('second-instance', () => {
    if (!mainWindow) {
      return
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    void boot().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      dialog.showErrorBox('JewelTrackerPro failed to start', message)
      app.quit()
    })
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && rendererOrigin) {
      const url = isDevMode() ? 'http://127.0.0.1:5173' : rendererOrigin
      void createMainWindow(url)
    }
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('before-quit', () => {
    if (apiServer) {
      apiServer.close()
      apiServer = null
    }
    closeDatabase()
  })
}
