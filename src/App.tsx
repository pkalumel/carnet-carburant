import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { emailLinkType, supabase } from './lib/supabase'
import { flushOutbox, loadFillups, loadVehicles } from './lib/db'
import { checkIsAdmin } from './lib/adminDb'
import { claimShares } from './lib/sharesDb'
import { listOutbox } from './lib/outbox'
import type { Fillup, Vehicle } from './lib/types'
import AuthScreen from './components/AuthScreen'
import SetPasswordScreen from './components/SetPasswordScreen'
import Home from './components/Home'
import History from './components/History'
import Settings from './components/Settings'
import VehicleManager from './components/VehicleManager'
import { GearIcon, HistoryIcon, HomeIcon, PumpIcon, ShieldIcon, StatsIcon } from './components/icons'
import { usePwaUpdate } from './lib/pwa'
import { PULL_THRESHOLD, usePullToRefresh } from './lib/usePullToRefresh'

const Stats = lazy(() => import('./components/Stats'))
const Admin = lazy(() => import('./components/Admin'))

type Tab = 'new' | 'history' | 'stats' | 'settings' | 'admin'

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
  const [isAdmin, setIsAdmin] = useState(false)
  // Arrivée par lien d'invitation ou de récupération : le mot de passe se
  // définit avant d'entrer dans l'app.
  const [needsPassword, setNeedsPassword] = useState(
    () => emailLinkType === 'invite' || emailLinkType === 'recovery',
  )
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

  // Détection admin, indépendante de refresh() et de son retry : en cas
  // d'échec réseau l'onglet reste caché (la console est un usage en ligne).
  useEffect(() => {
    if (!session) {
      setIsAdmin(false)
      return
    }
    void checkIsAdmin().then(setIsAdmin)
  }, [session])

  // Rattache les invitations de partage en attente portant mon adresse
  // (inscription via le lien d'invitation OU inscription normale), puis
  // recharge si des partages viennent d'être récupérés.
  useEffect(() => {
    if (!session) return
    void claimShares().then((n) => {
      if (n > 0) void refresh()
    })
  }, [session, refresh])

  // Tirer la page vers le bas : resynchronise et recharge tout depuis le
  // serveur, et vérifie au passage si une nouvelle version de l'app existe
  // (la bannière « Mettre à jour » apparaît alors).
  const [reloadTick, setReloadTick] = useState(0)
  const pullRefresh = useCallback(async () => {
    if (!navigator.onLine) {
      showToast('Hors ligne — impossible d’actualiser', 'err')
      return
    }
    void navigator.serviceWorker?.getRegistration().then((r) => r?.update())
    const n = await flushOutbox()
    await refresh()
    void checkIsAdmin().then(setIsAdmin)
    setReloadTick((t) => t + 1)
    showToast(n > 0 ? `À jour — ${n === 1 ? '1 plein synchronisé' : `${n} pleins synchronisés`} ✓` : 'À jour ✓')
  }, [refresh, showToast])
  const { pull, refreshing } = usePullToRefresh(pullRefresh)

  if (session === undefined) return null
  if (!session) return <AuthScreen />
  if (needsPassword) {
    return (
      <>
        <SetPasswordScreen
          userEmail={session.user.email ?? null}
          invited={emailLinkType === 'invite'}
          onDone={() => setNeedsPassword(false)}
          showToast={showToast}
        />
        {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      </>
    )
  }

  const filtered =
    vehicleFilter === 'all' ? fillups : fillups.filter((f) => f.vehicle_id === vehicleFilter)
  const userEmail = session.user.email ?? null
  const userId = session.user.id

  return (
    <>
      <div
        className={`ptr${pull >= PULL_THRESHOLD || refreshing ? ' armed' : ''}`}
        style={{
          transform: `translate(-50%, ${(refreshing ? 64 : pull) - 56}px)`,
          transition: pull > 0 ? 'none' : 'transform 0.2s ease',
        }}
        aria-hidden
      >
        {refreshing ? (
          <svg className="ptr-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 3a9 9 0 1 1-8.2 5.3" />
          </svg>
        ) : (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: `rotate(${Math.min(pull * 3, 180)}deg)`, transition: 'transform 0.1s linear' }}
          >
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        )}
      </div>

      <header className="topbar">
        <div className="brand-row">
          <span className="brand">
            <span className="mark">
              <PumpIcon size={18} />
            </span>
            Carnet <em>Carburant</em>
          </span>
        </div>
        {/* Le filtre cadre l'accueil et la consultation ; la saisie s'ouvre en feuille */}
        {(tab === 'new' || tab === 'history' || tab === 'stats') && vehicles.length > 0 && (
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
          <div className="screen-narrow">
            {vehicles.length === 0 ? (
              <>
                <div className="card empty">
                  <div className="empty-ico">
                    <PumpIcon size={30} />
                  </div>
                  <div className="empty-title">Bienvenue !</div>
                  Commence par ajouter le premier véhicule de la famille juste en dessous.
                </div>
                <VehicleManager vehicles={vehicles} fillups={fillups} userId={userId} onChanged={() => void refresh()} showToast={showToast} />
              </>
            ) : (
              <Home
                vehicles={vehicles}
                fillups={filtered}
                allFillups={fillups}
                vehicleFilter={vehicleFilter}
                userEmail={userEmail}
                showToast={showToast}
                onOpenHistory={() => setTab('history')}
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
            )}
          </div>
        )}

        {tab === 'history' && (
          <History
            fillups={filtered}
            allFillups={fillups}
            vehicles={vehicles}
            userId={userId}
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
            userId={userId}
            userEmail={userEmail}
            onChanged={() => void refresh()}
            showToast={showToast}
          />
        )}

        {tab === 'admin' && isAdmin && (
          <Suspense fallback={<div className="card empty">Chargement…</div>}>
            {/* key : le tirer-pour-actualiser remonte la console et refait ses requêtes */}
            <Admin key={reloadTick} showToast={showToast} />
          </Suspense>
        )}
      </main>

      <nav className="tabs">
        <div className="inner">
          <button className={tab === 'new' ? 'active' : ''} onClick={() => setTab('new')}>
            <span className="ico"><HomeIcon /></span>Accueil
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
          {isAdmin && (
            <button className={tab === 'admin' ? 'active' : ''} onClick={() => setTab('admin')}>
              <span className="ico"><ShieldIcon /></span>Admin
            </button>
          )}
        </div>
      </nav>

      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
    </>
  )
}
