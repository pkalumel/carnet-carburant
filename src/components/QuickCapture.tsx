import { useRef, useState } from 'react'
import { saveFillup } from '../lib/db'
import { downscalePhoto } from '../lib/image'
import { energiesFor, type Energy, type Vehicle } from '../lib/types'
import { CameraIcon } from './icons'

export const LAST_VEHICLE_KEY = 'carnet:lastEntryVehicle'

interface Props {
  vehicles: Vehicle[]
  /** Véhicule pré-sélectionné (filtre courant) ; null → dernier utilisé, sinon le premier */
  vehicleId: string | null
  /** Énergie imposée (formulaire) ; absente → celle par défaut du véhicule */
  energy?: Energy
  userEmail: string | null
  onSaved: (status: 'synced' | 'queued') => void
  showToast: (msg: string, kind?: 'ok' | 'err') => void
}

/** Capture rapide : le geste d'urgence à la pompe ou à la borne → brouillon à compléter */
export default function QuickCapture({ vehicles, vehicleId, energy, userEmail, onSaved, showToast }: Props) {
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const last = localStorage.getItem(LAST_VEHICLE_KEY)
  const vehicle =
    vehicles.find((v) => v.id === vehicleId) ??
    vehicles.find((v) => v.id === last) ??
    vehicles[0] ??
    null
  const en: Energy = energy ?? energiesFor(vehicle?.fuel ?? null)[0]
  const electric = en === 'electric'

  async function capture(file: File) {
    if (!vehicle) {
      showToast('Choisis d’abord un véhicule', 'err')
      return
    }
    setBusy(true)
    try {
      const blob = await downscalePhoto(file)
      const status = await saveFillup(
        {
          vehicle_id: vehicle.id,
          filled_at: new Date().toISOString(),
          energy: en,
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
      localStorage.setItem(LAST_VEHICLE_KEY, vehicle.id)
      if (input.current) input.current.value = ''
      onSaved(status)
    } catch {
      showToast('Enregistrement impossible', 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn-capture"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <span className="cam">
          <CameraIcon size={28} />
        </span>
        <span className="txt">
          Capture rapide
          <small>
            {electric
              ? 'Photographie l’écran de la borne, encode plus tard'
              : 'Photographie l’écran de la pompe, encode plus tard'}
          </small>
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
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void capture(f)
        }}
      />
    </>
  )
}
