/// <reference types="vite/client" />

type DesktopExportResult = {
  canceled: boolean
  filePath?: string
}

type DesktopAPI = {
  exportDatabase: () => Promise<DesktopExportResult>
  exportExcel: () => Promise<DesktopExportResult>
  savePdf: (url: string, defaultFilename: string) => Promise<DesktopExportResult>
  chooseBackupFolder: () => Promise<string | null>
  getAppVersion: () => Promise<string>
  platform: string
}

interface Window {
  desktopAPI?: DesktopAPI
}
