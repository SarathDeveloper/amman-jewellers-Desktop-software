import { contextBridge, ipcRenderer } from 'electron'

export type DesktopExportResult = {
  canceled: boolean
  filePath?: string
}

export type DesktopAPI = {
  exportDatabase: () => Promise<DesktopExportResult>
  savePdf: (url: string, defaultFilename: string) => Promise<DesktopExportResult>
  getAppVersion: () => Promise<string>
  platform: string
}

const electronAPI: DesktopAPI = {
  exportDatabase: () => ipcRenderer.invoke('export-database') as Promise<DesktopExportResult>,
  savePdf: (url, defaultFilename) =>
    ipcRenderer.invoke('save-as-pdf', url, defaultFilename) as Promise<DesktopExportResult>,
  getAppVersion: () => ipcRenderer.invoke('get-version') as Promise<string>,
  platform: process.platform,
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
