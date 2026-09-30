# Architecture

## Layers

```
index.html (DOM: copy, nav, CTA, sections with data-scene + data-height)   ← SEO, a11y, scroll length
  └─ main.ts: quality detect → Experience.init(manifest, sceneFactory) → start
       Experience (renderer, gsap.ticker loop, resize, visibility, context-loss)
         ├─ Scroll   (Lenis, autoRaf:false, driven by gsap.ticker; ScrollTrigger.update on scroll)
         ├─ Assets   (LoadingManager, GLTF + Draco + KTX2 + Meshopt → loader bar)
         ├─ Story    (DOM sections → {current, next, progress, mix})
         ├─ Scenes[] (SceneBase: own THREE.Scene + camera, update(FrameState))
         ├─ PointerTrail (ping-pong FBO)
         └─ Composite (A/B targets → wipe transition, trail distortion, grain, vignette → screen)
```

## Scroll → progress math (Story.ts)

Section i spans `[top, top+height]` in page px; its content is `position: sticky; height: 100svh`.
- Pinned phase: `progress = clamp((scrollY - top) / (height - vh))` → drive the chapter.
- Exit phase: `mix = clamp((scrollY - (top + height - vh)) / vh)` → next chapter wipes in.
- `data-height` (in viewport units) = how long a chapter lasts. 2–3 for rich chapters, 1 for a CTA.
- Re-measure on resize and after `document.fonts.ready` (layout shifts move offsets).

Choreograph inside a chapter with `range(progress, a, b)` (remap + clamp) and easings:
```ts
const intro = easeInOut(range(progress, 0.0, 0.3))   // first 30%
const turn  = easeInOut(range(progress, 0.3, 0.8))
camera.position.lerpVectors(A, B, intro); model.rotation.y = turn * Math.PI
```
Keyframed alternative for complex timelines: a paused `gsap.timeline()` and `tl.progress(progress)` each frame
(scrubbable, easing per tween), or Theatre.js (`sheet.sequence.position = progress * length`) for designer-authored cameras.

### Alternative: world-stacked layout (Santioni/Hydra style)
All scenes live in ONE world stacked vertically; camera.y = -lerpedScrollY * worldPerPx; each element
has `worldTop/worldBottom` and computes its own `scrollProgress = range(-scrollY, worldBottom - screenH, worldTop)`
plus visibility culling. Choose it when chapters must physically overlap/continue (a character walking down the page).
Choose per-scene render targets (template) when chapters have different looks/backgrounds/cameras.

## Render loop rules

- ONE clock: `gsap.ticker.add(tick)`; inside: `lenis.raf(ms)` → update scenes → render. `gsap.ticker.lagSmoothing(0)`.
- Clamp delta (≤1/20 s). Pause rendering on `visibilitychange` hidden and when canvas off-screen.
- Only render visible scenes; the transition renders two, never more.
- `renderer.compile(scene, camera)` for every scene during loading (no first-frame shader hitches).
- MSAA on render targets (`samples: 4` desktop), `antialias:false` on the canvas.
- Handle `webglcontextlost` → show DOM fallback.

## Transitions between chapters

In composite: noise wipe with an ink edge (template), or alternatives:
- Radial/iris wipe from pointer position: `step(length(uv - pointer) , mix * 1.5)`.
- Displacement blend: offset A's UVs by noise * mix, B's by noise * (1-mix).
- Pixel sort / dither dissolve: compare Bayer threshold with mix.
- Camera-continuous: no cut; move the camera through a portal mesh that renders the next scene (render-to-texture on a plane).

## Pointer & interaction

- Pointer normalized (-1..1) and damped; tilt models ±0.3 rad, parallax cameras ±0.5 units.
- Raycast only on click or throttled; use simplified proxy meshes (`layers`) for hit tests.
- Drag interactions (pour, rotate, draw): pointer events on the canvas region + `touch-action: none` on that element only.
- Hover cursor: DOM cursor follower (`transform: translate3d`, damped) — cheaper than GL.

## Audio

Howler (20% of surveyed sites) or WebAudio. Off by default; start only after a user gesture.
Ambient loop + SFX mapped to progress events (fire when crossing a threshold, store last-fired to avoid repeats).
Fade volume with chapter visibility. Respect a persisted mute choice (`localStorage`, try/catch).

## Loading

Budget: first meaningful frame ≤3 s on 4G. Show a DOM loader with real progress (LoadingManager).
Load chapter 1 assets first, start, then lazy-load later chapters (`assets.load(manifestForChapter)` when the previous chapter reaches progress 0.5).

## Routing / multi-page

Keep ONE persistent canvas across routes (Astro view transitions, Nuxt/Next layout, Barba). On route change:
dispose the old scene set, init the new, run a composite transition. Never recreate the renderer.

## React Three Fiber variant (when the project is React/Next)

```tsx
// npm i three @react-three/fiber @react-three/drei @react-three/postprocessing lenis gsap
<Canvas dpr={[1, quality.maxDpr]} gl={{ antialias: false, powerPreference: 'high-performance' }}
        style={{ position: 'fixed', inset: 0 }} frameloop="always">
  <Suspense fallback={null}><Chapters /></Suspense>
  <EffectComposer multisampling={4}><Noise opacity={0.06} /><Vignette /></EffectComposer>
  <Preload all />
</Canvas>
```
- Scroll: `lenis/react` `<ReactLenis root options={{ autoRaf: false }}>` + drive from gsap.ticker; read `lenis.scroll` inside `useFrame` (never setState per frame).
- drei helpers: `useGLTF` (+ `useGLTF.preload`), `useKTX2`, `Environment`, `MeshTransmissionMaterial`, `Text`(troika MSDF), `View` (multiple scenes in DOM rects), `ScrollControls` (simple cases only), `PerformanceMonitor` (adaptive DPR), `AdaptiveDpr`.
- Custom shaders: `shaderMaterial()` from drei + `extend`, or `three-custom-shader-material` to extend MeshStandardMaterial with lighting intact.
- Versions (Sep 2026): R3F 9.8 (React 19), drei 10.7, three 0.186.

## WebGPU / TSL (optional)

`import * as THREE from 'three/webgpu'` + `import { ... } from 'three/tsl'`; `new THREE.WebGPURenderer()`,
`await renderer.init()`. It falls back to a WebGL2 backend automatically. Node materials (TSL) replace GLSL strings;
compute shaders make 1M-particle sims easy. Use when the concept needs compute; otherwise WebGL2 + GLSL is simpler and
has more examples. Don't mix `ShaderMaterial` GLSL with WebGPURenderer.

## CMS / content

Keep copy in DOM/HTML or a JSON the page renders at build time (Santioni: Sanity CMS JSON inlined as
`<script type="application/json">`). Scenes read colors/labels from the same data.

## Debug tooling

`?debug` → lil-gui/Tweakpane for uniforms, `r3f-perf` or `stats-gl`, `renderer.info` (calls, triangles, textures).
`?tier=0` to test low-end paths on desktop. Spector.js for frame capture.
