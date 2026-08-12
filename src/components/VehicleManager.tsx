import { useState, type FormEvent } from 'react'
import { addVehicle, deleteVehicle } from '../lib/db'
import type { Fillup, Vehicle } from '../lib/types'

interface Props {
  vehicles: Vehicle[]
  fillups: Fillup[]
  onChanged: () => void
  showToast: (msg: string, kind?: 'ok' | 'err') => void
}

const FUELS = ['Essence', 'Diesel', 'E85', 'GPL', 'Hybride']

export default function VehicleManager({ vehicles, fillups, onChanged, showToast }: Props) {
  const [name, setName] = useState('')
  const [plate, setPlate] = useState('')
  const [fuel, setFuel] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState('')

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

  async function remove(v: Vehicle) {
    setBusy(true)
    try {
      await deleteVehicle(v.id)
      setConfirmingId(null)
      setConfirmText('')
      showToast('Véhicule supprimé', 'ok')
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
        const confirming = confirmingId === v.id
        const nameMatches = confirmText.trim().toLowerCase() === v.name.trim().toLowerCase()
        return (
          <div key={v.id}>
            <div className="fillup-item">
              <div className="body">
                <div className="nums">{v.name}</div>
                <div className="sub">
                  {v.plate ? `${v.plate} · ` : ''}
                  {v.fuel ? `${v.fuel} · ` : ''}
                  {n === 0 ? 'aucun plein' : n === 1 ? '1 plein' : `${n} pleins`}
                </div>
              </div>
              {!confirming && (
                <button
                  className="btn-ghost btn-danger"
                  onClick={() => {
                    setConfirmingId(v.id)
                    setConfirmText('')
                  }}
                >
                  Supprimer
                </button>
              )}
            </div>
            {confirming && (
              <div className="danger-zone">
                <p>
                  {n === 0
                    ? <>Supprimer « {v.name} » ? Cette action est définitive.</>
                    : <>Supprimer « {v.name} » et ses {n === 1 ? '1 plein' : `${n} pleins`} ?
                      Tout l’historique de ce véhicule sera perdu. Cette action est définitive.</>}
                </p>
                {n > 0 && (
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={`Tape « ${v.name} » pour confirmer`}
                    autoComplete="off"
                  />
                )}
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busy}
                    onClick={() => {
                      setConfirmingId(null)
                      setConfirmText('')
                    }}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-danger"
                    disabled={busy || (n > 0 && !nameMatches)}
                    onClick={() => void remove(v)}
                  >
                    Supprimer définitivement
                  </button>
                </div>
              </div>
            )}
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
            <span className="lbl">Plaque (optionnel)</span>
            <input
              type="text"
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              placeholder="1-ABC-123"
            />
          </label>
        </div>
        <div className="field">
          <span className="lbl">Carburant</span>
          <div className="chips wrap">
            {FUELS.map((f) => (
              <button
                type="button"
                key={f}
                className={fuel === f ? 'chip active' : 'chip'}
                onClick={() => setFuel(fuel === f ? null : f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <button className="btn btn-primary" disabled={busy}>
          Ajouter le véhicule
        </button>
      </form>
    </section>
  )
}
