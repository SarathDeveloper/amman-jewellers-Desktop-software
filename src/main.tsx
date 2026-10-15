import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './responsive.css'
import './platform-mac.css'
import App from './App.tsx'
import { applyPrintEmbedDataset } from './features/print/embedMode'
import { disableTextSuggestions } from './lib/disableTextSuggestions'
import { applyPlatformClass } from './lib/platform'

applyPrintEmbedDataset()
applyPlatformClass()
disableTextSuggestions()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
