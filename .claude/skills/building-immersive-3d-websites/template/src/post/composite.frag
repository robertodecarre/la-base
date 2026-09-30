// Final composite: scene transition + pointer trail + print grain + vignette.
// Everything "post" happens in ONE full-screen pass — cheaper than chaining passes.
uniform sampler2D tA;          // current scene
uniform sampler2D tB;          // next scene
uniform sampler2D tTrail;      // PointerTrail: r = mask, gb = velocity
uniform float uMix;            // 0 -> A, 1 -> B
uniform float uTime;
uniform float uScroll;         // normalized scroll, scrolls the grain with the page
uniform vec2 uResolution;
uniform float uGrain;
uniform float uTrailStrength;
uniform vec3 uWipeColor;

varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; } return v; }

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);

  // Pointer trail: refract the image along the trail velocity
  vec3 trail = texture2D(tTrail, uv).rgb;
  vec2 vel = trail.gb * 2.0 - 1.0;
  uv -= vel * trail.r * 0.03 * uTrailStrength;

  vec3 a = texture2D(tA, uv).rgb;
  vec3 b = texture2D(tB, uv).rgb;

  // Noise wipe transition with an ink-colored burning edge (stepped for a hand-made feel)
  float stepped = floor(uTime * 8.0) / 8.0;
  float n = fbm(uv * aspect * 3.0 + stepped * 0.1);
  float edge = uMix * 1.2 - 0.1;
  float reveal = smoothstep(edge - 0.02, edge + 0.02, n);   // 1 where A stays
  float border = (1.0 - smoothstep(0.0, 0.03, abs(n - edge))) * step(0.001, uMix) * step(uMix, 0.999);
  vec3 color = mix(b, a, reveal);
  color = mix(color, uWipeColor, border);

  // Trail tint (subtle)
  color += trail.r * 0.04 * uTrailStrength;

  // Print grain that travels with scroll (reads as paper, not TV static)
  vec2 guv = vUv * aspect * 4.0;
  guv.y += uScroll * 1.5;
  float g = hash(floor(guv * uResolution.y * 0.25) + stepped);
  color *= mix(1.0, 0.85 + g * 0.3, uGrain);

  // Vignette
  vec2 q = vUv - 0.5;
  color *= 1.0 - dot(q, q) * 0.6;

  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
