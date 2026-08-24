import { logApi } from './apiLog'
import type { GeoPoint } from './geo'

/**
 * Stations et bornes autour de la position : JAMAIS bloquantes (le motif
 * de geo.ts) — toute erreur ou délai rend [].
 * Source principale : les API HERE (Geocoding & Search v7 /browse avec
 * show=ev pour les bornes ; Fuel Prices v2 opportuniste pour les prix),
 * via la clé VITE_HERE_KEY. Repli silencieux si la clé manque ou si HERE
 * ne répond pas : Overpass/OSM (stations) et Open Charge Map (bornes).
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
  /** bornes : prises libres à l'instant (HERE temps réel, si publié) */
  available?: number
  /** stations : prix par carburant (€/L), quand HERE les fournit */
  prices?: { label: string; price: number }[]
}

const RADIUS_KM = 10
const MAX_RESULTS = 20
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
  // le rayon fait partie de la clé : changer la portée invalide le cache
  return `carnet:nearby:${source}:r${RADIUS_KM}:${p.lat.toFixed(2)},${p.lng.toFixed(2)}`
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

async function fetchJson(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000,
  api?: string,
): Promise<unknown> {
  const ctrl = new AbortController()
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs)
  const start = performance.now()
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    if (api) logApi(api, res.ok, res.status, performance.now() - start)
    if (!res.ok) return null
    return await res.json()
  } catch (e) {
    if (api) logApi(api, false, null, performance.now() - start)
    throw e
  } finally {
    window.clearTimeout(t)
  }
}

/** Repli stations : Overpass/OSM (sans clé, miroir en secours) */
async function fetchFuelStationsOsm(p: GeoPoint): Promise<NearbyPlace[]> {
  const key = cacheKey('fuel', p)
  const cached = readCache(key)
  if (cached) return cached

  const query = `[out:json][timeout:8];node(around:${RADIUS_KM * 1000},${p.lat},${p.lng})[amenity=fuel];out body 40;`
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
      }, 8000, 'overpass')) as { elements?: { id: number; lat: number; lon: number; tags?: Record<string, string> }[] } | null
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

/** Repli bornes : Open Charge Map (clé gratuite VITE_OCM_KEY) */
async function fetchChargersOcm(p: GeoPoint): Promise<NearbyPlace[]> {
  const apiKey = import.meta.env.VITE_OCM_KEY as string | undefined
  if (!apiKey) return []

  const key = cacheKey('elec', p)
  const cached = readCache(key)
  if (cached) return cached

  try {
    const url =
      `https://api.openchargemap.io/v3/poi?output=json&latitude=${p.lat}&longitude=${p.lng}` +
      `&distance=${RADIUS_KM}&distanceunit=km&maxresults=20&compact=true&verbose=false&key=${apiKey}`
    const data = (await fetchJson(url, {}, 8000, 'open-charge-map')) as
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

// ------------------------------------------------------------------ HERE

const hereKey = () => (import.meta.env.VITE_HERE_KEY as string | undefined) || null

interface HereBrowseItem {
  id?: string
  title?: string
  position?: { lat?: number; lng?: number }
  /** mètres depuis le point de recherche */
  distance?: number
  extended?: {
    evStation?: {
      connectors?: {
        maxPowerLevel?: number | null
        chargingPoint?: {
          numberOfConnectors?: number | null
          numberOfAvailable?: number | null
        } | null
        connectorsCount?: number | null
      }[]
      totalNumberOfConnectors?: number | null
    }
  }
}

/** Recherche de proximité HERE (Geocoding & Search v7 /browse) */
async function hereBrowse(p: GeoPoint, category: string, key: string, show?: string): Promise<HereBrowseItem[]> {
  const url =
    `https://browse.search.hereapi.com/v1/browse?at=${p.lat},${p.lng}` +
    `&in=circle:${p.lat},${p.lng};r=${RADIUS_KM * 1000}&categories=${category}` +
    (show ? `&show=${show}` : '') +
    `&limit=20&apiKey=${key}`
  const api = show === 'ev' ? 'here-browse-ev' : 'here-browse-fuel'
  const data = (await fetchJson(url, {}, 8000, api)) as { items?: HereBrowseItem[] } | null
  return data?.items ?? []
}

const hereToPlace = (p: GeoPoint, it: HereBrowseItem, idPrefix: string): NearbyPlace | null => {
  const lat = it.position?.lat
  const lng = it.position?.lng
  if (lat == null || lng == null) return null
  return {
    id: `${idPrefix}-${it.id ?? `${lat},${lng}`}`,
    name: it.title || 'Sans nom',
    dist: it.distance != null ? it.distance / 1000 : haversineKm(p, { lat, lng }),
    lat,
    lng,
  }
}

/** Bornes EV via HERE /browse + show=ev (connecteurs, kW) */
async function fetchChargersHere(p: GeoPoint, key: string): Promise<NearbyPlace[]> {
  const items = await hereBrowse(p, '700-7600-0322', key, 'ev')
  const places: NearbyPlace[] = []
  for (const it of items) {
    const base = hereToPlace(p, it, 'here-ev')
    if (!base) continue
    base.name = it.title || 'Borne de recharge'
    const conns = it.extended?.evStation?.connectors ?? []
    const kw = Math.max(0, ...conns.map((c) => c.maxPowerLevel ?? 0))
    const count =
      it.extended?.evStation?.totalNumberOfConnectors ??
      conns.reduce(
        (s, c) => s + (c.chargingPoint?.numberOfConnectors ?? c.connectorsCount ?? 1),
        0,
      )
    if (kw > 0) base.kw = kw
    if (count > 0) base.connectors = count
    // disponibilité temps réel, quand l'opérateur la publie
    const avail = conns
      .map((c) => c.chargingPoint?.numberOfAvailable)
      .filter((n): n is number => n != null)
    if (avail.length > 0) base.available = avail.reduce((a, b) => a + b, 0)
    places.push(base)
  }
  return places.sort((a, b) => a.dist - b.dist).slice(0, MAX_RESULTS)
}

/** Libellés courts des codes fuelType HERE rencontrés en Europe */
const FUEL_LABELS: Record<string, string> = {
  '1': 'Diesel',
  '10': 'Diesel+',
  '14': 'LPG',
  '21': 'CNG',
  '53': 'SP95 E5',
  '54': 'SP95 E10',
  '55': 'Diesel+',
  '56': 'SP95',
  '59': 'SP98',
  '60': 'SP98',
}
/** priorité d'affichage : les carburants du quotidien d'abord */
const FUEL_ORDER = ['1', '54', '53', '56', '59', '60', '55', '10', '14', '21']

/** Stations essence/diesel via HERE Fuel Prices v3 : localisation, marque
 * ET prix en un appel. Réservé aux zones couvertes par le plan — sinon
 * l'appelant retombe sur /browse puis OSM. */
async function fetchFuelStationsHere(p: GeoPoint, key: string): Promise<NearbyPlace[]> {
  const url =
    `https://fuel.hereapi.com/v3/stations?in=circle:${p.lat},${p.lng};r=${RADIUS_KM * 1000}` +
    `&apiKey=${key}`
  const data = (await fetchJson(url, {}, 8000, 'here-fuel-v3')) as {
    stations?: {
      id?: string
      name?: string
      brand?: string
      distance?: number
      position?: { lat?: number; lng?: number }
      prices?: { price?: number; fuelType?: string; unit?: string }[]
    }[]
  } | null
  if (!data?.stations) return []
  const places: NearbyPlace[] = []
  for (const st of data.stations) {
    const lat = st.position?.lat
    const lng = st.position?.lng
    if (lat == null || lng == null) continue
    const priced = (st.prices ?? []).filter((x) => x.price != null && x.price > 0 && x.fuelType != null)
    priced.sort((a, b) => {
      const ia = FUEL_ORDER.indexOf(a.fuelType as string)
      const ib = FUEL_ORDER.indexOf(b.fuelType as string)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
    // deux prix max : le diesel et l'essence courante suffisent en popup
    const seen = new Set<string>()
    const prices: { label: string; price: number }[] = []
    for (const x of priced) {
      const label = FUEL_LABELS[x.fuelType as string]
      if (!label || seen.has(label)) continue
      seen.add(label)
      prices.push({ label, price: x.price as number })
      if (prices.length === 2) break
    }
    places.push({
      id: `here-fuel-${st.id ?? `${lat},${lng}`}`,
      name: st.brand || st.name || 'Station-service',
      dist: st.distance != null ? st.distance / 1000 : haversineKm(p, { lat, lng }),
      lat,
      lng,
      ...(prices.length > 0 ? { prices } : {}),
    })
  }
  return places.sort((a, b) => a.dist - b.dist).slice(0, MAX_RESULTS)
}

/** Repli intermédiaire : /browse (localisation seule, sans prix) */
async function fetchFuelStationsHereBrowse(p: GeoPoint, key: string): Promise<NearbyPlace[]> {
  const items = await hereBrowse(p, '700-7600-0116', key)
  const places: NearbyPlace[] = []
  for (const it of items) {
    const base = hereToPlace(p, it, 'here-fuel')
    if (!base) continue
    base.name = it.title || 'Station-service'
    places.push(base)
  }
  return places.sort((a, b) => a.dist - b.dist).slice(0, MAX_RESULTS)
}

// ------------------------------------------------- orchestrateurs exportés

/** Stations les plus proches : HERE d'abord, repli OSM si muet */
export async function fetchFuelStations(p: GeoPoint): Promise<NearbyPlace[]> {
  const key = hereKey()
  if (key) {
    const ck = cacheKey('fuel-here', p)
    const cached = readCache(ck)
    if (cached) return cached
    try {
      let places = await fetchFuelStationsHere(p, key)
      if (places.length === 0) places = await fetchFuelStationsHereBrowse(p, key)
      if (places.length > 0) {
        writeCache(ck, places)
        return places
      }
    } catch {
      // clé invalide ou service muet : le repli prend la main
    }
  }
  return fetchFuelStationsOsm(p)
}

/** Bornes les plus proches : HERE d'abord, repli Open Charge Map si muet */
export async function fetchChargers(p: GeoPoint): Promise<NearbyPlace[]> {
  const key = hereKey()
  if (key) {
    const ck = cacheKey('elec-here', p)
    const cached = readCache(ck)
    if (cached) return cached
    try {
      const places = await fetchChargersHere(p, key)
      if (places.length > 0) {
        writeCache(ck, places)
        return places
      }
    } catch {
      // clé invalide ou service muet : le repli prend la main
    }
  }
  return fetchChargersOcm(p)
}
