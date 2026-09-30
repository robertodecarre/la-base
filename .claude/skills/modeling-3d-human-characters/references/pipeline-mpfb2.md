# Pipeline: MPFB2 (MakeHuman for Blender) → skinned glTF → web

## Choosing the source

| Need | Use | Notes |
|---|---|---|
| Detailed, posed human, free, commercial-safe | **MPFB2 (MakeHuman for Blender), headless** — recipe below | Body/skins/system assets CC0; many clothes CC-BY (credit in footer). Hoodie: `elvs_hooded_sweat_jacket1` (shirts02, CC-BY) |
| Rigged character + real animations (typing, walking) | Mixamo (user must log in and download FBX) | MPFB2's `mixamo` rig has matching bone names → Mixamo clips retarget |
| Specific prop/character quickly | Sketchfab/Fab CC0/CC-BY, or AI 3D (Meshy/Tripo/Rodin) | Check each license; AI meshes are weak on faces/hands |
| Hyper-real human | MetaHuman | **License only allows rendering in Unreal — not usable on the web** |
| No 3D tools available / 30-min fix | 2D ink illustration (SVG) on a camera-facing plane ("fake 3D", Santioni-style) | Fine at mid distance; reads flat up close. Keep it as the load-failure fallback |
| Better 2D art | Image model (e.g. nano-banana/Gemini — needs `GEMINI_API_KEY`) or an illustrator | Remove background → PNG with alpha → same cut-out plane |

## MPFB2 headless recipe (Blender 4.5 LTS, verified)

Reusable script: `tools/build_character.py` (human + clothes + posture + raised hood + headphones + skinned GLB).
Posing itself is covered by `postures.md` and `hands.md`; this file is the plumbing.

1. **Install in isolation** (don't touch the user's Blender): download `blender-4.5.x-linux-x64.tar.xz` from
   download.blender.org, set `BLENDER_USER_RESOURCES=<scratch>/bconf`, then
   `blender -b --python-expr "bpy.ops.extensions.package_install_files(filepath='mpfb.zip', repo='user_default', enable_on_install=True); bpy.ops.wm.save_userpref()"`.
   MPFB zip URL: `https://extensions.blender.org/api/v1/extensions/?format=json` → entry `mpfb` → `archive_url`.
2. **Asset packs** from `https://files.makehumancommunity.org/asset_packs/<pack>/<pack>_<license>.zip`
   (`makehuman_system_assets_cc0`, `skins01_cc0`, `shirts02_ccby`, `pants02_ccby`, `shoes02_ccby`…).
   ⚠ the `files2.` mirror crawls at ~50 KB/s (system pack is 280 MB) — measure both mirrors with a ranged `curl` first.
   Install: `AssetService.fix_and_extract_asset_pack_zip(zip, LocationService.get_user_data())`.
3. **Build** (`from bl_ext.user_default.mpfb.services.humanservice import HumanService`):
   `create_human(macro_detail_dict={gender:1.0 (man) / 0.0 (woman), cupsize, age, muscle, weight, height, race:{…}})`, `add_builtin_rig(body, "mixamo")`,
   `add_mhclo_asset(AssetService.find_asset_absolute_path("x/x.mhclo", "clothes"), body, asset_type="Clothes", subdiv_levels=0)`.
4. **Pose by direction for the trunk and legs** (rotate each pose bone in world space around its head so its Y
   axis points along a target vector, parents first; character faces −Y, up +Z). Arms, hands and thumbs are
   **solved**, not aimed — see `postures.md` / `hands.md`.
5. **Bake**: `shape_key_remove(all=True, apply_mix=True)` **before** applying modifiers (MakeHuman morphs are
   shape keys → "Modifier cannot be applied to a mesh with shape keys"). Apply Armature + "Hide helpers" mask.
6. **Seat it after baking**: move the meshes, not the rig — meshes are both parented to and deformed by the rig,
   so moving the rig before baking displaces them twice (props built from bone positions end up on the chest).
7. **Raised hood** (packs only have hoods down): delete the jacket's hood bundle (verts above the shoulders and
   behind the face); build a hood from the baked head+neck verts: heavy `smooth_vert` (erase nose/ears) → push
   out along the radial ~5 cm (+ more at back/top for the peak, + a flare at the neck to drape on the shoulders,
   − a Gaussian groove on the centre line = seam, − a dent under the headband) → cut faces whose direction
   `· forward > 0.42` (face opening) → Displace(CLOUDS) wrinkles → Subsurf → Solidify 8 mm.
8. **Hard-surface props** (headphones, mic) from primitives are fine: bevelled cylinders, tori, curve tubes
   (`bevel_depth`), placed in the head frame; join by material role (`HP_Shell`, `HP_Cushion`, `HP_LED`).
9. **Preview** each iteration with Workbench renders (front/back/side PNGs) and look at them before exporting.
10. **Export** GLB with `export_materials="NONE"` (the web assigns ink by node name), then
    `gltf-transform optimize in.glb out.glb --compress meshopt --join false --instance false --simplify false --prune false --flatten false`.
    ⚠ without `--join false` all material-less meshes are merged into one and per-part styling is lost.
    Result for a dressed seated figure: ~65 k tris, ~400 KB static / ~540 KB skinned.

## Making it move (skinned export + procedural animation)

- Export **with the skeleton** and make the authored pose the rest pose: bake (shape keys frozen) →
  `pose.armature_apply()` → re-add an Armature modifier to each mesh → export with `export_skins=True`.
  The web then only adds small offsets, so a bad rotation can never wreck the pose.
- Derived meshes keep skin weights for free: when building the hood from the body's bmesh, create the body's
  vertex groups on the new object **in the same order** (the deform layer is copied by index).
- Rigid props (headset) → `parent_set(type="BONE")` to the head bone; glTF exports them as bone children.
- Props placed from the head bone: the Mixamo `Head` bone starts at the nape — offset the head centre
  ~2.5 cm forward or ear cups land behind the ears.
- Procedural motion in three: define each rotation in the **figure's axes** and convert per frame
  (`local = parentWorld⁻¹ · D · parentWorld · rest`) — never guess bone-local axes after export.
  Good layers: breathing on Spine1/2, head glance between screens (damped target switching), typing
  bursts (`pow(max(0,sin(t·rate+φ)),10)` per finger, envelope of two sines), mouse moves + clicks, and an
  intensity param tied to the story. GLTFLoader strips `:` from names → `mixamorigHead`.
- **ShaderMaterials need skinning chunks** or skinned meshes render frozen in the bind pose:
  `#include <skinning_pars_vertex>` + (`skinbase`, `skinnormal`, `skinning` on `transformed`). Compute hatch
  UVs from the rest position (lines stick to the fabric). The outline hull must be a `SkinnedMesh`
  `bind(src.skeleton, src.bindMatrix)` with the same chunks. Set `frustumCulled = false` on skinned parts.
- Verify motion with a frame sequence (6 shots 200–300 ms apart, cropped) — puppeteer `clip` is in
  **document** coordinates, so crop full-viewport shots afterwards instead.

## Comic / stylized rendering on the web (three.js)

```ts
// Per-part ink (template createInkMaterial) + inverted-hull outline + accent LED shared by reference
const hullMat = new THREE.ShaderMaterial({ side: THREE.BackSide,
  vertexShader: `uniform float t; void main(){ gl_Position = projectionMatrix*modelViewMatrix*vec4(position+normal*t,1.); }`,
  fragmentShader: `uniform vec3 c; void main(){ gl_FragColor = vec4(c,1.); }`,
  uniforms: { t: { value: 0.0035 }, c: { value: INK } } })
gltf.scene.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh) })  // collect first,
meshes.forEach(m => { m.material = inks[m.name] ?? inks.default                            // then mutate
  if (!['Lashes','Brows'].includes(m.name)) m.add(new THREE.Mesh(m.geometry, hullMat)) })
```
- lineFreq for metre-scale props ≈ 40–90 (tiny parts need dense hatching); walls/floors ≈ 16–20
  (higher → moiré in the distance).
- Faces toward the camera stay readable if the ink light comes from the upper side, not from behind.
- Keep a contact-shadow decal under the chair; add the chair in the same ink so the figure has something to sit on.
- Credit CC-BY assets in the footer (author + pack).
