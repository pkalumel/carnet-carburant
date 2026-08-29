import type { Vehicle } from './types'

/**
 * Les trois parcours de saisie, chacun limité à 3 données manuelles :
 * - fuel    : litres + prix total + compteur ;
 * - home    : % batterie avant + après + compteur (kWh et coût estimés) ;
 * - station : kWh + prix total + compteur (% facultatifs).
 * Logique pure, sans état React, partagée entre création et édition.
 */
export type EntryMode = 'fuel' | 'home' | 'station'

export const chargeModeKey = (vehicleId: string) => `carnet:chargeMode:${vehicleId}`
export const lastAfterPctKey = (vehicleId: string) => `carnet:lastAfterPct:${vehicleId}`

/** Dernière méthode utilisée pour ce véhicule, sinon selon l'équipement */
export function defaultChargeMode(vehicle: Vehicle | undefined): Exclude<EntryMode, 'fuel'> {
  if (!vehicle) return 'station'
  const stored = localStorage.getItem(chargeModeKey(vehicle.id))
  if (stored === 'home' || stored === 'station') return stored
  return vehicle.battery_kwh != null ? 'home' : 'station'
}

export interface HomeEstimate {
  kwh: number
  /** null quand aucun tarif domicile n'est enregistré */
  cost: number | null
}

const round2 = (v: number) => Math.round(v * 100) / 100

/** kWh estimés ajoutés à la batterie (pertes non comptées) + coût au tarif maison */
export function homeEstimate(
  batteryKwh: number | null,
  beforePct: number | null,
  afterPct: number | null,
  homePrice: number | null,
): HomeEstimate | null {
  if (batteryKwh == null || beforePct == null || afterPct == null) return null
  if (afterPct <= beforePct) return null
  const kwh = round2((batteryKwh * (afterPct - beforePct)) / 100)
  if (kwh <= 0) return null
  return { kwh, cost: homePrice != null ? round2(kwh * homePrice) : null }
}

/** Erreur BLOQUANTE des % (contrairement aux avertissements de plausibilité) */
export function pctError(beforePct: number | null, afterPct: number | null): string | null {
  if (beforePct == null || afterPct == null) return null
  if (afterPct <= beforePct) return 'Le niveau après doit dépasser le niveau avant.'
  return null
}

export type RequiredField = 'volume' | 'total' | 'before' | 'after' | 'battery'

/**
 * Données indispensables manquantes pour le mode donné — pilote à la fois
 * la validation du bouton principal et l'offre « compléter plus tard ».
 * Le compteur n'est jamais requis (la conso attendra le prochain relevé).
 */
export function requiredMissing(
  mode: EntryMode,
  v: {
    volume: number | null
    total: number | null
    beforePct: number | null
    afterPct: number | null
    batteryKwh: number | null
  },
): RequiredField[] {
  const missing: RequiredField[] = []
  if (mode === 'home') {
    if (v.batteryKwh == null) missing.push('battery')
    if (v.beforePct == null) missing.push('before')
    if (v.afterPct == null || (v.beforePct != null && v.afterPct <= v.beforePct))
      missing.push('after')
  } else {
    if (v.volume == null || v.volume <= 0) missing.push('volume')
    if (v.total == null || v.total < 0) missing.push('total')
  }
  return missing
}

export interface EntryValues {
  liters: number | null
  total_price: number | null
  battery_before_pct: number | null
  battery_after_pct: number | null
  liters_estimated: boolean
}

/**
 * Valeurs à enregistrer selon le mode. En mode home, kWh et coût estimés
 * sont matérialisés dans liters/total_price ; ailleurs les % restent des
 * relevés facultatifs. `draft` garde les valeurs valides et laisse le
 * reste à null (jamais liters: 0 — contrainte SQL liters > 0).
 */
export function buildEntryValues(
  mode: EntryMode,
  v: {
    volume: number | null
    total: number | null
    beforePct: number | null
    afterPct: number | null
    batteryKwh: number | null
    homePrice: number | null
  },
): EntryValues {
  if (mode === 'home') {
    const est = homeEstimate(v.batteryKwh, v.beforePct, v.afterPct, v.homePrice)
    return {
      liters: est?.kwh ?? null,
      total_price: est?.cost ?? null,
      battery_before_pct: v.beforePct,
      battery_after_pct: v.afterPct,
      liters_estimated: est != null,
    }
  }
  return {
    liters: v.volume != null && v.volume > 0 ? v.volume : null,
    total_price: v.total != null && v.total >= 0 ? v.total : null,
    battery_before_pct: mode === 'station' ? v.beforePct : null,
    battery_after_pct: mode === 'station' ? v.afterPct : null,
    liters_estimated: false,
  }
}
