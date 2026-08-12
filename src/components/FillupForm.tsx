import { useMemo, useRef, useState, type FormEvent } from 'react'
import { saveFillup } from '../lib/db'
import { downscalePhoto } from '../lib/image'
import { fmtKm, fmtPricePerL, parseDecimal, toLocalInputValue } from '../lib/format'
import type { Fillup, Vehicle } from '../lib/types'
import { AttachIcon, CameraIcon, SaveIcon } from './icons'

interface Props {
  vehicles: Vehicle[]
  fillups: Fillup[]
  defaultVehicleId: string | null
  userEmail: string | null
  onSaved: (status: 'synced' | 'queued', draft: boolean) => void
  showToast: (msg: string, kind?: 'ok' | 'err') => void
}

const LAST_VEHICLE_KEY = 'carnet:lastEntryVehicle'

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
  const [dateStr, setDateStr] = useState(() => toLocalInputValue(new Date()))
  const [odo, setOdo] = useState('')
  const [liters, setLiters] = useState('')
  const [price, setPrice] = useState('')
  const [isFull, setIsFull] = useState(true)
  const [notes, setNotes] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [errors, setErrors] = useState<{ liters?: string; price?: string }>({})

  const quickInput = useRef<HTMLInputElement>(null)
  const attachInput = useRef<HTMLInputElement>(null)
  const litersInput = useRef<HTMLInputElement>(null)
  const priceInput = useRef<HTMLInputElement>(null)

  const litersNum = parseDecimal(liters)
  const priceNum = parseDecimal(price)
  const odoNum = parseDecimal(odo)
  const pricePerLiter = useMemo(
    () => (litersNum && priceNum != null && litersNum > 0 ? priceNum / litersNum : null),
    [litersNum, priceNum],
  )

  // Dernier kilométrage connu du véhicule : aide à la saisie + garde-fou
  const lastOdo = useMemo(() => {
    let max: number | null = null
    for (const f of fillups) {
      if (f.vehicle_id !== vehicleId || f.odometer_km == null || f.is_draft) continue
      if (max == null || f.odometer_km > max) max = f.odometer_km
    }
    return max
  }, [fillups, vehicleId])

  const odoError =
    odoNum != null && lastOdo != null && Math.round(odoNum) <= lastOdo
      ? `Doit dépasser ${fmtKm(lastOdo)} (dernier plein)`
      : null

  function resetForm() {
    setDateStr(toLocalInputValue(new Date()))
    setOdo('')
    setLiters('')
    setPrice('')
    setIsFull(true)
    setNotes('')
    setPhoto(null)
    setErrors({})
    setShowMore(false)
    if (attachInput.current) attachInput.current.value = ''
    if (quickInput.current) quickInput.current.value = ''
  }

  /** Capture rapide : photo de la pompe → brouillon à compléter plus tard */
  async function quickCapture(file: File) {
    if (!vehicleId) {
      showToast('Choisis d’abord un véhicule', 'err')
      return
    }
    setBusy(true)
    try {
      const blob = await downscalePhoto(file)
      const status = await saveFillup(
        {
          vehicle_id: vehicleId,
          filled_at: new Date().toISOString(),
          odometer_km: null,
          liters: null,
          total_price: null,
          is_full: true,
          is_draft: true,
          notes: null,
          created_by_email: userEmail,
        },
        blob,
      )
      localStorage.setItem(LAST_VEHICLE_KEY, vehicleId)
      resetForm()
      onSaved(status, true)
    } catch {
      showToast('Enregistrement impossible', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs: { liters?: string; price?: string } = {}
    if (!litersNum || litersNum <= 0) errs.liters = 'Indique les litres'
    if (priceNum == null || priceNum < 0) errs.price = 'Indique le prix total'
    setErrors(errs)
    if (errs.liters) {
      litersInput.current?.focus()
      return
    }
    if (errs.price) {
      priceInput.current?.focus()
      return
    }
    if (odoError) return
    setBusy(true)
    try {
      const blob = photo ? await downscalePhoto(photo) : null
      const status = await saveFillup(
        {
          vehicle_id: vehicleId,
          filled_at: new Date(dateStr).toISOString(),
          odometer_km: odoNum != null ? Math.round(odoNum) : null,
          liters: litersNum as number,
          total_price: priceNum as number,
          is_full: isFull,
          is_draft: false,
          notes: notes.trim() || null,
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

  return (
    <>
      {/* Capture rapide : le geste d'urgence à la pompe */}
      <button
        type="button"
        className="btn-capture"
        disabled={busy}
        onClick={() => quickInput.current?.click()}
      >
        <span className="cam">
          <CameraIcon size={28} />
        </span>
        <span className="txt">
          Capture rapide
          <small>Photographie l’écran de la pompe, encode plus tard</small>
        </span>
        <svg
          className="chev"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
      <input
        ref={quickInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void quickCapture(f)
        }}
      />

      <form className="card" onSubmit={submit} noValidate>
        <h2>Nouveau plein</h2>
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
        <div className="field-grid">
          <label className="field">
            <span className="lbl">Litres</span>
            <input
              ref={litersInput}
              type="text"
              inputMode="decimal"
              placeholder="42,50"
              className={errors.liters ? 'error' : ''}
              value={liters}
              onChange={(e) => {
                setLiters(e.target.value)
                if (errors.liters) setErrors((p) => ({ ...p, liters: undefined }))
              }}
            />
            {errors.liters && <span className="field-error">{errors.liters}</span>}
          </label>
          <label className="field">
            <span className="lbl">Prix total (€)</span>
            <input
              ref={priceInput}
              type="text"
              inputMode="decimal"
              placeholder="72,30"
              className={errors.price ? 'error' : ''}
              value={price}
              onChange={(e) => {
                setPrice(e.target.value)
                if (errors.price) setErrors((p) => ({ ...p, price: undefined }))
              }}
            />
            {errors.price && <span className="field-error">{errors.price}</span>}
          </label>
        </div>
        <div className="field-grid">
          <label className="field">
            <span className="lbl">Compteur (km)</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder={lastOdo != null ? `> ${fmtKm(lastOdo)}` : '128 450'}
              className={odoError ? 'error' : ''}
              value={odo}
              onChange={(e) => setOdo(e.target.value)}
            />
            {odoError ? (
              <span className="field-error">{odoError}</span>
            ) : odoNum != null && lastOdo != null ? (
              <span className="field-hint">
                +{(Math.round(odoNum) - lastOdo).toLocaleString('fr-FR')} km depuis le dernier plein
              </span>
            ) : lastOdo != null ? (
              <span className="field-hint">Dernier plein : {fmtKm(lastOdo)}</span>
            ) : null}
          </label>
          <div className="field">
            <span className="lbl">Prix au litre</span>
            <div className="ppl">
              <span className="meter-big" style={{ fontSize: 22 }}>
                {fmtPricePerL(pricePerLiter)}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          className={showMore ? 'btn-more open' : 'btn-more'}
          onClick={() => setShowMore(!showMore)}
        >
          {showMore ? 'Masquer les détails' : 'Plus de détails'}
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
              <span className="lbl">Date et heure</span>
              <input type="datetime-local" value={dateStr} onChange={(e) => setDateStr(e.target.value)} required />
            </label>
            <label className="check">
              <input type="checkbox" checked={isFull} onChange={(e) => setIsFull(e.target.checked)} />
              Plein complet (rempli à ras bord)
            </label>
            <label className="field">
              <span className="lbl">Notes (optionnel)</span>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Station, type de carburant…"
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
                {photo ? `Photo jointe : ${photo.name}` : 'Joindre la photo de la pompe'}
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

        <button className="btn btn-primary" disabled={busy}>
          <SaveIcon /> {busy ? 'Enregistrement…' : 'Enregistrer le plein'}
        </button>
      </form>
    </>
  )
}
