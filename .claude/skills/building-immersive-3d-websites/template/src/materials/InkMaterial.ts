import * as THREE from 'three'
import vertexShader from './ink.vert'
import fragmentShader from './ink.frag'

export type InkOptions = {
  ink?: THREE.ColorRepresentation
  color?: THREE.ColorRepresentation
  highlight?: THREE.ColorRepresentation
  lineFreq?: number
  displace?: number
}

/** Comic / engraving NPR material. Share one instance per look; update uTime once per frame. */
export function createInkMaterial(opts: InkOptions = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uLightDir: { value: new THREE.Vector3(-0.6, 0.6, 0.8).normalize() },
      uInk: { value: new THREE.Color(opts.ink ?? '#121212') },
      uColor: { value: new THREE.Color(opts.color ?? '#c82924') },
      uHighlight: { value: new THREE.Color(opts.highlight ?? '#f3f1e9') },
      uThreshold: { value: new THREE.Vector2(0.15, 0.65) },
      uLineFreq: { value: opts.lineFreq ?? 9 },
      uBoil: { value: 1 },
      uHatchAxis: { value: new THREE.Vector3(0, 0.5, 2).normalize() },
      uHatchAngle: { value: -0.5 },
      uDisplace: { value: opts.displace ?? 0 },
    },
  })
}
