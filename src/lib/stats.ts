import type { Fillup } from './types'

export interface ConsoPoint {
  date: string // ISO du plein complet qui clôt la période
  per100: number // L/100 km
  km: number // distance parcourue sur la période
  liters: number
}

/**
 * Consommations entre pleins complets successifs munis d'un kilométrage.
 * Les litres des pleins partiels intermédiaires sont comptés dans la période.
 */
export function consumptionSeries(fillups: Fillup[]): ConsoPoint[] {
  const chrono = [...fillups]
    .filter((f) => !f.is_draft)
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
    if (f.total_price == null) continue
    const month = f.filled_at.slice(0, 7)
    map.set(month, (map.get(month) ?? 0) + f.total_price)
  }
  return [...map.entries()]
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

export interface PricePoint {
  date: string
  price: number
}

export function priceSeries(fillups: Fillup[]): PricePoint[] {
  return fillups
    .filter((f) => f.price_per_liter != null)
    .map((f) => ({ date: f.filled_at, price: f.price_per_liter as number }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export interface Summary {
  count: number
  totalSpent: number
  totalLiters: number
  avgPricePerLiter: number | null
  avgConso: number | null // L/100 km pondérée par la distance
  costPerKm: number | null // €/km sur les périodes mesurées
  trackedKm: number
}

export function summarize(fillups: Fillup[]): Summary {
  const real = fillups.filter((f) => !f.is_draft)
  const totalSpent = real.reduce((s, f) => s + (f.total_price ?? 0), 0)
  const totalLiters = real.reduce((s, f) => s + (f.liters ?? 0), 0)
  const conso = consumptionSeries(fillups)
  const trackedKm = conso.reduce((s, p) => s + p.km, 0)
  const trackedLiters = conso.reduce((s, p) => s + p.liters, 0)
  const avgConso = trackedKm > 0 ? (trackedLiters / trackedKm) * 100 : null

  // coût des litres consommés sur les périodes mesurées, approximé au prix moyen
  const avgPricePerLiter = totalLiters > 0 ? totalSpent / totalLiters : null
  const costPerKm =
    trackedKm > 0 && avgPricePerLiter != null
      ? (trackedLiters * avgPricePerLiter) / trackedKm
      : null

  return { count: real.length, totalSpent, totalLiters, avgPricePerLiter, avgConso, costPerKm, trackedKm }
}
