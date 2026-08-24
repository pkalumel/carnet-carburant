import type { GeoPoint } from './geo'

/**
 * Stations et bornes autour de la position : sources gratuites, JAMAIS
 * bloquantes (le motif de geo.ts) — toute erreur ou délai rend [].
 * Stations carburant : Overpass/OSM (sans clé). Bornes : Open Charge Map
 * (clé gratuite via VITE_OCM_KEY ; sans clé → []).
 */
export interface NearbyPlace {
  id: string
  name: string
  /** distance en km depuis la position demandée */
  dist: number
  lat: number
  lng: number
  /** bornes : puissance max en kW */
  kw?: number
  /** bornes : nombre de prises */
  connectors?: number
}

const RADIUS_KM = 5
const MAX_RESULTS = 4
const CACHE_TTL_MS = 10 * 60 * 1000

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(s))
}

export const fmtDist = (km: number) =>
  km < 1 ? `${Math.round(km * 1000)} m` : `${km.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`

/** Cache de session par source et position arrondie (~500 m) : évite de
 * marteler les API publiques à chaque retour sur l'accueil. */
function cacheKey(source: string, p: GeoPoint) {
  return `carnet:nearby:${source}:${p.lat.toFixed(2)},${p.lng.toFixed(2)}`
}
function readCache(key: string): NearbyPlace[] | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const { at, places } = JSON.parse(raw) as { at: number; places: NearbyPlace[] }
    return Date.now() - at < CACHE_TTL_MS ? places : null
  } catch {
    return null
  }
}
function writeCache(key: string, places: NearbyPlace[]) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), places }))
  } catch {
    // stockage plein ou indisponible : le cache est un confort, pas un besoin
  }
}

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<unknown> {
  const ctrl = new AbortController()
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    if (!res.ok) return null
    return await res.json()
  } finally {
    window.clearTimeout(t)
  }
}

/** Stations carburant les plus proches (Overpass/OSM, repli miroir) */
export async function fetchFuelStations(p: GeoPoint): Promise<NearbyPlace[]> {
  const key = cacheKey('fuel', p)
  const cached = readCache(key)
  if (cached) return cached

  const query = `[out:json][timeout:8];node(around:${RADIUS_KM * 1000},${p.lat},${p.lng})[amenity=fuel];out body 20;`
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ]
  for (const endpoint of endpoints) {
    try {
      const data = (await fetchJson(endpoint, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })) as { elements?: { id: number; lat: number; lon: number; tags?: Record<string, string> }[] } | null
      if (!data?.elements) continue
      const places = data.elements
        .map((e) => ({
          id: `osm-${e.id}`,
          name: e.tags?.brand || e.tags?.name || 'Station-service',
          dist: haversineKm(p, { lat: e.lat, lng: e.lon }),
          lat: e.lat,
          lng: e.lon,
        }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, MAX_RESULTS)
      writeCache(key, places)
      return places
    } catch {
      // essai suivant (miroir), puis abandon silencieux
    }
  }
  return []
}

/** Bornes de recharge les plus proches (Open Charge Map, clé gratuite) */
export async function fetchChargers(p: GeoPoint): Promise<NearbyPlace[]> {
  const apiKey = import.meta.env.VITE_OCM_KEY as string | undefined
  if (!apiKey) return []

  const key = cacheKey('elec', p)
  const cached = readCache(key)
  if (cached) return cached

  try {
    const url =
      `https://api.openchargemap.io/v3/poi?output=json&latitude=${p.lat}&longitude=${p.lng}` +
      `&distance=${RADIUS_KM}&distanceunit=km&maxresults=8&compact=true&verbose=false&key=${apiKey}`
    const data = (await fetchJson(url)) as
      | {
          ID: number
          AddressInfo?: { Title?: string; Latitude?: number; Longitude?: number }
          OperatorInfo?: { Title?: string } | null
          Connections?: { PowerKW?: number | null; Quantity?: number | null }[] | null
        }[]
      | null
    if (!Array.isArray(data)) return []
    const places = data
      .filter((c) => c.AddressInfo?.Latitude != null && c.AddressInfo?.Longitude != null)
      .map((c) => {
        const conns = c.Connections ?? []
        const kw = Math.max(0, ...conns.map((x) => x.PowerKW ?? 0))
        const connectors = conns.reduce((s, x) => s + (x.Quantity ?? 1), 0)
        const at = { lat: c.AddressInfo!.Latitude as number, lng: c.AddressInfo!.Longitude as number }
        return {
          id: `ocm-${c.ID}`,
          name: c.OperatorInfo?.Title || c.AddressInfo?.Title || 'Borne de recharge',
          dist: haversineKm(p, at),
          lat: at.lat,
          lng: at.lng,
          kw: kw > 0 ? kw : undefined,
          connectors: connectors > 0 ? connectors : undefined,
        }
      })
      .sort((a, b) => a.dist - b.dist)
      .slice(0, MAX_RESULTS)
    writeCache(key, places)
    return places
  } catch {
    return []
  }
}
