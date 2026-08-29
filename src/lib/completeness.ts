import type { Fillup } from './types'

/**
 * Complétude d'un enregistrement : une opération incomplète ne doit
 * jamais passer silencieusement pour complète.
 * - complete  : données réelles suffisantes ;
 * - estimated : « Complet — estimation », kWh/coût calculés depuis les % ;
 * - todo      : « À compléter », une donnée indispensable manque.
 */
export type FillupStatus = 'complete' | 'estimated' | 'todo'

export function fillupStatus(f: Fillup): FillupStatus {
  if (f.is_draft) return 'todo'
  // avant le test du prix : une estimation sans tarif maison a un coût
  // inconnu mais n'est pas « à compléter »
  if (f.liters_estimated) return 'estimated'
  if (f.liters == null || f.liters <= 0 || f.total_price == null) return 'todo'
  return 'complete'
}

export const statusLabel: Record<FillupStatus, string> = {
  complete: 'Complet',
  estimated: 'Complet — estimation',
  todo: 'À compléter',
}
