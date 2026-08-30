import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTextSize } from './lib/textSize'

// Apply the player's saved text-size preference BEFORE React mounts —
// otherwise there's a brief flash of unscaled content on Regular/Large.
applyTextSize()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service-worker registration now lives in UpdatePrompt via
// registerWithUpdates(), so the same registration that installs the worker
// is the one watching for updates. Registering here as well raced with it
// and could swallow the 'updatefound' event.
