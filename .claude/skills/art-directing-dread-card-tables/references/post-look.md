# Pipeline de post (el "look" en dos pasadas)

Implementación: `examples/mesa/src/post.ts`. Uniforms tuneables por URL en la demo: `?u_uSnapEdge=0.15&u_uBloom=0`.

## Pasada 1 — baja resolución (720 p alto por defecto; 360 p sólo como estilo extremo, 480 en tier bajo)

Feedback real: a 360 p con Bayer 0.6 el usuario lo encontró demasiado pixelado e ilegible. Default: 720 p, Bayer 0.3, 24 niveles.


La escena se renderiza a un RT HalfFloat de ~640×360 **con mipmaps** (se reusan para el bloom).

1. **Tone map ACES** (`uExposure` 1.4) y pasar a espacio de display.
2. **Brillos**: posterizado suave `uLevels` 10 + Bayer 4×4 (`uDither` 0.6) → textura Buckshot.
3. **Oscuros**: snap al color más cercano de `DARK_SNAP` (6 colores de paleta) — **el truco de Inscryption**.
   Mezcla por `smoothstep(uSnapEdge±0.06, lum + bayer*0.08)` para que el borde sea dither, no una línea.
4. **Duotono de evento** (Horripilant): gradient map `[sombra, luz]` mezclado con `uDuo` 0→1→0 en 1–2 s.

## Pasada 2 — resolución completa

1. Upscale **nearest** del RT bajo (pixeles grandes y nítidos; `image-rendering: pixelated` en el canvas).
2. **Bloom de mips**: `max(textureLod(scene, uv, 2/3.5/5) − umbral, 0)` con umbrales **en HDR lineal** (1.5/1.2/1.0).
   Sólo bombita, velas y LEDs. En alta resolución encima del pixelado (Inscryption / Celeste).
3. **Aberración cromática** radial 0.006 (más fuerte en bordes); pico breve en el reveal.
4. **Viñeta** 1.1, **grano** 0.05 que "hierve" a 12 fps.

## Calibración (hacerla SIEMPRE con la escena real, no con un cubo)

1. Capturar `?raw=1` y con post al mismo `t`. Todo lo que se lee en raw tiene que leerse con post.
2. Si **máscaras/manos desaparecen**: están bajo `uSnapEdge`. Subir el rebote del paño (uplight) o bajar el umbral
   (0.12 funcionó en la demo; 0.2 se comió los avatares). Nunca "arreglarlo" con emisivo en la ropa.
3. Si el **paño se ve crema**: la lámpara está muy fuerte (en la demo 55 → 11). El paño es medio-oscuro oliva;
   lo más brillante de la escena tienen que ser las **caras de las cartas**.
4. Si el **bloom lava todo**: el umbral está en valores LDR sobre un RT HDR. Umbrales ≥1.0 lineal.
5. Legibilidad: con "apuntar" (FOV 24) el índice de una carta del otro lado tiene que leerse.

## Accesibilidad

Opción "reducir destellos" (y respetar `prefers-reduced-motion`): duotono máx. 0.4 y sin pico de CA en el reveal.

## Presupuestos

- 1 luz con sombra, 3 pasadas totales (escena, low, final), sin MSAA (el pixelado lo reemplaza), DPR 1.
- Tier bajo: 270 p, sin bloom, sin sombra de la lámpara (blob bajo cada carta).
- Ver `building-immersive-3d-websites → references/performance-a11y.md` para FPS governor y tiers.
