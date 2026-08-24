import { logApi } from './apiLog'

/**
 * Localisation d'une saisie : optionnelle et JAMAIS bloquante.
 * Refus de permission, temps dépassé ou hors-ligne → null, sans erreur.
 */
export interface GeoPoint {
  lat: number
  lng: number
}

/** Position actuelle, ou null (refus, indisponible, délai dépassé) */
export function captureLocation(timeoutMs = 8000): Promise<GeoPoint | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 120_000 },
    )
  })
}

/**
 * Libellé lisible (« Rue de la Station, Wavre ») via Nominatim/OSM.
 * Usage léger conforme à leur politique ; null si hors-ligne ou en échec.
 */
export async function reverseGeocode(p: GeoPoint): Promise<string | null> {
  const start = performance.now()
  try {
    const ctrl = new AbortController()
    const t = window.setTimeout(() => ctrl.abort(), 4000)
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${p.lat}&lon=${p.lng}&zoom=17&accept-language=fr`,
      { signal: ctrl.signal, headers: { Accept: 'application/json' } },
    )
    window.clearTimeout(t)
    logApi('nominatim', res.ok, res.status, performance.now() - start)
    if (!res.ok) return null
    const data = (await res.json()) as {
      name?: string
      address?: Record<string, string | undefined>
    }
    const a = data.address ?? {}
    const poi = data.name || a.amenity || a.shop
    const road = a.road || a.pedestrian || a.square
    const city = a.village || a.town || a.city || a.municipality
    const label = [poi || road, city].filter(Boolean).join(', ')
    return label || null
  } catch {
    logApi('nominatim', false, null, performance.now() - start)
    return null
  }
}

/** Lien carte universel (Plans sur iOS, redirigé ailleurs) */
export const mapsUrl = (p: GeoPoint, label = 'Plein') =>
  `https://maps.apple.com/?ll=${p.lat},${p.lng}&q=${encodeURIComponent(label)}`
