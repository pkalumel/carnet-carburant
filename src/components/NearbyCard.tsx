import { useCallback, useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { captureLocation, mapsUrl, type GeoPoint } from '../lib/geo'
import { fetchChargers, fetchFuelStations, fmtDist, type NearbyPlace } from '../lib/nearby'
import type { Energy } from '../lib/types'
import { BoltIcon, PinIcon, PumpIcon } from './icons'

interface Props {
  /** énergies pertinentes pour le filtre véhicule courant */
  energies: Energy[]
  /** énergie mise en avant par défaut (dernier plein réel) */
  defaultEnergy: Energy
}

type State = 'idle' | 'locating' | 'loading' | 'ready' | 'nogeo'

const PUMP_SVG =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V6a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v15"/><path d="M3 21h11"/><path d="M13 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V9l-3-3"/></svg>'
const BOLT_SVG =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg>'

/** Épingle façon signalétique : pastille encre, icône à la couleur d'énergie */
const placeIcon = (electric: boolean) =>
  L.divIcon({
    className: 'nearby-pin-wrap',
    html: `<div class="nearby-pin ${electric ? 'elec' : 'fuel'}">${electric ? BOLT_SVG : PUMP_SVG}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -20],
  })

const meIcon = L.divIcon({
  className: 'nearby-pin-wrap',
  html: '<div class="nearby-me"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * « Autour de moi » : carte des stations carburant ou bornes les plus
 * proches (HERE en source principale, repli OSM/Open Charge Map) —
 * itinéraire depuis l'épingle, prix carburant quand HERE les fournit.
 * Jamais bloquant : géoloc refusée ou réseau muet → états doux.
 */
export default function NearbyCard({ energies, defaultEnergy }: Props) {
  const both = energies.length > 1
  const [mode, setMode] = useState<Energy>(energies.includes(defaultEnergy) ? defaultEnergy : energies[0])
  const [state, setState] = useState<State>('idle')
  const [geo, setGeo] = useState<GeoPoint | null>(null)
  const [places, setPlaces] = useState<NearbyPlace[]>([])

  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.LayerGroup | null>(null)

  // Le filtre véhicule peut retirer l'énergie affichée : on se réaligne
  useEffect(() => {
    if (!energies.includes(mode)) setMode(energies.includes(defaultEnergy) ? defaultEnergy : energies[0])
  }, [energies, defaultEnergy, mode])

  const locate = useCallback(async () => {
    setState('locating')
    const p = await captureLocation()
    if (!p) {
      setState('nogeo')
      return
    }
    setGeo(p)
  }, [])

  useEffect(() => {
    void locate()
  }, [locate])

  useEffect(() => {
    if (!geo) return
    let alive = true
    setState('loading')
    const fetcher = mode === 'electric' ? fetchChargers : fetchFuelStations
    void fetcher(geo).then((list) => {
      if (!alive) return
      setPlaces(list)
      setState('ready')
    })
    return () => {
      alive = false
    }
  }, [geo, mode])

  // La carte naît quand la position est connue, et vit jusqu'au démontage
  useEffect(() => {
    if (!geo || !mapEl.current || mapRef.current) return
    const map = L.map(mapEl.current, {
      center: [geo.lat, geo.lng],
      zoom: 13,
      zoomControl: false,
      scrollWheelZoom: false, // le défilement de la page garde la main sur desktop
      attributionControl: true,
    })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    L.marker([geo.lat, geo.lng], { icon: meIcon, interactive: false }).addTo(map)
    markersRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      markersRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo])

  // Épingles : reconstruites au changement de résultats ou d'énergie
  useEffect(() => {
    const map = mapRef.current
    const group = markersRef.current
    if (!map || !group) return
    group.clearLayers()
    const electric = mode === 'electric'
    for (const pl of places) {
      const fmtPrice = (v: number) =>
        v.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
      const sub = [
        fmtDist(pl.dist),
        pl.kw != null ? `${pl.kw.toLocaleString('fr-FR')} kW` : null,
        pl.connectors != null ? `${pl.connectors} ${pl.connectors > 1 ? 'prises' : 'prise'}` : null,
        pl.available != null
          ? pl.available > 0
            ? `${pl.available} libre${pl.available > 1 ? 's' : ''}`
            : 'aucune libre'
          : null,
        ...(pl.prices ?? []).map((x) => `${x.label} ${fmtPrice(x.price)} €`),
      ]
        .filter(Boolean)
        .join(' · ')
      const html =
        `<div class="nearby-pop"><strong>${esc(pl.name)}</strong><span>${sub}</span>` +
        `<a href="${mapsUrl({ lat: pl.lat, lng: pl.lng }, pl.name)}" target="_blank" rel="noreferrer">Itinéraire</a></div>`
      L.marker([pl.lat, pl.lng], { icon: placeIcon(electric) }).bindPopup(html).addTo(group)
    }
    if (geo) {
      const bounds = L.latLngBounds([[geo.lat, geo.lng], ...places.map((pl) => [pl.lat, pl.lng] as [number, number])])
      map.fitBounds(bounds.pad(0.18), { maxZoom: 15 })
    }
  }, [places, mode, geo])

  return (
    <section className="card nearby-card">
      <h2>Autour de moi</h2>

      {both && (
        <div className="chips">
          <button
            type="button"
            className={mode === 'fuel' ? 'chip active' : 'chip'}
            onClick={() => setMode('fuel')}
          >
            <PumpIcon size={16} /> Stations
          </button>
          <button
            type="button"
            className={mode === 'electric' ? 'chip active' : 'chip'}
            onClick={() => setMode('electric')}
          >
            <BoltIcon size={16} /> Bornes
          </button>
        </div>
      )}

      {state === 'nogeo' && (
        <div className="nearby-note">
          Active la localisation pour voir les {mode === 'electric' ? 'bornes' : 'stations'} autour de toi.
          <button className="btn-ghost" style={{ marginTop: 10, width: '100%' }} onClick={() => void locate()}>
            <PinIcon size={16} /> Réessayer
          </button>
        </div>
      )}

      {state === 'locating' && <div className="nearby-note">Recherche de ta position…</div>}

      {geo && (
        <div className="nearby-map-wrap">
          <div ref={mapEl} className="nearby-map" aria-label="Carte des stations autour de toi" />
          {state === 'loading' && <div className="nearby-overlay">Recherche autour de toi…</div>}
          {state === 'ready' && places.length === 0 && (
            <div className="nearby-overlay">
              {mode === 'electric'
                ? 'Aucune borne trouvée à moins de 5 km.'
                : 'Aucune station trouvée à moins de 5 km.'}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
