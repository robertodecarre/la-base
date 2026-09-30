# Immersive 3D site — starter

Vite 8 + TypeScript + three r186 + GSAP 3.15 (ScrollTrigger) + Lenis 1.3. Verified: `npm run build` passes,
all four chapters render in Chrome with no console warnings.

```bash
npm install
npm run dev          # http://localhost:5173  (?debug for GUI, ?tier=0|1|2 to force quality)
npm run build && npm run preview
```

## Map

| File | Role |
|---|---|
| `index.html` | Real content. Each `<section data-scene="key" data-height="N">` = one chapter lasting N viewports. Replace ALL_CAPS placeholders. |
| `src/main.ts` | Boot: quality → WebGL check → `Experience` with the scene registry + asset manifest. |
| `src/core/Experience.ts` | Renderer, gsap.ticker loop, resize, context loss, render order (trail → A → B → composite). |
| `src/core/Story.ts` | DOM sections → `{current, next, progress, mix}`. |
| `src/core/Scroll.ts` | Lenis synced to GSAP ticker + ScrollTrigger; anchor links. |
| `src/core/Assets.ts` | GLTF + Draco + KTX2 + Meshopt with loader progress; failures fall back to procedural meshes. |
| `src/core/Quality.ts` | Tiers (DPR, particle counts, post FX) + FPS governor. |
| `src/core/splitText.ts` | Word-mask reveals for `[data-split]`. |
| `src/scenes/*.ts` | One class per chapter (`init`, `update(FrameState)`). Animate from `progress`. |
| `src/materials/ink.*` | Comic hatching NPR material (Santioni technique). |
| `src/post/composite.frag` | Transition wipe, pointer-trail distortion, grain, vignette. |
| `src/fx/PointerTrail.ts` | Ping-pong FBO pointer trail. |

## Customize

1. Chapter map → edit sections in `index.html` and the registry in `main.ts` (keys must match `data-scene`).
2. Colors: CSS vars in `style.css` + material colors in scenes + `uWipeColor` in `Composite.ts`.
3. Fonts: add woff2 to `public/fonts`, uncomment `@font-face`, preload in `index.html`.
4. Models: put source GLBs in `public/models/src`, run `npm run optimize:models`, add to `MANIFEST`.
5. Different look: swap `createInkMaterial` for toon/PBR/particles (see skill `references/shader-recipes.md`).
