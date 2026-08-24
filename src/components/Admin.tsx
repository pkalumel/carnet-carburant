import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  adminAccountAction, fetchApiStats, fetchHealth, fetchOverview, fetchUserDetail, fetchUsers,
} from '../lib/adminDb'
import type { AdminApiStats, AdminHealth, AdminOverview, AdminUserDetail, AdminUserRow } from '../lib/adminDb'
import { AXIS, CURSOR, GRID, SERIES } from '../lib/chartTheme'
import { Tip } from './chartKit'
import { fmtBytes, fmtDate, fmtDateTime, fmtEur, fmtKm, fmtKwh, fmtLiters } from '../lib/format'
import { BoltIcon, PumpIcon, TrashIcon, XIcon } from './icons'

interface Props {
  showToast: (msg: string, kind?: 'ok' | 'err') => void
  /** l'admin s'ouvre depuis Réglages : chemin de retour */
  onBack: () => void
}

type SortKey = 'activity' | 'created' | 'fillups' | 'email'
const PAGE = 50
const DAY_MS = 86_400_000

const nf0 = new Intl.NumberFormat('fr-FR')

const weekLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

const ago = (iso: string | null) => (iso == null ? 'jamais' : `le ${fmtDate(iso)}`)

const isBanned = (until: string | null) => until != null && new Date(until) > new Date()
const isActive = (lastFillup: string | null) =>
  lastFillup != null && Date.now() - new Date(lastFillup).getTime() < 30 * DAY_MS

function StatusBadge({ u }: { u: AdminUserRow }) {
  if (isBanned(u.banned_until)) return <span className="badge badge-danger">Banni</span>
  if (u.is_admin) return <span className="badge badge-accent">Admin</span>
  if (isActive(u.last_fillup_at)) return <span className="badge badge-elec">Actif</span>
  return <span className="badge badge-partial">Dormant</span>
}

// ---------- Bandeau KPI ----------

function KpiStrip({ overview, health }: { overview: AdminOverview; health: AdminHealth | null }) {
  const anomalies =
    health == null ? null : health.orphan_photos + health.missing_photos + health.orphan_vehicles
  return (
    <section className="card admin-kpis">
      <div>
        <div className="meter-big" style={{ color: 'var(--accent-press)' }}>
          {nf0.format(overview.users_total)}
        </div>
        <div className="meter-label">Comptes</div>
      </div>
      <div>
        <div className="meter-big">{nf0.format(overview.vehicles_total)}</div>
        <div className="meter-label">Véhicules</div>
      </div>
      <div>
        <div className="meter-big">{nf0.format(overview.fillups_total)}</div>
        <div className="meter-label">Pleins</div>
      </div>
      <div>
        <div className="meter-big">{nf0.format(overview.active_7d)}</div>
        <div className="meter-label">Actifs 7 j</div>
      </div>
      <div>
        <div className="meter-big">{nf0.format(overview.active_30d)}</div>
        <div className="meter-label">Actifs 30 j</div>
      </div>
      <div>
        <div
          className="meter-big"
          style={anomalies != null && anomalies > 0 ? { color: 'var(--danger)' } : undefined}
        >
          {anomalies == null ? '—' : nf0.format(anomalies)}
        </div>
        <div className="meter-label">Anomalies</div>
      </div>
    </section>
  )
}

// ---------- Colonne latérale : graphes + santé ----------

function WeeklyMini({ title, points, color, noun, daily = false }: {
  title: string
  points: { week: string; n: number }[]
  color: string
  noun: string
  /** points quotidiens (l'infobulle dit « Le … » plutôt que « Semaine du … ») */
  daily?: boolean
}) {
  const data = points.map((p) => ({
    label: weekLabel(p.week),
    n: p.n,
    tip: `${daily ? 'Le' : 'Semaine du'} ${weekLabel(p.week)}\n${nf0.format(p.n)} ${noun}`,
  }))
  return (
    <section className="card">
      <h2>{title}</h2>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: AXIS }}
            tickLine={false}
            axisLine={{ stroke: GRID }}
            minTickGap={28}
          />
          <YAxis
            tick={{ fontSize: 10, fill: AXIS }}
            tickLine={false}
            axisLine={false}
            width={36}
            allowDecimals={false}
          />
          <Tooltip content={<Tip />} cursor={{ fill: CURSOR }} />
          <Bar dataKey="n" fill={color} maxBarSize={22} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </section>
  )
}

/** Journal des appels aux API externes tracés par les clients */
function ApiCallsCard({ stats }: { stats: AdminApiStats }) {
  const days = stats.days.map((d) => ({ week: d.day, n: d.calls }))
  const totalErrors = stats.apis.reduce((s, a) => s + a.errors, 0)
  return (
    <>
      {days.length > 0 && (
        <WeeklyMini title="Appels API / jour" points={days} color={SERIES[2]} noun="appels" daily />
      )}
      <section className="card">
        <h2>API externes · 7 jours</h2>
        {stats.apis.length === 0 && (
          <div className="settings-note">Aucun appel tracé pour l'instant.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {stats.apis.map((a) => {
            const errPct = a.calls > 0 ? Math.round((a.errors / a.calls) * 100) : 0
            return (
              <div key={a.api} className="admin-health-row api-row">
                <span className="api-name">
                  {a.api}
                  <span className="api-sub">{nf0.format(a.calls_24h)} sur 24 h</span>
                </span>
                <span
                  className="admin-num"
                  style={a.errors > 0 ? { color: 'var(--danger)', fontWeight: 700 } : undefined}
                >
                  {nf0.format(a.calls)} · {errPct} %
                  {a.avg_ms != null && ` · ${nf0.format(a.avg_ms)} ms`}
                </span>
              </div>
            )
          })}
        </div>
        {totalErrors === 0 && stats.apis.length > 0 && (
          <div className="settings-note" style={{ marginTop: 10, marginBottom: 0 }}>
            Aucune erreur sur la période.
          </div>
        )}
      </section>
    </>
  )
}

function HealthCard({ health }: { health: AdminHealth }) {
  const bad = (n: number) =>
    n > 0 ? { color: 'var(--danger)', fontWeight: 700 } : { color: 'var(--ok)', fontWeight: 600 }
  return (
    <section className="card">
      <h2>Santé</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="admin-health-row">
          <span>Photos (volume)</span>
          <span className="admin-num">{fmtBytes(health.photo_bytes)}</span>
        </div>
        <div className="admin-health-row">
          <span>Photos orphelines / manquantes</span>
          <span className="admin-num" style={bad(health.orphan_photos + health.missing_photos)}>
            {nf0.format(health.orphan_photos)} / {nf0.format(health.missing_photos)}
          </span>
        </div>
        <div className="admin-health-row">
          <span>Brouillons &gt; 7 j</span>
          <span className="admin-num">{nf0.format(health.stale_drafts)}</span>
        </div>
        <div className="admin-health-row">
          <span>Table des pleins</span>
          <span className="admin-num">{fmtBytes(health.fillups_bytes)}</span>
        </div>
        <div className="admin-health-row">
          <span>Véhicules orphelins</span>
          <span className="admin-num" style={bad(health.orphan_vehicles)}>
            {nf0.format(health.orphan_vehicles)}
          </span>
        </div>
      </div>
    </section>
  )
}

// ---------- Fiche utilisateur (bottom sheet) ----------

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

  const banned = detail != null && isBanned(detail.user.banned_until)

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
    <div className="page-modal" role="dialog" aria-modal="true" aria-label="Fiche utilisateur">
      <header className="page-modal-top">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">Fiche utilisateur</div>
          <div className="title">
            {detail ? detail.user.email : '…'}
            {detail?.user.is_admin && <span className="badge badge-draft">Admin</span>}
            {banned && <span className="badge badge-pending">Banni</span>}
          </div>
          {detail && (
            <div className="subtitle">
              Inscrit le {fmtDate(detail.user.created_at)} · dernière connexion{' '}
              {ago(detail.user.last_sign_in_at)} · {nf0.format(detail.photo_count)}{' '}
              {detail.photo_count > 1 ? 'photos' : 'photo'} ({fmtBytes(detail.photo_bytes)})
            </div>
          )}
        </div>
        <button className="page-modal-close" onClick={onClose} aria-label="Fermer la fiche">
          <XIcon size={20} />
        </button>
      </header>
      <div className="page-modal-body">
        {!detail ? (
          <div className="card empty">Chargement…</div>
        ) : (
          <>
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
                  <div className={f.energy === 'electric' ? 'thumb ph elec' : 'thumb ph fuel'}>
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

            {detail.user.is_admin ? (
              <section className="card">
                <h2>Actions</h2>
                <p className="settings-note">
                  Ce compte est administrateur : il ne peut être ni banni ni supprimé depuis la
                  console. Pour lui retirer ce statut, retire sa ligne de la table{' '}
                  <strong>admins</strong> dans le SQL Editor de Supabase.
                </p>
              </section>
            ) : (
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

          </>
        )}
      </div>
    </div>
  )
}

// ---------- Tableau / liste des utilisateurs ----------

const sub = (u: AdminUserRow) =>
  `${nf0.format(u.vehicle_count)} véh. · ${nf0.format(u.fillup_count)} ${
    u.fillup_count > 1 ? 'pleins' : 'plein'
  } · dernier ${ago(u.last_fillup_at)}`

function SortTh({ label, k, sort, dir, onSort, align }: {
  label: string
  k: SortKey
  sort: SortKey
  dir: 'asc' | 'desc'
  onSort: (k: SortKey) => void
  align?: 'right'
}) {
  return (
    <th style={align ? { textAlign: align } : undefined}>
      <button onClick={() => onSort(k)}>
        {label}
        {sort === k ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  )
}

// ---------- Console ----------

export default function Admin({ showToast, onBack }: Props) {
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [health, setHealth] = useState<AdminHealth | null>(null)
  const [apiStats, setApiStats] = useState<AdminApiStats | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | 'active' | 'dormant'>('all')
  const [sort, setSort] = useState<SortKey>('activity')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [rows, setRows] = useState<AdminUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [detailId, setDetailId] = useState<string | null>(null)
  const debounce = useRef<number>(0)

  const total = rows.length > 0 ? rows[0].total_count : 0

  useEffect(() => {
    fetchOverview().then(setOverview).catch((e: Error) => showToast(e.message, 'err'))
    fetchHealth().then(setHealth).catch((e: Error) => showToast(e.message, 'err'))
    fetchApiStats().then(setApiStats).catch(() => undefined)
  }, [showToast])

  const load = useCallback(
    async (offset: number) => {
      setLoading(true)
      try {
        const page = await fetchUsers({ search, status, sort, dir, limit: PAGE, offset })
        setRows((prev) => (offset === 0 ? page : [...prev, ...page]))
      } catch (e) {
        showToast(e instanceof Error ? e.message : String(e), 'err')
      } finally {
        setLoading(false)
      }
    },
    [search, status, sort, dir, showToast],
  )

  // Recherche débouncée ; filtres et tri rechargent immédiatement
  useEffect(() => {
    window.clearTimeout(debounce.current)
    debounce.current = window.setTimeout(() => void load(0), 300)
    return () => window.clearTimeout(debounce.current)
  }, [load])

  const onSort = (k: SortKey) => {
    if (sort === k) {
      setDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSort(k)
      setDir(k === 'email' ? 'asc' : 'desc')
    }
  }

  const refresh = () => {
    void load(0)
    fetchHealth().then(setHealth).catch(() => undefined)
    fetchOverview().then(setOverview).catch(() => undefined)
    fetchApiStats().then(setApiStats).catch(() => undefined)
  }

  return (
    <>
      <div className="admin-back">
        <button className="btn-ghost" onClick={onBack}>← Réglages</button>
      </div>

      {overview ? (
        <KpiStrip overview={overview} health={health} />
      ) : (
        <div className="card empty">Chargement…</div>
      )}

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
          onChange={(e) => {
            const k = e.target.value as SortKey
            setSort(k)
            setDir(k === 'email' ? 'asc' : 'desc')
          }}
          aria-label="Trier par"
        >
          <option value="activity">Dernière saisie</option>
          <option value="created">Inscription</option>
          <option value="fillups">Nombre de pleins</option>
          <option value="email">E-mail</option>
        </select>
      </div>

      <div className="admin-split">
        <section className="card" style={{ padding: '12px 12px 8px' }}>
          {/* Desktop : vrai tableau triable */}
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <SortTh label="E-mail" k="email" sort={sort} dir={dir} onSort={onSort} />
                  <th style={{ textAlign: 'right' }}>Véhicules</th>
                  <SortTh label="Pleins" k="fillups" sort={sort} dir={dir} onSort={onSort} align="right" />
                  <SortTh label="Dernier plein" k="activity" sort={sort} dir={dir} onSort={onSort} />
                  <SortTh label="Inscription" k="created" sort={sort} dir={dir} onSort={onSort} />
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.user_id} className="rowlink" onClick={() => setDetailId(u.user_id)}>
                    <td className="admin-num" style={{ fontWeight: 600 }}>{u.email}</td>
                    <td className="admin-num" style={{ textAlign: 'right' }}>{nf0.format(u.vehicle_count)}</td>
                    <td className="admin-num" style={{ textAlign: 'right' }}>{nf0.format(u.fillup_count)}</td>
                    <td className="admin-num">{u.last_fillup_at ? fmtDate(u.last_fillup_at) : '—'}</td>
                    <td className="admin-num">{fmtDate(u.user_created_at)}</td>
                    <td><StatusBadge u={u} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile : liste à deux lignes */}
          <div className="admin-list">
            {rows.map((u) => (
              <button key={u.user_id} className="fillup-item admin-row" onClick={() => setDetailId(u.user_id)}>
                <div className="body">
                  <div className="date admin-email">{u.email}</div>
                  <div className="sub">{sub(u)}</div>
                </div>
                <StatusBadge u={u} />
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px 8px' }}>
            <span style={{ fontSize: 13, color: 'var(--ink-64)' }}>
              {loading ? 'Chargement…' : `${nf0.format(rows.length)} sur ${nf0.format(total)} comptes`}
            </span>
            {!loading && rows.length === 0 && (
              <span style={{ fontSize: 13, color: 'var(--ink-64)' }}>Aucun compte ne correspond.</span>
            )}
            {!loading && rows.length < total && (
              <button
                className="btn-ghost"
                style={{ marginLeft: 'auto', flex: 'none' }}
                onClick={() => void load(rows.length)}
              >
                Charger plus ({nf0.format(total - rows.length)} restants)
              </button>
            )}
          </div>
        </section>

        <div className="admin-aside">
          {overview && (
            <>
              <WeeklyMini
                title="Inscriptions / sem."
                points={overview.signups_weekly}
                color={SERIES[0]}
                noun="inscriptions"
              />
              <WeeklyMini
                title="Pleins / sem."
                points={overview.fillups_weekly}
                color={SERIES[1]}
                noun="pleins"
              />
            </>
          )}
          {health && <HealthCard health={health} />}
          {apiStats && <ApiCallsCard stats={apiStats} />}
        </div>
      </div>

      {detailId && (
        <UserSheet
          userId={detailId}
          showToast={showToast}
          onClose={() => setDetailId(null)}
          onChanged={refresh}
        />
      )}
    </>
  )
}
