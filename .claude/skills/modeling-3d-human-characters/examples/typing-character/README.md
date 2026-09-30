# Typing character (web side) — extracted from the ARGOS site, verified in production

Pairs with `tools/build_character.py` (Blender/MPFB2 export). Not a standalone app: copy into a project
built on the template.

| File | What it does |
|---|---|
| `analyst3d.ts` | Loads the skinned GLB, per-part comic ink + skinned inverted-hull outline, `KeyAnchor` alignment to the keyboard, ink-burn dissolve, and `AnalystRig`: breathing, damped glances, typing about **anatomical axes measured on the model** (flex = cross(segment, palm normal), spread = palm normal, sign from palm × segment). |
| `typing.ts` | Touch-typing driver: looping command script → per-character finger (QWERTY rules) → eased reach / press envelopes per finger + which keycaps are down. Uses an accumulated clock (no "flick" on speed changes). |
| `ink-skinned.vert` | The template ink vertex shader with skinning chunks (hatch UVs from the rest pose so lines stick to the fabric). |

Keyboard side (in the scene): real MX pitch 19.05 mm + row stagger, keycaps as an InstancedMesh whose
`press(c, r, amount)` / `commit()` move caps down by `travel` (3.5 mm). The grid constants must match the
Blender script (`PITCH`, `X0`, `Z0`, `STAGGER`, `KEY_TOP`).

QA: `?noboil` (freeze hatching boil) + frame sequences 60–110 ms apart, cropped on the fingers.
