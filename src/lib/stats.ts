import type { Energy, Fillup } from './types'

export interface ConsoPoint {
  date: string // ISO du plein complet qui clôt la période
  per100: number // L/100 km (ou kWh/100 km pour l'électrique)
  km: number // distance parcourue sur la période
  liters: number // litres, ou kWh pour l'électrique
}

/**
 * Consommations entre pleins complets successifs munis d'un kilométrage,
 * pour une énergie donnée (carburant ou recharges électriques).
 * Les litres/kWh des appoints partiels intermédiaires sont comptés dans la période.
 */
export function consumptionSeries(fillups: Fillup[], energy: Energy = 'fuel'): ConsoPoint[] {
  const chrono = fillups
    .filter((f) => !f.is_draft && f.energy === energy)
    .sort((a, b) => new Date(a.filled_at).getTime() - new Date(b.filled_at).getTime())

  const points: ConsoPoint[] = []
  let lastFullOdo: number | null = null
  let liters = 0
  for (const f of chrono) {
    liters += f.liters ?? 0
    if (f.is_full && f.odometer_km != null) {
      if (lastFullOdo != null && f.odometer_km > lastFullOdo && liters > 0) {
        const km = f.odometer_km - lastFullOdo
        points.push({
          date: f.filled_at,
          per100: (liters / km) * 100,
          km,
          liters,
        })
      }
      lastFullOdo = f.odometer_km
      liters = 0
    }
  }
  return points
}

export interface MonthCost {
  month: string // "2026-08"
  total: number
}

export function monthlyCosts(fillups: Fillup[]): MonthCost[] {
  const map = new Map<string, number>()
  for (const f of fillups) {
    if (f.is_draft || f.total_price == null) continue
    const month = f.filled_at.slice(0, 7)
    map.set(month, (map.get(month) ?? 0) + f.total_price)
  }
  return [...map.entries()]
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

/** Dépense mensuelle ventilée par véhicule : { month, totals: { [vehicleId]: € } } */
export interface MonthCostByVehicle {
  month: string
  totals: Record<string, number>
  total: number
}

export function monthlyCostsByVehicle(fillups: Fillup[]): MonthCostByVehicle[] {
  const map = new Map<string, Record<string, number>>()
  for (const f of fillups) {
    if (f.is_draft || f.total_price == null) continue
    const month = f.filled_at.slice(0, 7)
    const totals = map.get(month) ?? {}
    totals[f.vehicle_id] = (totals[f.vehicle_id] ?? 0) + f.total_price
    map.set(month, totals)
  }
  return [...map.entries()]
    .map(([month, totals]) => ({
      month,
      totals,
      total: Object.values(totals).reduce((s, v) => s + v, 0),
    }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

export interface PricePoint {
  date: string
  price: number
}

export function priceSeries(fillups: Fillup[], energy: Energy = 'fuel'): PricePoint[] {
  // les tarifs estimés (recharge domicile) ne sont pas des prix de marché
  return fillups
    .filter((f) => !f.is_draft && !f.liters_estimated && f.price_per_liter != null && f.energy === energy)
    .map((f) => ({ date: f.filled_at, price: f.price_per_liter as number }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export interface Summary {
  count: number
  totalSpent: number
  totalLiters: number
  totalKwh: number
  avgPricePerLiter: number | null
  avgPricePerKwh: number | null
  avgConso: number | null // L/100 km pondérée par la distance
  avgConsoElec: number | null // kWh/100 km pondérée par la distance
  costPerKm: number | null // €/km sur les périodes mesurées, énergies cumulées
  trackedKm: number
}

export function summarize(fillups: Fillup[]): Summary {
  const real = fillups.filter((f) => !f.is_draft)
  const totalSpent = real.reduce((s, f) => s + (f.total_price ?? 0), 0)
  // Les consommations se calculent véhicule par véhicule : enchaîner les
  // odomètres de véhicules différents fabriquerait des distances fictives.
  const byVehicle = new Map<string, Fillup[]>()
  for (const f of fillups) {
    const group = byVehicle.get(f.vehicle_id)
    if (group) group.push(f)
    else byVehicle.set(f.vehicle_id, [f])
  }

  const forEnergy = (energy: Energy) => {
    const entries = real.filter((f) => f.energy === energy)
    const spent = entries.reduce((s, f) => s + (f.total_price ?? 0), 0)
    const units = entries.reduce((s, f) => s + (f.liters ?? 0), 0)
    const conso = [...byVehicle.values()].flatMap((g) => consumptionSeries(g, energy))
    const km = conso.reduce((s, p) => s + p.km, 0)
    const trackedUnits = conso.reduce((s, p) => s + p.liters, 0)
    const unitPrice = units > 0 ? spent / units : null
    return {
      units,
      unitPrice,
      per100: km > 0 ? (trackedUnits / km) * 100 : null,
      km,
      // coût des unités consommées sur les périodes mesurées, approximé au prix moyen
      costPerKm: km > 0 && unitPrice != null ? (trackedUnits * unitPrice) / km : null,
    }
  }

  const fuel = forEnergy('fuel')
  const elec = forEnergy('electric')

  // Pour un hybride rechargeable, périodes carburant et électriques couvrent
  // les mêmes kilomètres : les coûts au km s'additionnent.
  const costPerKm =
    fuel.costPerKm != null || elec.costPerKm != null
      ? (fuel.costPerKm ?? 0) + (elec.costPerKm ?? 0)
      : null

  return {
    count: real.length,
    totalSpent,
    totalLiters: fuel.units,
    totalKwh: elec.units,
    avgPricePerLiter: fuel.unitPrice,
    avgPricePerKwh: elec.unitPrice,
    avgConso: fuel.per100,
    avgConsoElec: elec.per100,
    costPerKm,
    trackedKm: Math.max(fuel.km, elec.km),
  }
}

/** Moyenne mobile (fenêtre glissante, fenêtres partielles en début de série) */
export function movingAverage(values: number[], window = 5): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1)
    return slice.reduce((s, v) => s + v, 0) / slice.length
  })
}
