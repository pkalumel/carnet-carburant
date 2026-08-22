import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { deleteFillup, getPhotoUrl, updateFillup } from '../lib/db'
import { downscalePhoto } from '../lib/image'
import {
  fmtConso, fmtConsoElec, fmtDateTime, fmtEur, fmtKm, fmtKwh, fmtLiters, fmtPricePerKwh,
  fmtPricePerL, parseDecimal, toLocalInputValue,
} from '../lib/format'
import { consumptionSeries, summarize, type ConsoPoint } from '../lib/stats'
import { Meter } from './chartKit'
import { energiesFor, type Energy, type Fillup, type Vehicle } from '../lib/types'
import { AttachIcon, BoltIcon, PumpIcon, SaveIcon, TrashIcon, XIcon } from './icons'

interface Props {
  fillups: Fillup[]
  /** Liste complète, non filtrée : sert aux validations inter-véhicules */
  allFillups: Fillup[]
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
// Feuille d'édition d'un plein ou d'une recharge (brouillons compris)
// La tâche du brouillon = recopier les chiffres de la photo :
// photo en haut, litres/kWh et prix juste dessous, focus immédiat.
// ------------------------------------------------------------

function Editor({
  fillup,
  vehicles,
  allFillups,
  onDone,
  showToast,
}: {
  fillup: Fillup
  vehicles: Vehicle[]
  allFillups: Fillup[]
  onDone: () => void
  showToast: Props['showToast']
}) {
  const [vehicleId, setVehicleId] = useState(fillup.vehicle_id)
  const [energyChoice, setEnergyChoice] = useState<Energy>(fillup.energy)
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

  // Le choix d'énergie ne survit que s'il reste valable pour le véhicule choisi
  const vehicle = vehicles.find((v) => v.id === vehicleId)
  const energies = energiesFor(vehicle?.fuel ?? null)
  const energy: Energy = energies.includes(energyChoice) ? energyChoice : energies[0]
  const electric = energy === 'electric'

  // Plein précédent du véhicule choisi, à la date saisie (le plein édité exclu)
  const editedTime = new Date(dateStr).getTime()
  const prevOdo = useMemo(() => {
    let max: number | null = null
    for (const f of allFillups) {
      if (
        f.id === fillup.id ||
        f.vehicle_id !== vehicleId ||
        f.is_draft ||
        f.odometer_km == null ||
        new Date(f.filled_at).getTime() >= editedTime
      )
        continue
      if (max == null || f.odometer_km > max) max = f.odometer_km
    }
    return max
  }, [allFillups, fillup.id, vehicleId, editedTime])

  const odoNum = parseDecimal(odo)
  const odoError =
    odoNum != null && prevOdo != null && Math.round(odoNum) <= prevOdo
      ? `Doit dépasser ${fmtKm(prevOdo)} (plein précédent)`
      : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    const litersNum = parseDecimal(liters)
    const priceNum = parseDecimal(price)
    if (!litersNum || litersNum <= 0 || priceNum == null || priceNum < 0) {
      showToast(
        electric
          ? 'kWh et prix total sont requis pour compléter la recharge'
          : 'Litres et prix total sont requis pour compléter le plein',
        'err',
      )
      return
    }
    if (odoError) return
    setBusy(true)
    try {
      const blob = newPhoto ? await downscalePhoto(newPhoto) : null
      await updateFillup(
        fillup.id,
        {
          vehicle_id: vehicleId,
          filled_at: new Date(dateStr).toISOString(),
          energy,
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
    if (!confirm(electric ? 'Supprimer cette recharge ?' : 'Supprimer ce plein ?')) return
    setBusy(true)
    try {
      await deleteFillup(fillup)
      showToast(electric ? 'Recharge supprimée' : 'Plein supprimé', 'ok')
      onDone()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Suppression impossible', 'err')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <h2>
        {fillup.is_draft
          ? electric ? 'Compléter la recharge' : 'Compléter le plein'
          : electric ? 'Modifier la recharge' : 'Modifier le plein'}
      </h2>
      {photoUrl && <img className="photo-full" src={photoUrl} alt={electric ? 'Écran de la borne' : 'Écran de la pompe'} />}
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
      <div className="field-grid">
        <label className="field">
          <span className="lbl">{electric ? 'kWh' : 'Litres'}</span>
          <input
            type="text"
            inputMode="decimal"
            autoFocus={fillup.is_draft}
            placeholder={electric ? '38,20' : '42,50'}
            value={liters}
            onChange={(e) => setLiters(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="lbl">Prix total (€)</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder={electric ? '18,40' : '72,30'}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
      </div>
      <label className="field">
        <span className="lbl">Compteur (km)</span>
        <input
          type="text"
          inputMode="numeric"
          className={odoError ? 'error' : ''}
          value={odo}
          onChange={(e) => setOdo(e.target.value)}
        />
        {odoError ? (
          <span className="field-error">{odoError}</span>
        ) : prevOdo != null ? (
          <span className="field-hint">Plein précédent : {fmtKm(prevOdo)}</span>
        ) : null}
      </label>
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
      <label className="field">
        <span className="lbl">Date et heure</span>
        <input type="datetime-local" value={dateStr} onChange={(e) => setDateStr(e.target.value)} required />
      </label>
      <div className="field">
        <span className="lbl">{electric ? 'Charge' : 'Plein'}</span>
        <div className="seg">
          <button type="button" className={isFull ? 'active' : ''} onClick={() => setIsFull(true)}>
            {electric ? 'Charge complète' : 'Plein complet'}
          </button>
          <button type="button" className={!isFull ? 'active' : ''} onClick={() => setIsFull(false)}>
            {electric ? 'Partielle' : 'Partiel'}
          </button>
        </div>
      </div>
      <label className="field">
        <span className="lbl">Notes</span>
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <button
        type="button"
        className="btn-ghost"
        style={{ width: '100%', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        onClick={() => photoInput.current?.click()}
      >
        <AttachIcon />
        {newPhoto ? `Nouvelle photo : ${newPhoto.name}` : fillup.photo_path ? 'Remplacer la photo' : 'Joindre une photo'}
      </button>
      <input ref={photoInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => setNewPhoto(e.target.files?.[0] ?? null)} />
      <button className="btn btn-primary" disabled={busy}>
        <SaveIcon /> {busy ? 'Enregistrement…' : 'Enregistrer'}
      </button>
      <button type="button" className="btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={onDone} disabled={busy}>
        <XIcon /> Annuler
      </button>
      <button type="button" className="btn-delete" onClick={remove} disabled={busy}>
        <TrashIcon /> {electric ? 'Supprimer cette recharge' : 'Supprimer ce plein'}
      </button>
    </form>
  )
}

// ------------------------------------------------------------
// Liste de l'historique
// ------------------------------------------------------------

const monthOf = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

export default function History({ fillups, allFillups, vehicles, onChanged, showToast }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const vehicleName = (id: string) => vehicles.find((v) => v.id === id)?.name ?? '?'
  const drafts = fillups.filter((f) => f.is_draft)
  const editing = fillups.find((f) => f.id === editingId && !f.pending) ?? null

  // Distance et conso de chaque plein (période close par ce plein), par véhicule et par énergie
  const consoByFillup = useMemo(() => {
    const map = new Map<string, ConsoPoint>()
    const byVehicle = new Map<string, typeof fillups>()
    for (const f of fillups) {
      const g = byVehicle.get(f.vehicle_id)
      if (g) g.push(f)
      else byVehicle.set(f.vehicle_id, [f])
    }
    for (const [vid, group] of byVehicle) {
      for (const energy of ['fuel', 'electric'] as const) {
        for (const p of consumptionSeries(group, energy)) map.set(`${vid}|${energy}|${p.date}`, p)
      }
    }
    return map
  }, [fillups])

  // Agrégats par mois affiché (liste éventuellement filtrée par véhicule)
  const monthAgg = useMemo(() => {
    const map = new Map<string, { total: number; n: number }>()
    for (const f of fillups) {
      const label = monthOf(f.filled_at)
      const agg = map.get(label) ?? { total: 0, n: 0 }
      if (f.total_price != null) agg.total += f.total_price
      if (!f.is_draft) agg.n += 1
      map.set(label, agg)
    }
    return map
  }, [fillups])

  // Résumé de la liste affichée, pour le bandeau de tête
  const summary = useMemo(() => summarize(fillups), [fillups])

  // La feuille ouverte fige le défilement de la page derrière
  useEffect(() => {
    if (!editing) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [editing])

  if (fillups.length === 0) {
    return (
      <div className="card empty">
        <div className="empty-ico">
          <PumpIcon size={30} />
        </div>
        <div className="empty-title">Aucun plein pour l’instant</div>
        Le premier s’enregistre dans l’onglet « Plein », en bas de l’écran.
      </div>
    )
  }

  return (
    <>
      {drafts.length > 0 && (
        <button
          className="netbanner pending banner-action"
          onClick={() => setEditingId(drafts[0].id)}
        >
          {drafts.length === 1 ? '1 plein à compléter' : `${drafts.length} pleins à compléter`} — ouvrir
        </button>
      )}

      {/* Bandeau agrégé de la liste affichée */}
      {summary.count > 0 && (
        <section className="card history-band">
          <div className="meter-row">
            <Meter value={String(summary.count)} label={summary.count > 1 ? 'Pleins' : 'Plein'} />
            <Meter value={fmtEur(summary.totalSpent)} label="Total dépensé" />
            <Meter
              value={
                summary.avgPricePerLiter != null
                  ? fmtPricePerL(summary.avgPricePerLiter)
                  : fmtPricePerKwh(summary.avgPricePerKwh)
              }
              label="Prix moyen"
            />
          </div>
        </section>
      )}
      {/* Desktop : tableau d'abord (la liste ci-dessous reprend la main en mobile) */}
      <div className="history-table-wrap card" style={{ padding: '4px 12px 8px' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Véhicule</th>
              <th style={{ textAlign: 'right' }}>Litres / kWh</th>
              <th style={{ textAlign: 'right' }}>Prix</th>
              <th style={{ textAlign: 'right' }}>€/L · €/kWh</th>
              <th style={{ textAlign: 'right' }}>Compteur</th>
              <th style={{ textAlign: 'right' }}>Conso</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {fillups.map((f, i) => {
              const label = monthOf(f.filled_at)
              const showLabel = i === 0 || monthOf(fillups[i - 1].filled_at) !== label
              const conso = consoByFillup.get(`${f.vehicle_id}|${f.energy}|${f.filled_at}`)
              const electric = f.energy === 'electric'
              return (
                <Fragment key={f.id}>
                  {showLabel && (
                    <tr className="month-row">
                      <td colSpan={8}>
                        {label}
                        <span className="month-sub">
                          {(monthAgg.get(label)?.n ?? 0) > 1
                            ? `${monthAgg.get(label)?.n} pleins`
                            : '1 plein'}
                        </span>
                        <span className="month-total">{fmtEur(monthAgg.get(label)?.total ?? null)}</span>
                      </td>
                    </tr>
                  )}
                  <tr
                    className="rowlink"
                    onClick={() => {
                      if (f.pending) {
                        showToast('Ce plein sera modifiable après synchronisation', 'err')
                        return
                      }
                      setEditingId(f.id)
                    }}
                  >
                    <td className="admin-num">{fmtDateTime(f.filled_at)}</td>
                    <td>{vehicleName(f.vehicle_id)}</td>
                    <td className="admin-num" style={{ textAlign: 'right' }}>
                      {f.is_draft ? '—' : electric ? fmtKwh(f.liters) : fmtLiters(f.liters)}
                    </td>
                    <td className="admin-num" style={{ textAlign: 'right' }}>
                      {f.is_draft ? '—' : fmtEur(f.total_price)}
                    </td>
                    <td className="admin-num" style={{ textAlign: 'right' }}>
                      {f.is_draft
                        ? '—'
                        : electric
                          ? fmtPricePerKwh(f.price_per_liter)
                          : fmtPricePerL(f.price_per_liter)}
                    </td>
                    <td className="admin-num" style={{ textAlign: 'right' }}>{fmtKm(f.odometer_km)}</td>
                    <td className="admin-num" style={{ textAlign: 'right' }}>
                      {conso
                        ? electric
                          ? fmtConsoElec(conso.per100)
                          : fmtConso(conso.per100)
                        : '—'}
                    </td>
                    <td>
                      {electric && <span className="badge badge-elec">⚡ Recharge</span>}
                      {f.is_draft && <span className="badge badge-draft">À compléter</span>}
                      {f.pending && <span className="badge badge-pending">En attente</span>}
                      {!f.is_full && !f.is_draft && (
                        <span className="badge badge-partial">{electric ? 'Partielle' : 'Partiel'}</span>
                      )}
                    </td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="history-list">
      {fillups.map((f, i) => {
        const label = monthOf(f.filled_at)
        const showLabel = i === 0 || monthOf(fillups[i - 1].filled_at) !== label
        const conso = consoByFillup.get(`${f.vehicle_id}|${f.energy}|${f.filled_at}`)
        const electric = f.energy === 'electric'
        return (
          <Fragment key={f.id}>
            {showLabel && (
              <div className="month-label">
                {label}
                <span className="month-sub">
                  {(monthAgg.get(label)?.n ?? 0) > 1 ? `${monthAgg.get(label)?.n} pleins` : '1 plein'}
                </span>
                <span className="month-total">{fmtEur(monthAgg.get(label)?.total ?? null)}</span>
              </div>
            )}
            <button
              className={f.is_draft ? 'fillup-item draft' : 'fillup-item'}
              onClick={() => {
                if (f.pending) {
                  showToast('Ce plein sera modifiable après synchronisation', 'err')
                  return
                }
                setEditingId(f.id)
              }}
            >
              {f.photo_path ? (
                <Thumb path={f.photo_path} />
              ) : (
                <div className="thumb ph">
                  {electric ? <BoltIcon size={22} /> : <PumpIcon size={22} />}
                </div>
              )}
              <div className="body">
                <div className="date">
                  {fmtDateTime(f.filled_at)} · {vehicleName(f.vehicle_id)}
                  {electric && <span className="badge badge-elec">⚡ Recharge</span>}
                  {f.is_draft && <span className="badge badge-draft">À compléter</span>}
                  {f.pending && <span className="badge badge-pending">En attente</span>}
                  {!f.is_full && !f.is_draft && (
                    <span className="badge badge-partial">{electric ? 'Partielle' : 'Partiel'}</span>
                  )}
                </div>
                {f.is_draft ? (
                  <div className="sub" style={{ marginTop: 4 }}>
                    Photo enregistrée — touche ici pour encoder les chiffres
                  </div>
                ) : (
                  <>
                    <div className="nums">
                      {electric ? fmtKwh(f.liters) : fmtLiters(f.liters)} · {fmtEur(f.total_price)}
                    </div>
                    <div className="sub">
                      {conso
                        ? `${conso.km.toLocaleString('fr-FR')} km · ${
                            electric ? fmtConsoElec(conso.per100) : fmtConso(conso.per100)
                          } · ${electric ? fmtPricePerKwh(f.price_per_liter) : fmtPricePerL(f.price_per_liter)}`
                        : electric
                          ? fmtPricePerKwh(f.price_per_liter)
                          : fmtPricePerL(f.price_per_liter)}
                    </div>
                    <div className="sub2">
                      {fmtKm(f.odometer_km)}
                      {f.created_by_email ? ` · ${f.created_by_email.split('@')[0]}` : ''}
                    </div>
                  </>
                )}
              </div>
            </button>
          </Fragment>
        )
      })}
      </div>

      {editing && (
        <>
          <div className="sheet-backdrop" onClick={() => setEditingId(null)} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Édition du plein">
            <div className="sheet-handle" aria-hidden />
            <Editor
              key={editing.id}
              fillup={editing}
              vehicles={vehicles}
              allFillups={allFillups}
              showToast={showToast}
              onDone={() => {
                setEditingId(null)
                onChanged()
              }}
            />
          </div>
        </>
      )}
    </>
  )
}
