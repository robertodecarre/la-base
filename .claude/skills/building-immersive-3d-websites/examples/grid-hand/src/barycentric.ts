import * as THREE from "three";

// Two triangles are "one quad" if they're nearly coplanar (glTF exports
// always triangulated; this recovers the original quads).
const COPLANAR_COS = Math.cos(THREE.MathUtils.degToRad(25));

/**
 * Converts an indexed geometry to non-indexed and adds:
 *  - aBary: (1,0,0) (0,1,0) (0,0,1) per triangle corner.
 *  - aHide: 1 on the component of edges that are quad diagonals.
 * A shared edge is a diagonal if it's the longest edge of BOTH triangles
 * and they're nearly coplanar. Skin attributes (skinIndex/skinWeight) are
 * preserved, so it still works on a SkinnedMesh.
 */
export function buildBarycentric(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const index = source.getIndex();
  if (!index) throw new Error("buildBarycentric needs an indexed geometry");
  const pos = source.getAttribute("position");
  const triCount = index.count / 3;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  const normals: THREE.Vector3[] = [];
  const longest: string[] = [];
  const edgeTris = new Map<string, number[]>();
  const key = (i: number, j: number) => (i < j ? `${i}_${j}` : `${j}_${i}`);

  for (let t = 0; t < triCount; t++) {
    const ids = [index.getX(t * 3), index.getX(t * 3 + 1), index.getX(t * 3 + 2)];
    a.fromBufferAttribute(pos, ids[0]);
    b.fromBufferAttribute(pos, ids[1]);
    c.fromBufferAttribute(pos, ids[2]);
    normals.push(new THREE.Triangle(a.clone(), b.clone(), c.clone()).getNormal(new THREE.Vector3()));
    let maxLen = -1;
    let maxKey = "";
    for (let k = 0; k < 3; k++) {
      const i = ids[(k + 1) % 3];
      const j = ids[(k + 2) % 3];
      const len = a.fromBufferAttribute(pos, i).distanceToSquared(b.fromBufferAttribute(pos, j));
      const e = key(i, j);
      if (len > maxLen) {
        maxLen = len;
        maxKey = e;
      }
      edgeTris.set(e, [...(edgeTris.get(e) ?? []), t]);
    }
    longest.push(maxKey);
  }

  const hide = new Float32Array(triCount * 9);
  const bary = new Float32Array(triCount * 9);
  for (let t = 0; t < triCount; t++) {
    const ids = [index.getX(t * 3), index.getX(t * 3 + 1), index.getX(t * 3 + 2)];
    for (let k = 0; k < 3; k++) {
      bary[t * 9 + k * 3 + k] = 1;
      // Edge opposite corner k.
      const e = key(ids[(k + 1) % 3], ids[(k + 2) % 3]);
      const tris = edgeTris.get(e) ?? [];
      if (tris.length !== 2) continue;
      const other = tris[0] === t ? tris[1] : tris[0];
      const isDiagonal =
        longest[t] === e && longest[other] === e && normals[t].dot(normals[other]) > COPLANAR_COS;
      if (!isDiagonal) continue;
      for (let v = 0; v < 3; v++) hide[t * 9 + v * 3 + k] = 1;
    }
  }

  const out = source.toNonIndexed();
  out.setAttribute("aBary", new THREE.BufferAttribute(bary, 3));
  out.setAttribute("aHide", new THREE.BufferAttribute(hide, 3));
  return out;
}
