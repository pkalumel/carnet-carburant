import { fmtConso, fmtConsoElec, fmtKm, fmtKwh, fmtPricePerKwh, fmtPricePerL } from './format'
import { summarize } from './stats'
import type { Energy, Fillup } from './types'

/**
 * Garde-fous de plausibilité de la saisie : ils AVERTISSENT, ils ne
 * bloquent jamais — l'utilisateur en station a raison contre l'algorithme.
 * (Seul le « % après ≤ % avant » bloque, et il vit dans entryModel.ts.)
 */
export interface PlausibilityInput {
  vehicleId: string
  energy: Energy
  odometerKm: number | null
  volume: number | null
  unitPrice: number | null
  /** capacité utile de la batterie du véhicule, si connue */
  batteryKwh: number | null
  /** véhicule bi-énergie (hybride rechargeable) : km partagés entre énergies */
  biEnergy: boolean
  /** date de la saisie (détection de doublon) */
  filledAt: string
  /** en édition : l'enregistrement lui-même n'est pas son propre doublon */
  excludeId?: string | null
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
  field?: 'odo' | 'volume' | 'total'
}

const PRICE_BOUNDS = {
  fuel: { min: 0.8, max: 3, fmt: fmtPricePerL },
  electric: { min: 0.05, max: 1.2, fmt: fmtPricePerKwh },
}

const DUPLICATE_WINDOW_MS = 10 * 60 * 1000

/**
 * Une borne facture l'énergie DÉLIVRÉE (côté réseau) ; la batterie en stocke
 * moins — pertes de conversion typiques de 8 à 20 %. Dépasser la capacité
 * utile est donc normal pour une charge complète : on ne signale qu'au-delà
 * d'une marge large, où il s'agit presque sûrement d'une faute de frappe.
 */
const CHARGE_LOSS_FACTOR = 1.35

export function checkFillup(input: PlausibilityInput): PlausibilityWarning[] {
  const warnings: PlausibilityWarning[] = []
  const {
    energy, odometerKm, volume, unitPrice, batteryKwh, biEnergy, filledAt, excludeId, fillups, lastOdo, vehicleId,
  } = input

  if (odometerKm != null && lastOdo != null && Math.round(odometerKm) <= lastOdo) {
    warnings.push({
      id: 'odo-baisse',
      field: 'odo',
      msg: `Compteur en baisse — le dernier relevé était ${fmtKm(lastOdo)}. C'est un autre véhicule ?`,
    })
  }

  // Le prix unitaire n'est plus saisi : il se corrige via le prix total
  if (unitPrice != null && unitPrice > 0) {
    const b = PRICE_BOUNDS[energy]
    if (unitPrice < b.min || unitPrice > b.max) {
      warnings.push({
        id: 'prix-inhabituel',
        field: 'total',
        msg: `Prix inhabituel : ${b.fmt(unitPrice)} — vérifie le prix total.`,
      })
    }
  }

  if (
    energy === 'electric' &&
    volume != null &&
    batteryKwh != null &&
    volume > batteryKwh * CHARGE_LOSS_FACTOR
  ) {
    warnings.push({
      id: 'kwh-capacite',
      field: 'volume',
      msg: `${fmtKwh(volume)} saisis pour une batterie de ${fmtKwh(batteryKwh)} — trop, même pertes de recharge comprises. Vérifie.`,
    })
  }

  // Doublon probable : une saisie du même véhicule à moins de 10 minutes
  const t = new Date(filledAt).getTime()
  if (Number.isFinite(t)) {
    const dup = fillups.find(
      (f) =>
        f.vehicle_id === vehicleId &&
        f.id !== excludeId &&
        Math.abs(new Date(f.filled_at).getTime() - t) < DUPLICATE_WINDOW_MS,
    )
    if (dup) {
      warnings.push({
        id: 'doublon',
        msg: 'Une saisie existe déjà pour ce véhicule il y a moins de 10 minutes — doublon ?',
      })
    }
  }

  // Conso implicite vs moyenne du véhicule (±40 %) — approximation sur la
  // distance depuis le dernier relevé, suffisante pour un avertissement.
  // Jamais sur un bi-énergie : ses km sont propulsés par les deux énergies,
  // la conso par énergie sur la distance totale varie donc avec le trajet.
  if (
    !biEnergy &&
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
