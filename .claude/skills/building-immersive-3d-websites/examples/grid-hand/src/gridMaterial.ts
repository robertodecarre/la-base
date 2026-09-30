import * as THREE from "three";

/**
 * Wireframe-grid material for a SkinnedMesh (works on any mesh).
 *
 * Two line sources, chosen by `mode`:
 *  - "rest": grid computed from the BIND-POSE position (attribute `position`,
 *    before skinning). Lines are glued to the skin and deform with the rig,
 *    and it doesn't depend on topology or UVs. Triplanar pick by rest normal.
 *  - "bary": real mesh edges via a barycentric attribute (needs a
 *    non-indexed geometry, see buildBarycentric). With `aHide` the quad
 *    diagonals are hidden, giving the clean "quad grid" look.
 *
 * Three.js turns on USE_SKINNING for ShaderMaterial automatically when the
 * object is a SkinnedMesh, so the skinning chunks work as-is.
 */
export type GridMode = "rest" | "bary";

const VERTEX = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
uniform vec4 uPlane;
varying vec3 vRest;
varying vec3 vRestNormal;
varying vec3 vNormalW;
varying vec3 vViewW;
varying float vPlaneDist;
#ifdef MODE_BARY
attribute vec3 aBary;
attribute vec3 aHide;
varying vec3 vBary;
#endif

void main() {
  vRest = position;
  vRestNormal = normal;
  #ifdef MODE_BARY
  vBary = aBary + aHide * 4.0; // hidden edge: its component never reaches 0
  #endif
  #include <skinbase_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec4 world = modelMatrix * vec4(transformed, 1.0);
  vPlaneDist = dot(world.xyz, uPlane.xyz) + uPlane.w;
  vNormalW = normalize(mat3(modelMatrix) * objectNormal);
  vViewW = cameraPosition - world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uDensity;
uniform float uThickness;
uniform float uReveal;
uniform float uRevealMin;
uniform float uRevealMax;
uniform vec3 uRevealAxis;
uniform float uTime;
varying vec3 vRest;
varying vec3 vRestNormal;
varying vec3 vNormalW;
varying vec3 vViewW;
varying float vPlaneDist;
#ifdef MODE_BARY
varying vec3 vBary;
#endif

// 1 on the line, 0 elsewhere; width in pixels via fwidth (crisp at any distance).
float gridLines(vec2 p) {
  vec2 g = abs(fract(p - 0.5) - 0.5) / (fwidth(p) * uThickness);
  return 1.0 - min(min(g.x, g.y), 1.0);
}

void main() {
  #ifdef MODE_BARY
  vec3 d = vBary / (fwidth(vBary) * uThickness);
  float line = 1.0 - min(min(min(d.x, d.y), d.z), 1.0);
  #else
  vec3 p = vRest * uDensity;
  vec3 w = pow(abs(normalize(vRestNormal)), vec3(4.0));
  w /= (w.x + w.y + w.z);
  float line = gridLines(p.yz) * w.x + gridLines(p.xz) * w.y + gridLines(p.xy) * w.z;
  #endif

  vec3 n = normalize(vNormalW);
  vec3 v = normalize(vViewW);
  float fres = pow(1.0 - abs(dot(n, v)), 2.0);

  // Faces seen from behind (the far side of the hand) stay dimmer: depth
  // reading without needing a depth buffer.
  float facing = gl_FrontFacing ? 1.0 : 0.35;

  // Past the membrane the hand fades; at the intersection it glows.
  float beyond = smoothstep(0.0, -0.04, vPlaneDist);
  float fringe = 1.0 - smoothstep(0.0, 0.012, abs(vPlaneDist));

  // "Draw-on" reveal along the arm (rest-pose axis), scrubbed by progress.
  float along = clamp((dot(vRest, uRevealAxis) - uRevealMin) / (uRevealMax - uRevealMin), 0.0, 1.0);
  float reveal = smoothstep(along - 0.08, along, uReveal);
  // Scan pulse travelling along the arm.
  float pulse = smoothstep(0.03, 0.0, abs(fract(along - uTime * 0.25) - 0.5) - 0.47);

  float a = line * (0.55 + fres * 1.2) * facing;
  a *= mix(1.0, 0.18, beyond);
  a = a * reveal + fringe * 1.5 + pulse * line * 0.8;
  a += fres * 0.06 * reveal; // faint "skin" volume
  gl_FragColor = vec4(uColor * a, a);
}
`;

export function createGridMaterial(mode: GridMode): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    defines: mode === "bary" ? { MODE_BARY: "" } : {},
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color("#3fd0ff") },
      uDensity: { value: 90 },
      uThickness: { value: 1.1 },
      uPlane: { value: new THREE.Vector4(0, 0, 1, 10) },
      uReveal: { value: 1 },
      uRevealMin: { value: 0 },
      uRevealMax: { value: 1 },
      uRevealAxis: { value: new THREE.Vector3(0, 0, 1) },
      uTime: { value: 0 },
    },
  });
}

/** Material for the "HandInfo" pass: writes only the intersection band with the membrane (R). */
export function createHandInfoMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: /* glsl */ `
      varying float vPlaneDist;
      void main() {
        // Wide band on purpose: at 256² texels a band as thin as the visible
        // glow barely covers a few pixels and the sim never "feels" the hand.
        float fringe = 1.0 - smoothstep(0.0, 0.06, abs(vPlaneDist));
        gl_FragColor = vec4(fringe, 0.0, 0.0, 1.0);
      }
    `,
    side: THREE.DoubleSide,
    uniforms: { uPlane: { value: new THREE.Vector4(0, 0, 1, 10) } },
  });
}
