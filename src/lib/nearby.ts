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
  /** stations : prix du carburant principal (€/L), quand HERE le fournit */
  price?: number
  /** stations : libellé du carburant du prix (« Diesel », « Super 95 »…) */
  fuelLabel?: string
}

const RADIUS_KM = 5
const MAX_RESULTS = 12
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
        chargingPoint?: { numberOfConnectors?: number | null } | null
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
  const data = (await fetchJson(url)) as { items?: HereBrowseItem[] } | null
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
    places.push(base)
  }
  return places.sort((a, b) => a.dist - b.dist).slice(0, MAX_RESULTS)
}

/** Prix carburant HERE (Fuel Prices v2) — opportuniste : couverture selon
 * la zone et le plan ; toute erreur rend une carte vide. */
async function hereFuelPrices(p: GeoPoint, key: string): Promise<{ lat: number; lng: number; price: number; label: string }[]> {
  try {
    const url =
      `https://fuel-v2.cc.api.here.com/fuel/stations.json?prox=${p.lat},${p.lng},${RADIUS_KM * 1000}` +
      `&apikey=${key}`
    const data = (await fetchJson(url)) as {
      stations?: {
        latitude?: number
        longitude?: number
        fuelPrice?: { price?: number; fuelTypeName?: string; fuelType?: number }[]
      }[]
    } | null
    if (!data?.stations) return []
    const out: { lat: number; lng: number; price: number; label: string }[] = []
    for (const st of data.stations) {
      if (st.latitude == null || st.longitude == null) continue
      const fp = (st.fuelPrice ?? []).find((f) => f.price != null && f.price > 0)
      if (!fp) continue
      out.push({ lat: st.latitude, lng: st.longitude, price: fp.price as number, label: fp.fuelTypeName ?? '' })
    }
    return out
  } catch {
    return []
  }
}

/** Stations essence/diesel via HERE /browse, prix Fuel v2 rapprochés < 100 m */
async function fetchFuelStationsHere(p: GeoPoint, key: string): Promise<NearbyPlace[]> {
  const [items, prices] = await Promise.all([
    hereBrowse(p, '700-7600-0116', key),
    hereFuelPrices(p, key),
  ])
  const places: NearbyPlace[] = []
  for (const it of items) {
    const base = hereToPlace(p, it, 'here-fuel')
    if (!base) continue
    base.name = it.title || 'Station-service'
    const near = prices.find((pr) => haversineKm(base, { lat: pr.lat, lng: pr.lng }) < 0.1)
    if (near) {
      base.price = near.price
      if (near.label) base.fuelLabel = near.label
    }
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
      const places = await fetchFuelStationsHere(p, key)
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
