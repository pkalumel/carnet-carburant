import { fmtConso, fmtConsoElec, fmtKm, fmtPricePerKwh, fmtPricePerL } from './format'
import { summarize } from './stats'
import type { Energy, Fillup } from './types'

/**
 * Garde-fous de plausibilité de la saisie : ils AVERTISSENT, ils ne
 * bloquent jamais — l'utilisateur en station a raison contre l'algorithme.
 */
export interface PlausibilityInput {
  vehicleId: string
  energy: Energy
  odometerKm: number | null
  volume: number | null
  unitPrice: number | null
  /** liste complète des pleins (tous véhicules) */
  fillups: Fillup[]
  /** dernier compteur connu du véhicule */
  lastOdo: number | null
}

export interface PlausibilityWarning {
  /** stable pour « C'est normal » : le même avertissement ne revient pas */
  id: string
  msg: string
  /** champ à corriger, si l'avertissement en désigne un */
  field?: 'odo' | 'volume' | 'unit'
}

const PRICE_BOUNDS = {
  fuel: { min: 0.8, max: 3, fmt: fmtPricePerL },
  electric: { min: 0.05, max: 1.2, fmt: fmtPricePerKwh },
}

export function checkFillup(input: PlausibilityInput): PlausibilityWarning[] {
  const warnings: PlausibilityWarning[] = []
  const { energy, odometerKm, volume, unitPrice, fillups, lastOdo, vehicleId } = input

  if (odometerKm != null && lastOdo != null && Math.round(odometerKm) <= lastOdo) {
    warnings.push({
      id: 'odo-baisse',
      field: 'odo',
      msg: `Compteur en baisse — le dernier relevé était ${fmtKm(lastOdo)}. C'est un autre véhicule ?`,
    })
  }

  if (unitPrice != null && unitPrice > 0) {
    const b = PRICE_BOUNDS[energy]
    if (unitPrice < b.min || unitPrice > b.max) {
      warnings.push({ id: 'prix-inhabituel', field: 'unit', msg: `Prix inhabituel : ${b.fmt(unitPrice)}.` })
    }
  }

  // Conso implicite vs moyenne du véhicule (±40 %) — approximation sur la
  // distance depuis le dernier relevé, suffisante pour un avertissement.
  if (
    odometerKm != null &&
    lastOdo != null &&
    odometerKm > lastOdo &&
    volume != null &&
    volume > 0
  ) {
    const per100 = (volume / (odometerKm - lastOdo)) * 100
    const mine = fillups.filter((f) => f.vehicle_id === vehicleId && !f.is_draft)
    const s = summarize(mine)
    const avg = energy === 'electric' ? s.avgConsoElec : s.avgConso
    if (avg != null && avg > 0 && Math.abs(per100 - avg) / avg > 0.4) {
      const f = energy === 'electric' ? fmtConsoElec : fmtConso
      warnings.push({
        id: 'conso-inhabituelle',
        field: 'volume',
        msg: `${f(per100)} estimé — inhabituel (moyenne ${f(avg)}). ${energy === 'electric' ? 'Charge' : 'Plein'} partiel${energy === 'electric' ? 'le' : ''} ?`,
      })
    }
  }

  return warnings
}
