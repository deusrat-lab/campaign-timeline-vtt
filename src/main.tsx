import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { captureTokenFromUrl } from './state/persistence/authToken.ts'

// Must run before CampaignStoreProvider mounts — it builds the overlay
// adapter (localStorage vs HTTP) synchronously on first render, and the
// HTTP adapter needs the token already in localStorage by then. No-op
// entirely when the app isn't configured for a server backend (see
// src/config.ts's API_BASE_URL / .env.example).
captureTokenFromUrl()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
