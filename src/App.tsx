import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { flushOutbox, loadFillups, loadVehicles } from './lib/db'
import { listOutbox } from './lib/outbox'
import type { Fillup, Vehicle } from './lib/types'
import AuthScreen from './components/AuthScreen'
import FillupForm from './components/FillupForm'
import History from './components/History'
import VehicleManager from './components/VehicleManager'
import { HistoryIcon, PumpIcon, StatsIcon } from './components/icons'

const Stats = lazy(() => import('./components/Stats'))

type Tab = 'new' | 'history' | 'stats'

const VEHICLE_KEY = 'carnet:vehicle'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [fillups, setFillups] = useState<Fillup[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [online, setOnline] = useState(navigator.onLine)
  const [tab, setTab] = useState<Tab>('new')
  const [vehicleFilter, setVehicleFilter] = useState<string>(
    () => localStorage.getItem(VEHICLE_KEY) ?? 'all',
  )
  const [showGarage, setShowGarage] = useState(false)
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)

  const showToast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ msg, kind })
    window.setTimeout(() => setToast(null), 3500)
  }, [])

  // Session Supabase
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const refresh = useCallback(async () => {
    const [v, f, outbox] = await Promise.all([loadVehicles(), loadFillups(), listOutbox()])
    setVehicles(v)
    setFillups(f)
    setPendingCount(outbox.length)
  }, [])

  // Chargement initial + synchronisation au retour du réseau
  useEffect(() => {
    if (!session) return
    void flushOutbox().then(() => refresh())
    const onOnline = async () => {
      setOnline(true)
      const n = await flushOutbox()
      if (n > 0) showToast(n === 1 ? '1 plein synchronisé ✓' : `${n} pleins synchronisés ✓`)
      void refresh()
    }
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [session, refresh, showToast])

  useEffect(() => {
    localStorage.setItem(VEHICLE_KEY, vehicleFilter)
  }, [vehicleFilter])

  if (session === undefined) return null
  if (!session) return <AuthScreen />

  const filtered =
    vehicleFilter === 'all' ? fillups : fillups.filter((f) => f.vehicle_id === vehicleFilter)
  const userEmail = session.user.email ?? null

  return (
    <>
      <header className="topbar">
        <span className="brand">
          Carnet <em>Carburant</em>
        </span>
        <select
          value={vehicleFilter}
          onChange={(e) => setVehicleFilter(e.target.value)}
          aria-label="Filtrer par véhicule"
        >
          <option value="all">Tous les véhicules</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <button className="signout" onClick={() => void supabase.auth.signOut()}>
          Sortir
        </button>
      </header>

      {!online && (
        <div className="netbanner offline">
          Hors ligne — les pleins saisis seront synchronisés au retour du réseau
        </div>
      )}
      {online && pendingCount > 0 && (
        <div className="netbanner pending">
          {pendingCount === 1 ? '1 plein en attente' : `${pendingCount} pleins en attente`} de
          synchronisation
        </div>
      )}

      <main className="content">
        {tab === 'new' && (
          <>
            {vehicles.length === 0 ? (
              <>
                <div className="card empty">
                  Bienvenue ! Commence par ajouter le premier véhicule de la famille.
                </div>
                <VehicleManager vehicles={vehicles} onChanged={() => void refresh()} showToast={showToast} />
              </>
            ) : (
              <>
                <FillupForm
                  key={vehicleFilter} /* re-préremplit le véhicule quand le filtre change */
                  vehicles={vehicles}
                  defaultVehicleId={vehicleFilter !== 'all' ? vehicleFilter : null}
                  userEmail={userEmail}
                  showToast={showToast}
                  onSaved={(status, draft) => {
                    showToast(
                      status === 'queued'
                        ? 'Enregistré sur le téléphone — synchronisation dès que possible'
                        : draft
                          ? 'Photo enregistrée — à compléter dans l’historique'
                          : 'Plein enregistré ✓',
                    )
                    if (draft) setTab('history')
                    void refresh()
                  }}
                />
                <button className="btn-ghost" onClick={() => setShowGarage(!showGarage)}>
                  {showGarage ? 'Masquer les véhicules' : 'Gérer les véhicules'}
                </button>
                {showGarage && (
                  <VehicleManager vehicles={vehicles} onChanged={() => void refresh()} showToast={showToast} />
                )}
              </>
            )}
          </>
        )}

        {tab === 'history' && (
          <History
            fillups={filtered}
            vehicles={vehicles}
            onChanged={() => void refresh()}
            showToast={showToast}
          />
        )}

        {tab === 'stats' && (
          <Suspense fallback={<div className="card empty">Chargement…</div>}>
            <Stats fillups={filtered} vehicles={vehicles} vehicleFilter={vehicleFilter} />
          </Suspense>
        )}
      </main>

      <nav className="tabs">
        <div className="inner">
          <button className={tab === 'new' ? 'active' : ''} onClick={() => setTab('new')}>
            <span className="ico"><PumpIcon /></span>Plein
          </button>
          <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
            <span className="ico"><HistoryIcon /></span>Historique
          </button>
          <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>
            <span className="ico"><StatsIcon /></span>Stats
          </button>
        </div>
      </nav>

      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
    </>
  )
}
