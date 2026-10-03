import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, type NativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import type { Server } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from '../server/app'
import { backupDatabaseTo, tickScheduledBackup } from '../server/db/backup'
import { closeDatabase, initDatabase } from '../server/db'
import { getAppRoot } from '../server/lib/appPaths'
import { logError } from '../server/lib/logger'

const here = dirname(fileURLToPath(import.meta.url))
const preloadPath = join(here, 'preload.cjs')
const splashPath = join(here, 'splash.html')

let mainWindow: BrowserWindow | null = null
let apiServer: Server | null = null
let rendererOrigin = ''
let ipcRegistered = false

const MAX_RENDERER_RECOVERIES = 3
const rendererRecoveries = new WeakMap<BrowserWindow, number>()

function scheduleRendererReload(win: BrowserWindow, reason: string): void {
  if (win.isDestroyed()) {
    return
  }
  const attempts = rendererRecoveries.get(win) ?? 0
  if (attempts >= MAX_RENDERER_RECOVERIES) {
    console.error(`Renderer recovery exhausted after ${attempts} attempts (${reason})`)
    return
  }
  rendererRecoveries.set(win, attempts + 1)
  console.error(`Reloading renderer (${reason}), attempt ${attempts + 1} of ${MAX_RENDERER_RECOVERIES}`)
  setTimeout(() => {
    if (win.isDestroyed()) {
      return
    }
    win.webContents.reload()
  }, 1500)
}

function isDevMode(): boolean {
  return !app.isPackaged && process.argv.includes('--dev')
}

function resolveAppIconPath(): string {
  if (app.isPackaged) {
    return join(app.getAppPath(), 'src', 'images', 'amman-jeweller-logo.png')
  }
  return join(here, '..', 'src', 'images', 'amman-jeweller-logo.png')
}

function loadAppIcon(): NativeImage | undefined {
  const image = nativeImage.createFromPath(resolveAppIconPath())
  return image.isEmpty() ? undefined : image
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
            backgroundThrottling: false,
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
    if (url.startsWith('about:') || url.startsWith('file:')) {
      return
    }
    if (!isRendererUrl(url)) {
      event.preventDefault()
      if (/^https?:/i.test(url)) {
        void shell.openExternal(url)
      }
    }
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') {
      return
    }
    logError(`Renderer process gone: ${details.reason} (exit ${details.exitCode})`)
    scheduleRendererReload(win, `render-process-gone: ${details.reason}`)
  })

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) {
      return
    }
    logError(`Page failed to load: ${errorDescription} (${errorCode})`)
    scheduleRendererReload(win, `did-fail-load: ${errorDescription}`)
  })

  win.webContents.on('unresponsive', () => {
    logError('Renderer became unresponsive')
  })

  win.webContents.on('responsive', () => {
    logError('Renderer became responsive again')
  })

  win.webContents.on('did-finish-load', () => {
    rendererRecoveries.delete(win)
  })

  win.webContents.on('did-navigate-in-page', () => {
    rendererRecoveries.delete(win)
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

async function createMainWindow(): Promise<BrowserWindow> {
  const appIcon = loadAppIcon()
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 700,
    show: true,
    backgroundColor: '#f3f4f6',
    autoHideMenuBar: process.platform !== 'darwin',
    ...(appIcon ? { icon: appIcon } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })
  mainWindow = win

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null
    }
  })

  if (isDevMode()) {
    win.webContents.openDevTools({ mode: 'detach' })
  }

  await win.loadFile(splashPath)
  return win
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
        setTimeout(resolve, 500)
      })
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Failed to load ${url}`)
}

const PRINT_READY_SCRIPT = `new Promise((resolve, reject) => {
  function settle(data) {
    if (data && data.type === 'print-error') {
      reject(new Error(typeof data.message === 'string' ? data.message : 'Failed to load preview'))
      return
    }
    if (data && data.type === 'print-ready') {
      resolve(true)
      return
    }
  }
  const existing = window.__PRINT_SIGNAL__
  if (existing && (existing.type === 'print-error' || existing.type === 'print-ready')) {
    settle(existing)
    return
  }
  const timer = setTimeout(() => reject(new Error('Timed out waiting for print preview')), 15000)
  function onMessage(event) {
    if (event.origin !== window.location.origin) return
    const data = event.data
    if (!data || typeof data !== 'object') return
    if (data.type !== 'print-error' && data.type !== 'print-ready') return
    window.removeEventListener('message', onMessage)
    clearTimeout(timer)
    settle(data)
  }
  window.addEventListener('message', onMessage)
  if (window.__PRINT_SIGNAL__) {
    window.removeEventListener('message', onMessage)
    clearTimeout(timer)
    settle(window.__PRINT_SIGNAL__)
  }
})`

function sanitizePdfFilename(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/^\.+/, '')
  const base = cleaned || 'document.pdf'
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`
}

function resolvePrintPdfUrl(path: string): string {
  if (!rendererOrigin) {
    throw new Error('The app is still starting. Try again in a moment.')
  }
  const url = new URL(path, rendererOrigin)
  if (url.origin !== rendererOrigin || !url.pathname.startsWith('/print/')) {
    throw new Error('Invalid print URL')
  }
  url.searchParams.set('embed', '1')
  return url.toString()
}

async function generatePrintPdf(printUrl: string): Promise<Uint8Array> {
  const session = (BrowserWindow.getFocusedWindow() ?? mainWindow)?.webContents.session
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1100,
    skipTaskbar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      ...(session ? { session } : {}),
    },
  })
  try {
    await win.loadURL(printUrl)
    await win.webContents.executeJavaScript(PRINT_READY_SCRIPT)
    return await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      pageSize: 'A4',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    })
  } finally {
    if (!win.isDestroyed()) {
      win.destroy()
    }
  }
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
  ipcMain.handle('save-as-pdf', async (_event, path: unknown, defaultFilename: unknown) => {
    if (typeof path !== 'string' || typeof defaultFilename !== 'string') {
      throw new Error('Invalid PDF export request')
    }
    const printUrl = resolvePrintPdfUrl(path)
    const target = BrowserWindow.getFocusedWindow() ?? mainWindow
    const options = {
      title: 'Save PDF',
      defaultPath: sanitizePdfFilename(defaultFilename),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    }
    const result = target
      ? await dialog.showSaveDialog(target, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) {
      return { canceled: true }
    }
    const filePath = result.filePath.toLowerCase().endsWith('.pdf')
      ? result.filePath
      : `${result.filePath}.pdf`
    const pdf = await generatePrintPdf(printUrl)
    await writeFile(filePath, pdf)
    return { canceled: false, filePath }
  })
}

async function boot(): Promise<void> {
  setupMenu()
  const appIcon = loadAppIcon()
  if (appIcon && process.platform === 'darwin') {
    app.dock?.setIcon(appIcon)
  }
  registerIpc()

  const win = await createMainWindow()

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

  if (win.isDestroyed()) {
    return
  }
  await loadRenderer(win, rendererUrl)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.setName('JewelTrackerPro')
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.jeweltrackerpro.desktop')
    app.disableHardwareAcceleration()
    app.commandLine.appendSwitch('disable-renderer-backgrounding')
    app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
    app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
    app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512')
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
      logError('JewelTrackerPro failed to start', error)
      const message = error instanceof Error ? error.message : String(error)
      dialog.showErrorBox('JewelTrackerPro failed to start', message)
      app.quit()
    })
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && rendererOrigin) {
      const url = isDevMode() ? 'http://127.0.0.1:5173' : rendererOrigin
      void createMainWindow().then((win) => loadRenderer(win, url))
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
