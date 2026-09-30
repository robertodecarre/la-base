# Story mechanics: camera sweep, choices, gates, sound, product reveal, QA

Proven on a 7-chapter comic-ink cybersecurity story (ARGOS vs HIDRA) built on the template.

## Camera: one sweep for the whole film
- Map a single camera parameter to **global** page progress so every chapter continues it (e.g. pitch
  −80° bird's-eye → +65° worm's-eye). Pass `global` in FrameState; compute it against a marker
  (`[data-pitch-end]`) if an epilogue shouldn't be part of the sweep.
- Build each scene in **depth layers** (near silhouettes, mid subject, far set) — the sweep reads as parallax.
- `orbit(camera, target, dist, pitch, yaw)` helper; for worm's-eye shots put the camera near the floor and
  aim by pitch instead (orbiting below a ground plane clips).
- **Few camera moves, each ONE-WAY.** Inside one chapter, one or two continuous moves read as intention; a
  tour of shots reads as noise, and a path that approaches → backs off → approaches again (e.g. passing the
  subject, overshooting the screen, pulling back for the layout) reads as indecision. Proven for a
  "screen → room → product" epilogue:
  ① ZOOM OUT only: glass (digits, RGB sub-pixels) → straight back until the **key image on the screen is
  fully framed and HELD** (the digit-eye; widen the FOV during the hold instead of backing into the character's
  head sitting ~60 cm from the screen) → overhead of the hands typing (arms entering from the bottom, like
  stock "typing" photos) → the room.
  ② ZOOM IN only: room → one straight line through the character (ink dissolve) → product shot; widen the
  lens on the way (FINAL_FOV) so the final position doesn't need to back off.
  Delay content changes on the screen (dashboard reveal) until after the held image has been seen.
- **Check every camera key against scene geometry** (camera inside a head = a black frame). Capture a frame
  at each key time with `tools/shot.mjs`.
- **Don't let contrast tweaks erase motifs**: when darkening a region (a pupil), keep its texture (digits at
  ~30% instead of 0%) — the motif is the point.
- **Lens shift for layout**: `camera.setViewOffset(w, h, -w*0.2, 0, w, h)` moves the subject beside the DOM copy
  **without changing the viewing angle** (moving the object instead changes reflections/perspective and it
  drifts behind the text).

## Choices that nudge what follows
- One shared `THREE.Color` accent referenced by every material (`mat.color = accent` — constructors *copy*
  colours, so assign after construction); `accent.lerp(target, 1-exp(-dt*3))` each frame recolours everything.
- Mirror in DOM: `--accent` + `html[data-target]` / `html[data-verdict]`; copy variants via
  `[data-when="x"]{display:none}` + attribute selectors. Also feed choices into content (dashboard rows, audio motifs).

## Interaction gates (scroll waits for the visitor)
- Clamp **downward** scroll only: on Lenis `scroll`, if past the first closed gate →
  `lenis.scrollTo(limit, {immediate:true, force:true})`. Never `lenis.stop()` (freezes the page, can't go back).
- Each gate: section, `at` (progress), `isOpen()`, hint text, `onEngage` (focus the control). Show a fixed hint.
- The HUD CTA must bypass every gate (conversion fast path). Gate controls must work with keyboard.
- Patterns that worked: pick-one choice buttons, **hold-to-reveal** (pointer + Space/Enter, fills 0..1, drains
  when released), **terminal command** with Tab autocomplete, hint after 5 s, "Skip", easter-egg commands.
- Narrative logic check: interactions must not contradict the copy ("never sleeps" + "hold to wake" ✗ →
  hold to *open the manga panel* on an eye that was open all along ✓).

## Comic DOM kit
Caption boxes (paper, 3px ink border, offset shadow), balloons with CSS tail, SFX words (`-webkit-text-stroke`
+ `paint-order: stroke fill`), halftone strips (`radial-gradient` dots), `[data-at="a,b"]` slices toggled by a
ScrollTrigger per section. Positioning uses `translate`, animation uses `transform`/`scale` — never both on
the same property (keyframes on `translate` break `translate:-50%` centring).

## Generative adaptive score (no audio files)
Web Audio: look-ahead sequencer (25 ms timer, 150 ms horizon, 16ths), convolver hall from decaying noise,
compressor. Instruments: taiko = sine 150→42 Hz drop + filtered noise; choir = 3 detuned saws/note through
formant band-passes (750/1150/2800 Hz) + vibrato; brass = saws with a fast-opening low-pass; wind = looped
noise through an LFO'd band-pass. Per-chapter layer mix eased toward targets; choices change motif/harmony;
big synced `hit()`s on key moments. Start only from an "enter with sound" gate (autoplay policy).

## Product reveal on a screen inside the scene
- Dashboard drawn in a 1600×900 canvas (`CanvasTexture`, redraw ≈11 fps), themed with the visitor's story.
- Screen shader: binary digits (glyph atlas) → dashboard, dissolved per cell (`step(hash(cell), reveal)`);
  RGB sub-pixel mask when the camera is millimetres from the glass (zoom-out opener).
- Keep the world stylized and the **product the only realistic thing** — it pops. Side monitors must sit on
  the desk (desk width ≥ 2×|x| + projected half-width).

## QA gotchas
- Extension screenshots black / timing out → the Chrome window is occluded (`document.hidden === true`,
  rAF paused). Use `tools/shot.mjs` (headless Chromium + puppeteer-core) instead.
- Vite HMR serves changed modules as `…ts?t=123`; `import('/src/x.ts')` from the console gets a *different*
  module instance — import the exact URL from `performance.getEntriesByType('resource')`.
- Programmatic scroll jumps spike scroll velocity → velocity-driven effects (chromatic split) smear screenshots;
  wait before capturing.
- Synthetic `click()` doesn't grant user activation → AudioContext stays suspended; use a real click.
