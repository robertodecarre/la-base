# Assets Pipeline

~50–60% of surveyed sites ship compressed glTF (Draco 53%, KTX2 51%, Meshopt 49%). Target total first-load
payload ≤ 5 MB (hero chapter ≤ 2 MB); lazy-load later chapters.

## Sourcing models

1. Client CAD/product files → clean in Blender (decimate, merge, fix normals, UV unwrap).
2. Procedural in code (lathe, extrude, instancing) — fastest for abstract concepts; the template's bottle is a `LatheGeometry`.
3. Libraries: Poly Haven (CC0 models/HDRIs/textures), Sketchfab (check license), Quaternius / Kenney (CC0 stylized).
4. AI-assisted: generate concept images → Meshy/Tripo/Rodin image-to-3D → retopo/decimate in Blender. Always clean up.
Never ship assets without a license that allows it.

## Blender → glTF checklist

- Apply transforms (Ctrl+A), Y-up export, meters, origin where it should pivot.
- One material per look; name objects/materials meaningfully (code finds them by name).
- Bake: lighting/AO into a lightmap (UV2) or into base color for stylized looks; bake the Santioni-style `ao` vertex attribute via Color Attribute.
- Animations: NLA strips named; skinned meshes ≤ 4 influences, ≤ 60 bones.
- Export `.glb`, +Y up, apply modifiers, no cameras/lights unless used.

## Compression (glTF-Transform)

```bash
npx @gltf-transform/cli optimize in.glb out.glb --compress meshopt --texture-compress ktx2 --texture-size 2048
# alternatives: --compress draco (smaller geometry, slower decode); --simplify --simplify-ratio 0.5
npx @gltf-transform/cli inspect out.glb      # verify sizes, texture formats, draw calls
```
- Meshopt: fast decode, pairs with gzip/brotli on the server. Draco: smallest for dense static meshes.
- KTX2 (UASTC for normals/detail, ETC1S for color): stays compressed on the GPU → big VRAM savings on mobile.
- Loader setup: template `src/core/Assets.ts` (DRACOLoader + KTX2Loader.detectSupport + MeshoptDecoder). Self-host decoders for production (`/public/decoders`).

## Texture budgets

| Tier | Max texture | Total VRAM target |
|---|---|---|
| 0 (old phone) | 1024 | < 64 MB |
| 1 (mobile) | 2048 | < 128 MB |
| 2 (desktop) | 4096 (hero only) | < 512 MB |

Pack channels: ORM/MRO (AO, roughness, metalness) in one texture (Santioni `_txtMRO`). Noise/lines/blue-noise
tiles: 256–512 px, `RepeatWrapping`. Env maps: 1k–2k HDR → PMREM once at load.

## Fonts

woff2, subset to used glyphs (`pyftsubset` / glyphhanger), `font-display: swap`, preload the display font.
MSDF atlases for GL text generated at build time.

## Audio

AAC/MP3 128 kbps loops ≤ 1 MB; SFX short mono. Lazy-load after first interaction.

## Video textures

`VideoTexture` from muted, `playsinline`, looping mp4/webm (H.264 for iOS). ≤ 1080p, ≤ 4 Mbps.

## Delivery

Static hosting + CDN (Vercel/Netlify/Cloudflare), brotli, `Cache-Control: immutable` on hashed assets,
`<link rel="preload">` hero model/HDR. Keep `assetsInlineLimit: 0` in Vite so binaries stay cacheable files.
