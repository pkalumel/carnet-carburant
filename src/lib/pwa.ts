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

// ------------------------------------------------------------
// Bannière d'installation maison : proposée après le 3e plein
// enregistré, jamais au premier lancement. Android capte
// beforeinstallprompt ; iOS reçoit les instructions Partager.
// ------------------------------------------------------------
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const installSubs = new Set<() => void>()

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredPrompt = e as BeforeInstallPromptEvent
  installSubs.forEach((s) => s())
})

const DISMISS_KEY = 'carnet:installDismissed'
export const FILL_COUNT_KEY = 'carnet:fillCount'

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

export function useInstallBanner(fillCount: number) {
  const [, force] = useState(0)
  useEffect(() => {
    const bump = () => force((n) => n + 1)
    installSubs.add(bump)
    return () => {
      installSubs.delete(bump)
    }
  }, [])
  const dismissed = localStorage.getItem(DISMISS_KEY) === '1'
  const eligible = !isStandalone() && !dismissed && fillCount >= 3
  return {
    show: eligible && (deferredPrompt != null || isIos()),
    ios: isIos(),
    canPrompt: deferredPrompt != null,
    install: () => {
      void deferredPrompt?.prompt()
      deferredPrompt = null
      force((n) => n + 1)
    },
    dismiss: () => {
      localStorage.setItem(DISMISS_KEY, '1')
      force((n) => n + 1)
    },
  }
}
