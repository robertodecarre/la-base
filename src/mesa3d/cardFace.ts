import * as THREE from 'three'
import { PALETTE, SUIT_INK } from './look'

export type Suit = keyof typeof SUIT_INK
export const SUITS: Suit[] = ['oros', 'copas', 'espadas', 'bastos']
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12] as const // 40-card Spanish deck (La Base: two of them with 8 players)
export type Rank = (typeof RANKS)[number]

// Real Spanish deck ratio (Fournier ≈ 61×95 mm). Texture is drawn small on purpose:
// it is sampled with NearestFilter and survives the low-res post pass.
const W = 160
const H = 250
const TEX_SCALE = 2 // drawn in 160×250 units, rasterized at 320×500 for legibility
// "Pintas": gaps in the frame that tell the suit even when only the edge is visible.
const PINTA_GAPS: Record<Suit, number> = { oros: 0, copas: 1, espadas: 2, bastos: 3 }

function rng(seed: number) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

function stock(g: CanvasRenderingContext2D, seed: number) {
  const r = rng(seed)
  g.fillStyle = PALETTE.bone
  g.fillRect(0, 0, W, H)
  // Foxing stains + stipple grain (Sol Cesto / Horripilant dither texture)
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(90,60,30,${0.04 + r() * 0.06})`
    g.beginPath()
    g.arc(r() * W, r() * H, 6 + r() * 28, 0, Math.PI * 2)
    g.fill()
  }
  g.fillStyle = 'rgba(20,14,12,0.18)'
  for (let i = 0; i < 900; i++) g.fillRect((r() * W) | 0, (r() * H) | 0, 1, 1)
}

// Double ink frame with pinta gaps on the top and bottom edges.
function frame(g: CanvasRenderingContext2D, suit: Suit, color: string) {
  g.strokeStyle = PALETTE.ink
  g.lineWidth = 3
  g.strokeRect(7, 7, W - 14, H - 14)
  g.lineWidth = 1.5
  g.strokeStyle = color
  g.strokeRect(12, 12, W - 24, H - 24)
  const gaps = PINTA_GAPS[suit]
  g.fillStyle = PALETTE.bone
  for (let k = 0; k < gaps; k++) {
    const x = W / 2 - (gaps - 1) * 9 + k * 18 - 4
    g.fillRect(x, 4, 8, 12)
    g.fillRect(x, H - 16, 8, 12)
  }
}

function sun(g: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string) {
  g.fillStyle = fill
  g.beginPath()
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    const rr = i % 2 ? s : s * 1.3
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  g.closePath()
  g.fill()
  g.stroke()
  g.fillStyle = PALETTE.bone
  g.beginPath()
  g.arc(x, y, s * 0.62, 0, Math.PI * 2)
  g.fill()
  g.stroke()
  g.fillStyle = PALETTE.ink // the watching face: two eyes, a mouth of teeth
  g.fillRect(x - s * 0.3, y - s * 0.18, s * 0.14, s * 0.14)
  g.fillRect(x + s * 0.16, y - s * 0.18, s * 0.14, s * 0.14)
  g.fillRect(x - s * 0.25, y + s * 0.18, s * 0.5, s * 0.08)
}

function pip(g: CanvasRenderingContext2D, suit: Suit, x: number, y: number, s: number) {
  const c = SUIT_INK[suit]
  g.save()
  g.translate(x, y)
  g.lineWidth = Math.max(1.5, s * 0.14)
  g.strokeStyle = PALETTE.ink
  g.fillStyle = c
  g.beginPath()
  if (suit === 'oros') {
    g.restore()
    sun(g, x, y, s * 0.72, c)
    return
  }
  if (suit === 'copas') {
    g.moveTo(-s * 0.7, -s * 0.7)
    g.quadraticCurveTo(-s * 0.7, s * 0.25, 0, s * 0.25)
    g.quadraticCurveTo(s * 0.7, s * 0.25, s * 0.7, -s * 0.7)
    g.closePath()
    g.rect(-s * 0.12, s * 0.25, s * 0.24, s * 0.45)
    g.rect(-s * 0.5, s * 0.7, s, s * 0.2)
  } else if (suit === 'espadas') {
    g.moveTo(0, -s * 1.1)
    g.lineTo(s * 0.16, -s * 0.9)
    g.lineTo(s * 0.12, s * 0.4)
    g.lineTo(-s * 0.12, s * 0.4)
    g.lineTo(-s * 0.16, -s * 0.9)
    g.closePath()
    g.rect(-s * 0.55, s * 0.4, s * 1.1, s * 0.16)
    g.rect(-s * 0.09, s * 0.56, s * 0.18, s * 0.38)
    g.moveTo(s * 0.18, s * 1.06)
    g.arc(0, s * 1.06, s * 0.18, 0, Math.PI * 2)
  } else {
    // bastos: knotted club with a sprout
    g.moveTo(-s * 0.16, s * 1.0)
    g.lineTo(-s * 0.3, -s * 0.8)
    g.quadraticCurveTo(0, -s * 1.2, s * 0.3, -s * 0.8)
    g.lineTo(s * 0.16, s * 1.0)
    g.closePath()
  }
  g.fill()
  g.stroke()
  if (suit === 'bastos') {
    g.fillStyle = PALETTE.ink
    for (const k of [-0.5, 0, 0.45]) g.fillRect(-s * 0.08, s * k, s * 0.16, s * 0.1)
  }
  g.restore()
}

// Pip layouts in card space (0..1), close to the traditional Fournier arrangement.
const LAYOUT: Record<number, [number, number][]> = {
  2: [[0.5, 0.3], [0.5, 0.7]],
  3: [[0.5, 0.25], [0.5, 0.5], [0.5, 0.75]],
  4: [[0.33, 0.3], [0.67, 0.3], [0.33, 0.7], [0.67, 0.7]],
  5: [[0.33, 0.28], [0.67, 0.28], [0.5, 0.5], [0.33, 0.72], [0.67, 0.72]],
  6: [[0.33, 0.25], [0.67, 0.25], [0.33, 0.5], [0.67, 0.5], [0.33, 0.75], [0.67, 0.75]],
  7: [[0.33, 0.22], [0.67, 0.22], [0.5, 0.36], [0.33, 0.5], [0.67, 0.5], [0.33, 0.78], [0.67, 0.78]],
}

// Courts: grotesque masked figures (Sola Busca / Sol Cesto), not the Fournier kings.
function court(g: CanvasRenderingContext2D, suit: Suit, rank: Rank) {
  const c = SUIT_INK[suit]
  g.lineWidth = 2.5
  g.strokeStyle = PALETTE.ink
  g.fillStyle = PALETTE.soot
  g.beginPath() // robe
  g.moveTo(W * 0.28, H * 0.86)
  g.quadraticCurveTo(W * 0.5, H * 0.3, W * 0.72, H * 0.86)
  g.closePath()
  g.fill()
  g.stroke()
  g.fillStyle = PALETTE.bone // mask
  g.beginPath()
  g.ellipse(W * 0.5, H * 0.3, W * 0.13, H * 0.1, 0, 0, Math.PI * 2)
  g.fill()
  g.stroke()
  g.fillStyle = PALETTE.ink
  g.fillRect(W * 0.43, H * 0.28, 6, 4)
  g.fillRect(W * 0.54, H * 0.28, 6, 4)
  for (let i = 0; i < 5; i++) g.fillRect(W * 0.44 + i * 4, H * 0.35, 2, 4) // teeth
  if (rank === 12) {
    g.fillStyle = c // crown
    g.beginPath()
    g.moveTo(W * 0.38, H * 0.2)
    for (let i = 0; i <= 4; i++) g.lineTo(W * (0.38 + i * 0.06), H * (i % 2 ? 0.1 : 0.2))
    g.closePath()
    g.fill()
    g.stroke()
  } else if (rank === 11) {
    g.fillStyle = PALETTE.bone // horse skull beside the rider
    g.beginPath()
    g.ellipse(W * 0.72, H * 0.52, W * 0.07, H * 0.12, -0.5, 0, Math.PI * 2)
    g.fill()
    g.stroke()
  }
  pip(g, suit, W * 0.5, H * 0.66, 16)
}

function index(g: CanvasRenderingContext2D, rank: Rank) {
  // Index ≥ 16% of card height: must read at ~60 px on screen after the post pass.
  g.fillStyle = PALETTE.ink
  g.font = 'bold 40px "IM Fell English SC", Georgia, serif'
  g.textBaseline = 'top'
  g.fillText(String(rank), 16, 16)
  g.save()
  g.translate(W - 16, H - 16)
  g.rotate(Math.PI)
  g.fillText(String(rank), 0, 0)
  g.restore()
}

export function drawFace(suit: Suit, rank: Rank): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = W * TEX_SCALE
  cv.height = H * TEX_SCALE
  const g = cv.getContext('2d')!
  g.scale(TEX_SCALE, TEX_SCALE)
  stock(g, SUITS.indexOf(suit) * 100 + rank)
  frame(g, suit, SUIT_INK[suit])
  if (rank === 1) {
    pip(g, suit, W / 2, H / 2, 46)
    const brava = suit === 'espadas' || suit === 'bastos'
    if (brava) sun(g, W / 2, H * 0.18, 12, PALETTE.rose) // the bravas get an extra watching sun
  } else if (rank >= 10) court(g, suit, rank)
  else for (const [x, y] of LAYOUT[rank]) pip(g, suit, x * W, y * H, rank > 5 ? 16 : 20)
  index(g, rank)
  return cv
}

// ONE back for the whole deck, 180°-symmetric, no per-card wear → no marked cards.
export function drawBack(): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = W * TEX_SCALE
  cv.height = H * TEX_SCALE
  const g = cv.getContext('2d')!
  g.scale(TEX_SCALE, TEX_SCALE)
  g.fillStyle = PALETTE.oxblood
  g.fillRect(0, 0, W, H)
  g.strokeStyle = 'rgba(20,14,12,0.55)'
  g.lineWidth = 2
  for (let i = -H; i < W + H; i += 14) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke()
    g.beginPath(); g.moveTo(i, H); g.lineTo(i + H, 0); g.stroke()
  }
  g.strokeStyle = PALETTE.ink
  g.lineWidth = 3
  g.strokeRect(7, 7, W - 14, H - 14)
  g.strokeStyle = PALETTE.bone
  g.lineWidth = 1.5
  g.strokeRect(12, 12, W - 24, H - 24)
  sun(g, W / 2, H / 2, 30, SUIT_INK.oros)
  return cv
}

export function toTexture(cv: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter // mips avoid shimmer on the far side of the table
  t.anisotropy = 4
  return t
}
