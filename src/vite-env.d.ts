/// <reference types="vite/client" />

type DesktopExportResult = {
  canceled: boolean
  filePath?: string
}

type DesktopAPI = {
  exportDatabase: () => Promise<DesktopExportResult>
  exportExcel: () => Promise<DesktopExportResult>
  savePdf: (bytes: Uint8Array, defaultFilename: string) => Promise<DesktopExportResult>
  chooseBackupFolder: () => Promise<string | null>
  getAppVersion: () => Promise<string>
  platform: string
  isMac: boolean
  openPrintWindow: (path: string) => Promise<void>
  printWebview: () => Promise<void>
}

interface Window {
  desktopAPI?: DesktopAPI
  __JTP_DESKTOP_PRINT__?: boolean
}
