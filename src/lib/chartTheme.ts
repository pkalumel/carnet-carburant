// Palette des graphes, partagée entre Stats et la console d'administration.
// Les valeurs sont des custom properties CSS : elles suivent le thème
// clair/sombre défini dans index.css (SVG accepte var() dans stroke/fill).

// Série encre pétrole + déclinaisons : accordées à l'identité, contrastées sur la surface
export const SERIES = [
  'var(--chart-s1)',
  'var(--chart-s2)',
  'var(--chart-s3)',
  'var(--chart-s4)',
  'var(--chart-s5)',
  'var(--chart-s6)',
]
export const GRID = 'var(--chart-grid)'
export const AXIS = 'var(--chart-axis)'
export const CURSOR = 'var(--chart-cursor)'
export const ACTIVE_DOT = 'var(--accent-press)'
