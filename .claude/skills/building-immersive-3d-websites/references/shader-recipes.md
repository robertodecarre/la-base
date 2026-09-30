# Shader Recipes (GLSL, three.js ShaderMaterial)

Conventions: `ShaderMaterial` (three injects matrices, `position`, `normal`, `uv`, and `USE_INSTANCING`).
End fragment shaders that write to the screen with `#include <colorspace_fragment>`.
Colors passed as `THREE.Color` are linear; three handles sRGB output.
With `InstancedMesh` + custom vertex shader ALWAYS apply `instanceMatrix` (see §0).

## 0. Utilities (paste as needed)

```glsl
// Anti-aliased step: crisp but not jagged at any resolution (screen-space derivatives)
float aastep(float t, float v) { float w = length(vec2(dFdx(v), dFdy(v))) * 0.7071; return smoothstep(t - w, t + w, v); }
// Remap
float range(float v, float a, float b) { return clamp((v - a) / (b - a), 0.0, 1.0); }
// Hand-drawn "boil": quantize time to 8 fps
float stepped(float t) { return floor(t * 8.0) / 8.0; }
// Value noise / fbm
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a*noise(p); p *= 2.0; a *= 0.5; } return v; }
// Instancing in a custom vertex shader
#ifdef USE_INSTANCING
  pos = (instanceMatrix * vec4(pos, 1.0)).xyz;  nrm = mat3(instanceMatrix) * nrm;
#endif
// Fresnel
float fresnel(vec3 n, vec3 v, float p) { return pow(1.0 - clamp(dot(n, v), 0.0, 1.0), p); }
```
Never write `smoothstep(big, small, x)` (undefined); use `1.0 - smoothstep(small, big, x)`.
For simplex/curl noise use `lygia` (`npm i lygia`, `#include "lygia/generative/snoise.glsl"` via vite-plugin-glsl).

## 1. Comic ink / hatching (Santioni technique) — template: `src/materials/ink.*`

1. `lighting = dot(N, L)`; 2. `lines = hatch(-1..1)` from a rotated object-space coord (or a tiling
lines texture); 3. **add** lines to lighting before thresholding → hand-inked terminator;
4. two thresholds → ink / base / highlight flat tones; 5. lines fade in light areas and break into dots via
noise; 6. `stepped(time)` offsets → boil. Extras used by Active Theory: AO attribute subtracts from lighting,
distance-compensated line frequency, vertical gradient, `discard` above/below screen bands to fake panel borders.
Tweak: `uLineFreq` 6–20, thresholds (0.15, 0.65), line angle per object for variety.

## 2. Toon / cel shading + outline

```glsl
float d = dot(normalize(vNormal), normalize(uLightDir));
float band = d > 0.6 ? 1.0 : d > 0.1 ? 0.6 : 0.3;          // or texture2D(tRamp, vec2(d*.5+.5, .5)).r
vec3 col = uColor * band + fresnel(n, v, 3.0) * uRim;
```
Outline (inverted hull): clone mesh, `material = new MeshBasicMaterial({ color: ink, side: BackSide })`, in vertex
shader `pos += normal * uThickness`. Post alternative: Sobel on depth+normal buffers (costlier, cleaner).

## 3. Stepped / "on twos" animation for any look

Quantize time AND vertex noise: `float t = stepped(uTime); pos += normal * noise(pos.xy*3.+t) * 0.02;`.
Also quantize DOM animations: GSAP `ease: "steps(12)"` for matching feel.

## 4. SDF masks (comic panels, rounded frames, reveals)

Santioni clips each "floating frame" by testing NDC against 4 projected corners (isLeft edge test) and `discard`.
Generic rounded-rect SDF in screen space:
```glsl
float sdRoundBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q,0.)) + min(max(q.x,q.y),0.) - r; }
vec2 p = (gl_FragCoord.xy / uRes - 0.5) * vec2(uRes.x/uRes.y, 1.0);
float d = sdRoundBox(p - uCenter, uSize * uReveal, 0.03);
if (d > 0.0) discard;                 // mask
float border = 1.0 - aastep(0.004, abs(d));   // ink border line
```
Animate `uReveal` 0→1 with progress; add `noise(p*20.+stepped(t))*0.01` to `d` for a hand-drawn edge.

## 5. Noise dissolve / burn (object appear/disappear)

```glsl
float n = fbm(vUv * 6.0);
float edge = uProgress * 1.2 - 0.1;
if (n < edge) discard;
float burn = 1.0 - smoothstep(0.0, 0.05, n - edge);
gl_FragColor.rgb = mix(col, uBurnColor * 3.0, burn);   // HDR edge → bloom picks it up
```
Use world/object position instead of UV for seam-free dissolves on complex meshes.

## 6. Glass / liquid (product shots)

Easiest high quality: `MeshPhysicalMaterial({ transmission: 1, thickness, roughness: .05, ior: 1.5, clearcoat: 1, attenuationColor, attenuationDistance })`
+ `scene.environment = pmrem.fromScene(new RoomEnvironment())` or an HDR (`RGBELoader`/`UltraHDRLoader`).
R3F: drei `MeshTransmissionMaterial` (chromatic aberration, backside, samples).
Custom (Santioni `GlassLiquidPBR`): refract view dir `refract(-V, N, 1.0/1.5)`, sample a screen-space background
texture with LOD blur (`textureLod` across mips), fresnel 4.0, liquid fill level by `step(fill, localPos.y)`, wobble
the fill plane with damped velocity uniforms (`uWobbleX/Z`) driven by object motion.

## 7. Pointer trail / fluid

Template `src/fx/PointerTrail.ts`: 1/4-res ping-pong FBO, self-advected, dissipation 0.96, splat carries velocity.
Composite samples it to distort UVs (`uv -= vel * mask * 0.03`), tint, or reveal a second image
(`mix(a, b, smoothstep(.2,.6,mask))`). For real fluids (Santioni uses a full Navier-Stokes: advection, divergence,
pressure (Jacobi 20–40 iters), gradient subtract, vorticity/curl) port Pavel Dobryakov's WebGL-Fluid-Simulation
(MIT) into ping-pong targets at 1/4–1/8 res.

## 8. GPGPU particles (morphing shapes, swarms)

`GPUComputationRenderer` (three/examples/jsm/misc): position texture (RGBA float, size √N), velocity texture.
Position shader: `vel += curlNoise(pos*0.3 + t*0.1)*0.02 + (target - pos)*uAttract; pos += vel;`.
Targets = sampled mesh surface (`MeshSurfaceSampler`) → morph between shapes by lerping target textures with progress.
Render with `THREE.Points` + `ShaderMaterial` reading `texture2D(tPos, reference).xyz`; size attenuation
`gl_PointSize = uSize * uDpr / -mvPos.z`; soft round sprite `1.0 - smoothstep(0.3, 0.5, length(gl_PointCoord - .5))`.
Additive blending for glow; depthWrite false. Counts by tier: 16k / 65k / 262k.

## 9. Dither / retro post

```glsl
float bayer4(vec2 p) { ivec2 i = ivec2(mod(p, 4.0)); int idx = i.x + i.y*4;
  float m[16] = float[](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.); return m[idx]/16.; }
vec2 px = floor(gl_FragCoord.xy / uPixel);              // pixel size 2–4
float l = dot(texture2D(tScene, px*uPixel/uRes).rgb, vec3(.299,.587,.114));
vec3 col = mix(uDark, uLight, step(bayer4(px), l));
```

## 10. Grain, vignette, chromatic aberration (composite)

Template `composite.frag`: grain that scrolls with page (reads as paper), vignette `1 - dot(q,q)*0.6`.
CA: sample r/g/b at `uv ± dir * 0.002 * length(q)`. Keep grain ≤0.35 strength; animate grain seed with stepped time.

## 11. Text in WebGL (only when it must deform/live in 3D)

MSDF text (13.7% of surveyed sites): `troika-three-text` (drei `<Text>`), or generate atlases with
`msdf-bmfont-xml`. MSDF median: `float sd = median(s.r,s.g,s.b); alpha = aastep(0.5, sd);` — allows dissolves
(`uDissolveOut`) and per-glyph translate-in like Santioni's `TextAnimatedShader`. Keep a DOM copy for a11y (`sr-only`).

## 12. Environment tricks

- Fog matching background color hides far clipping and adds depth.
- Fake god rays: additive cone mesh with `pow(1.-vUv.y, 2.) * noise` alpha (Santioni `LightBeamShader`).
- Shadows: bake into textures or use a blurred "blob" plane (cheap contact shadow) instead of real-time shadow maps.
- Background: full-screen gradient/noise plane (`depthWrite:false`, renderOrder -1) instead of skybox.

## 13. Post-processing stack (if not using the single composite)

`postprocessing` (pmndrs) > three's EffectComposer for performance (merges effects into one pass).
Typical: Bloom (mipmapBlur, threshold 0.8) → ToneMapping(AgX/ACES) → Noise → Vignette → SMAA. Skip on tier 0.
