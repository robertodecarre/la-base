# Creative Direction for Immersive Sites

The survey's top sites share one trait: **a single strong metaphor rendered in one coherent visual
language**. Santioni = "sin & indulgence as a hand-inked comic epic". Tech is interchangeable; the idea isn't.

## 1. Brief questions (answer before code; infer if the user doesn't know)

1. What is being sold/communicated in one sentence? Who's the audience (luxury, gamers, B2B, kids)?
2. What should the visitor **feel** in 5 s, and **do** at the end (buy, contact, sign up, remember)?
3. What is the brand's existing visual identity (logo, colors, fonts, photography)? Any 3D models / product CAD?
4. Tone: playful · premium · technical · poetic · rebellious · institutional?
5. Primary device of the audience (B2C social traffic = mobile first!).
6. Budget of attention: 30-second hook or 3-minute journey?

## 2. From brief to concept

Formula: **[Product truth] + [Metaphor world] + [Interaction verb]**.

| Product truth | Metaphor world | Verb | Example concept |
|---|---|---|---|
| Cocktails = small guilty pleasures | Baroque comic of saints & sin | pour, tempt | Santioni (Active Theory) |
| Coffee roaster, origin story | Journey from volcano soil to cup, paper-cut layers | descend, brew | Chapters: soil → cherry → roast (glow) → cup (steam particles) |
| Fintech: money moves instantly | Liquid light flowing through a glass city | flow, route | GPGPU particle streams between glass towers |
| Architecture studio | Blueprint lines that "build" into rendered spaces | draw, construct | Line shader → PBR crossfade by progress |
| AI product | Neural field / swarm that reorganizes to user input | ask, organize | Particles form words/shapes on scroll |
| Kids / toys | Tiny diorama world, tilt-shift, bouncy physics | play, poke | Toon + Rapier physics, sound on collisions |
| Wine / terroir | Seasons over a vineyard | ripen | Same scene, time-of-day & season driven by progress |
| Personal portfolio | A room/desk/world you explore | explore | Bruno Simon-style playable scene + 2D fallback list |
| Non-profit / cause | Loss & recovery (color draining/returning) | restore | Desaturation shader reversed by scroll |
| Automotive | Wind tunnel / race | accelerate | Speed lines, motion blur, velocity from scroll |

Rules:
- **3–6 chapters.** Each chapter = one idea, one camera move, one headline (≤6 words).
- **Contrast between chapters** (stylized ↔ realistic, dark ↔ light, macro ↔ wide) keeps attention; Santioni alternates comic ink with PBR bottles.
- **Hook in the first viewport** (moving hero, reacts to pointer within 1 s).
- **Product moment** = realistic PBR, slow rotation, big type. Then a calm CTA chapter.
- Give the user a verb (drag, hold, pour, draw) at least once — interaction beats watching.

## 3. Visual languages (pick ONE)

| Look | Recipe (see shader-recipes.md) | Fits | Survey examples |
|---|---|---|---|
| Comic / engraving ink | Hatching N·L + stepped time + rim ink + grain | spirits, fashion, editorial, rebellious | santionispirits.com |
| Toon / anime cel | 2–3 step ramp, inverted-hull outline, flat sky gradients | youth, gaming, anime | sougen.co, summer-afternoon.vlucendo.com |
| Premium PBR studio | HDRI env, transmission glass, soft shadows, DOF | luxury products, watches, beauty | thewatch.60fps.fr, 25residences.com |
| Particles / point clouds | GPGPU FBO sim, curl noise, additive points | AI, tech, science, fintech | unseen.co/labs/cellular, giveahand.ai |
| Liquid / chrome / iridescent | Fresnel + env + thin-film, blob SDF raymarch | beauty, music, drinks | — |
| Dither / retro / pixel | Ordered Bayer dither post, low res RT, palette LUT | gaming, dev tools, crypto | — |
| Paper / diorama / papercraft | Flat colors, drop shadows, subtle paper normal, tilt-shift | kids, food, travel | aimee-wei-s-papercraft-world, mr-panda paper portfolio |
| Blueprint / line | Wireframe/edges shader, dashed lines, reveal to solid | architecture, engineering | — |
| Photoreal world | Baked lightmaps, fog, god rays | real estate, tourism | mont-saint-michel-3d, the-mongols exhibition |
| Abstract shader art | Full-screen fragment shader driven by scroll/pointer | agencies, events, music | shader.se, cineshader |

## 4. Typography & layout

- Display face with character (condensed serif, art-deco, grotesk extra-bold) + neutral body face. Fluid sizes with `clamp()`.
- Headlines huge (10–15vw), 2–6 words, uppercase often. Body copy short (≤40 words per chapter).
- Text in DOM with `mix-blend-mode: difference` stays legible over any GL frame.
- Split-text reveals (word/line masks, `expo.out`, 0.05 stagger). Don't animate every paragraph.
- Fixed minimal HUD: logo, 3 links, sound toggle, menu. CTA always one click away.

## 5. Motion language

- Easing: `expo.out` / `power4.out` for reveals, `easeInOut` cubic for scroll-scrubbed camera.
- Scroll smoothing: Lenis lerp 0.08–0.12. Pointer: damp λ≈4 (see `THREE.MathUtils.damp`).
- Stepped time (`floor(t*8)/8`) = hand-drawn "on twos" feel for illustrated looks; continuous time for premium/liquid.
- Idle motion everywhere (breathing, float, noise) so frames are never frozen.
- Sound (optional, off by default, toggle visible): ambient loop + 3–6 SFX tied to progress events (Santioni plays footsteps synced to a walk animation).

## 6. Copy tone

Short, declarative, confident. Brand voice > descriptions. Santioni: "Indulge now, atone later".
Write chapter headlines as a sequence that reads like a poem when scrolled.

## 7. Anti-patterns from real feedback

Santioni's Instagram comments (designers/marketers): "the best way to ruin conversion", "too many
things to buy a bottle", "the red overwhelms", and also "it's an artistic piece for a specific audience".
Lessons: keep a visible fast path to the goal (nav + CTA + optional "2D version" link like the
3D Shopify store in mesh3d's picks), cap intensity (one saturated accent, lots of neutral), loading
<3 s perceived, and match spectacle to audience.
