import { useEffect, useMemo, useState } from 'react'
import { summarize } from '../lib/stats'
import {
  fmtDateTime, fmtEur, fmtKwh, fmtLiters, fmtPricePerKwh, fmtPricePerL,
} from '../lib/format'
import type { Fillup, Vehicle } from '../lib/types'
import FillupForm from './FillupForm'
import QuickCapture from './QuickCapture'
import { Meter } from './chartKit'
import { BoltIcon, HistoryIcon, PlusIcon, PumpIcon } from './icons'

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
}

const num = (v: number | null, digits: number) =>
  v == null
    ? '—'
    : v.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })

export default function Home({
  vehicles, fillups, allFillups, vehicleFilter, userEmail, showToast, onSaved, onOpenHistory,
}: Props) {
  const [entryOpen, setEntryOpen] = useState(false)

  // La feuille ouverte fige le défilement de la page derrière
  useEffect(() => {
    if (!entryOpen) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [entryOpen])

  const real = useMemo(() => fillups.filter((f) => !f.is_draft), [fillups])
  const draftCount = fillups.length - real.length

  // Dépense et pleins du mois en cours (dates locales)
  const { monthCost, monthCount, monthName } = useMemo(() => {
    const now = new Date()
    let cost = 0
    let count = 0
    for (const f of real) {
      const d = new Date(f.filled_at)
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
        cost += f.total_price ?? 0
        count += 1
      }
    }
    return {
      monthCost: cost,
      monthCount: count,
      monthName: now.toLocaleDateString('fr-FR', { month: 'long' }),
    }
  }, [real])

  const summary = useMemo(() => summarize(fillups), [fillups])

  // Dernier plein + tendance du prix unitaire vs le précédent
  // (même véhicule, même énergie — comparer un plein d'essence à une
  // recharge n'aurait aucun sens)
  const last = real.find((f) => f.liters != null) ?? null
  const prev = last
    ? real.find(
        (f) =>
          f.id !== last.id &&
          f.vehicle_id === last.vehicle_id &&
          f.energy === last.energy &&
          f.price_per_liter != null &&
          f.filled_at < last.filled_at,
      ) ?? null
    : null
  const trendCts =
    last?.price_per_liter != null && prev?.price_per_liter != null
      ? (last.price_per_liter - prev.price_per_liter) * 100
      : null

  const vehicleName = (id: string) => vehicles.find((v) => v.id === id)?.name ?? '—'
  const recent = real.slice(0, 4)

  return (
    <>
      {draftCount > 0 && (
        <button className="netbanner pending banner-action" onClick={onOpenHistory}>
          {draftCount === 1 ? '1 plein à compléter' : `${draftCount} pleins à compléter`} — ouvrir
        </button>
      )}

      <QuickCapture
        vehicles={vehicles}
        vehicleId={vehicleFilter !== 'all' ? vehicleFilter : null}
        userEmail={userEmail}
        onSaved={(status) => onSaved(status, true)}
        showToast={showToast}
      />

      <section className="card">
        <h2>Ce mois-ci</h2>
        <div className="meter-lead-row">
          <div className="meter-big lead">
            {num(monthCost, 2)}
            <span className="meter-unit">€</span>
          </div>
          <div className="meter-label">Dépensé en {monthName}</div>
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

      <button className="btn btn-primary" onClick={() => setEntryOpen(true)}>
        <PlusIcon /> Saisir un plein ou une recharge
      </button>

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
                    {trendCts > 0 ? '▲' : '▼'} {num(Math.abs(trendCts), 1)} cts
                    {last.energy === 'electric' ? '/kWh' : '/L'}
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
          Photographie la pompe avec la capture rapide, ou saisis ton premier plein juste au-dessus.
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
