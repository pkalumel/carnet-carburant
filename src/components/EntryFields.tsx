import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildEntryValues, chargeModeKey, defaultChargeMode, homeEstimate, lastAfterPctKey,
  pctError, requiredMissing, type EntryMode, type EntryValues,
} from '../lib/entryModel'
import { fmtEur, fmtKm, fmtKwh, fmtPricePerKwh, fmtPricePerL, parseDecimal } from '../lib/format'
import { checkFillup } from '../lib/plausibility'
import { editField, emptyTriangle, triangleValues, type Triangle } from '../lib/triangle'
import type { Energy, Fillup, Vehicle } from '../lib/types'

/**
 * Zone « chiffres » partagée entre la création (FillupForm) et l'édition
 * (History.Editor) : 3 champs manuels par mode, le reste est calculé.
 * - fuel    : litres + prix total + compteur (prix/L affiché, jamais saisi) ;
 * - home    : % avant + % après + compteur (kWh et coût estimés) ;
 * - station : kWh + prix total + compteur (% facultatifs, repliés).
 * Le chrome (photo, géoloc, date, complet/partiel) reste dans les parents.
 */

interface EntryStateOpts {
  vehicle: Vehicle | undefined
  energy: Energy
  /** liste complète des pleins (tous véhicules) : suggestions + garde-fous */
  fillups: Fillup[]
  /** édition : l'enregistrement ouvert (préremplissage, doublon exclu) */
  initial?: Fillup | null
  /** date de la saisie (format input datetime-local) */
  dateStr: string
}

interface FieldErrors {
  volume?: string
  total?: string
  before?: string
  after?: string
}

type FocusableField = 'odo' | 'volume' | 'total' | 'before' | 'after'

export function useEntryState({ vehicle, energy, fillups, initial = null, dateStr }: EntryStateOpts) {
  const vehicleId = vehicle?.id ?? ''
  const electric = energy === 'electric'
  const editing = initial != null
  const batteryKwh = vehicle?.battery_kwh ?? null
  const homePrice = vehicle?.home_kwh_price ?? null

  const [chargeMode, setChargeMode] = useState<Exclude<EntryMode, 'fuel'>>(() =>
    initial
      ? initial.liters_estimated && initial.battery_before_pct != null
        ? 'home'
        : 'station'
      : defaultChargeMode(vehicle),
  )
  const mode: EntryMode = electric ? chargeMode : 'fuel'

  const [triangle, setTriangle] = useState<Triangle>(() => {
    // édition d'une saisie mesurée : litres/kWh et total redeviennent sources
    if (initial && !initial.liters_estimated) {
      let t = emptyTriangle()
      if (initial.liters != null) t = editField(t, 'volume', String(initial.liters).replace('.', ','))
      if (initial.total_price != null)
        t = editField(t, 'total', String(initial.total_price).replace('.', ','))
      return t
    }
    return emptyTriangle()
  })
  const [before, setBefore] = useState(initial?.battery_before_pct?.toString() ?? '')
  const [after, setAfter] = useState(initial?.battery_after_pct?.toString() ?? '')
  const [odo, setOdo] = useState(initial?.odometer_km?.toString() ?? '')
  const [odoTouched, setOdoTouched] = useState(editing)
  /** avertissements écartés d'un « C'est normal » — ne reviennent pas pour cette saisie */
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<FieldErrors>({})

  const volumeInput = useRef<HTMLInputElement>(null)
  const totalInput = useRef<HTMLInputElement>(null)
  const odoInput = useRef<HTMLInputElement>(null)
  const beforeInput = useRef<HTMLInputElement>(null)
  const afterInput = useRef<HTMLInputElement>(null)

  // Changement de véhicule : la méthode de recharge mémorisée du nouveau
  // véhicule reprend la main (création uniquement)
  const prevVehicle = useRef(vehicleId)
  useEffect(() => {
    if (editing || prevVehicle.current === vehicleId) return
    prevVehicle.current = vehicleId
    setChargeMode(defaultChargeMode(vehicle))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId, editing])

  // Changement de véhicule ou d'énergie : les chiffres repartent à zéro
  // (les litres d'une Clio ne sont pas les kWh d'une Zoé)
  const prevKey = useRef(`${vehicleId}|${energy}`)
  useEffect(() => {
    const key = `${vehicleId}|${energy}`
    if (editing || prevKey.current === key) return
    prevKey.current = key
    setTriangle(emptyTriangle())
    setBefore('')
    setAfter('')
    setErrors({})
  }, [vehicleId, energy, editing])

  // « % après » prérempli avec la limite habituelle de recharge du véhicule
  useEffect(() => {
    if (editing || mode !== 'home' || !vehicleId) return
    const stored = localStorage.getItem(lastAfterPctKey(vehicleId))
    if (stored) setAfter((a) => (a === '' ? stored : a))
  }, [editing, mode, vehicleId])

  // Dernier kilométrage AVANT la date saisie (la saisie éditée exclue) +
  // delta médian : le compteur est pré-rempli en « suggéré » à la création
  const { lastOdo, suggestedOdo } = useMemo(() => {
    const editedTime = new Date(dateStr).getTime()
    const odos = fillups
      .filter(
        (f) =>
          f.vehicle_id === vehicleId &&
          !f.is_draft &&
          f.odometer_km != null &&
          f.id !== initial?.id &&
          (!Number.isFinite(editedTime) || new Date(f.filled_at).getTime() < editedTime),
      )
      .sort((a, b) => (a.filled_at < b.filled_at ? -1 : 1))
      .map((f) => f.odometer_km as number)
    const last = odos.length > 0 ? Math.max(...odos) : null
    const deltas: number[] = []
    for (let i = 1; i < odos.length; i++) {
      const d = odos[i] - odos[i - 1]
      if (d > 0) deltas.push(d)
    }
    const recent = deltas.slice(-6).sort((a, b) => a - b)
    const median = recent.length > 0 ? recent[Math.floor(recent.length / 2)] : null
    return { lastOdo: last, suggestedOdo: last != null && median != null ? last + median : null }
  }, [fillups, vehicleId, initial?.id, dateStr])

  // Compteur suggéré à l'arrivée sur un véhicule (création uniquement)
  useEffect(() => {
    if (editing) return
    setOdo(suggestedOdo != null ? String(suggestedOdo) : '')
    setOdoTouched(false)
  }, [vehicleId, suggestedOdo, editing])

  const vals = triangleValues(triangle)
  const beforePct = parseDecimal(before)
  const afterPct = parseDecimal(after)
  const odoNum = parseDecimal(odo)
  const estimate = mode === 'home' ? homeEstimate(batteryKwh, beforePct, afterPct, homePrice) : null
  const pctErr = mode === 'home' ? pctError(beforePct, afterPct) : null
  const hasData =
    mode === 'home' ? before !== '' || after !== '' : triangle.volume !== '' || triangle.total !== ''

  // Garde-fous de plausibilité : avertissent, ne bloquent jamais
  const warnings = useMemo(
    () =>
      checkFillup({
        vehicleId,
        energy,
        odometerKm: odoNum,
        volume: mode === 'home' ? (estimate?.kwh ?? null) : vals.volume,
        // en mode domicile le €/kWh est le tarif choisi par l'utilisateur
        unitPrice: mode === 'home' ? null : vals.unit,
        batteryKwh,
        filledAt: dateStr,
        excludeId: initial?.id ?? null,
        fillups,
        lastOdo,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vehicleId, energy, odoNum, mode, estimate?.kwh, vals.volume, vals.unit, batteryKwh, dateStr, initial?.id, fillups, lastOdo],
  ).filter((w) => !dismissed.has(w.id) && (w.id !== 'doublon' || hasData))

  const missing = requiredMissing(mode, {
    volume: vals.volume,
    total: vals.total,
    beforePct,
    afterPct,
    batteryKwh,
  })

  function focusField(field: FocusableField) {
    const ref =
      field === 'odo'
        ? odoInput
        : field === 'total'
          ? totalInput
          : field === 'before'
            ? beforeInput
            : field === 'after' || mode === 'home'
              ? afterInput
              : volumeInput
    ref.current?.focus()
    ref.current?.select()
  }

  function editTriangle(field: 'volume' | 'total', value: string) {
    setTriangle((t) => editField(t, field, value))
    setErrors((p) => (p[field] ? { ...p, [field]: undefined } : p))
  }

  function setMode(m: Exclude<EntryMode, 'fuel'>) {
    setChargeMode(m)
    setErrors({})
    if (vehicleId) localStorage.setItem(chargeModeKey(vehicleId), m)
  }

  /** Valide les 3 champs du mode, pose les messages et focus le premier fautif */
  function validate(): boolean {
    const errs: FieldErrors = {}
    if (mode === 'home') {
      if (batteryKwh == null) return false // encart déjà affiché à l'écran
      if (beforePct == null) errs.before = 'Indique le niveau avant'
      if (afterPct == null) errs.after = 'Indique le niveau après'
      else if (pctErr) errs.after = pctErr
    } else {
      if (vals.volume == null || vals.volume <= 0)
        errs.volume = mode === 'station' ? 'Indique les kWh' : 'Indique les litres'
      if (vals.total == null || vals.total < 0) errs.total = 'Indique le prix total'
    }
    setErrors(errs)
    const first = (['volume', 'total', 'before', 'after'] as const).find((f) => errs[f])
    if (first) {
      focusField(first)
      return false
    }
    return true
  }

  /** Valeurs à enregistrer (compteur compris) ; mémorise la limite de recharge */
  function buildInput(): EntryValues & { odometer_km: number | null } {
    if (mode === 'home' && afterPct != null && vehicleId)
      localStorage.setItem(lastAfterPctKey(vehicleId), String(Math.round(afterPct)))
    return {
      ...buildEntryValues(mode, {
        volume: vals.volume,
        total: vals.total,
        beforePct,
        afterPct,
        batteryKwh,
        homePrice,
      }),
      odometer_km: odoNum != null ? Math.round(odoNum) : null,
    }
  }

  function reset() {
    setTriangle(emptyTriangle())
    setBefore('')
    setAfter('')
    setOdo(suggestedOdo != null ? String(suggestedOdo) : '')
    setOdoTouched(false)
    setDismissed(new Set())
    setErrors({})
  }

  return {
    electric,
    mode,
    setMode,
    triangle,
    editTriangle,
    vals,
    before,
    setBefore,
    after,
    setAfter,
    beforePct,
    afterPct,
    estimate,
    pctErr,
    batteryKwh,
    homePrice,
    odo,
    setOdo,
    odoTouched,
    setOdoTouched,
    odoNum,
    lastOdo,
    suggestedOdo,
    warnings,
    dismiss: (id: string) => setDismissed((d) => new Set(d).add(id)),
    errors,
    setErrors,
    missing,
    focusField,
    validate,
    buildInput,
    reset,
    refs: { volumeInput, totalInput, odoInput, beforeInput, afterInput },
  }
}

export type EntryState = ReturnType<typeof useEntryState>

function NumField({
  label,
  affix,
  value,
  onChange,
  inputRef,
  error,
  derived = false,
  autoFocus = false,
  enterHint = 'next',
  inputMode = 'decimal',
}: {
  label: string
  affix: string
  value: string
  onChange: (v: string) => void
  inputRef?: React.RefObject<HTMLInputElement | null>
  error?: string
  derived?: boolean
  autoFocus?: boolean
  enterHint?: 'next' | 'done'
  inputMode?: 'decimal' | 'numeric'
}) {
  return (
    <label className="field">
      <span className="lbl">{label}</span>
      <div className={derived ? 'input-affix calc' : 'input-affix'}>
        {derived && <span className="affix affix-left">=</span>}
        <input
          ref={inputRef}
          type="text"
          inputMode={inputMode}
          enterKeyHint={enterHint}
          autoFocus={autoFocus}
          className={error ? 'error' : ''}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="affix">{affix}</span>
      </div>
      {error && <span className="field-error">{error}</span>}
    </label>
  )
}

export function EntryFields({ state, autoFocus = false }: { state: EntryState; autoFocus?: boolean }) {
  const s = state

  return (
    <>
      {s.electric && (
        <div className="field">
          <span className="lbl">Lieu de recharge</span>
          <div className="seg">
            <button type="button" className={s.mode === 'home' ? 'active' : ''} onClick={() => s.setMode('home')}>
              À domicile
            </button>
            <button
              type="button"
              className={s.mode === 'station' ? 'active' : ''}
              onClick={() => s.setMode('station')}
            >
              Borne ou station
            </button>
          </div>
        </div>
      )}

      {s.mode === 'home' && s.batteryKwh == null && (
        <div className="field-warn" role="status">
          <div className="warn-msg">
            <span aria-hidden>⚠</span> Renseigne la capacité utile de la batterie dans Réglages →
            Véhicules pour saisir en % de batterie.
          </div>
        </div>
      )}

      {s.mode === 'home' && s.batteryKwh != null && (
        <>
          <div className="field-grid">
            <NumField
              label="Batterie avant"
              affix="%"
              inputMode="numeric"
              value={s.before}
              onChange={(v) => {
                s.setBefore(v)
                s.setErrors((p) => (p.before ? { ...p, before: undefined } : p))
              }}
              inputRef={s.refs.beforeInput}
              error={s.errors.before}
              autoFocus={autoFocus}
            />
            <NumField
              label="Batterie après"
              affix="%"
              inputMode="numeric"
              value={s.after}
              onChange={(v) => {
                s.setAfter(v)
                s.setErrors((p) => (p.after ? { ...p, after: undefined } : p))
              }}
              inputRef={s.refs.afterInput}
              error={s.errors.after ?? s.pctErr ?? undefined}
            />
          </div>
          {s.estimate && (
            <div className="calc-line">
              Environ {fmtKwh(s.estimate.kwh)}
              {s.estimate.cost != null && <> — coût estimé {fmtEur(s.estimate.cost)}</>}
            </div>
          )}
          <span className="field-hint">
            Énergie estimée ajoutée à la batterie (pertes de recharge non comptées).
            {s.homePrice == null && ' Ajoute un tarif maison dans Réglages pour estimer le coût.'}
          </span>
        </>
      )}

      {s.mode !== 'home' && (
        <>
          <div className="field-grid">
            <NumField
              label={s.mode === 'station' ? 'kWh' : 'Litres'}
              affix={s.mode === 'station' ? 'kWh' : 'L'}
              value={s.triangle.volume}
              onChange={(v) => s.editTriangle('volume', v)}
              inputRef={s.refs.volumeInput}
              error={s.errors.volume}
              autoFocus={autoFocus}
            />
            <NumField
              label="Prix total"
              affix="€"
              value={s.triangle.total}
              onChange={(v) => s.editTriangle('total', v)}
              inputRef={s.refs.totalInput}
              error={s.errors.total}
            />
          </div>
          {s.vals.unit != null && (
            <div className="calc-line">
              {s.mode === 'station'
                ? `Prix au kWh : ${fmtPricePerKwh(s.vals.unit)}`
                : `Prix au litre : ${fmtPricePerL(s.vals.unit)}`}
            </div>
          )}
          {s.mode === 'station' &&
            s.vals.volume != null &&
            s.vals.volume > 0 &&
            s.triangle.total === '' && (
              <button type="button" className="chip" onClick={() => s.editTriangle('total', '0')}>
                Recharge gratuite (0 €)
              </button>
            )}
        </>
      )}

      <label className="field">
        <span className="lbl">Compteur</span>
        <div className="input-affix">
          <input
            ref={s.refs.odoInput}
            type="text"
            inputMode="numeric"
            enterKeyHint="done"
            className={s.odoTouched || s.odo === '' ? '' : 'suggested'}
            value={s.odo}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              s.setOdo(e.target.value)
              s.setOdoTouched(true)
            }}
          />
          <span className="affix">km</span>
        </div>
        {!s.odoTouched && s.suggestedOdo != null && s.odo !== '' ? (
          <span className="field-hint">Suggéré : dernier relevé {fmtKm(s.lastOdo)} + habitude</span>
        ) : s.lastOdo != null ? (
          <span className="field-hint">Dernier relevé : {fmtKm(s.lastOdo)}</span>
        ) : null}
      </label>

      {s.warnings.map((w) => (
        <div key={w.id} className="field-warn" role="status">
          <div className="warn-msg">
            <span aria-hidden>⚠</span> {w.msg}
          </div>
          <div className="warn-actions">
            {w.field != null && (
              <button
                type="button"
                className="warn-btn"
                onClick={() => {
                  if (w.field) s.focusField(w.field)
                }}
              >
                Corriger
              </button>
            )}
            <button type="button" className="warn-btn" onClick={() => s.dismiss(w.id)}>
              C’est normal
            </button>
          </div>
        </div>
      ))}
    </>
  )
}

/** % avant/après facultatifs du mode borne, à placer dans la zone repliée */
export function PctFieldsOptional({ state }: { state: EntryState }) {
  const s = state
  if (s.mode !== 'station') return null
  return (
    <div className="field-grid">
      <NumField
        label="Batterie avant (optionnel)"
        affix="%"
        inputMode="numeric"
        value={s.before}
        onChange={s.setBefore}
        inputRef={s.refs.beforeInput}
      />
      <NumField
        label="Batterie après (optionnel)"
        affix="%"
        inputMode="numeric"
        value={s.after}
        onChange={s.setAfter}
        inputRef={s.refs.afterInput}
      />
    </div>
  )
}
