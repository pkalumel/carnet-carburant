import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { saveFillup } from '../lib/db'
import { downscalePhoto } from '../lib/image'
import { fmtDateTime, toLocalInputValue } from '../lib/format'
import { captureLocation, reverseGeocode, type GeoPoint } from '../lib/geo'
import { energiesFor, type Energy, type Fillup, type Vehicle } from '../lib/types'
import { EntryFields, PctFieldsOptional, useEntryState } from './EntryFields'
import { LAST_VEHICLE_KEY } from './QuickCapture'
import { AttachIcon, BoltIcon, PinIcon, PumpIcon, SaveIcon, XIcon } from './icons'

interface Props {
  vehicles: Vehicle[]
  fillups: Fillup[]
  defaultVehicleId: string | null
  /** énergie pré-sélectionnée (raccourci PWA « Recharge ») */
  defaultEnergy?: Energy
  userEmail: string | null
  onSaved: (status: 'synced' | 'queued', draft: boolean) => void
  showToast: (msg: string, kind?: 'ok' | 'err') => void
}

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

export default function FillupForm({ vehicles, fillups, defaultVehicleId, defaultEnergy, userEmail, onSaved, showToast }: Props) {
  const [vehicleId, setVehicleId] = useState(() => {
    const last = localStorage.getItem(LAST_VEHICLE_KEY)
    return (
      defaultVehicleId ??
      (last && vehicles.some((v) => v.id === last) ? last : null) ??
      vehicles[0]?.id ??
      ''
    )
  })
  const [energyChoice, setEnergyChoice] = useState<Energy | null>(defaultEnergy ?? null)
  const [dateStr, setDateStr] = useState(() => toLocalInputValue(new Date()))
  const [dateOpen, setDateOpen] = useState(false)
  const [isFull, setIsFull] = useState(true)
  const [notes, setNotes] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [showMore, setShowMore] = useState(false)

  const attachInput = useRef<HTMLInputElement>(null)

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

  const entry = useEntryState({ vehicle, energy, fillups, dateStr })

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

  // La vignette de la photo jointe remplace le nom de fichier brut
  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo])
  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl)
    }
  }, [photoUrl])

  function resetForm() {
    entry.reset()
    setDateStr(toLocalInputValue(new Date()))
    setDateOpen(false)
    setIsFull(storedFull(energy))
    setNotes('')
    setPhoto(null)
    setShowMore(false)
    if (attachInput.current) attachInput.current.value = ''
  }

  async function save(draft: boolean) {
    setBusy(true)
    try {
      const blob = photo ? await downscalePhoto(photo) : null
      const status = await saveFillup(
        {
          vehicle_id: vehicleId,
          filled_at: new Date(dateStr).toISOString(),
          energy,
          ...entry.buildInput(),
          is_full: isFull,
          is_draft: draft,
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
      onSaved(status, draft)
    } catch {
      showToast('Enregistrement impossible', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!entry.validate()) return
    await save(false)
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

        <EntryFields state={entry} autoFocus />

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
          {showMore ? 'Masquer photo et détails' : 'Photo et détails'}
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
            <PctFieldsOptional state={entry} />
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
                {photoUrl ? (
                  <img className="photo-mini" src={photoUrl} alt="" />
                ) : (
                  <AttachIcon />
                )}
                {photo
                  ? 'Photo jointe — changer'
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
        {entry.missing.length > 0 && (
          <button
            type="button"
            className="btn-ghost btn-later"
            disabled={busy}
            onClick={() => void save(true)}
          >
            Enregistrer et compléter plus tard
          </button>
        )}
      </div>
    </form>
  )
}
