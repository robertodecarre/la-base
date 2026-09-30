// Ink / comic hatching — fragment
// Technique (as used by Active Theory on santionispirits.com):
//   1. Lambert term N·L gives a lighting value.
//   2. Hatch lines (-1..1) are ADDED to the lighting value before thresholding,
//      so the shadow terminator becomes a jagged, hand-inked edge.
//   3. Two thresholds -> 3 flat tones (ink, base color, highlight). No gradients.
//   4. Lines fade out where it's bright and break into dots via noise.
//   5. Time is quantized (floor(t*8)/8) so everything "boils" like hand-drawn frames.
// aastep() gives resolution-independent anti-aliased edges via screen derivatives.
uniform float uTime;
uniform vec3 uLightDir;      // view space
uniform vec3 uInk;
uniform vec3 uColor;
uniform vec3 uHighlight;
uniform vec2 uThreshold;     // (mid, high) terminators
uniform float uLineFreq;     // hatch density
uniform float uBoil;         // 0 = static lines, 1 = boiling

varying vec3 vNormalV;
varying vec2 vHatchUv;
varying float vDepth;

float aastep(float threshold, float value) {
  float afwidth = length(vec2(dFdx(value), dFdy(value))) * 0.70710678118654757;
  return smoothstep(threshold - afwidth, threshold + afwidth, value);
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

void main() {
  float stepped = floor(uTime * 8.0) / 8.0 * uBoil;
  vec3 n = normalize(vNormalV);

  vec2 huv = vHatchUv * uLineFreq;
  huv.x -= stepped * 0.3;
  float jitter = noise(huv * vec2(0.15, 2.0) + stepped) * 0.8;   // wobbly, hand-drawn lines
  float lines = sin((huv.y + jitter) * 6.2831853);               // -1..1

  float lighting = dot(n, normalize(uLightDir));
  float lightMask = max(0.0, lighting);

  float mid  = aastep(uThreshold.x, lighting + lines * 0.45);
  float high = aastep(uThreshold.y, lighting + lines * 0.10);

  float masked = lines + lightMask;
  masked += noise(huv * 3.0) * lightMask + lighting * 0.3;
  masked = aastep(0.2, masked);

  vec3 color = mix(uInk, uColor, mid);
  color = mix(color, uHighlight, high);
  color = mix(uInk, color, masked);

  // Rim ink line (silhouette-ish outline without a second pass)
  float rim = 1.0 - abs(n.z);
  color = mix(color, uInk, aastep(0.72, rim + lines * 0.05));

  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
