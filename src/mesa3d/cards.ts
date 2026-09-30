import * as THREE from 'three'
import { CARD_W, CARD_H } from './seats'
import { drawBack, drawFace, toTexture, type Rank, type Suit } from './cardFace'

export interface CardView {
  root: THREE.Group
  setIdentity(suit: Suit, rank: Rank): void
  forget(): void // back on both sides again (card returned to the deck)
}

export type CardFactory = ReturnType<typeof makeCardFactory>

// La Base: one factory per scene (the demo kept these as module globals) so destroy() can free
// every texture/material. Faces are keyed by suit+rank only: with two decks (8 players) both
// copies of a card MUST render identically, otherwise the cards are marked.
export function makeCardFactory() {
  const geo = new THREE.PlaneGeometry(CARD_W, CARD_H)
  const backTex = toTexture(drawBack())
  const backMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.85 })
  const faceTex = new Map<string, THREE.Texture>()
  const faceCache = new Map<string, THREE.MeshStandardMaterial>()

  function faceTexture(suit: Suit, rank: Rank) {
    const key = `${suit}${rank}`
    let t = faceTex.get(key)
    if (!t) {
      t = toTexture(drawFace(suit, rank))
      t.name = key
      faceTex.set(key, t)
    }
    return t
  }

  function faceMat(suit: Suit, rank: Rank) {
    const key = `${suit}${rank}`
    let m = faceCache.get(key)
    if (!m) {
      // Faces are slightly emissive so they stay the brightest thing under the lamp and
      // land ABOVE the dark-snap threshold of the post pass (legibility rule).
      const map = faceTexture(suit, rank)
      m = new THREE.MeshStandardMaterial({ map, roughness: 0.8, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.18 })
      faceCache.set(key, m)
    }
    return m
  }

  // A card whose identity is UNKNOWN until setIdentity() — remote cards start as back-only,
  // exactly like the network model (identity only arrives with the reveal event).
  function makeCard(): CardView {
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

  // Resources shared by every card: a layout rebuild must not dispose them.
  function isShared(x: unknown) {
    return x === geo || x === backTex || x === backMat || [...faceTex.values()].includes(x as THREE.Texture) || [...faceCache.values()].includes(x as THREE.MeshStandardMaterial)
  }

  function dispose() {
    geo.dispose()
    backTex.dispose()
    backMat.dispose()
    faceTex.forEach((t) => t.dispose())
    faceCache.forEach((m) => m.dispose())
    faceTex.clear()
    faceCache.clear()
  }

  return { makeCard, faceTexture, backTex, isShared, dispose }
}
