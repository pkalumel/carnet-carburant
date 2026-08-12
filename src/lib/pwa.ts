import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

// Mode « prompt » : quand une nouvelle version est prête, on prévient
// l'interface ; l'utilisateur choisit le moment du rechargement.
let needRefresh = false
const subs = new Set<(v: boolean) => void>()

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    needRefresh = true
    subs.forEach((s) => s(true))
  },
  onRegisteredSW(_url, registration) {
    if (registration) {
      window.setInterval(() => void registration.update(), 60 * 60 * 1000)
    }
  },
})

/** Nouvelle version prête ? `apply()` l'active et recharge la page. */
export function usePwaUpdate() {
  const [ready, setReady] = useState(needRefresh)
  useEffect(() => {
    subs.add(setReady)
    return () => {
      subs.delete(setReady)
    }
  }, [])
  return { ready, apply: () => void updateSW(true) }
}
