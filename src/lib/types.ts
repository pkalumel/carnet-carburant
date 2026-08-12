export interface Vehicle {
  id: string
  name: string
  plate: string | null
  fuel: string | null
  created_at: string
}

export interface Fillup {
  id: string
  vehicle_id: string
  filled_at: string
  odometer_km: number | null
  liters: number | null
  total_price: number | null
  price_per_liter: number | null
  is_full: boolean
  is_draft: boolean
  photo_path: string | null
  notes: string | null
  created_by_email: string | null
  created_at: string
  /** vrai si le plein attend d'être synchronisé vers le serveur */
  pending?: boolean
}

export interface FillupInput {
  vehicle_id: string
  filled_at: string
  odometer_km: number | null
  liters: number | null
  total_price: number | null
  is_full: boolean
  is_draft: boolean
  notes: string | null
  created_by_email: string | null
}
