import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App'

// Mise à jour de la PWA : vérification immédiate puis toutes les heures ;
// en mode autoUpdate, la page se recharge dès que la nouvelle version
// du service worker prend le contrôle.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration) {
      window.setInterval(() => void registration.update(), 60 * 60 * 1000)
    }
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
