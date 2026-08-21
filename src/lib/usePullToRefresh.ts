import { useEffect, useRef, useState } from 'react'

/** Distance d'affichage (px, amortie) à partir de laquelle le geste déclenche */
export const PULL_THRESHOLD = 60

/**
 * « Tirer pour actualiser » : quand la page est en haut et qu'on la tire
 * vers le bas au doigt, `onRefresh` est appelé au relâchement. Renvoie la
 * distance amortie du tirage en cours et l'état d'actualisation, pour
 * animer l'indicateur.
 */
export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const pulling = useRef(false)
  const busy = useRef(false)

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (busy.current || e.touches.length !== 1 || window.scrollY > 0) return
      // Pas de tirage depuis une feuille ouverte (elle a son propre défilement)
      if (e.target instanceof Element && e.target.closest('.sheet, .sheet-backdrop')) return
      startY.current = e.touches[0].clientY
      pulling.current = false
    }
    const onMove = (e: TouchEvent) => {
      if (busy.current || startY.current == null) return
      const dy = e.touches[0].clientY - startY.current
      if (dy <= 0 || window.scrollY > 0) {
        if (pulling.current) {
          pulling.current = false
          setPull(0)
        }
        return
      }
      pulling.current = true
      setPull(Math.min(dy * 0.45, 90))
    }
    const onEnd = () => {
      if (startY.current == null) return
      startY.current = null
      if (!pulling.current) return
      pulling.current = false
      setPull((p) => {
        if (p >= PULL_THRESHOLD && !busy.current) {
          busy.current = true
          setRefreshing(true)
          void onRefresh().finally(() => {
            busy.current = false
            setRefreshing(false)
          })
        }
        return 0
      })
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [onRefresh])

  return { pull, refreshing }
}
