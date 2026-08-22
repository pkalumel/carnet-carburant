import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { inviteGuest, listShares, revokeShare } from '../lib/sharesDb'
import type { Vehicle, VehicleShare } from '../lib/types'
import { PlusIcon, TrashIcon, XIcon } from './icons'

interface Props {
  vehicles: Vehicle[]
  userId: string
  userEmail: string | null
  showToast: (msg: string, kind?: 'ok' | 'err') => void
  /** recharge l'app (un partage quitté fait disparaître un véhicule) */
  onChanged: () => void
}

export default function ShareManager({ vehicles, userId, userEmail, showToast, onChanged }: Props) {
  const [shares, setShares] = useState<VehicleShare[] | null>(null)
  const [email, setEmail] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const owned = useMemo(() => vehicles.filter((v) => v.user_id === userId), [vehicles, userId])
  const vehicleName = (id: string) => vehicles.find((v) => v.id === id)?.name ?? 'Véhicule retiré'

  const load = useCallback(async () => {
    try {
      setShares(await listShares())
    } catch {
      setShares([]) // hors ligne ou erreur : le partage se gère en ligne
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const sent = (shares ?? []).filter((s) => s.owner_id === userId)
  const received = (shares ?? []).filter((s) => s.guest_id === userId)

  // Invitations émises, groupées par adresse invitée
  const byGuest = useMemo(() => {
    const map = new Map<string, VehicleShare[]>()
    for (const s of sent) {
      const list = map.get(s.guest_email) ?? []
      list.push(s)
      map.set(s.guest_email, list)
    }
    return [...map.entries()]
  }, [sent])

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const allSelected = owned.length > 0 && selected.length === owned.length

  async function submit(e: FormEvent) {
    e.preventDefault()
    const addr = email.trim().toLowerCase()
    if (!addr || selected.length === 0) {
      showToast('Indique une adresse et au moins un véhicule', 'err')
      return
    }
    if (userEmail && addr === userEmail.toLowerCase()) {
      showToast('Impossible de partager avec toi-même', 'err')
      return
    }
    setBusy(true)
    try {
      const result = await inviteGuest(addr, selected)
      showToast(result.user_exists ? 'Partage activé ✓' : 'Invitation envoyée ✓')
      setEmail('')
      setSelected([])
      void load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'err')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string, leaving: boolean) {
    setBusy(true)
    try {
      await revokeShare(id)
      showToast(leaving ? 'Partage quitté ✓' : 'Accès retiré ✓')
      void load()
      if (leaving) onChanged()
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2>Partage</h2>

      {owned.length > 0 && (
        <form onSubmit={submit}>
          <p className="settings-note">
            Invite quelqu’un à encoder les pleins et recharges de tes véhicules. La personne
            recevra un e-mail pour créer son accès ; elle ne pourra pas modifier tes véhicules.
          </p>
          <label className="field">
            <span className="lbl">Adresse e-mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom@exemple.com"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </label>
          <div className="field">
            <span className="lbl">Véhicules partagés</span>
            <div className="chips wrap">
              <button
                type="button"
                className={allSelected ? 'chip active' : 'chip'}
                onClick={() => setSelected(allSelected ? [] : owned.map((v) => v.id))}
              >
                Tous
              </button>
              {owned.map((v) => (
                <button
                  type="button"
                  key={v.id}
                  className={selected.includes(v.id) ? 'chip active' : 'chip'}
                  onClick={() => toggle(v.id)}
                >
                  {v.name}
                </button>
              ))}
            </div>
          </div>
          <button className="btn btn-primary" disabled={busy || !email.trim() || selected.length === 0}>
            <PlusIcon /> Envoyer l’invitation
          </button>
        </form>
      )}

      {shares == null && <div className="settings-note">Chargement…</div>}

      {byGuest.length > 0 && (
        <>
          <h2 style={{ marginTop: 20 }}>Invitations envoyées</h2>
          {byGuest.map(([guestEmail, list]) => (
            <div key={guestEmail}>
              <div className="fillup-item">
                <div className="body">
                  <div className="date">
                    <span className="admin-email">{guestEmail}</span>
                    {list.some((s) => s.guest_id == null) ? (
                      <span className="badge badge-pending">En attente</span>
                    ) : (
                      <span className="badge badge-elec">Actif</span>
                    )}
                  </div>
                  <div className="sub" style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {list.map((s) => (
                      <span
                        key={s.id}
                        className="badge badge-partial"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 0 }}
                      >
                        {vehicleName(s.vehicle_id)}
                        <button
                          type="button"
                          aria-label={`Retirer ${vehicleName(s.vehicle_id)} pour ${guestEmail}`}
                          disabled={busy}
                          onClick={() => void remove(s.id, false)}
                          style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', display: 'grid' }}
                        >
                          <XIcon size={13} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {received.length > 0 && (
        <>
          <h2 style={{ marginTop: 20 }}>Partagés avec moi</h2>
          {received.map((s) => (
            <div key={s.id} className="fillup-item">
              <div className="body">
                <div className="nums">{vehicleName(s.vehicle_id)}</div>
                <div className="sub">par {s.owner_email}</div>
              </div>
              <button
                className="btn-icon"
                aria-label={`Quitter le partage de ${vehicleName(s.vehicle_id)}`}
                disabled={busy}
                onClick={() => void remove(s.id, true)}
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </>
      )}

      {shares != null && byGuest.length === 0 && received.length === 0 && owned.length > 0 && (
        <div className="settings-note">Aucune invitation pour l’instant.</div>
      )}
    </section>
  )
}
