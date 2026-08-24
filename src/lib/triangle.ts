import { parseDecimal } from './format'

/**
 * Le « triangle » de la saisie : volume (L ou kWh) × prix unitaire = prix
 * total. Les trois champs sont saisissables ; les DEUX derniers édités
 * sont les sources, le troisième est dérivé et recalculé en direct.
 * Logique pure, sans état React, pour être testable et sans boucle.
 */
export type TriangleField = 'volume' | 'total' | 'unit'

export interface Triangle {
  volume: string
  total: string
  unit: string
  /** les 2 derniers champs édités ; le champ absent est dérivé */
  sources: TriangleField[]
}

const FIELDS: TriangleField[] = ['volume', 'total', 'unit']

export const emptyTriangle = (): Triangle => ({
  volume: '',
  total: '',
  unit: '',
  sources: ['volume', 'total'],
})

/** Le champ actuellement dérivé (jamais un champ source) */
export function derivedField(t: Triangle): TriangleField {
  return FIELDS.find((f) => !t.sources.includes(f)) ?? 'unit'
}

const fmt = (v: number, dec: number) =>
  v.toLocaleString('fr-FR', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
    useGrouping: false,
  })

/** Recalcule le champ dérivé à partir des deux sources (ou le vide) */
export function recompute(t: Triangle): Triangle {
  const derived = derivedField(t)
  const vol = parseDecimal(t.volume)
  const tot = parseDecimal(t.total)
  const unit = parseDecimal(t.unit)
  let out: number | null = null
  if (derived === 'total' && vol != null && vol > 0 && unit != null && unit > 0) out = vol * unit
  else if (derived === 'volume' && tot != null && tot >= 0 && unit != null && unit > 0) out = tot / unit
  else if (derived === 'unit' && vol != null && vol > 0 && tot != null && tot >= 0) out = tot / vol
  if (out == null || !Number.isFinite(out)) return { ...t, [derived]: '' }
  return { ...t, [derived]: fmt(out, derived === 'unit' ? 3 : 2) }
}

/** Édition d'un champ : il (re)devient source, le dérivé est recalculé */
export function editField(t: Triangle, field: TriangleField, value: string): Triangle {
  const sources = [field, ...t.sources.filter((f) => f !== field)].slice(0, 2)
  return recompute({ ...t, [field]: value, sources })
}

/** Impose une valeur source (tarif maison) sans en faire le dernier édité */
export function setSourceValue(t: Triangle, field: TriangleField, value: string): Triangle {
  const sources = t.sources.includes(field)
    ? t.sources
    : [...t.sources.slice(0, 1), field]
  return recompute({ ...t, [field]: value, sources })
}

/** Valeurs numériques finales (le dérivé compris), pour l'enregistrement */
export function triangleValues(t: Triangle): {
  volume: number | null
  total: number | null
  unit: number | null
} {
  return {
    volume: parseDecimal(t.volume),
    total: parseDecimal(t.total),
    unit: parseDecimal(t.unit),
  }
}
