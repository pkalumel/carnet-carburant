// Briques graphiques partagées entre Stats et la console
// d'administration : Meter (tuile KPI) et Tip (tooltip encre).

export function Meter({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div>
      <div className="meter-big">
        {value}
        {unit && <span className="meter-unit">{unit}</span>}
      </div>
      <div className="meter-label">{label}</div>
    </div>
  )
}

export interface TipPayload {
  payload?: { tip: string }
}

export function Tip({ active, payload }: { active?: boolean; payload?: TipPayload[] }) {
  if (!active || !payload?.length || !payload[0].payload) return null
  return (
    <div
      style={{
        background: 'var(--tip-bg)', color: 'var(--tip-fg)', borderRadius: 8, padding: '6px 10px',
        fontSize: 13, fontFamily: 'var(--mono)', whiteSpace: 'pre-line',
      }}
    >
      {payload[0].payload.tip}
    </div>
  )
}
