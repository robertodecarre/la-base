# Interactive hand: "Hold & Move" + surface that reacts (Santioni) and wireframe-grid version

Verified 27-Sep-2026 against santionispirits.com's shipped bundle (`app.1782836328290.js`,
`compiled.vs`) and with a working demo in `examples/grid-hand/` (three r186).

## 1. How Santioni does it (read from the code, not guessed)

Chapter "Hesitantly, his hand draws forward." — an inked arm reaches toward a **vertical red
water surface** (what looks like wood grain is a *water* shader drawn with a lines texture).
Where the hand touches the surface, **rings** form that spread out. Desktop: custom cursor
"Hold & Move"; mobile: a disc button "HOLD &" (`GLUIDiscButton`) + drag.

### Pieces (classes in the bundle)

| Piece | What it does |
|---|---|
| `Hand` | Loads `assets/geometry/story/hand/arm-skin.bin` (Draco skinned mesh, arm + sleeve) and a clip `arm.bin`. Controller + bone noise + spring bones. |
| `HandScene` | Wires hand, water, text box, cursor/button; renders the extra passes. |
| `SkinHandShader` | Ink look (hatching, same model as the rest of the site) + **plane clip** + writes to 2 buffers (MRT). |
| `InverseSkinHandShader` | Same geometry, `BackSide`, extruded along the screen-space normal (`projectionPos.xy += screenNormal * 0.004 * w`) → **inverted-hull ink outline**. |
| `InteractiveWaterHeightmap.fs` | 2D wave sim on a 256² ping-pong (GPUComputationRenderer-style). |
| `WaterHandShader` | Draws the water: lines texture displaced by the height + color bands by threshold. |
| `InverseHandPass` + `FloatingFrameHand` | (desktop only) the part of the hand "on the other side" seen from a mirror camera, inside a floating comic panel. |

### The controller (`Hand.render`, every frame)

```js
mouseDown = isMobile ? discButton.isHolding : cursor.mouseDown
progress  = lerp(progress, mouseDown ? 1 : 0, 0.05)            // ~1 s to go in or out
animation.elapsed = range(easeInSine(progress), 0,1, 25,55)    // SCRUBS frames 25→55 of the clip
// pointer → range of the screen it can move in (holding: x .65–.75, y .1–.6 on desktop)
pos = projection.unproject(mouse, distHand)                    // distHand: 2.5 → 3.5 with progress
pivotGroup.position.lerp(worldToLocal(pos), 0.3)               // mobile 0.2
pivotGroup.rotation.y = lerp(-30°, 0°, progress); rotation.z = lerp(0°, -40°, progress)
fingers (pinky2..thumb3): rotation.x += cnoise(t*6e-4) * 0.15  // it's never frozen
wrist: rotation.y/z += cnoise(t*1e-4) * 0.1
root arm bone: += tilt from pointer velocity (lerp 0.07 / 0.04)
sleeve: WiggleBoneSpring per bone (damped spring)
audio: contact volume by proximity; lowpass filter 200 Hz→12 kHz by hand velocity
```
The `?still` param locks the hand at progress 1 (for captures). On mobile, not holding → fixed at the center of the screen.

### Portal / clip against the surface

The plane equation is computed from the water mesh (`n·p + d`) and passed as `uPortalPlane`.
In the shader, `vDepth = dot(worldPos, plane.xyz) + plane.w`, and:

```glsl
float depthMask = smoothstep(-feather, feather, vDepth);             // 1 on the visible side
float fringe    = 1.0 - smoothstep(0.0, feather + 0.1, abs(vDepth - 0.01)); // band at the cut
color *= step(0.1, 1.0 - fringe);                                     // black ink line at the cut
#drawbuffer HandInfo gl_FragColor = vec4(distBeforePortal, 1.0 - depthMask, fringe, 1.0);
#drawbuffer Color    gl_FragColor = vec4(color, depthMask);            // alpha = only in front of the plane
```
Also: `isClipping()` discards dots when the camera gets close (a "dissolve" by
proximity) and `uDiscard` clips by screen height (the comic panel's frame).

### Ripples: the hand is the source of a wave sim

1. **HandInfo pass**: the hand is rendered from the main camera into an RGBA RT (`Utils3D.createFXLayer("HandInfo")`); channel B = fringe (where it cuts the plane).
2. **Heightmap** (Hugo Elias method, 256²): `x` = current height, `y` = previous height.
   ```glsl
   float h = ((N + S + E + W) * 0.5 - prev) * 0.96;  // viscosity
   h += texture2D(tHand, screenUv - scroll).b;        // the hand pushes
   h = clamp(h, -4.0, 100.0);
   gl_FragColor = vec4(h, current, 0, 1);
   ```
   The sim samples tHand in **screen space** (the water is flat in front of the camera), corrected by the scroll.
3. **Water**: `lineuv += height * 0.01` (displaces the lines) and color bands by
   `step(0.31 / 0.4 / 1.8 + blue noise, height)` → black, red `#C82924`, bright red. With `floor(time*8)/8` for the "boil".

## 2. Recipe to build it in three.js / R3F

0. **Always ARM + hand, never a lone hand.** A hand cut off at the wrist reads as a severed
   limb. The arm must leave the frame (right/bottom edge) in every state and aspect ratio.
   Santioni uses a whole arm with a sleeve. If the model ends at the wrist → procedural forearm (§3b).
1. **Asset**: rigged arm (Blender, ~20 bones: arm, wrist, 3 per finger, sleeve) and ONE
   "reach" clip. Export glTF + Draco/Meshopt. In three: `mixer.clipAction(clip).play(); action.paused = true;`
   and every frame `action.time = lerp(t0, t1, easeInSine(progress)); mixer.update(0)` — the equivalent of `animation.elapsed`.
   No clip → procedural pose (fingers + wrist), like `examples/grid-hand/src/handRig.ts`.
2. **Controller**: `HandRig` in the example (damped progress, pointer→depth plane,
   rotations by progress, per-bone noise). DOM "Hold & Move" button with `touch-action:none`
   and `setPointerCapture` for mobile.
3. **Plane clip**: `uPlane` uniform + `vPlaneDist` in the vertex shader (after skinning).
4. **HandInfo pass**: in three there's no `#drawbuffer`; a second render with
   another material is enough (swap `mesh.material`, `renderer.render(pivot, infoCamera)` into a small RT).
   If the surface is a finite mesh (not the whole screen), render from an **ortho camera
   aligned with the plane** → the RT is already in the surface's UVs (that's what `membrane.ts` does).
5. **Sim**: `GPUComputationRenderer` with one variable `heightmap` (see `membrane.ts`).
6. **Surface**: whatever look (Santioni: lines + color bands; grid: vertex displacement + brightness).
7. Performance: sim + extra pass cost ~2 cheap draws at 256²; on mobile, 128² is enough.

## 3. Wireframe-grid version (hologram / sci-fi hand, like the references)

Three ways to draw the lines; the example has 1 and 2 plus dots (3):

| Method | How | Pros / cons |
|---|---|---|
| **1. Bind-pose grid** (`mode=rest`) | `fract(restPosition * density)` on 2 axes, triplanar by rest normal, `fwidth` for AA. Rest position = the `position` attribute BEFORE skinning → the lines stick to the skin. | Works with ANY rigged mesh, no UVs or topology needed. Lines = sections of the model (rings), not the "real" mesh. |
| **2. Real quad edges** (`mode=bary`) | Non-indexed geometry + `aBary` attribute; **quad diagonals** (the edge that's longest in both triangles and coplanar ±25°) are hidden with `aHide`. | The look of the references (clean grid following the model's loops). Needs quad topology in the original model. |
| **3. Dots on vertices** (`&dots`) | `THREE.Points` child of the SkinnedMesh; every frame `skinned.getVertexPosition(i, v)` (morph + skinning on CPU). | ~1–5k vertices on CPU is fine. For more: GPU skinning in the Points ShaderMaterial (`#include <skinning_*>` + skeleton's `bindMatrix`/`boneTexture` uniforms). |
| (UV grid) | `fract(uv * N)` | Only if the UV unwrap is cylindrical per finger; with normal UVs it comes out broken. |

### 3a. A human pose (not demonic)

Santioni's hand looks monstrous on purpose (ink, long fingers). For a human hand:
- **First check whether the skeleton is hierarchical or FLAT.** The WebXR hand (and hand-tracking rigs)
  has all 25 joints as siblings under `Armature`: rotating `bone.quaternion` on a knuckle does NOT carry the
  following phalanges → broken, twisted fingers. Do forward kinematics per finger:
  `pos[i+1] = pos[i] + accum_i · segment_i`, `accum_i = accum_{i-1} · R(axis_i, θ_i)`, `bone.quaternion = accum_i · bindQuat_i`,
  and the wrist rotates the whole hand around its position (`handRig.ts`). Hierarchical rig (Blender/Mixamo) → rotating the bone is enough.
- **Flexion axis per joint** = `cross(segment, palm direction)` in the bind pose (NOT the same local X for
  all: bone axes aren't aligned). Check the sign with `?side&curl=3`: it should close into a fist toward the palm.
- **Graded curl**: pinky > ring > middle > index (rest ≈ 0.48/0.40/0.32/0.24 rad; reaching ≈ 0.24/0.16/0.10/0.06),
  intermediate phalanx ×1.15, distal ×0.7, thumb soft; spread ±0.06–0.12 at the proximal; slight cupping of the ring/pinky
  metacarpals; noise ≤ 0.035 rad. Wrist: extension of −0.12 rad while reaching.

### 3b. Procedural forearm (when the model ends at the wrist) — `forearm.ts`

- Tube of rings × segments (indexed quads → also works with `mode=bary`), 4.5 hand lengths so it always leaves the frame.
- **The first ring copies the real outline of the wrist opening** (angular max radius over the vertices closest
  to the wrist end, center = midpoint of the bbox, not the centroid) and blends over ~0.35 hand lengths into an anatomical
  superellipse (exponent 2.4): flat wrist → rounder, thicker forearm (+28% wide, +65% deep). Rings
  denser near the wrist (`t^1.6`). Starts 3% *inside* the hand and droops ~10° toward the palm (the elbow is lower).
- **Skinned with 2 bones**: `wrist` (weight 1 → 0 over the first 0.4 hand lengths) and a fixed `anchor` bone (sibling of the wrist,
  same bind transform). The wrist bends and the start of the forearm follows it; the rest doesn't move.
- **bindMatrix trap**: if the hand was re-parented/rotated after loading (e.g. an `orient` group), the forearm's new
  `Skeleton` computes boneInverses with the CURRENT transform → call `forearm.bind(skeleton)` with NO bindMatrix
  (it uses its current matrixWorld). Passing `hand.bindMatrix` (from load time) applies the parent transform twice.
- Build it in the hand's geometry space → the bind-pose grid comes out continuous across hand and arm.

**Key fact**: `ShaderMaterial` on a `SkinnedMesh` already gets `USE_SKINNING` — just include
`skinning_pars_vertex`, `skinbase_vertex`, `beginnormal_vertex`, `skinnormal_vertex`, `begin_vertex`,
`skinning_vertex` in that order and use `transformed` / `objectNormal`.

**Holographic look** (`gridMaterial.ts`):
- `AdditiveBlending`, `depthWrite:false`, `DoubleSide`; back faces at 35% (`gl_FrontFacing`) → reads as volume without z-sorting.
- Fresnel `pow(1 - |n·v|, 2)` boosts the silhouette; a faint "skin" `fres * 0.06` fills the volume.
- **Draw-on**: `reveal` along the arm axis (dot(rest, axis) remapped) → the hand "draws itself" on scroll/load.
- **Scan pulse** travelling along the arm with `fract(along - time*0.25)`.
- Behind the membrane: alpha × 0.18; at the cut: glowing band. Bloom (mipmapBlur, threshold ~0.2) if tier ≥ 1.
- Palette like the references: `#3fd0ff` on `#070b1e`, or `#b6ff3a` on black, or lilac/white dots.

**Scene idea**: the "water" becomes a **grid membrane** (plane with a grid shader) whose
vertices move with the heightmap — the hand "pierces a digital layer" and the grid ripples
where it passes. That's what `membrane.ts` does.

## 4. Pitfalls hit while verifying the demo

- **Too-thin band in HandInfo**: with 0.015 world units and a 256² RT only ~9 pixels showed up and the
  sim never "felt" the hand. Use a wide band for the sim (~6% of the hand's size) and a thin one only for the visual glow.
- **Whole hand past the plane** → nothing intersects → no waves. The reach depth has to leave the wrist on this side: `reach = planeZ + ~0.55 × hand length`.
- `frustumCulled = false` on the SkinnedMesh (the bounding box is from the bind pose).
- **Deformed hand** = a flat skeleton rotated as if it were hierarchical, and/or the same local axis for every bone (see §3a).
- **Lone hand cut off at the wrist** = it reads as amputated; forearm to the edge (§3b), check it in landscape AND portrait.
- To capture portrait without resizing the window: an `<iframe>` 430×900 of the same page (same origin) and `toDataURL` of its canvas.
- `renderer.render(group, cam)` with a Group (not a Scene) works for secondary passes and doesn't draw the background.
- Model orientation: don't hardcode rotations; align `wrist→middle-finger-tip` to -Z and the palm normal
  (cross of index/pinky metacarpals) to -Y with two `setFromUnitVectors` (see `main.ts`).
- In portrait, open the FOV (`40 + (1 - aspect) * 30`) or the hand gets cropped.
- Canvas captures without `preserveDrawingBuffer`: `requestAnimationFrame(() => canvas.toDataURL())`
  registered after the render loop reads the same frame (handy for verifying without screenshots).

## 5. Where to get the hand

- **Free, rigged**: WebXR `generic-hand` (`@webxr-input-profiles/assets`, repo MIT), 25 joints, 1.4k verts,
  no clips → procedural pose. `npm run fetch-hand` in the example.
- **Custom**: model in Blender with quad topology and ring loops (method 2 looks like the references), rig
  with Rigify/manual, a "reach" clip, export glTF → `gltf-transform optimize --compress draco`.
- Mixamo: arms/hands inside full characters; useful for clips, but they need cutting and re-rigging.
