export interface Vehicle {
  id: string
  /** propriétaire du véhicule (≠ moi pour un véhicule partagé avec moi) */
  user_id: string
  name: string
  plate: string | null
  fuel: string | null
  /** tarif électricité à domicile (€/kWh) — recharge « Maison » pré-tarifée */
  home_kwh_price: number | null
  /** capacité utile de la batterie (kWh) — recharge domicile estimée par % */
  battery_kwh: number | null
  created_at: string
}

/** Partage d'un véhicule avec un invité ; guest_id null = invitation en attente */
export interface VehicleShare {
  id: string
  vehicle_id: string
  owner_id: string
  owner_email: string
  guest_email: string
  guest_id: string | null
  created_at: string
}

/** Nature d'un enregistrement : plein de carburant ou recharge électrique */
export type Energy = 'fuel' | 'electric'

export const FUEL_PLUGIN_HYBRID = 'Hybride rechargeable'
export const FUEL_ELECTRIC = 'Électrique'

/** Énergies enregistrables pour un véhicule selon son carburant */
export function energiesFor(fuel: string | null): Energy[] {
  if (fuel === FUEL_ELECTRIC) return ['electric']
  if (fuel === FUEL_PLUGIN_HYBRID) return ['fuel', 'electric']
  return ['fuel']
}

export interface Fillup {
  id: string
  vehicle_id: string
  filled_at: string
  energy: Energy
  odometer_km: number | null
  /** litres de carburant, ou kWh si energy = 'electric' */
  liters: number | null
  total_price: number | null
  /** €/L, ou €/kWh si energy = 'electric' */
  price_per_liter: number | null
  is_full: boolean
  is_draft: boolean
  /** niveaux de batterie relevés (recharge) — sources de l'estimation, ou facultatifs en borne */
  battery_before_pct: number | null
  battery_after_pct: number | null
  /** vrai si liters (kWh) et total_price sont estimés depuis les % de batterie */
  liters_estimated: boolean
  photo_path: string | null
  notes: string | null
  /** position au moment de la saisie (optionnelle) + libellé lisible */
  lat: number | null
  lng: number | null
  place: string | null
  created_by: string | null
  created_by_email: string | null
  created_at: string
  /** vrai si le plein attend d'être synchronisé vers le serveur */
  pending?: boolean
}

export interface FillupInput {
  vehicle_id: string
  filled_at: string
  energy: Energy
  odometer_km: number | null
  liters: number | null
  total_price: number | null
  is_full: boolean
  is_draft: boolean
  battery_before_pct: number | null
  battery_after_pct: number | null
  liters_estimated: boolean
  notes: string | null
  lat: number | null
  lng: number | null
  place: string | null
  created_by_email: string | null
}
