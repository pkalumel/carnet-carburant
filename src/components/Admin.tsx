import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  adminAccountAction, fetchHealth, fetchOverview, fetchUserDetail, fetchUsers,
} from '../lib/adminDb'
import type { AdminHealth, AdminOverview, AdminUserDetail, AdminUserRow } from '../lib/adminDb'
import { AXIS, GRID, SERIES } from '../lib/chartTheme'
import { Meter, Tip } from './chartKit'
import { fmtBytes, fmtDate, fmtDateTime, fmtEur, fmtKm, fmtKwh, fmtLiters } from '../lib/format'
import { BoltIcon, PumpIcon, TrashIcon, XIcon } from './icons'

interface Props {
  showToast: (msg: string, kind?: 'ok' | 'err') => void
}

type View = 'overview' | 'users' | 'health'
const PAGE = 50

const nf0 = new Intl.NumberFormat('fr-FR')

const weekLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

const ago = (iso: string | null) => (iso == null ? 'jamais' : `le ${fmtDate(iso)}`)

// ---------- Vue d'ensemble ----------

function WeeklyCard({ title, points, color, noun }: {
  title: string
  points: { week: string; n: number }[]
  color: string
  noun: string
}) {
  const data = points.map((p) => ({
    label: weekLabel(p.week),
    n: p.n,
    tip: `Semaine du ${weekLabel(p.week)}\n${nf0.format(p.n)} ${noun}`,
  }))
  return (
    <section className="card">
      <h2>{title}</h2>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: AXIS }}
            tickLine={false}
            axisLine={{ stroke: GRID }}
            minTickGap={24}
          />
          <YAxis
            tick={{ fontSize: 11, fill: AXIS }}
            tickLine={false}
            axisLine={false}
            width={44}
            allowDecimals={false}
          />
          <Tooltip content={<Tip />} cursor={{ fill: 'rgba(22, 32, 43, 0.06)' }} />
          <Bar dataKey="n" fill={color} maxBarSize={36} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </section>
  )
}

function Distribution({ title, entries }: { title: string; entries: Record<string, number> }) {
  const rows = Object.entries(entries).sort((a, b) => b[1] - a[1])
  const max = rows.length > 0 ? rows[0][1] : 0
  return (
    <section className="card">
      <h2>{title}</h2>
      {rows.length === 0 && <div className="settings-note">Aucune donnée pour l’instant.</div>}
      {rows.map(([label, n], i) => (
        <div key={label} className="admin-dist-row">
          <span className="admin-dist-label">{label === 'fuel' ? 'Carburant' : label === 'electric' ? 'Recharge' : label}</span>
          <span className="admin-dist-bar">
            <span
              style={{
                width: `${max > 0 ? Math.max((n / max) * 100, 4) : 0}%`,
                background: SERIES[i % SERIES.length],
              }}
            />
          </span>
          <span className="admin-dist-n">{nf0.format(n)}</span>
        </div>
      ))}
    </section>
  )
}

function Overview({ showToast }: Props) {
  const [data, setData] = useState<AdminOverview | null>(null)

  useEffect(() => {
    fetchOverview().then(setData).catch((e: Error) => showToast(e.message, 'err'))
  }, [showToast])

  if (!data) return <div className="card empty">Chargement…</div>

  return (
    <>
      <section className="card hero">
        <h2>En un coup d’œil</h2>
        <div className="meter-lead-row">
          <div className="meter-big lead">
            {nf0.format(data.users_total)}
            <span className="meter-unit">comptes</span>
          </div>
        </div>
        <div className="meter-row">
          <Meter value={nf0.format(data.vehicles_total)} label="Véhicules" />
          <Meter value={nf0.format(data.fillups_total)} label="Pleins" />
          <Meter value={nf0.format(data.active_7d)} label="Actifs 7 j" />
          <Meter value={nf0.format(data.active_30d)} label="Actifs 30 j" />
          <Meter value={nf0.format(data.signed_in_30d)} label="Connectés 30 j" />
          <Meter value={nf0.format(data.drafts_total)} label="Brouillons" />
        </div>
      </section>
      <div className="admin-grid">
        <WeeklyCard
          title="Inscriptions par semaine"
          points={data.signups_weekly}
          color={SERIES[0]}
          noun="inscriptions"
        />
        <WeeklyCard
          title="Pleins saisis par semaine"
          points={data.fillups_weekly}
          color={SERIES[1]}
          noun="pleins"
        />
      </div>
      <div className="admin-grid">
        <Distribution title="Pleins par énergie" entries={data.by_energy} />
        <Distribution title="Véhicules par carburant" entries={data.by_fuel} />
      </div>
    </>
  )
}

// ---------- Utilisateurs ----------

function UserSheet({ userId, showToast, onClose, onChanged }: {
  userId: string
  showToast: Props['showToast']
  onClose: () => void
  onChanged: () => void
}) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchUserDetail(userId).then(setDetail).catch((e: Error) => {
      showToast(e.message, 'err')
      onClose()
    })
  }, [userId, showToast, onClose])

  // La feuille ouverte fige le défilement de la page derrière
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const banned = detail?.user.banned_until != null && new Date(detail.user.banned_until) > new Date()

  const act = async (action: 'ban' | 'unban' | 'delete', doneMsg: string) => {
    setBusy(true)
    try {
      await adminAccountAction(action, userId)
      showToast(doneMsg)
      onClose()
      onChanged()
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 'err')
      setBusy(false)
    }
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Fiche utilisateur">
        <div className="sheet-handle" aria-hidden />
        {!detail ? (
          <div className="card empty">Chargement…</div>
        ) : (
          <>
            <h2>
              {detail.user.email}
              {detail.user.is_admin && <span className="badge badge-draft">Admin</span>}
              {banned && <span className="badge badge-pending">Banni</span>}
            </h2>
            <div className="settings-note">
              Inscrit le {fmtDate(detail.user.created_at)} · dernière connexion{' '}
              {ago(detail.user.last_sign_in_at)} · {nf0.format(detail.photo_count)}{' '}
              {detail.photo_count > 1 ? 'photos' : 'photo'} ({fmtBytes(detail.photo_bytes)})
            </div>

            <section className="card">
              <h2>Véhicules ({detail.vehicles.length})</h2>
              {detail.vehicles.length === 0 && (
                <div className="settings-note">Aucun véhicule.</div>
              )}
              {detail.vehicles.map((v) => (
                <div key={v.id} className="fillup-item">
                  <div className="body">
                    <div className="date">
                      {v.name}
                      {v.plate && ` · ${v.plate}`}
                      {v.fuel && <span className="badge badge-partial">{v.fuel}</span>}
                    </div>
                    <div className="sub">
                      {nf0.format(v.fillup_count)} {v.fillup_count > 1 ? 'pleins' : 'plein'} ·{' '}
                      {fmtEur(v.total_spent)} · dernier {ago(v.last_fillup_at)}
                    </div>
                  </div>
                </div>
              ))}
            </section>

            <section className="card">
              <h2>Derniers pleins</h2>
              {detail.recent_fillups.length === 0 && (
                <div className="settings-note">Aucun plein.</div>
              )}
              {detail.recent_fillups.map((f) => (
                <div key={f.id} className="fillup-item">
                  <div className="thumb ph">
                    {f.energy === 'electric' ? <BoltIcon size={22} /> : <PumpIcon size={22} />}
                  </div>
                  <div className="body">
                    <div className="date">
                      {fmtDateTime(f.filled_at)} · {f.vehicle_name}
                      {f.is_draft && <span className="badge badge-draft">À compléter</span>}
                    </div>
                    <div className="sub">
                      {f.energy === 'electric' ? fmtKwh(f.liters) : fmtLiters(f.liters)} ·{' '}
                      {fmtEur(f.total_price)} · {fmtKm(f.odometer_km)}
                    </div>
                  </div>
                </div>
              ))}
            </section>

            {!detail.user.is_admin && (
              <section className="card">
                <h2>Actions</h2>
                <div className="row-actions">
                  <button
                    className="btn-ghost"
                    disabled={busy}
                    onClick={() =>
                      banned
                        ? void act('unban', 'Compte débanni ✓')
                        : void act('ban', 'Compte banni — sessions révoquées ✓')
                    }
                  >
                    {banned ? 'Débannir ce compte' : 'Bannir ce compte'}
                  </button>
                </div>
                <div className="danger-zone">
                  <p>
                    La suppression efface définitivement le compte, ses véhicules, ses pleins et
                    ses photos. Recopie l’adresse e-mail pour confirmer.
                  </p>
                  <input
                    type="text"
                    placeholder={detail.user.email}
                    value={confirmEmail}
                    onChange={(e) => setConfirmEmail(e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                  <div className="row-actions">
                    <button
                      className="btn-ghost btn-danger"
                      disabled={busy || confirmEmail.trim().toLowerCase() !== detail.user.email.toLowerCase()}
                      onClick={() => void act('delete', 'Compte supprimé ✓')}
                    >
                      <TrashIcon /> Supprimer définitivement
                    </button>
                  </div>
                </div>
              </section>
            )}

            <div className="row-actions">
              <button className="btn-ghost" onClick={onClose}>
                <XIcon /> Fermer
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function Users({ showToast }: Props) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | 'active' | 'dormant'>('all')
  const [sort, setSort] = useState<'activity' | 'created' | 'fillups' | 'email'>('activity')
  const [rows, setRows] = useState<AdminUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [detailId, setDetailId] = useState<string | null>(null)
  const debounce = useRef<number>(0)

  const total = rows.length > 0 ? rows[0].total_count : 0

  const load = useCallback(
    async (offset: number) => {
      setLoading(true)
      try {
        const page = await fetchUsers({ search, status, sort, limit: PAGE, offset })
        setRows((prev) => (offset === 0 ? page : [...prev, ...page]))
      } catch (e) {
        showToast(e instanceof Error ? e.message : String(e), 'err')
      } finally {
        setLoading(false)
      }
    },
    [search, status, sort, showToast],
  )

  // Recherche débouncée ; filtres et tri rechargent immédiatement
  useEffect(() => {
    window.clearTimeout(debounce.current)
    debounce.current = window.setTimeout(() => void load(0), 300)
    return () => window.clearTimeout(debounce.current)
  }, [load])

  return (
    <>
      <div className="admin-toolbar">
        <input
          type="text"
          placeholder="Rechercher un e-mail…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
        />
        <div className="seg">
          {(
            [
              ['all', 'Tous'],
              ['active', 'Actifs'],
              ['dormant', 'Dormants'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={status === key ? 'active' : ''}
              onClick={() => setStatus(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          className="input admin-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          aria-label="Trier par"
        >
          <option value="activity">Dernière saisie</option>
          <option value="created">Inscription</option>
          <option value="fillups">Nombre de pleins</option>
          <option value="email">E-mail</option>
        </select>
      </div>

      <section className="card">
        <h2>
          Utilisateurs{total > 0 && ` (${nf0.format(total)})`}
        </h2>
        {rows.map((u) => {
          const banned = u.banned_until != null && new Date(u.banned_until) > new Date()
          return (
            <button key={u.user_id} className="fillup-item admin-row" onClick={() => setDetailId(u.user_id)}>
              <div className="body">
                <div className="date">
                  <span className="admin-email">{u.email}</span>
                  {u.is_admin && <span className="badge badge-draft">Admin</span>}
                  {banned && <span className="badge badge-pending">Banni</span>}
                </div>
                <div className="sub">
                  {nf0.format(u.vehicle_count)} {u.vehicle_count > 1 ? 'véhicules' : 'véhicule'} ·{' '}
                  {nf0.format(u.fillup_count)} {u.fillup_count > 1 ? 'pleins' : 'plein'} · dernier{' '}
                  {ago(u.last_fillup_at)}
                </div>
                <div className="sub2">
                  Inscrit le {fmtDate(u.user_created_at)} · dernière connexion {ago(u.last_sign_in_at)}
                </div>
              </div>
            </button>
          )
        })}
        {!loading && rows.length === 0 && (
          <div className="settings-note">Aucun compte ne correspond.</div>
        )}
        {loading && <div className="settings-note">Chargement…</div>}
        {!loading && rows.length < total && (
          <div className="row-actions">
            <button className="btn-ghost" onClick={() => void load(rows.length)}>
              Charger plus ({nf0.format(total - rows.length)} restants)
            </button>
          </div>
        )}
      </section>

      {detailId && (
        <UserSheet
          userId={detailId}
          showToast={showToast}
          onClose={() => setDetailId(null)}
          onChanged={() => void load(0)}
        />
      )}
    </>
  )
}

// ---------- Santé technique ----------

function Health({ showToast }: Props) {
  const [data, setData] = useState<AdminHealth | null>(null)

  useEffect(() => {
    fetchHealth().then(setData).catch((e: Error) => showToast(e.message, 'err'))
  }, [showToast])

  if (!data) return <div className="card empty">Chargement…</div>

  const alert = (n: number) => (n > 0 ? { color: 'var(--danger)' } : undefined)

  return (
    <>
      <section className="card">
        <h2>Stockage</h2>
        <div className="meter-row">
          <Meter value={fmtBytes(data.photo_bytes)} label="Photos (volume)" />
          <Meter value={nf0.format(data.photo_count)} label="Photos (nombre)" />
          <Meter value={fmtBytes(data.fillups_bytes)} label="Table des pleins" />
          <Meter value={fmtBytes(data.vehicles_bytes)} label="Table des véhicules" />
        </div>
      </section>
      <section className="card">
        <h2>Anomalies</h2>
        <div className="meter-row">
          <div>
            <div className="meter-big" style={alert(data.orphan_photos)}>{nf0.format(data.orphan_photos)}</div>
            <div className="meter-label">Photos orphelines</div>
          </div>
          <div>
            <div className="meter-big" style={alert(data.missing_photos)}>{nf0.format(data.missing_photos)}</div>
            <div className="meter-label">Photos manquantes</div>
          </div>
          <div>
            <div className="meter-big" style={alert(data.orphan_vehicles)}>{nf0.format(data.orphan_vehicles)}</div>
            <div className="meter-label">Véhicules orphelins</div>
          </div>
          <Meter value={nf0.format(data.stale_drafts)} label="Brouillons > 7 j" />
        </div>
        <div className="settings-note">
          Photos orphelines : fichiers sans plein correspondant. Photos manquantes : pleins dont le
          fichier a disparu. Véhicules orphelins : compte parent supprimé (doit rester à zéro).
        </div>
      </section>
    </>
  )
}

// ---------- Console ----------

export default function Admin({ showToast }: Props) {
  const [view, setView] = useState<View>('overview')

  const views = useMemo(
    () =>
      [
        ['overview', 'Vue d’ensemble'],
        ['users', 'Utilisateurs'],
        ['health', 'Santé'],
      ] as const,
    [],
  )

  return (
    <>
      <div className="seg admin-seg">
        {views.map(([key, label]) => (
          <button key={key} className={view === key ? 'active' : ''} onClick={() => setView(key)}>
            {label}
          </button>
        ))}
      </div>
      {view === 'overview' && <Overview showToast={showToast} />}
      {view === 'users' && <Users showToast={showToast} />}
      {view === 'health' && <Health showToast={showToast} />}
    </>
  )
}
