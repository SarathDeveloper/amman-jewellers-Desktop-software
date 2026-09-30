/// <reference types="vite/client" />

type DesktopExportResult = {
  canceled: boolean
  filePath?: string
}

type DesktopAPI = {
  exportDatabase: () => Promise<DesktopExportResult>
  getAppVersion: () => Promise<string>
  platform: string
}

interface Window {
  electronAPI?: DesktopAPI
}
