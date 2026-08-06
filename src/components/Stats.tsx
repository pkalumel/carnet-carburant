import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { consumptionSeries, monthlyCosts, priceSeries, summarize } from '../lib/stats'
import { fmtConso, fmtEur, fmtKm, fmtPricePerL } from '../lib/format'
import type { Fillup, Vehicle } from '../lib/types'

// Couleur de série validée (contraste, chroma, bande de luminance) sur surface blanche
const DATA = '#3E8EDD'
const GRID = '#272c34'
const AXIS = '#9aa1ac'

interface Props {
  fillups: Fillup[]
  vehicles: Vehicle[]
  vehicleFilter: string
}

const num = (v: number | null, digits: number) =>
  v == null
    ? '—'
    : v.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })

const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

function Meter({ value, unit, label, chip }: { value: string; unit?: string; label: string; chip: string }) {
  return (
    <div>
      <span className={`chip ${chip}`}>{label}</span>
      <div className="meter-big num" style={{ marginTop: 10 }}>
        {value}
        {unit && <span className="meter-unit">{unit}</span>}
      </div>
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
        background: '#ffffff', color: '#12151a', borderRadius: 12, padding: '8px 12px',
        fontSize: 13, fontWeight: 600, whiteSpace: 'pre-line',
      }}
    >
      {payload[0].payload.tip}
    </div>
  )
}

export default function Stats({ fillups, vehicles, vehicleFilter }: Props) {
  const summary = summarize(fillups)
  const months = monthlyCosts(fillups).slice(-12).map((m) => ({
    ...m,
    label: monthLabel(m.month),
    tip: `${monthLabel(m.month)}\n${fmtEur(m.total)}`,
  }))

  const singleVehicle = vehicleFilter !== 'all'
  const conso = singleVehicle
    ? consumptionSeries(fillups).map((p) => ({
        ...p,
        label: dayLabel(p.date),
        tip: `${dayLabel(p.date)}\n${fmtConso(p.per100)} sur ${fmtKm(p.km)}`,
      }))
    : []
  const prices = singleVehicle
    ? priceSeries(fillups).map((p) => ({
        ...p,
        label: dayLabel(p.date),
        tip: `${dayLabel(p.date)}\n${fmtPricePerL(p.price)}`,
      }))
    : []

  if (fillups.length === 0) {
    return <div className="card empty">Les statistiques apparaîtront après les premiers pleins.</div>
  }

  return (
    <>
      <section className="card light">
        <h2>
          En <span style={{ fontWeight: 400 }}>résumé</span>
        </h2>
        <div className="meter-row">
          <Meter value={num(summary.avgConso, 1)} unit="L/100" label="Conso moyenne" chip="chip-lime" />
          <Meter value={num(summary.costPerKm != null ? summary.costPerKm * 100 : null, 1)} unit="c€/km" label="Coût au km" chip="chip-pink" />
          <Meter value={num(summary.totalSpent, 2)} unit="€" label="Total dépensé" chip="chip-blue" />
          <Meter value={num(summary.avgPricePerLiter, 3)} unit="€/L" label="Prix moyen" chip="chip-lime" />
        </div>
        {summary.avgConso == null && (
          <p style={{ fontSize: 13, color: 'var(--muted-inv)', marginBottom: 0, marginTop: 14 }}>
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
              <Line isAnimationActive={false} type="monotone" dataKey="per100" stroke={DATA} strokeWidth={2} dot={{ r: 3, fill: DATA, strokeWidth: 0 }} activeDot={{ r: 5 }} />
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
              <Tooltip content={<Tip />} cursor={{ fill: 'rgba(47, 109, 181, 0.08)' }} />
              <Bar isAnimationActive={false} dataKey="total" fill={DATA} radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
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
              <Line isAnimationActive={false} type="monotone" dataKey="price" stroke={DATA} strokeWidth={2} dot={{ r: 3, fill: DATA, strokeWidth: 0 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </section>
      )}

      {!singleVehicle && vehicles.length > 1 && (
        <section className="card">
          <h2>Par véhicule</h2>
          {vehicles.map((v) => {
            const s = summarize(fillups.filter((f) => f.vehicle_id === v.id))
            if (s.count === 0) return null
            return (
              <div key={v.id} className="fillup-item">
                <div className="body">
                  <div className="nums">{v.name}</div>
                  <div className="sub">
                    {s.count} pleins · {fmtEur(s.totalSpent)} · {s.avgConso != null ? fmtConso(s.avgConso) : 'conso —'}
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
