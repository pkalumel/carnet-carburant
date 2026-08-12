import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { flushOutbox, loadFillups, loadVehicles } from './lib/db'
import { listOutbox } from './lib/outbox'
import type { Fillup, Vehicle } from './lib/types'
import AuthScreen from './components/AuthScreen'
import FillupForm from './components/FillupForm'
import History from './components/History'
import Settings from './components/Settings'
import VehicleManager from './components/VehicleManager'
import { GearIcon, HistoryIcon, PumpIcon, StatsIcon } from './components/icons'
import { usePwaUpdate } from './lib/pwa'

const Stats = lazy(() => import('./components/Stats'))

type Tab = 'new' | 'history' | 'stats' | 'settings'

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
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)
  const update = usePwaUpdate()

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
    let [v, f] = await Promise.all([loadVehicles(), loadFillups()])
    const outbox = await listOutbox()
    // Course possible juste après la connexion : la requête part avant que la
    // session soit active et retombe sur un cache vide alors que des pleins
    // existent. Un nouvel essai après un court délai suffit.
    if (v.length === 0 && f.some((x) => !x.pending)) {
      await new Promise((r) => setTimeout(r, 800))
      ;[v, f] = await Promise.all([loadVehicles(), loadFillups()])
    }
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
        <div className="brand-row">
          <span className="brand">
            <span className="mark">
              <PumpIcon size={18} />
            </span>
            Carnet <em>Carburant</em>
          </span>
        </div>
        {/* Le filtre est un concept de consultation : pas sur l'écran de saisie */}
        {(tab === 'history' || tab === 'stats') && vehicles.length > 0 && (
          <div className="chips-wrap">
            <div className="chips" role="tablist" aria-label="Filtrer par véhicule">
              <button
                className={vehicleFilter === 'all' ? 'chip active' : 'chip'}
                onClick={() => setVehicleFilter('all')}
              >
                Tous
              </button>
              {vehicles.map((v) => (
                <button
                  key={v.id}
                  className={vehicleFilter === v.id ? 'chip active' : 'chip'}
                  onClick={() => setVehicleFilter(v.id)}
                >
                  {v.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {update.ready && (
        <button className="netbanner update banner-action" onClick={update.apply}>
          Nouvelle version disponible — Mettre à jour
        </button>
      )}
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
                  <div className="empty-ico">
                    <PumpIcon size={30} />
                  </div>
                  <div className="empty-title">Bienvenue !</div>
                  Commence par ajouter le premier véhicule de la famille juste en dessous.
                </div>
                <VehicleManager vehicles={vehicles} fillups={fillups} onChanged={() => void refresh()} showToast={showToast} />
              </>
            ) : (
              <>
                <FillupForm
                  key={vehicleFilter} /* re-préremplit le véhicule quand le filtre change */
                  vehicles={vehicles}
                  fillups={fillups}
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

        {tab === 'settings' && (
          <Settings
            vehicles={vehicles}
            fillups={fillups}
            userEmail={userEmail}
            onChanged={() => void refresh()}
            showToast={showToast}
          />
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
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
            <span className="ico"><GearIcon /></span>Réglages
          </button>
        </div>
      </nav>

      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
    </>
  )
}
