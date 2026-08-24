import { useEffect, useMemo, useState } from 'react'
import { getPhotoUrl } from '../lib/db'
import { summarize } from '../lib/stats'
import {
  fmtDateTime, fmtEur, fmtKwh, fmtLiters, fmtPricePerKwh, fmtPricePerL,
} from '../lib/format'
import type { Fillup, Vehicle } from '../lib/types'
import AnimatedNumber from './AnimatedNumber'
import FillupForm from './FillupForm'
import QuickCapture from './QuickCapture'
import { Meter } from './chartKit'
import { BoltIcon, CameraIcon, HistoryIcon, PlusIcon, PumpIcon } from './icons'

interface Props {
  vehicles: Vehicle[]
  /** Pleins filtrés par le chip véhicule : ce que l'accueil résume */
  fillups: Fillup[]
  /** Liste complète, non filtrée : sert aux validations du formulaire */
  allFillups: Fillup[]
  vehicleFilter: string
  userEmail: string | null
  showToast: (msg: string, kind?: 'ok' | 'err') => void
  onSaved: (status: 'synced' | 'queued', draft: boolean) => void
  onOpenHistory: () => void
  /** ouvre directement l'éditeur d'un brouillon dans l'Historique */
  onOpenDraft: (id: string) => void
  /** raccourci PWA : ouvre la feuille de saisie dès l'arrivée */
  autoOpenEntry?: boolean
}

const num = (v: number | null, digits: number) =>
  v == null
    ? '—'
    : v.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })

function DraftThumb({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    if (path) void getPhotoUrl(path).then((u) => alive && setUrl(u))
    else setUrl(null)
    return () => {
      alive = false
    }
  }, [path])
  if (url) return <img className="thumb" src={url} alt="" />
  return (
    <div className="thumb ph">
      <CameraIcon size={22} />
    </div>
  )
}

export default function Home({
  vehicles, fillups, allFillups, vehicleFilter, userEmail, showToast, onSaved, onOpenHistory, onOpenDraft,
  autoOpenEntry,
}: Props) {
  const [entryOpen, setEntryOpen] = useState(autoOpenEntry ?? false)

  // La feuille ouverte fige le défilement de la page derrière
  useEffect(() => {
    if (!entryOpen) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [entryOpen])

  const real = useMemo(() => fillups.filter((f) => !f.is_draft), [fillups])
  const drafts = useMemo(() => fillups.filter((f) => f.is_draft && !f.pending), [fillups])

  // Dépense du mois en cours + delta vs mois précédent (dates locales)
  const { monthCost, monthCount, monthName, prevCost, prevName } = useMemo(() => {
    const now = new Date()
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    let cost = 0
    let count = 0
    let pCost = 0
    for (const f of real) {
      const d = new Date(f.filled_at)
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
        cost += f.total_price ?? 0
        count += 1
      } else if (d.getFullYear() === prev.getFullYear() && d.getMonth() === prev.getMonth()) {
        pCost += f.total_price ?? 0
      }
    }
    return {
      monthCost: cost,
      monthCount: count,
      monthName: now.toLocaleDateString('fr-FR', { month: 'long' }),
      prevCost: pCost,
      prevName: prev.toLocaleDateString('fr-FR', { month: 'long' }),
    }
  }, [real])

  const deltaPct = prevCost > 0 ? ((monthCost - prevCost) / prevCost) * 100 : null

  const summary = useMemo(() => summarize(fillups), [fillups])

  // Dernier plein + comparaison à MA moyenne 6 mois (même véhicule, même énergie)
  const last = real.find((f) => f.liters != null) ?? null
  const avg6 = useMemo(() => {
    if (!last) return null
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - 6)
    const iso = cutoff.toISOString()
    const prices = real
      .filter(
        (f) =>
          f.vehicle_id === last.vehicle_id &&
          f.energy === last.energy &&
          f.price_per_liter != null &&
          f.filled_at >= iso &&
          f.id !== last.id,
      )
      .map((f) => f.price_per_liter as number)
    if (prices.length === 0) return null
    return prices.reduce((s, p) => s + p, 0) / prices.length
  }, [real, last])
  const trendCts =
    last?.price_per_liter != null && avg6 != null ? (last.price_per_liter - avg6) * 100 : null

  const vehicleName = (id: string) => vehicles.find((v) => v.id === id)?.name ?? '—'
  const recent = real.slice(0, 3)

  return (
    <>
      <section className="card">
        <h2>Ce mois-ci</h2>
        <div className="meter-lead-row">
          <div className="meter-big lead">
            <AnimatedNumber value={monthCost} />
            <span className="meter-unit">€</span>
          </div>
          <div className="meter-label">
            Dépensé en {monthName}
            {deltaPct != null && Math.abs(deltaPct) >= 1 && (
              <span className={deltaPct > 0 ? 'trend up' : 'trend down'}>
                {deltaPct > 0 ? '▲' : '▼'} {num(Math.abs(deltaPct), 0)} % vs {prevName}
              </span>
            )}
          </div>
        </div>
        <div className="meter-row">
          <Meter value={String(monthCount)} label={monthCount > 1 ? 'Pleins ce mois' : 'Plein ce mois'} />
          {summary.avgConso != null && (
            <Meter value={num(summary.avgConso, 1)} unit="L/100" label="Conso moyenne" />
          )}
          {summary.avgConso == null && summary.avgConsoElec != null && (
            <Meter value={num(summary.avgConsoElec, 1)} unit="kWh/100" label="Conso moyenne" />
          )}
          <Meter
            value={num(summary.costPerKm != null ? summary.costPerKm * 100 : null, 1)}
            unit="c€/km"
            label="Coût au km"
          />
        </div>
      </section>

      <div className="home-actions">
        <QuickCapture
          vehicles={vehicles}
          vehicleId={vehicleFilter !== 'all' ? vehicleFilter : null}
          userEmail={userEmail}
          variant="button"
          onSaved={(status) => onSaved(status, true)}
          showToast={showToast}
        />
        <button className="btn btn-primary" onClick={() => setEntryOpen(true)}>
          <PlusIcon /> Saisir un plein
        </button>
      </div>

      {drafts.length > 0 && (
        <section className="card">
          <h2>
            À compléter
            <span className="badge badge-draft">{drafts.length}</span>
          </h2>
          {drafts.map((f) => (
            <div key={f.id} className="fillup-item">
              <DraftThumb path={f.photo_path} />
              <div className="body">
                <div className="date">
                  {fmtDateTime(f.filled_at)} · {vehicleName(f.vehicle_id)}
                </div>
                <div className="sub">Recopie les chiffres de la {f.energy === 'electric' ? 'borne' : 'pompe'}</div>
              </div>
              <button className="btn-ghost btn-complete" onClick={() => onOpenDraft(f.id)}>
                Compléter
              </button>
            </div>
          ))}
        </section>
      )}

      {last && (
        <section className="card">
          <h2>Dernier plein</h2>
          <div className="fillup-item">
            <div className="thumb ph">
              {last.energy === 'electric' ? <BoltIcon size={22} /> : <PumpIcon size={22} />}
            </div>
            <div className="body">
              <div className="date">
                {fmtDateTime(last.filled_at)} · {vehicleName(last.vehicle_id)}
              </div>
              <div className="nums">
                {last.energy === 'electric' ? fmtKwh(last.liters) : fmtLiters(last.liters)} ·{' '}
                {fmtEur(last.total_price)}
              </div>
              <div className="sub">
                {last.energy === 'electric'
                  ? fmtPricePerKwh(last.price_per_liter)
                  : fmtPricePerL(last.price_per_liter)}
                {trendCts != null && Math.abs(trendCts) >= 0.05 && (
                  <span className={trendCts > 0 ? 'trend up' : 'trend down'}>
                    {trendCts > 0 ? '▲' : '▼'} {num(Math.abs(trendCts), 1)} cts vs ta moyenne 6 mois
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {recent.length > 0 ? (
        <section className="card">
          <h2>Derniers pleins</h2>
          {recent.map((f) => (
            <div key={f.id} className="fillup-item">
              <div className="body">
                <div className="date">
                  {fmtDateTime(f.filled_at)} · {vehicleName(f.vehicle_id)}
                </div>
                <div className="sub">
                  {f.energy === 'electric' ? fmtKwh(f.liters) : fmtLiters(f.liters)} ·{' '}
                  {fmtEur(f.total_price)} ·{' '}
                  {f.energy === 'electric'
                    ? fmtPricePerKwh(f.price_per_liter)
                    : fmtPricePerL(f.price_per_liter)}
                </div>
              </div>
            </div>
          ))}
          <div className="row-actions">
            <button className="btn-ghost" onClick={onOpenHistory}>
              <HistoryIcon size={18} /> Tout l’historique
            </button>
          </div>
        </section>
      ) : (
        <div className="card empty">
          <div className="empty-ico">
            <PumpIcon size={30} />
          </div>
          <div className="empty-title">Aucun plein pour l’instant</div>
          Photographie la pompe avec le bouton Photo, ou saisis ton premier plein juste au-dessus.
        </div>
      )}

      {entryOpen && (
        <>
          <div className="sheet-backdrop" onClick={() => setEntryOpen(false)} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Saisie d’un plein">
            <div className="sheet-handle" aria-hidden />
            <FillupForm
              vehicles={vehicles}
              fillups={allFillups}
              defaultVehicleId={vehicleFilter !== 'all' ? vehicleFilter : null}
              userEmail={userEmail}
              showToast={showToast}
              onSaved={(status, draft) => {
                setEntryOpen(false)
                onSaved(status, draft)
              }}
            />
          </div>
        </>
      )}
    </>
  )
}
