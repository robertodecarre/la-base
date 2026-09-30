---
name: building-immersive-3d-websites
description: Use when asked to build an immersive, 3D, WebGL, Three.js or "Awwwards-style" website, scroll-driven storytelling page, interactive product/brand experience, or creative portfolio — including requests like "haceme un sitio 3D para X", "web inmersiva", "landing con 3D", or references to sites from mesh3d.gallery, Awwwards, Active Theory, Lusion, Unseen, Immersive Garden.
---

# Building Immersive 3D Websites

## Overview

An immersive site is a **short film the user scrubs with the scroll**: a few chapters, each with one
strong idea, rendered in WebGL behind a real, accessible DOM. The magic is ~70% art direction and
choreography, ~30% tech. The tech is standardized: a survey of 388 sites on mesh3d.gallery
found Three.js 68%, custom GLSL 72%, GSAP+ScrollTrigger 60%, Lenis 41%, compressed glTF
(Draco/Meshopt/KTX2) ~50%, post-processing 37%, React Three Fiber only 22%.

**Core principle:** DOM is the source of truth (scroll length, content, SEO, a11y, CTA). WebGL only
reads numbers from it (`progress`, `mix`, pointer) and paints. Every animation is a pure function of
scroll progress, so it's scrubbable and reversible.

## Workflow (follow in order, don't skip 1–2)

1. **Concept brief (15 min, before any code).** Answer the questions in
   `references/creative-direction.md` → one-line metaphor, 3–6 chapters, ONE visual language,
   palette of 3–4 colors, type pairing, where the conversion happens. If the user gave only
   "sitio 3D para X", propose 2–3 concepts in a few lines each and pick the strongest if they don't answer.
2. **Chapter map.** Table: chapter → DOM copy → GL scene → what progress 0→1 does → pointer
   reaction → transition to next. This table IS the spec.
3. **Scaffold from the template** (`template/`, verified building and rendering with three r186 /
   Vite 8): `cp -r ~/.claude/skills/building-immersive-3d-websites/template <project> && npm i && npm run dev`.
   It includes: Lenis+GSAP ticker sync, DOM→scene story mapper with sticky chapters, per-scene
   render targets + noise-wipe transitions, pointer trail, print grain, comic-ink NPR material,
   PBR glass product scene, quality tiers + FPS governor, asset loader (Draco/KTX2/Meshopt),
   loader UI, split-text reveals, no-WebGL/reduced-motion fallbacks, `?debug` and `?tier=0|1|2`.
4. **Replace, don't pile on:** rewrite the scenes in `src/scenes/` to match the chapter map,
   set colors/fonts in `style.css`, edit `index.html` copy. Delete scenes you don't use.
5. **Look development** with recipes from `references/shader-recipes.md` (ink/hatching, toon,
   dither, glass, dissolve, particles, fluid, SDF masks, MSDF text…). One look per site.
6. **Assets** per `references/assets-pipeline.md` (glTF-Transform, KTX2, baked lighting, budgets).
7. **Perf + a11y + QA pass** with `references/performance-a11y.md` checklist. Verify in a real
   browser (Claude in Chrome): screenshot every chapter at desktop AND 390×844, check console.

## Stack decision

| Situation | Choose |
|---|---|
| Default / standalone marketing site | **Vanilla Three.js + Vite + TS + GSAP + Lenis** (the template) |
| Project already on React/Next, or 3D is a component inside an app | React Three Fiber v9 + drei + @react-three/postprocessing (see `references/architecture.md`) |
| Needs CMS / many routes / SEO pages | Astro or Nuxt/Next shell + the template's `Experience` mounted on one canvas that persists across routes |
| Client wants to edit 3D without code, low budget | Spline embed (2% of surveyed sites) — accept perf/look limits |
| Cutting-edge compute (millions of particles) | `three/webgpu` + TSL with WebGL2 fallback (see architecture ref) |

## Quick reference

| Need | Where |
|---|---|
| Concepts by industry, style catalog, copy tone, real examples | `references/creative-direction.md` |
| Scroll→progress math, scene manager, transitions, audio, routing, R3F version | `references/architecture.md` |
| GLSL recipes (hatching, stepped time, aastep, fresnel, dissolve, fluid, particles, MSDF) | `references/shader-recipes.md` |
| Blender→glTF, compression, texture budgets, baking | `references/assets-pipeline.md` |
| Budgets, mobile/iOS, fallbacks, SEO, QA checklist | `references/performance-a11y.md` |
| How Active Theory built santionispirits.com (full teardown) | `references/case-study-santioni.md` |
| Interactive hand "Hold & Move" + ripple surface (Santioni), wireframe-grid hand | `references/hand-interaction.md` + `examples/grid-hand/` (verified demo) |
| mesh3d.gallery survey: stats, studios, exemplars by category | `references/mesh3d-survey.md` |
| Human characters (anatomy, posing, hands, MPFB2 pipeline, typing animation) | **skill `modeling-3d-human-characters`**; site integration notes in `references/characters.md` |
| Whole-film camera sweep, lens shift, choices that recolour everything, scroll gates, hold/terminal interactions, generative score, product-on-a-screen reveal | `references/story-mechanics.md` |
| Headless screenshots when the visible browser is occluded | `tools/shot.mjs` |
| Measure fps + effective render scale per chapter (gpu / weak / phone emulation) | `tools/perf.mjs` + `references/performance-a11y.md` |

## Common mistakes (all seen while building/verifying the template)

- **Human built from capsules/spheres, or posed by eye** → use the `modeling-3d-human-characters` skill
  (real body mesh, anatomical posing, measured verification).
- **`gltf-transform optimize` without `--join false`** merges material-less meshes → per-part styling lost.
- **Scroll gate with `lenis.stop()`** → page freezes, can't scroll back. Clamp downward scroll instead.
- **Camera paths that approach and back off repeatedly**, or cut away before the key image is framed → one-way moves, hold on the image (see `references/story-mechanics.md`).
- **Interaction contradicting the copy** (e.g. "never sleeps" + "hold to wake") → rewrite the interaction.
- **Rigged hand looks deformed/demonic**: flat skeleton (WebXR/hand-tracking: all joints siblings) rotated as if hierarchical, or the same local axis for every bone → per-finger FK with axis = cross(segment, palm). And never a lone hand: the arm must reach the edge of the frame.
- **Mask/source render target too thin for a sim** (e.g. hand∩plane band 0.015 u at 256²) → ~9 px, the sim never reacts. Make the sim band wide, keep the thin one only for visuals.
- **Custom `ShaderMaterial` on an `InstancedMesh` without `instanceMatrix`** → every instance renders stacked at the origin. Wrap with `#ifdef USE_INSTANCING pos = (instanceMatrix * vec4(pos,1.)).xyz; #endif`.
- **`z-index` on `<main>`** isolates `mix-blend-mode: difference` from the canvas → text illegible. Leave main without z-index.
- **Reversed `smoothstep(edge0 > edge1)`** is undefined in GLSL; use `1.0 - smoothstep(a, b, x)`.
- **`THREE.Clock`** is deprecated (r18x): use `THREE.Timer` and `timer.update(timestamp)`.
- **Vite 8 (Rolldown)**: `manualChunks` must be a function, not an object.
- Separate RAF loops for Lenis, GSAP and three → DOM/GL jitter. Drive all from `gsap.ticker`.
- Animations driven by elapsed time instead of `progress` → not reversible, breaks on fast scroll.
- Everything in WebGL (text, nav, CTA) → no SEO/a11y, blurry text. Keep copy/CTA in DOM.
- No loader precompile (`renderer.compile`) → hitch on first entry into each chapter.
- DPR uncapped (3× on phones) → 9× fragment cost. Cap by tier and adapt at runtime.
- One giant "wow" per chapter plus five small ones → noise. One idea per chapter.
- Pure spectacle, buried CTA (the #1 criticism in the Santioni Instagram comments) → always a fast path: visible nav, CTA in the last chapter, and ideally a "skip/2D" link.

## Definition of done

Builds with no TS errors · 60 fps desktop / ≥30 fps mid mobile · LCP DOM text <2.5 s · no console
errors · every chapter screenshot-verified desktop + mobile · reduced-motion and no-WebGL paths
readable · CTA reachable in ≤2 interactions from load.
