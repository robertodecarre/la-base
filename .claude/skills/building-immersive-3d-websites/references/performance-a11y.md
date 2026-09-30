# Performance, Accessibility, SEO & QA

## Budgets

| Metric | Desktop | Mid mobile |
|---|---|---|
| FPS | 60 | ≥ 30 stable (no jank on scroll) |
| Draw calls / frame | < 200 | < 80 |
| Triangles visible | < 1.5 M | < 300 k |
| DPR | ≤ 2 | ≤ 1.5 (tier 0: 1) |
| JS (gzip) | three ~190 kB + app < 150 kB | same |
| First load | < 5 MB | < 3 MB |
| LCP (DOM headline) | < 2.5 s | < 2.5 s |

Check with `renderer.info.render.calls / triangles`, `renderer.info.memory`, Chrome Performance panel, Lighthouse.

## Techniques

- Cap DPR by tier + runtime FPS governor (template `Quality.ts`), or drei `PerformanceMonitor`.
- Instancing (`InstancedMesh`/`BatchedMesh`) for repeated objects; merge static geometry (`mergeGeometries`).
- Render only the visible chapter(s); skip frames when tab hidden; stop render if nothing changes (static states).
- Half/quarter-res render targets for blur, fluid, trails.
- Avoid real-time shadows; bake or blob shadows. Avoid many lights; prefer env maps + 1 key light.
- Avoid transparent overdraw (big additive particles fill-rate bound on mobile).
- Precompile (`renderer.compile`) + upload textures (`renderer.initTexture`) during loading.
- Dispose geometries/materials/textures/targets when leaving a route.
- Avoid allocations in `update()` (reuse Vector3/Matrix4); GC spikes = scroll hitches.
- Heavy work (decoders, SDF/MSDF gen, physics) in workers.

## Mobile & iOS gotchas

- Use `svh/lvh/dvh`, not `vh`, for sticky heights; canvas at `100lvh` to avoid resize jumps when the URL bar hides.
- Don't resize the renderer on every mobile scroll-triggered `resize` (height-only changes): debounce or ignore < 150 px height deltas.
- Lenis `syncTouch: false` (native touch scroll) is more reliable on iOS.
- Low-power mode on iOS caps rAF to 30 fps — design animations delta-based.
- iOS Safari: max texture 4096, WebGL context limit, memory kills the tab silently at ~1–1.5 GB → keep VRAM low.
- Landscape prompts (Santioni shows "Please rotate your device" when the viewport is too narrow/wide) are a last resort; prefer responsive framing (FOV widening on portrait, template `SceneBase.resize`).

## Accessibility

- All meaningful content & CTAs in semantic DOM; canvas `aria-hidden="true"`.
- `prefers-reduced-motion`: Lenis lerp 1, no split reveals, no pointer trail, slower/no camera flights (template does this).
- Keyboard: nav/CTA focusable with visible `:focus-visible`; don't trap scroll; anchor links work (Lenis `scrollTo`).
- Contrast: DOM text over GL with `mix-blend-mode: difference` or a scrim; verify each chapter.
- Sound off by default, visible toggle with `aria-pressed`.
- Provide a skip link / "2D version" for heavy experiences.
- Age gates (alcohol) must still let search engines & screen readers read content.

## SEO

Real `<title>`, meta description, OG/Twitter images, headings hierarchy in DOM, JSON-LD for products/org,
content rendered in HTML (SSG) not injected only by JS. `noscript` message is not SEO.

## Fallbacks

- No WebGL2 → `.no-webgl` class, DOM story remains complete (template `main.ts`).
- Context lost → same.
- `?tier=0` path looks intentional (static images/posters instead of heavy scenes if needed).

## QA checklist (run before calling it done)

- [ ] `npm run build` passes (tsc strict) and `npm run preview` works
- [ ] Console: zero errors/warnings (deprecations too)
- [ ] Screenshot every chapter at start/middle/end of progress: 1440×900 and 390×844
- [ ] Fast scroll top→bottom→top: no pops, transitions reversible
- [ ] Resize/rotate mid-page: framing and progress correct
- [ ] `?tier=0`, reduced motion (DevTools emulation), WebGL disabled (chrome://flags or `?nogl` hook)
- [ ] Keyboard-only: reach CTA; focus visible
- [ ] Lighthouse: Perf ≥ 70 mobile (3D sites rarely hit 90), A11y ≥ 90, SEO ≥ 90
- [ ] Network throttled "Fast 4G": loader progresses, first frame < 3–4 s
- [ ] Throttled CPU 4×: FPS governor lowers DPR, stays usable


## Adaptive quality that doesn't wreck low-end devices (verified)

- **Tier from the GPU, not from "is mobile"**: read `WEBGL_debug_renderer_info` → `UNMASKED_RENDERER_WEBGL`
  (regex for weak: SwiftShader/llvmpipe/old Mali/Adreno ≤ 6xx/HD Graphics; strong: Apple/NVIDIA/Radeon/
  Adreno 64x+/Mali-G7x+/Iris Xe). `isMobile ⇒ tier 1` punished fast phones (DPR 3 phone rendered at 0.5× native).
- The tier only sets the START and fixed costs (MSAA, 8-bit vs half-float targets). **Same content on every
  tier** — instance counts are cheap; cost is per pixel.
- **Governor ladder ordered by visibility of loss**: render scale 2→1.75→…→1.0 → drop chromatic split →
  drop pointer trail. **Never below 1.0× CSS pixels** (ink lines and text blur). Step down when a 45-frame
  window averages > 22 ms; **probe up** after 3 windows ≤ 18 ms (60 Hz screens never report "fast" frames,
  so you must try), remember failed steps (~40 windows) to avoid oscillation.
- **How to verify** (`tools/perf.mjs <url> gpu|weak|phone`): headless Chromium per chapter, real fps via rAF
  and effective render scale = canvas.width / clientWidth / devicePixelRatio. `weak` = SwiftShader (software
  GL, far below any real GPU: a floor test), `phone` = 390×844 DPR 3 + 4× CPU throttle + mobile UA. `?perf`
  exposes `window.__perf = {fps, dpr, fx, tier, gpu}`. Compare before/after, plus crops for visible sharpness.
  Emulation isn't a real device: confirm on an actual low-end phone when possible.
