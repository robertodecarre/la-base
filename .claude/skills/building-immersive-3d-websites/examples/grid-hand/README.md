# grid-hand — wireframe hand + "Hold & Move" + ripple membrane

Verified demo (three r186, Vite 8, 27-Sep-2026): builds with `tsc` strict, no console
errors, captures checked for rest / hold / move / release, `mode=rest` and
`mode=bary&dots`. Explanation of every piece in `../../references/hand-interaction.md`.

```bash
cp -r ~/.claude/skills/building-immersive-3d-websites/examples/grid-hand my-hand && cd my-hand
npm i && npm run fetch-hand && npm run dev
```

The hand is the rigged WebXR `generic-hand` (25 joints, 1.4k verts, repo
immersive-web/webxr-input-profiles, MIT). Swap `public/hand.glb` for your own model
(arm + clip) when there's a budget: quad topology → `?mode=bary` looks like the
reference images.

| URL | What it shows |
|---|---|
| `/` | bind-pose grid (topology-independent) |
| `/?mode=bary` | real edges with quad diagonals hidden |
| `&dots` | dots on the vertices (CPU skinning) |
| `&hold` | forces "holding" (for screenshots) |
| `?side&curl=3` | debug: profile view, hand still, exaggerated flexion (should close into a fist toward the palm) |

`window.__demo` exposes rig/hand/membrane/renderer/materials for inspection from the console.

Files: `gridMaterial.ts` (shaders), `barycentric.ts` (quad recovery),
`handRig.ts` (Hold & Move + per-finger FK for the WebXR hand's FLAT skeleton),
`forearm.ts` (procedural forearm to the edge of the screen, skinned to the wrist),
`membrane.ts` (HandInfo → heightmap sim → grid), `main.ts` (wiring, orientation, loop).

Re-verified 27-Sep-2026 after humanizing: profile with curl ×1 and ×3, front at rest/holding in
2560×1265 and portrait 430×900 (iframe), arm always reaching the edge, `vite build` OK, no console errors.
