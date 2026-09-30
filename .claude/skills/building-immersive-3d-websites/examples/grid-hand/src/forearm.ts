import * as THREE from "three";

/**
 * Procedural forearm for hand models that end at the wrist (WebXR hand,
 * most hand scans). A hand cut off at the wrist reads as a severed limb;
 * the arm has to reach the edge of the screen.
 *
 * - The cross-section is MEASURED from the hand's wrist opening (the
 *   vertices closest to the wrist end), so the joint doesn't jump.
 * - Anatomical profile: the wrist is flat (wider than deep); toward the
 *   elbow the forearm gets rounder and thicker (muscles).
 * - It droops slightly toward the palm (the elbow is lower than the hand
 *   when reaching forward).
 * - Skinned with 2 bones: the hand's `wrist` near the joint, and a fixed
 *   `anchor` bone after that → when the wrist bends, the start of the
 *   forearm bends with it, and the rest stays put.
 * - Indexed quad topology (rings × segments) → also works in `mode=bary`.
 *
 * Everything is built in the hand's GEOMETRY space (mesh local), so the "rest"
 * grid comes out continuous across hand and arm. Call it with the hand in bind pose.
 */
export type ForearmOptions = {
  /** Length in hand lengths (enough to exit the frame). */
  lengthInHands?: number;
  rings?: number;
  segments?: number;
  /** Droop slope toward the palm (0.18 ≈ 10°). */
  droop?: number;
};

export function createForearm(
  hand: THREE.SkinnedMesh,
  wrist: THREE.Bone,
  forwardGeo: THREE.Vector3,
  palmGeo: THREE.Vector3,
  { lengthInHands = 4.5, rings = 56, segments = 28, droop = 0.18 }: ForearmOptions = {},
): THREE.SkinnedMesh {
  const f = forwardGeo.clone().normalize();
  const n = palmGeo.clone().addScaledVector(f, -palmGeo.dot(f)).normalize();
  const s = new THREE.Vector3().crossVectors(f, n).normalize();

  // Measure the wrist opening.
  const pos = hand.geometry.getAttribute("position");
  const v = new THREE.Vector3();
  let minProj = Infinity;
  let maxProj = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const d = v.fromBufferAttribute(pos, i).dot(f);
    minProj = Math.min(minProj, d);
    maxProj = Math.max(maxProj, d);
  }
  const handLength = maxProj - minProj;
  const band = handLength * 0.05;
  // Center = midpoint of the band's bounding box (the centroid is biased
  // toward where there are more vertices).
  let minS = Infinity;
  let maxS = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;
  let sumF = 0;
  let count = 0;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (v.dot(f) > minProj + band) continue;
    minS = Math.min(minS, v.dot(s));
    maxS = Math.max(maxS, v.dot(s));
    minN = Math.min(minN, v.dot(n));
    maxN = Math.max(maxN, v.dot(n));
    sumF += v.dot(f);
    count++;
  }
  const center = new THREE.Vector3()
    .addScaledVector(s, (minS + maxS) / 2)
    .addScaledVector(n, (minN + maxN) / 2)
    .addScaledVector(f, sumF / Math.max(count, 1));
  const radiusSide = (maxS - minS) / 2;
  const radiusPalm = (maxN - minN) / 2;

  // Real outline of the opening, angle by angle: the first ring copies it
  // exactly (no step at the seam) and then blends into the anatomical profile.
  const wristOutline = new Float32Array(segments).fill(0);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (v.dot(f) > minProj + band) continue;
    v.sub(center);
    const x = v.dot(s) / radiusSide;
    const y = v.dot(n) / radiusPalm;
    const bin = Math.round(((Math.atan2(y, x) / (Math.PI * 2) + 1) % 1) * segments) % segments;
    wristOutline[bin] = Math.max(wristOutline[bin], Math.hypot(x, y));
  }
  fillEmptyBins(wristOutline);

  // It starts slightly INSIDE the hand to hide the seam.
  const start = center.clone().addScaledVector(f, handLength * 0.03);
  const length = handLength * lengthInHands;

  const positions: number[] = [];
  const skinIndex: number[] = [];
  const skinWeight: number[] = [];
  const indices: number[] = [];
  const ringCenter = new THREE.Vector3();
  for (let r = 0; r <= rings; r++) {
    // Rings denser near the wrist (where the bend happens and it's seen up close).
    const t = Math.pow(r / rings, 1.6);
    const d = t * length;
    const k = d / handLength; // distance in hand lengths
    const sideScale = 1 + 0.28 * smoothstep(0.15, 0.9, k);
    const palmScale = 1 + 0.65 * smoothstep(0.1, 1.0, k) - 0.08 * smoothstep(1.4, 2.2, k);
    ringCenter.copy(start).addScaledVector(f, -d).addScaledVector(n, droop * d);
    const wristWeight = 1 - smoothstep(0, handLength * 0.4, d);
    const outlineBlend = smoothstep(0, handLength * 0.35, d);
    for (let k2 = 0; k2 < segments; k2++) {
      const a = (k2 / segments) * Math.PI * 2;
      // Superellipse (exponent 2.4): flatter than an ellipse, like a real forearm.
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const superX = Math.sign(c) * Math.pow(Math.abs(c), 2 / 2.4);
      const superY = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / 2.4);
      const measured = wristOutline[k2];
      const x = THREE.MathUtils.lerp(c * measured, superX, outlineBlend);
      const y = THREE.MathUtils.lerp(sn * measured, superY, outlineBlend);
      v.copy(ringCenter)
        .addScaledVector(s, x * radiusSide * sideScale)
        .addScaledVector(n, y * radiusPalm * palmScale);
      positions.push(v.x, v.y, v.z);
      skinIndex.push(0, 1, 0, 0);
      skinWeight.push(wristWeight, 1 - wristWeight, 0, 0);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let k2 = 0; k2 < segments; k2++) {
      const a = r * segments + k2;
      const b = r * segments + ((k2 + 1) % segments);
      const c = a + segments;
      const d = b + segments;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // UVs aren't used by the grid, but the bary conversion copies whatever attributes exist.

  // Fixed bone: same bind transform as the wrist, but it doesn't rotate with it.
  const anchor = new THREE.Bone();
  anchor.name = "forearm-anchor";
  wrist.parent?.add(anchor);
  anchor.position.copy(wrist.position);
  anchor.quaternion.copy(wrist.quaternion);
  anchor.scale.copy(wrist.scale);
  anchor.updateMatrixWorld(true);
  wrist.updateMatrixWorld(true);

  const forearm = new THREE.SkinnedMesh(geometry, hand.material);
  forearm.name = "forearm";
  forearm.position.copy(hand.position);
  forearm.quaternion.copy(hand.quaternion);
  forearm.scale.copy(hand.scale);
  hand.parent?.add(forearm);
  forearm.updateMatrixWorld(true);
  // bindMatrix = the forearm's CURRENT matrixWorld (not hand.bindMatrix): the
  // Skeleton computes its boneInverses now, with the hand already moved/rotated;
  // mixing that with the hand's original load-time bindMatrix would apply
  // the parent transform twice.
  forearm.bind(new THREE.Skeleton([wrist, anchor]));
  forearm.frustumCulled = false;
  return forearm;
}

/** Fills zeros (angles with no vertices) by interpolating between neighbors. */
function fillEmptyBins(bins: Float32Array): void {
  const n = bins.length;
  for (let i = 0; i < n; i++) {
    if (bins[i] > 0) continue;
    let prev = 1;
    let next = 1;
    while (prev < n && bins[(i - prev + n) % n] === 0) prev++;
    while (next < n && bins[(i + next) % n] === 0) next++;
    const a = bins[(i - prev + n) % n] || 1;
    const b = bins[(i + next) % n] || 1;
    bins[i] = a + ((b - a) * prev) / (prev + next);
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
