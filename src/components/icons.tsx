interface IconProps {
  size?: number
}

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function PumpIcon({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden>
      <path d="M5 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16" />
      <path d="M3.5 21h12" />
      <rect x="7.5" y="6" width="4" height="4" rx="0.8" />
      <path d="M14 9h1.5a2 2 0 0 1 2 2v5.5a1.5 1.5 0 0 0 3 0V10l-2.5-2.5" />
    </svg>
  )
}

export function HistoryIcon({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden>
      <path d="M4 4h16v16H4z" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  )
}

export function StatsIcon({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M7.5 15.5l3.5-4 3 2.5 4.5-6" />
    </svg>
  )
}

export function GearIcon({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
    </svg>
  )
}

export function CameraIcon({ size = 26 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.4-2h5.2L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  )
}

export function AttachIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden>
      <path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.4a1.6 1.6 0 0 1-2.3-2.2l7.8-7.8" />
    </svg>
  )
}
