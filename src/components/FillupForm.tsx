import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { saveFillup } from '../lib/db'
import { downscalePhoto } from '../lib/image'
import { fmtDateTime, fmtKm, parseDecimal, toLocalInputValue } from '../lib/format'
import { captureLocation, reverseGeocode, type GeoPoint } from '../lib/geo'
import { checkFillup } from '../lib/plausibility'
import {
  derivedField, editField, emptyTriangle, setSourceValue, triangleValues, type Triangle,
} from '../lib/triangle'
import { energiesFor, type Energy, type Fillup, type Vehicle } from '../lib/types'
import { LAST_VEHICLE_KEY } from './QuickCapture'
import { AttachIcon, BoltIcon, PinIcon, PumpIcon, SaveIcon, XIcon } from './icons'

interface Props {
  vehicles: Vehicle[]
  fillups: Fillup[]
  defaultVehicleId: string | null
  userEmail: string | null
  onSaved: (status: 'synced' | 'queued', draft: boolean) => void
  showToast: (msg: string, kind?: 'ok' | 'err') => void
}

type ChargePlace = 'home' | 'station'
const PLACE_KEY = 'carnet:chargePlace'

/** « Aujourd'hui, 18:15 » / « Hier, 09:40 » / date complète */
function dateLabel(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const now = new Date()
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (sameDay(d, now)) return `Aujourd’hui, ${time}`
  if (sameDay(d, yesterday)) return `Hier, ${time}`
  return fmtDateTime(d.toISOString())
}

export default function FillupForm({ vehicles, fillups, defaultVehicleId, userEmail, onSaved, showToast }: Props) {
  const [vehicleId, setVehicleId] = useState(() => {
    const last = localStorage.getItem(LAST_VEHICLE_KEY)
    return (
      defaultVehicleId ??
      (last && vehicles.some((v) => v.id === last) ? last : null) ??
      vehicles[0]?.id ??
      ''
    )
  })
  const [energyChoice, setEnergyChoice] = useState<Energy | null>(null)
  const [triangle, setTriangle] = useState<Triangle>(emptyTriangle)
  const [odo, setOdo] = useState('')
  const [odoTouched, setOdoTouched] = useState(false)
  const [dateStr, setDateStr] = useState(() => toLocalInputValue(new Date()))
  const [dateOpen, setDateOpen] = useState(false)
  const [chargePlace, setChargePlace] = useState<ChargePlace>(
    () => (localStorage.getItem(PLACE_KEY) === 'station' ? 'station' : 'home'),
  )
  const [isFull, setIsFull] = useState(true)
  const [notes, setNotes] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [errors, setErrors] = useState<{ volume?: string; total?: string }>({})

  const attachInput = useRef<HTMLInputElement>(null)
  const volumeInput = useRef<HTMLInputElement>(null)
  const totalInput = useRef<HTMLInputElement>(null)

  // Lieu de la saisie : capturé à l'ouverture, retirable, jamais bloquant
  const [geo, setGeo] = useState<GeoPoint | null>(null)
  const [place, setPlace] = useState<string | null>(null)
  const [geoOff, setGeoOff] = useState(false)
  useEffect(() => {
    let alive = true
    void captureLocation().then((p) => {
      if (!alive || !p) return
      setGeo(p)
      void reverseGeocode(p).then((label) => {
        if (alive) setPlace(label)
      })
    })
    return () => {
      alive = false
    }
  }, [])

  // Énergies possibles pour le véhicule choisi ; le choix explicite ne
  // survit que s'il reste valable après un changement de véhicule.
  const vehicle = vehicles.find((v) => v.id === vehicleId)
  const energies = energiesFor(vehicle?.fuel ?? null)
  const energy: Energy = energyChoice && energies.includes(energyChoice) ? energyChoice : energies[0]
  const electric = energy === 'electric'
  const homePricing = electric && vehicle?.home_kwh_price != null

  // Dernier kilométrage connu + delta médian : le compteur est pré-rempli
  // en « suggéré », l'utilisateur tape par-dessus (select() au focus).
  const { lastOdo, suggestedOdo } = useMemo(() => {
    const mine = fillups
      .filter((f) => f.vehicle_id === vehicleId && !f.is_draft && f.odometer_km != null)
      .sort((a, b) => (a.filled_at < b.filled_at ? -1 : 1))
    const odos = mine.map((f) => f.odometer_km as number)
    const last = odos.length > 0 ? Math.max(...odos) : null
    const deltas: number[] = []
    for (let i = 1; i < odos.length; i++) {
      const d = odos[i] - odos[i - 1]
      if (d > 0) deltas.push(d)
    }
    const recent = deltas.slice(-6).sort((a, b) => a - b)
    const median = recent.length > 0 ? recent[Math.floor(recent.length / 2)] : null
    return { lastOdo: last, suggestedOdo: last != null && median != null ? last + median : null }
  }, [fillups, vehicleId])

  // Changement de véhicule ou d'énergie : le triangle repart à zéro
  // (les litres d'une Clio ne sont pas les kWh d'une Zoé)
  useEffect(() => {
    setTriangle(emptyTriangle())
    setErrors({})
  }, [vehicleId, energy])

  // Recharge « Maison » : le tarif du véhicule devient la source prix/kWh
  useEffect(() => {
    if (homePricing && chargePlace === 'home' && vehicle?.home_kwh_price != null) {
      const tarif = String(vehicle.home_kwh_price).replace('.', ',')
      setTriangle((t) => setSourceValue(t, 'unit', tarif))
    }
  }, [homePricing, chargePlace, vehicle?.home_kwh_price, vehicleId, energy])

  // Compteur suggéré à l'arrivée sur un véhicule
  useEffect(() => {
    setOdo(suggestedOdo != null ? String(suggestedOdo) : '')
    setOdoTouched(false)
  }, [vehicleId, suggestedOdo])

  // Le dernier choix complet/partiel est mémorisé par énergie
  const storedFull = (en: Energy) => {
    const s = localStorage.getItem(`carnet:isFull:${en}`)
    return s == null ? true : s === '1'
  }
  useEffect(() => {
    setIsFull(storedFull(energy))
  }, [energy])
  function chooseFull(v: boolean) {
    setIsFull(v)
    localStorage.setItem(`carnet:isFull:${energy}`, v ? '1' : '0')
  }
  function choosePlace(p: ChargePlace) {
    setChargePlace(p)
    localStorage.setItem(PLACE_KEY, p)
    if (p === 'station') {
      // le tarif maison cesse d'être imposé : le prix redevient dérivé
      setTriangle((t) => ({ ...t, unit: '', sources: ['volume', 'total'] }))
    }
  }

  const odoNum = parseDecimal(odo)
  const vals = triangleValues(triangle)
  const derived = derivedField(triangle)

  // Garde-fous de plausibilité : avertissent, ne bloquent jamais
  const warnings = useMemo(
    () =>
      checkFillup({
        vehicleId,
        energy,
        odometerKm: odoNum,
        volume: vals.volume,
        unitPrice: vals.unit,
        fillups,
        lastOdo,
      }),
    [vehicleId, energy, odoNum, vals.volume, vals.unit, fillups, lastOdo],
  )

  function resetForm() {
    setTriangle(emptyTriangle())
    setOdo(suggestedOdo != null ? String(suggestedOdo) : '')
    setOdoTouched(false)
    setDateStr(toLocalInputValue(new Date()))
    setDateOpen(false)
    setIsFull(storedFull(energy))
    setNotes('')
    setPhoto(null)
    setErrors({})
    setShowMore(false)
    if (attachInput.current) attachInput.current.value = ''
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs: { volume?: string; total?: string } = {}
    if (vals.volume == null || vals.volume <= 0)
      errs.volume = electric ? 'Indique les kWh' : 'Indique les litres'
    if (vals.total == null || vals.total < 0) errs.total = 'Indique le prix total'
    setErrors(errs)
    if (errs.volume) {
      volumeInput.current?.focus()
      return
    }
    if (errs.total) {
      totalInput.current?.focus()
      return
    }
    setBusy(true)
    try {
      const blob = photo ? await downscalePhoto(photo) : null
      const status = await saveFillup(
        {
          vehicle_id: vehicleId,
          filled_at: new Date(dateStr).toISOString(),
          energy,
          odometer_km: odoNum != null ? Math.round(odoNum) : null,
          liters: vals.volume as number,
          total_price: vals.total as number,
          is_full: isFull,
          is_draft: false,
          notes: notes.trim() || null,
          lat: geoOff ? null : (geo?.lat ?? null),
          lng: geoOff ? null : (geo?.lng ?? null),
          place: geoOff ? null : place,
          created_by_email: userEmail,
        },
        blob,
      )
      localStorage.setItem(LAST_VEHICLE_KEY, vehicleId)
      resetForm()
      onSaved(status, false)
    } catch {
      showToast('Enregistrement impossible', 'err')
    } finally {
      setBusy(false)
    }
  }

  const unitAffix = electric ? '€/kWh' : '€/L'
  const volAffix = electric ? 'kWh' : 'L'

  const numField = (
    field: 'volume' | 'total' | 'unit',
    label: string,
    affix: string,
    ref?: React.RefObject<HTMLInputElement | null>,
    error?: string,
    enterHint: 'next' | 'done' = 'next',
  ) => {
    const isDerived = derived === field && triangle[field] !== ''
    return (
      <label className="field">
        <span className="lbl">{label}</span>
        <div className={isDerived ? 'input-affix calc' : 'input-affix'}>
          {isDerived && <span className="affix affix-left">=</span>}
          <input
            ref={ref}
            type="text"
            inputMode="decimal"
            enterKeyHint={enterHint}
            className={error ? 'error' : ''}
            value={triangle[field]}
            onChange={(e) => {
              setTriangle((t) => editField(t, field, e.target.value))
              if (errors[field as 'volume' | 'total'])
                setErrors((p) => ({ ...p, [field]: undefined }))
            }}
          />
          <span className="affix">{affix}</span>
        </div>
        {error && <span className="field-error">{error}</span>}
      </label>
    )
  }

  return (
    <form className="card entry-form" onSubmit={submit} noValidate>
      <div className="sheet-body">
        <h2>{electric ? 'Nouvelle recharge' : 'Nouveau plein'}</h2>
        {vehicles.length > 1 && (
          <div className="field">
            <span className="lbl">Véhicule</span>
            <div className="chips wrap">
              {vehicles.map((v) => (
                <button
                  type="button"
                  key={v.id}
                  className={vehicleId === v.id ? 'chip active' : 'chip'}
                  onClick={() => setVehicleId(v.id)}
                >
                  {v.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {energies.length > 1 && (
          <div className="field">
            <span className="lbl">Énergie</span>
            <div className="chips">
              <button
                type="button"
                className={energy === 'fuel' ? 'chip active' : 'chip'}
                onClick={() => setEnergyChoice('fuel')}
              >
                <PumpIcon size={16} /> Carburant
              </button>
              <button
                type="button"
                className={energy === 'electric' ? 'chip active' : 'chip'}
                onClick={() => setEnergyChoice('electric')}
              >
                <BoltIcon size={16} /> Recharge
              </button>
            </div>
          </div>
        )}

        {homePricing && (
          <div className="field">
            <span className="lbl">Lieu de recharge</span>
            <div className="seg">
              <button type="button" className={chargePlace === 'home' ? 'active' : ''} onClick={() => choosePlace('home')}>
                Maison
              </button>
              <button type="button" className={chargePlace === 'station' ? 'active' : ''} onClick={() => choosePlace('station')}>
                Borne
              </button>
            </div>
            {chargePlace === 'home' && vehicle?.home_kwh_price != null && (
              <span className="field-hint">
                Tarif maison appliqué : {String(vehicle.home_kwh_price).replace('.', ',')} €/kWh
              </span>
            )}
          </div>
        )}

        <div className="field-grid">
          {numField('volume', volAffix === 'kWh' ? 'kWh' : 'Litres', volAffix, volumeInput, errors.volume)}
          {numField('total', 'Prix total', '€', totalInput, errors.total)}
        </div>
        <div className="field-grid">
          {numField('unit', electric ? 'Prix au kWh' : 'Prix au litre', unitAffix)}
          <label className="field">
            <span className="lbl">Compteur</span>
            <div className="input-affix">
              <input
                type="text"
                inputMode="numeric"
                enterKeyHint="done"
                className={odoTouched || odo === '' ? '' : 'suggested'}
                value={odo}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  setOdo(e.target.value)
                  setOdoTouched(true)
                }}
              />
              <span className="affix">km</span>
            </div>
            {!odoTouched && suggestedOdo != null && odo !== '' ? (
              <span className="field-hint">
                Suggéré : dernier relevé {fmtKm(lastOdo)} + habitude
              </span>
            ) : lastOdo != null ? (
              <span className="field-hint">Dernier relevé : {fmtKm(lastOdo)}</span>
            ) : null}
          </label>
        </div>

        <div className="field">
          <span className="lbl">{electric ? 'Charge' : 'Plein'}</span>
          <div className="seg">
            <button type="button" className={isFull ? 'active' : ''} onClick={() => chooseFull(true)}>
              {electric ? 'Charge complète' : 'Plein complet'}
            </button>
            <button type="button" className={!isFull ? 'active' : ''} onClick={() => chooseFull(false)}>
              {electric ? 'Partielle' : 'Partiel'}
            </button>
          </div>
          {!isFull && (
            <span className="field-hint">
              {electric
                ? 'La consommation se calculera à la prochaine charge complète.'
                : 'La consommation se calculera au prochain plein complet.'}
            </span>
          )}
        </div>

        {warnings.map((w) => (
          <div key={w} className="field-warn" role="status">
            <span aria-hidden>⚠</span> {w}
          </div>
        ))}

        {geo && !geoOff && (
          <div className="geo-line">
            <span className="geo-ico" aria-hidden>
              <PinIcon size={15} />
            </span>
            <span className="geo-label">
              {place ?? `${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}`}
            </span>
            <button
              type="button"
              className="geo-off"
              aria-label="Ne pas enregistrer le lieu"
              onClick={() => setGeoOff(true)}
            >
              <XIcon size={14} />
            </button>
          </div>
        )}

        <button type="button" className="date-line" onClick={() => setDateOpen(!dateOpen)}>
          <span className="lbl">Date</span>
          <span className="date-val">{dateLabel(dateStr)}</span>
          <svg
            className="chev"
            style={dateOpen ? { transform: 'rotate(180deg)' } : undefined}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {dateOpen && (
          <div className="field">
            <div className="chips" style={{ marginBottom: 8 }}>
              <button
                type="button"
                className="chip"
                onClick={() => setDateStr(toLocalInputValue(new Date()))}
              >
                Aujourd’hui
              </button>
              <button
                type="button"
                className="chip"
                onClick={() => {
                  const d = new Date()
                  d.setDate(d.getDate() - 1)
                  setDateStr(toLocalInputValue(d))
                }}
              >
                Hier
              </button>
            </div>
            <input type="datetime-local" value={dateStr} onChange={(e) => setDateStr(e.target.value)} required />
          </div>
        )}

        <button
          type="button"
          className={showMore ? 'btn-more open' : 'btn-more'}
          onClick={() => setShowMore(!showMore)}
        >
          {showMore ? 'Masquer photo et notes' : 'Photo et notes'}
          <svg
            className="chev"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {showMore && (
          <>
            <label className="field">
              <span className="lbl">Notes (optionnel)</span>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={electric ? 'Borne, réseau de recharge…' : 'Station, type de carburant…'}
              />
            </label>
            <div className="field">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => attachInput.current?.click()}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <AttachIcon />
                {photo
                  ? `Photo jointe : ${photo.name}`
                  : electric
                    ? 'Joindre la photo de la borne'
                    : 'Joindre la photo de la pompe'}
              </button>
              <input
                ref={attachInput}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              />
            </div>
          </>
        )}
      </div>

      <div className="sheet-footer">
        <button className="btn btn-primary" disabled={busy}>
          <SaveIcon />{' '}
          {busy ? 'Enregistrement…' : electric ? 'Enregistrer la recharge' : 'Enregistrer le plein'}
        </button>
      </div>
    </form>
  )
}
