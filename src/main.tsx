import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'

// Activate a new build as soon as it lands, and re-check hourly for long-lived tabs.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh: () => void updateSW(true),
  onRegisteredSW: (_url, registration) => {
    if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000)
  },
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    void navigator.serviceWorker?.getRegistration().then((r) => r?.update())
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
