import { useState, type FormEvent } from 'react'
import { addVehicle, deleteVehicle, updateVehicle } from '../lib/db'
import type { Fillup, Vehicle } from '../lib/types'

interface Props {
  vehicles: Vehicle[]
  fillups: Fillup[]
  onChanged: () => void
  showToast: (msg: string, kind?: 'ok' | 'err') => void
}

const FUELS = ['Essence', 'Diesel', 'E85', 'GPL', 'Hybride']

function FuelChips({ value, onChange }: { value: string | null; onChange: (f: string | null) => void }) {
  return (
    <div className="field">
      <span className="lbl">Carburant</span>
      <div className="chips wrap">
        {FUELS.map((f) => (
          <button
            type="button"
            key={f}
            className={value === f ? 'chip active' : 'chip'}
            onClick={() => onChange(value === f ? null : f)}
          >
            {f}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Panneau d'édition d'un véhicule (renommage, plaque, carburant, suppression) */
function Editor({
  vehicle,
  fillupCount,
  busy,
  setBusy,
  onDone,
  showToast,
}: {
  vehicle: Vehicle
  fillupCount: number
  busy: boolean
  setBusy: (b: boolean) => void
  onDone: (changed: boolean) => void
  showToast: Props['showToast']
}) {
  const [name, setName] = useState(vehicle.name)
  const [plate, setPlate] = useState(vehicle.plate ?? '')
  const [fuel, setFuel] = useState<string | null>(vehicle.fuel)
  const [confirming, setConfirming] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const nameMatches = confirmText.trim().toLowerCase() === vehicle.name.trim().toLowerCase()

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      await updateVehicle(vehicle.id, { name: name.trim(), plate: plate.trim() || null, fuel })
      showToast('Véhicule modifié ✓')
      onDone(true)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await deleteVehicle(vehicle.id)
      showToast('Véhicule supprimé', 'ok')
      onDone(true)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="vehicle-editor" onSubmit={save}>
      <div className="field-grid">
        <label className="field">
          <span className="lbl">Nom du véhicule</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="field">
          <span className="lbl">Plaque</span>
          <input type="text" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="1-ABC-123" autoCapitalize="characters" />
        </label>
      </div>
      <FuelChips value={fuel} onChange={setFuel} />
      <button className="btn btn-primary" disabled={busy}>
        Enregistrer
      </button>
      <button
        type="button"
        className="btn-ghost"
        style={{ width: '100%', marginTop: 8 }}
        onClick={() => onDone(false)}
        disabled={busy}
      >
        Annuler
      </button>
      {!confirming && (
        <button type="button" className="btn-delete" onClick={() => setConfirming(true)} disabled={busy}>
          Supprimer ce véhicule
        </button>
      )}
      {confirming && (
        <div className="danger-zone" style={{ marginTop: 16 }}>
          <p>
            {fillupCount === 0
              ? <>Supprimer « {vehicle.name} » ? Cette action est définitive.</>
              : <>Supprimer « {vehicle.name} » et ses {fillupCount === 1 ? '1 plein' : `${fillupCount} pleins`} ?
                Tout l’historique de ce véhicule sera perdu. Cette action est définitive.</>}
          </p>
          {fillupCount > 0 && (
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={`Tape « ${vehicle.name} » pour confirmer`}
              autoComplete="off"
            />
          )}
          <div className="row-actions">
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => setConfirming(false)}>
              Annuler
            </button>
            <button
              type="button"
              className="btn-ghost btn-danger"
              disabled={busy || (fillupCount > 0 && !nameMatches)}
              onClick={() => void remove()}
            >
              Supprimer définitivement
            </button>
          </div>
        </div>
      )}
    </form>
  )
}

export default function VehicleManager({ vehicles, fillups, onChanged, showToast }: Props) {
  const [name, setName] = useState('')
  const [plate, setPlate] = useState('')
  const [fuel, setFuel] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      await addVehicle(name.trim(), plate.trim() || null, fuel)
      setName('')
      setPlate('')
      setFuel(null)
      showToast('Véhicule ajouté', 'ok')
      onChanged()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'err')
    } finally {
      setBusy(false)
    }
  }

  const countFor = (id: string) => fillups.filter((f) => f.vehicle_id === id).length

  return (
    <section className="card">
      <h2>Véhicules</h2>
      {vehicles.map((v) => {
        const n = countFor(v.id)
        return editingId === v.id ? (
          <Editor
            key={v.id}
            vehicle={v}
            fillupCount={n}
            busy={busy}
            setBusy={setBusy}
            showToast={showToast}
            onDone={(changed) => {
              setEditingId(null)
              if (changed) onChanged()
            }}
          />
        ) : (
          <div key={v.id} className="fillup-item">
            <div className="body">
              <div className="nums">{v.name}</div>
              <div className="sub">
                {v.plate ? `${v.plate} · ` : ''}
                {v.fuel ? `${v.fuel} · ` : ''}
                {n === 0 ? 'aucun plein' : n === 1 ? '1 plein' : `${n} pleins`}
              </div>
            </div>
            <button className="btn-ghost" onClick={() => setEditingId(v.id)}>
              Modifier
            </button>
          </div>
        )
      })}
      <form onSubmit={submit} style={{ marginTop: 12 }}>
        <div className="field-grid">
          <label className="field">
            <span className="lbl">Nom du véhicule</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Clio grise"
              required
            />
          </label>
          <label className="field">
            <span className="lbl">Plaque</span>
            <input
              type="text"
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              placeholder="1-ABC-123" autoCapitalize="characters"
            />
          </label>
        </div>
        <FuelChips value={fuel} onChange={setFuel} />
        <button className="btn btn-primary" disabled={busy}>
          Ajouter le véhicule
        </button>
      </form>
    </section>
  )
}
