import { useEffect, useState } from 'react'

/** Préférence de thème : suivre le système, ou forcer clair/sombre */
export type ThemePref = 'auto' | 'light' | 'dark'

const KEY = 'carnet:theme'
const LIGHT_COLOR = '#f3f1ec'
const DARK_COLOR = '#1b2733'

export function getThemePref(): ThemePref {
  const v = localStorage.getItem(KEY)
  return v === 'light' || v === 'dark' ? v : 'auto'
}

function systemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Applique la préférence : attribut data-theme + meta theme-color */
function apply(pref: ThemePref) {
  const root = document.documentElement
  if (pref === 'auto') delete root.dataset.theme
  else root.dataset.theme = pref
  const dark = pref === 'dark' || (pref === 'auto' && systemDark())
  // Les deux metas (clair/sombre par media query) sont forcées à la couleur
  // effective : nécessaire quand data-theme contredit le système.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = dark ? DARK_COLOR : LIGHT_COLOR
  }
}

/** Thème réellement appliqué (« auto » résolu), pour ce qui ne peut pas
 *  passer par les tokens CSS — les tuiles de carte, par exemple. */
export function useResolvedTheme(): 'light' | 'dark' {
  const resolved = () => {
    const t = document.documentElement.dataset.theme
    return t === 'dark' || (t == null && systemDark()) ? 'dark' : 'light'
  }
  const [theme, setTheme] = useState<'light' | 'dark'>(resolved)

  useEffect(() => {
    const update = () => setTheme(resolved())
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', update)
    // bascule depuis Réglages : data-theme change sur <html>
    const obs = new MutationObserver(update)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      mq.removeEventListener('change', update)
      obs.disconnect()
    }
    // resolved() ne dépend que du DOM : effet de montage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return theme
}

export function useTheme(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(getThemePref)

  useEffect(() => {
    apply(pref)
    if (pref === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref)
  }, [pref])

  // En mode auto, la meta theme-color suit les bascules du système
  useEffect(() => {
    if (pref !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => apply('auto')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [pref])

  return [pref, setPref]
}
