# Case Study: santionispirits.com (Active Theory, 2026)

Ready-to-drink cocktail brand. Tagline "Cocktails to Indulge Now, Atone Later". Featured on mesh3d (tags:
E-commerce, Food & drinks, Art). Went viral on Instagram as "¿sitio web o película?".

## Concept

A baroque **comic-book epic about sin and indulgence**: a hooded "saint" walks through a cathedral, a
colosseum, crumbling pillars, a portal; eyes open in manga close-ups; a giant hand offers a drink; the
bottle is poured; products appear in a collection. Monochrome ink + one saturated red (`#c82924`) + parchment
(`#f3f1e9`) + dark ink (`#121212`). Art-deco display font (Charles Rosie) + rounded bold (PP Nikkei Maru) +
light body (GT Era). Voice-over and SFX (footsteps synced to walk cycle), age gate, cookie banner, retail list.

## Tech (from the shipped code)

- **Framework:** Active Theory's proprietary *Hydra X* (`CREATED_WITH_HYDRAX = 1.1.20`) — not three.js
  directly, but same concepts. Scene/uniform tuning via their *UIL* GUI, exported to `assets/data/uil.<hash>.json`
  (270 kB of per-scene, per-element uniform values). Content from Sanity CMS inlined as JSON.
- **Single fixed canvas** (`#Stage`, `overflow:hidden`, custom scroll). DOM "UI" components per scene
  (`EyesOpenUI`, `DrinkPourUI`, `ProductsUI`, `TasteUI`, `RetailUI`, `FooterUI`) positioned with CSS vars
  `--height/--margin-top` → DOM defines each chapter's scroll length.
- **Scenes** (≈20): Intro, Approach, Wander, Near, Cathedral, Colosseum, PillarCrumble, Profile, Target, EyesOpen,
  Hand/HandFX, DrinkPour, DrinkSelection, AntiGravity, Products, Collection, Taste, Retail, Footer, Transition.
- **Scroll model:** world-stacked; each element knows `worldTop/worldBottom`, receives `lerpedScrollY`,
  computes `scrollProgress = range(-scrollY, worldBottom - screenH, worldTop)` and `visible` (culling).
- **~150 shaders** in one `compiled.vs` bundle. Key ones:
  - `StaticObjectBaseShader`: hatching NPR — `dot(N,L) + lines*0.45 - ao*0.15` thresholded twice with `aastep`
    into ink/color/highlight; lines texture (`lines.jpg`) along a rotated object-space axis; noise breaks lines
    into dots in light; `floor(time*8)/8` boil; distance-compensated line frequency.
  - `StaticCharacterBaseShader`, `SkinShader`, `HairShader`, `LeafShader`: same ink model + wind/breath params.
  - `FloatingFrame*Shader`: comic panels — geometry clipped in NDC by 4 projected corner points (edge test SDF).
  - `BorderShader`: panel border that expands from full screen to padded frame (`uTransition`) and gets
    eaten by the **mouse fluid mask** at the edges.
  - `PortalShader`: stepped-time noise + lines, fluid-driven distortion.
  - Full **Navier-Stokes mouse fluid** (advection, divergence, pressure, curl/vorticity, splat) → `tFluid` +
    `tFluidMask` sampled by many shaders (`mousefluid.fs`).
  - `GlassLiquidPBR` / `BottlePBR` / `LabelPBR`: PBR with prefiltered env diffuse/specular, MRO maps,
    lightmaps, screen-space refraction with mip-LOD blur, liquid fill + wobble.
  - `CompositeShader`: final pass — blue-noise grain scrolled by `uScrollY`, fluid-reactive noise on the age gate.
  - `TextAnimatedShader`/`TextShaderMasked`: MSDF text with translate-in and dissolve.
  - Particles ("Proton/Antimatter" GPGPU), wind lines/dust, light beams, water heightmap interaction.
  - **Hand chapter** (`Hand`/`HandScene`/`SkinHandShader`/`InteractiveWaterHeightmap`): skinned arm whose clip is
    scrubbed by a "Hold & Move" progress, clipped by the water plane; the cut band feeds a 2D wave sim →
    rings on the red water. Full teardown + recipe in `hand-interaction.md`.
- **Assets:** Draco `.bin` geometry per scene (`assets/geometry/story/...`), animation curves as JSON
  (`wind-curves.json`, `portal-wind-curves.json`), Lottie loader, voice-over timestamps JSON, gain-map HDR encoder/decoder.
- **Device handling:** GPU tier detection, DPR uniforms, "Please rotate your device" prompt on unsupported aspect,
  `unsupported.html` for old browsers (optional chaining eval check).

## What to steal (and what the template already does)

| Santioni | Template equivalent |
|---|---|
| Hatching NPR model | `materials/ink.frag` (procedural lines, same math) |
| Stepped-time boil | `floor(uTime*8)/8` in ink + composite |
| Mouse fluid mask | `fx/PointerTrail.ts` (lite) → full NS in shader-recipes §7 |
| Paper grain scrolled with page | `composite.frag` grain with `uScroll` |
| DOM defines chapter length | `data-height` sections + `Story.ts` |
| Ink panel transitions | noise wipe with ink edge in composite |
| PBR product chapter contrasting the stylized story | `ProductScene.ts` |
| Tuning GUI | `?debug` lil-gui |

## Lessons

- The whole identity comes from ONE shading model applied consistently to every object.
- Realistic PBR is reserved for the product → the product literally stands out.
- Criticism: conversion friction and visual overload. Always pair spectacle with a fast path to buy.
