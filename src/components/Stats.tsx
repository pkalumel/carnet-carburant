import { useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { consumptionSeries, monthlyCostsByVehicle, priceSeries, summarize } from '../lib/stats'
import { fmtConso, fmtEur, fmtKm, fmtPricePerL } from '../lib/format'
import type { Fillup, Vehicle } from '../lib/types'

// Série encre pétrole + déclinaisons : accordées à l'identité, contrastées sur blanc
const SERIES = ['#26303c', '#dd9f0e', '#4a6fa5', '#2e7d5b', '#b3402f', '#7d5ba6']
const GRID = '#e4e2da'
const AXIS = '#6e7781'

interface Props {
  fillups: Fillup[]
  vehicles: Vehicle[]
  vehicleFilter: string
}

type Period = '3m' | '12m' | 'all'

const num = (v: number | null, digits: number) =>
  v == null
    ? '—'
    : v.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })

const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

function Meter({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div>
      <div className="meter-big">
        {value}
        {unit && <span className="meter-unit">{unit}</span>}
      </div>
      <div className="meter-label">{label}</div>
    </div>
  )
}

interface TipPayload {
  payload?: { tip: string }
}

function Tip({ active, payload }: { active?: boolean; payload?: TipPayload[] }) {
  if (!active || !payload?.length || !payload[0].payload) return null
  return (
    <div
      style={{
        background: '#16202b', color: '#fff', borderRadius: 8, padding: '6px 10px',
        fontSize: 13, fontFamily: 'var(--mono)', whiteSpace: 'pre-line',
      }}
    >
      {payload[0].payload.tip}
    </div>
  )
}

export default function Stats({ fillups, vehicles, vehicleFilter }: Props) {
  const [period, setPeriod] = useState<Period>('12m')

  const scoped = useMemo(() => {
    if (period === 'all') return fillups
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - (period === '3m' ? 3 : 12))
    const iso = cutoff.toISOString()
    return fillups.filter((f) => f.filled_at >= iso)
  }, [fillups, period])

  const summary = summarize(scoped)
  const singleVehicle = vehicleFilter !== 'all'
  const vehicleColor = new Map(vehicles.map((v, i) => [v.id, SERIES[i % SERIES.length]]))

  const months = useMemo(
    () =>
      monthlyCostsByVehicle(scoped).map((m) => ({
        ...m.totals,
        label: monthLabel(m.month),
        tip: [
          monthLabel(m.month),
          ...vehicles
            .filter((v) => m.totals[v.id])
            .map((v) => `${v.name} ${fmtEur(m.totals[v.id])}`),
          ...(Object.keys(m.totals).length > 1 ? [`Total ${fmtEur(m.total)}`] : []),
        ].join('\n'),
      })),
    [scoped, vehicles],
  )

  const conso = singleVehicle
    ? consumptionSeries(scoped).map((p) => ({
        ...p,
        label: dayLabel(p.date),
        tip: `${dayLabel(p.date)}\n${fmtConso(p.per100)} sur ${fmtKm(p.km)}`,
      }))
    : []
  const prices = singleVehicle
    ? priceSeries(scoped).map((p) => ({
        ...p,
        label: dayLabel(p.date),
        tip: `${dayLabel(p.date)}\n${fmtPricePerL(p.price)}`,
      }))
    : []

  const stackedVehicles = vehicles.filter((v) => months.some((m) => (m as Record<string, unknown>)[v.id]))

  if (fillups.length === 0) {
    return (
      <div className="card empty">
        <div className="empty-ico">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 20V4" />
            <path d="M4 20h16" />
            <path d="M7.5 15.5l3.5-4 3 2.5 4.5-6" />
          </svg>
        </div>
        <div className="empty-title">Pas encore de statistiques</div>
        Elles apparaîtront après les premiers pleins enregistrés.
      </div>
    )
  }

  return (
    <>
      <div className="seg" role="tablist" aria-label="Période">
        {(['3m', '12m', 'all'] as const).map((p) => (
          <button
            key={p}
            className={period === p ? 'active' : ''}
            onClick={() => setPeriod(p)}
          >
            {p === '3m' ? '3 mois' : p === '12m' ? '12 mois' : 'Tout'}
          </button>
        ))}
      </div>

      <section className="card hero">
        <h2>En résumé</h2>
        <div className="meter-lead-row">
          <div className="meter-big lead">
            {num(summary.totalSpent, 2)}
            <span className="meter-unit">€</span>
          </div>
          <div className="meter-label">Total dépensé</div>
        </div>
        <div className="meter-row">
          <Meter value={num(summary.avgConso, 1)} unit="L/100" label="Conso moyenne" />
          <Meter value={num(summary.costPerKm != null ? summary.costPerKm * 100 : null, 1)} unit="c€/km" label="Coût au km" />
          <Meter value={num(summary.avgPricePerLiter, 3)} unit="€/L" label="Prix moyen" />
        </div>
        {summary.avgConso == null && (
          <p className="hero-note">
            La consommation se calcule entre deux pleins complets avec kilométrage relevé
            {singleVehicle ? '.' : ' — choisis un véhicule en haut pour la voir.'}
          </p>
        )}
      </section>

      {singleVehicle && conso.length > 0 && (
        <section className="card">
          <h2>Consommation (L/100 km)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={conso} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} />
              <Tooltip content={<Tip />} cursor={{ stroke: GRID }} />
              <Line isAnimationActive={false} type="monotone" dataKey="per100" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 3, fill: SERIES[0], strokeWidth: 0 }} activeDot={{ r: 5, fill: '#dd9f0e' }} />
            </LineChart>
          </ResponsiveContainer>
        </section>
      )}

      {months.length > 0 && (
        <section className="card">
          <h2>Dépense par mois (€)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={months} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} width={44} />
              <Tooltip content={<Tip />} cursor={{ fill: 'rgba(38, 48, 60, 0.06)' }} />
              {(singleVehicle ? vehicles.filter((v) => v.id === vehicleFilter) : stackedVehicles).map((v, i, arr) => (
                <Bar
                  key={v.id}
                  isAnimationActive={false}
                  dataKey={v.id}
                  stackId="mois"
                  fill={vehicleColor.get(v.id)}
                  radius={i === arr.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  maxBarSize={36}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
          {!singleVehicle && stackedVehicles.length > 1 && (
            <div className="legend">
              {stackedVehicles.map((v) => (
                <span key={v.id} className="legend-item">
                  <span className="dot" style={{ background: vehicleColor.get(v.id) }} />
                  {v.name}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {singleVehicle && prices.length > 1 && (
        <section className="card">
          <h2>Prix du litre (€/L)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={prices} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} width={48} domain={['auto', 'auto']} tickFormatter={(v: number) => v.toFixed(2)} />
              <Tooltip content={<Tip />} cursor={{ stroke: GRID }} />
              <Line isAnimationActive={false} type="monotone" dataKey="price" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 3, fill: SERIES[0], strokeWidth: 0 }} activeDot={{ r: 5, fill: '#dd9f0e' }} />
            </LineChart>
          </ResponsiveContainer>
        </section>
      )}

      {!singleVehicle && vehicles.length > 1 && (
        <section className="card">
          <h2>Par véhicule</h2>
          {vehicles.map((v) => {
            const s = summarize(scoped.filter((f) => f.vehicle_id === v.id))
            return (
              <div key={v.id} className="fillup-item">
                <div className="body">
                  <div className="nums">
                    <span className="dot" style={{ background: vehicleColor.get(v.id), marginRight: 8 }} />
                    {v.name}
                  </div>
                  <div className="sub">
                    {s.count === 0
                      ? 'aucun plein sur la période'
                      : `${s.count} pleins · ${fmtEur(s.totalSpent)} · ${s.avgConso != null ? fmtConso(s.avgConso) : 'conso —'}`}
                  </div>
                </div>
              </div>
            )
          })}
        </section>
      )}
    </>
  )
}
