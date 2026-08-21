const nf2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const nf1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const nf3 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const nf0 = new Intl.NumberFormat('fr-FR')

export const fmtEur = (v: number | null | undefined) => (v == null ? '—' : `${nf2.format(v)} €`)
export const fmtLiters = (v: number | null | undefined) => (v == null ? '—' : `${nf2.format(v)} L`)
export const fmtKwh = (v: number | null | undefined) => (v == null ? '—' : `${nf2.format(v)} kWh`)
export const fmtPricePerL = (v: number | null | undefined) => (v == null ? '—' : `${nf3.format(v)} €/L`)
export const fmtPricePerKwh = (v: number | null | undefined) => (v == null ? '—' : `${nf3.format(v)} €/kWh`)
export const fmtKm = (v: number | null | undefined) => (v == null ? '—' : `${nf0.format(v)} km`)
export const fmtConso = (v: number | null | undefined) => (v == null ? '—' : `${nf1.format(v)} L/100`)
export const fmtConsoElec = (v: number | null | undefined) => (v == null ? '—' : `${nf1.format(v)} kWh/100`)

export const fmtBytes = (v: number | null | undefined) => {
  if (v == null) return '—'
  if (v < 1024) return `${nf0.format(v)} o`
  if (v < 1024 * 1024) return `${nf1.format(v / 1024)} ko`
  if (v < 1024 * 1024 * 1024) return `${nf1.format(v / (1024 * 1024))} Mo`
  return `${nf1.format(v / (1024 * 1024 * 1024))} Go`
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/** Valeur pour un <input type="datetime-local"> à partir d'une date locale */
export function toLocalInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Interprète "12,5" ou "12.5" ; renvoie null si vide ou invalide */
export function parseDecimal(s: string): number | null {
  const t = s.trim().replace(',', '.')
  if (!t) return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}
