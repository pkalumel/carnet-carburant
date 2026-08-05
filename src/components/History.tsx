import { useEffect, useRef, useState, type FormEvent } from 'react'
import { deleteFillup, getPhotoUrl, updateFillup } from '../lib/db'
import { downscalePhoto } from '../lib/image'
import {
  fmtDateTime, fmtEur, fmtKm, fmtLiters, fmtPricePerL, parseDecimal, toLocalInputValue,
} from '../lib/format'
import type { Fillup, Vehicle } from '../lib/types'

interface Props {
  fillups: Fillup[]
  vehicles: Vehicle[]
  onChanged: () => void
  showToast: (msg: string, kind?: 'ok' | 'err') => void
}

function usePhotoUrl(path: string | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    if (path) void getPhotoUrl(path).then((u) => alive && setUrl(u))
    else setUrl(null)
    return () => {
      alive = false
    }
  }, [path])
  return url
}

function Thumb({ path }: { path: string }) {
  const url = usePhotoUrl(path)
  if (!url) return <div className="thumb" aria-hidden />
  return <img className="thumb" src={url} alt="Photo de la pompe" />
}

// ------------------------------------------------------------
// Éditeur d'un plein (complétion de brouillon comprise)
// ------------------------------------------------------------

function Editor({ fillup, onDone, showToast }: { fillup: Fillup; onDone: () => void; showToast: Props['showToast'] }) {
  const [dateStr, setDateStr] = useState(toLocalInputValue(new Date(fillup.filled_at)))
  const [odo, setOdo] = useState(fillup.odometer_km?.toString() ?? '')
  const [liters, setLiters] = useState(fillup.liters?.toString() ?? '')
  const [price, setPrice] = useState(fillup.total_price?.toString() ?? '')
  const [isFull, setIsFull] = useState(fillup.is_full)
  const [notes, setNotes] = useState(fillup.notes ?? '')
  const [newPhoto, setNewPhoto] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const photoInput = useRef<HTMLInputElement>(null)
  const photoUrl = usePhotoUrl(fillup.photo_path)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const litersNum = parseDecimal(liters)
    const priceNum = parseDecimal(price)
    const odoNum = parseDecimal(odo)
    if (!litersNum || litersNum <= 0 || priceNum == null || priceNum < 0) {
      showToast('Litres et prix total sont requis pour compléter le plein', 'err')
      return
    }
    setBusy(true)
    try {
      const blob = newPhoto ? await downscalePhoto(newPhoto) : null
      await updateFillup(
        fillup.id,
        {
          filled_at: new Date(dateStr).toISOString(),
          odometer_km: odoNum != null ? Math.round(odoNum) : null,
          liters: litersNum,
          total_price: priceNum,
          is_full: isFull,
          is_draft: false,
          notes: notes.trim() || null,
        },
        blob,
      )
      showToast(fillup.is_draft ? 'Plein complété ✓' : 'Plein modifié ✓', 'ok')
      onDone()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Modification impossible', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm('Supprimer ce plein ?')) return
    setBusy(true)
    try {
      await deleteFillup(fillup)
      showToast('Plein supprimé', 'ok')
      onDone()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Suppression impossible', 'err')
      setBusy(false)
    }
  }

  return (
    <form className="card" onSubmit={submit} style={{ borderColor: 'var(--accent)' }}>
      <h2>{fillup.is_draft ? 'Compléter le plein' : 'Modifier le plein'}</h2>
      {photoUrl && <img className="photo-full" src={photoUrl} alt="Écran de la pompe" />}
      <label className="field">
        <span className="lbl">Date et heure</span>
        <input type="datetime-local" value={dateStr} onChange={(e) => setDateStr(e.target.value)} required />
      </label>
      <div className="field-grid">
        <label className="field">
          <span className="lbl">Litres</span>
          <input type="text" inputMode="decimal" value={liters} onChange={(e) => setLiters(e.target.value)} />
        </label>
        <label className="field">
          <span className="lbl">Prix total (€)</span>
          <input type="text" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span className="lbl">Compteur (km)</span>
        <input type="text" inputMode="numeric" value={odo} onChange={(e) => setOdo(e.target.value)} />
      </label>
      <label className="check">
        <input type="checkbox" checked={isFull} onChange={(e) => setIsFull(e.target.checked)} />
        Plein complet (rempli à ras bord)
      </label>
      <label className="field">
        <span className="lbl">Notes</span>
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <button type="button" className="btn-ghost" style={{ width: '100%', marginBottom: 12 }} onClick={() => photoInput.current?.click()}>
        {newPhoto ? `📎 Nouvelle photo : ${newPhoto.name}` : fillup.photo_path ? '📎 Remplacer la photo' : '📎 Joindre une photo'}
      </button>
      <input ref={photoInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => setNewPhoto(e.target.files?.[0] ?? null)} />
      <button className="btn btn-primary" disabled={busy}>
        {busy ? 'Enregistrement…' : 'Enregistrer'}
      </button>
      <div className="row-actions">
        <button type="button" className="btn-ghost" onClick={onDone} disabled={busy}>
          Annuler
        </button>
        <button type="button" className="btn-ghost btn-danger" onClick={remove} disabled={busy}>
          Supprimer
        </button>
      </div>
    </form>
  )
}

// ------------------------------------------------------------
// Liste de l'historique
// ------------------------------------------------------------

export default function History({ fillups, vehicles, onChanged, showToast }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const vehicleName = (id: string) => vehicles.find((v) => v.id === id)?.name ?? '?'
  const drafts = fillups.filter((f) => f.is_draft)

  if (fillups.length === 0) {
    return (
      <div className="card empty">
        Aucun plein pour l’instant.
        <br />
        Le premier s’enregistre dans l’onglet « Plein ».
      </div>
    )
  }

  return (
    <>
      {drafts.length > 0 && (
        <div className="netbanner pending" style={{ borderRadius: 10 }}>
          {drafts.length === 1 ? '1 plein à compléter' : `${drafts.length} pleins à compléter`} — touche-le dans la liste
        </div>
      )}
      <section className="card">
        <h2>Historique</h2>
        {fillups.map((f) =>
          editingId === f.id && !f.pending ? (
            <Editor
              key={f.id}
              fillup={f}
              showToast={showToast}
              onDone={() => {
                setEditingId(null)
                onChanged()
              }}
            />
          ) : (
            <button
              key={f.id}
              className="fillup-item"
              style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--line)', padding: '12px 0', font: 'inherit', cursor: 'pointer' }}
              onClick={() => {
                if (f.pending) {
                  showToast('Ce plein sera modifiable après synchronisation', 'err')
                  return
                }
                setEditingId(editingId === f.id ? null : f.id)
              }}
            >
              {f.photo_path ? <Thumb path={f.photo_path} /> : <div className="thumb" style={{ display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>⛽</div>}
              <div className="body">
                <div className="date">
                  {fmtDateTime(f.filled_at)} · {vehicleName(f.vehicle_id)}
                  {f.is_draft && <span className="badge badge-draft">À compléter</span>}
                  {f.pending && <span className="badge badge-pending">En attente</span>}
                  {!f.is_full && !f.is_draft && <span className="badge badge-partial">Partiel</span>}
                </div>
                {f.is_draft ? (
                  <div className="sub" style={{ marginTop: 4 }}>
                    Photo enregistrée — touche ici pour encoder les chiffres
                  </div>
                ) : (
                  <>
                    <div className="nums">
                      {fmtLiters(f.liters)} · {fmtEur(f.total_price)}
                    </div>
                    <div className="sub">
                      {fmtPricePerL(f.price_per_liter)} · {fmtKm(f.odometer_km)}
                      {f.created_by_email ? ` · ${f.created_by_email.split('@')[0]}` : ''}
                    </div>
                  </>
                )}
              </div>
            </button>
          ),
        )}
      </section>
    </>
  )
}
