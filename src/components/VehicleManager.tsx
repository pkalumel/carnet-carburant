import { useState, type FormEvent } from 'react'
import { addVehicle, deleteVehicle } from '../lib/db'
import type { Vehicle } from '../lib/types'

interface Props {
  vehicles: Vehicle[]
  onChanged: () => void
  showToast: (msg: string, kind?: 'ok' | 'err') => void
}

export default function VehicleManager({ vehicles, onChanged, showToast }: Props) {
  const [name, setName] = useState('')
  const [plate, setPlate] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      await addVehicle(name.trim(), plate.trim() || null)
      setName('')
      setPlate('')
      showToast('Véhicule ajouté', 'ok')
      onChanged()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function remove(v: Vehicle) {
    if (!confirm(`Supprimer « ${v.name} » et tous ses pleins ? Cette action est définitive.`)) return
    try {
      await deleteVehicle(v.id)
      showToast('Véhicule supprimé', 'ok')
      onChanged()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'err')
    }
  }

  return (
    <section className="card">
      <h2>Véhicules</h2>
      {vehicles.map((v) => (
        <div key={v.id} className="fillup-item">
          <div className="body">
            <div className="nums">{v.name}</div>
            {v.plate && <div className="sub">{v.plate}</div>}
          </div>
          <button className="btn-ghost btn-danger" onClick={() => remove(v)}>
            Supprimer
          </button>
        </div>
      ))}
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
        <button className="btn btn-primary" disabled={busy}>
          Ajouter le véhicule
        </button>
      </form>
    </section>
  )
}
