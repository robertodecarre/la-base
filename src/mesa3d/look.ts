// Single source of truth for the look. Every hex here traces back to a reference game
// (see references/moodboard.md). Do not add colors outside this file.
export const PALETTE = {
  void: '#0b0908', // warm near-black: everything outside the lamp pool
  soot: '#1c1714', // chairs, coats, wall bands
  oxblood: '#602217', // Loop Hero backdrop red → card backs, curtains
  plum: '#472246', // Buckshot dusty plum → deep shadows on cloth
  felt: '#4a4927', // Buckshot olive felt
  feltLit: '#6f6e4b', // Buckshot felt under the lamp
  chalk: '#cfc6a8', // chalk lines / tallies on felt
  bone: '#d8c7a0', // card stock, masks, gloves (Buckshot #d8b78e warmed)
  ink: '#140e0c', // all linework on cards
  amber: '#ffc58a', // the one lamp (2700K)
  led: '#7fd36b', // Buckshot LED green: diegetic counters only
  rose: '#b76d6e', // Sol Cesto / Buckshot dusty rose: team I cuffs, rare accent
  teal: '#5ea2b0', // Loop Hero teal: team II cuffs, envido duotone
} as const

// Suit accents: one per suit, desaturated so they sit inside the palette.
export const SUIT_INK = {
  oros: '#c9a043',
  copas: '#8e2a22',
  espadas: '#4f7f8a',
  bastos: '#6b6a2e',
} as const

// Dark palette the post pass snaps shadows into (Inscryption trick: only darks are quantized).
export const DARK_SNAP = ['#0b0908', '#1c1714', '#2a0f0c', '#2d2c18', '#1d2626', '#2b1a2b'] as const

// Duotone "moments" (Horripilant): [shadow, light] gradient maps blended in on dramatic events.
export const DUOTONES = {
  truco: ['#1a0303', '#d23a2a'],
  envido: ['#03101a', '#5ea2b0'],
  flor: ['#0d1203', '#b8d43c'],
  muerte: ['#050505', '#d8c7a0'],
} as const

export const hex = (h: string) => parseInt(h.slice(1), 16)
