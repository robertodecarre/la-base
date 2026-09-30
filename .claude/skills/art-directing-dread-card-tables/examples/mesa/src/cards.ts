import * as THREE from 'three'
import { CARD_W, CARD_H } from './seats'
import { drawBack, drawFace, toTexture, type Rank, type Suit } from './cardFace'

const geo = new THREE.PlaneGeometry(CARD_W, CARD_H)
const backMat = new THREE.MeshStandardMaterial({ map: toTexture(drawBack()), roughness: 0.85 })
const faceCache = new Map<string, THREE.MeshStandardMaterial>()

function faceMat(suit: Suit, rank: Rank) {
  const key = `${suit}${rank}`
  let m = faceCache.get(key)
  if (!m) {
    // Faces are slightly emissive so they stay the brightest thing under the lamp and
    // land ABOVE the dark-snap threshold of the post pass (legibility rule).
    const map = toTexture(drawFace(suit, rank))
    m = new THREE.MeshStandardMaterial({ map, roughness: 0.8, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.18 })
    faceCache.set(key, m)
  }
  return m
}

export interface CardView {
  root: THREE.Group
  setIdentity(suit: Suit, rank: Rank): void
  forget(): void // back on both sides again (card returned to the deck)
}

// A card whose identity is UNKNOWN until setIdentity() — remote cards start as back-only,
// exactly like the network model (identity only arrives with the reveal event).
export function makeCard(): CardView {
  const root = new THREE.Group()
  const back = new THREE.Mesh(geo, backMat)
  back.rotation.y = Math.PI
  const face = new THREE.Mesh(geo, backMat) // placeholder: back texture on both sides
  back.castShadow = face.castShadow = true
  root.add(face, back)
  return {
    root,
    setIdentity(suit, rank) {
      face.material = faceMat(suit, rank)
    },
    forget() {
      face.material = backMat
    },
  }
}
