import { useCallback, useEffect, useState } from 'react'
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

/**
 * « Autour de moi » : stations carburant (OSM) ou bornes (Open Charge Map)
 * les plus proches — distance et itinéraire en un tap. Jamais bloquant :
 * géoloc refusée ou réseau muet → états doux, zéro erreur.
 */
export default function NearbyCard({ energies, defaultEnergy }: Props) {
  const both = energies.length > 1
  const [mode, setMode] = useState<Energy>(energies.includes(defaultEnergy) ? defaultEnergy : energies[0])
  const [state, setState] = useState<State>('idle')
  const [geo, setGeo] = useState<GeoPoint | null>(null)
  const [places, setPlaces] = useState<NearbyPlace[]>([])

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

      {(state === 'locating' || state === 'loading') && (
        <div className="nearby-note">Recherche autour de toi…</div>
      )}

      {state === 'ready' && places.length === 0 && (
        <div className="nearby-note">
          {mode === 'electric'
            ? 'Aucune borne trouvée à moins de 5 km.'
            : 'Aucune station trouvée à moins de 5 km.'}
        </div>
      )}

      {state === 'ready' &&
        places.map((pl) => (
          <a
            key={pl.id}
            className="fillup-item nearby-row"
            href={mapsUrl({ lat: pl.lat, lng: pl.lng }, pl.name)}
            target="_blank"
            rel="noreferrer"
          >
            <div className={mode === 'electric' ? 'thumb ph elec' : 'thumb ph fuel'}>
              {mode === 'electric' ? <BoltIcon size={22} /> : <PumpIcon size={22} />}
            </div>
            <div className="body">
              <div className="nums">{pl.name}</div>
              <div className="sub">
                {fmtDist(pl.dist)}
                {pl.kw != null && ` · ${pl.kw.toLocaleString('fr-FR')} kW`}
                {pl.connectors != null &&
                  ` · ${pl.connectors} ${pl.connectors > 1 ? 'prises' : 'prise'}`}
              </div>
            </div>
            <span className="nearby-go" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </span>
          </a>
        ))}
    </section>
  )
}
