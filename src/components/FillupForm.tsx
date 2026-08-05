import { useMemo, useRef, useState, type FormEvent } from 'react'
import { saveFillup } from '../lib/db'
import { downscalePhoto } from '../lib/image'
import { fmtPricePerL, parseDecimal, toLocalInputValue } from '../lib/format'
import type { Vehicle } from '../lib/types'

interface Props {
  vehicles: Vehicle[]
  defaultVehicleId: string | null
  userEmail: string | null
  onSaved: (status: 'synced' | 'queued', draft: boolean) => void
  showToast: (msg: string, kind?: 'ok' | 'err') => void
}

export default function FillupForm({ vehicles, defaultVehicleId, userEmail, onSaved, showToast }: Props) {
  const [vehicleId, setVehicleId] = useState(defaultVehicleId ?? vehicles[0]?.id ?? '')
  const [dateStr, setDateStr] = useState(() => toLocalInputValue(new Date()))
  const [odo, setOdo] = useState('')
  const [liters, setLiters] = useState('')
  const [price, setPrice] = useState('')
  const [isFull, setIsFull] = useState(true)
  const [notes, setNotes] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  const quickInput = useRef<HTMLInputElement>(null)
  const attachInput = useRef<HTMLInputElement>(null)

  const litersNum = parseDecimal(liters)
  const priceNum = parseDecimal(price)
  const pricePerLiter = useMemo(
    () => (litersNum && priceNum != null && litersNum > 0 ? priceNum / litersNum : null),
    [litersNum, priceNum],
  )

  function resetForm() {
    setDateStr(toLocalInputValue(new Date()))
    setOdo('')
    setLiters('')
    setPrice('')
    setIsFull(true)
    setNotes('')
    setPhoto(null)
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
    if (!vehicleId) {
      showToast('Choisis un véhicule', 'err')
      return
    }
    if (!litersNum || litersNum <= 0 || priceNum == null || priceNum < 0) {
      showToast('Litres et prix total sont requis', 'err')
      return
    }
    setBusy(true)
    try {
      const blob = photo ? await downscalePhoto(photo) : null
      const odoNum = parseDecimal(odo)
      const status = await saveFillup(
        {
          vehicle_id: vehicleId,
          filled_at: new Date(dateStr).toISOString(),
          odometer_km: odoNum != null ? Math.round(odoNum) : null,
          liters: litersNum,
          total_price: priceNum,
          is_full: isFull,
          is_draft: false,
          notes: notes.trim() || null,
          created_by_email: userEmail,
        },
        blob,
      )
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
        <span style={{ fontSize: 26 }}>📷</span>
        <span>
          Capture rapide
          <small>Photographie l’écran de la pompe, encode plus tard</small>
        </span>
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

      <form className="card" onSubmit={submit}>
        <h2>Nouveau plein</h2>
        <label className="field">
          <span className="lbl">Véhicule</span>
          <select className="input" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} required>
            <option value="" disabled>
              Choisir…
            </option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="lbl">Date et heure</span>
          <input type="datetime-local" value={dateStr} onChange={(e) => setDateStr(e.target.value)} required />
        </label>
        <div className="field-grid">
          <label className="field">
            <span className="lbl">Litres</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="42,50"
              value={liters}
              onChange={(e) => setLiters(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="lbl">Prix total (€)</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="72,30"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
        </div>
        <div className="field-grid">
          <label className="field">
            <span className="lbl">Compteur (km)</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="128 450"
              value={odo}
              onChange={(e) => setOdo(e.target.value)}
            />
          </label>
          <div className="field">
            <span className="lbl" style={{ display: 'block', marginBottom: 5, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
              Prix au litre
            </span>
            <div className="meter-big" style={{ fontSize: 22, paddingTop: 8 }}>
              {fmtPricePerL(pricePerLiter)}
            </div>
          </div>
        </div>
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
            style={{ width: '100%' }}
          >
            {photo ? `📎 Photo jointe : ${photo.name}` : '📎 Joindre la photo de la pompe'}
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
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Enregistrement…' : 'Enregistrer le plein'}
        </button>
      </form>
    </>
  )
}
