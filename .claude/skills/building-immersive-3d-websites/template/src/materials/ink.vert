// Ink / comic hatching — vertex
// Hatch coordinates come from a rotated object-space position so lines stick to the
// object (no "shower door" effect) but keep a consistent direction across the mesh.
uniform float uTime;
uniform vec3 uHatchAxis;
uniform float uHatchAngle;
uniform float uDisplace;

varying vec3 vNormalV;
varying vec2 vHatchUv;
varying float vDepth;

mat3 rotation3d(vec3 axis, float angle) {
  axis = normalize(axis);
  float s = sin(angle);
  float c = cos(angle);
  float oc = 1.0 - c;
  return mat3(
    oc * axis.x * axis.x + c,          oc * axis.x * axis.y - axis.z * s, oc * axis.z * axis.x + axis.y * s,
    oc * axis.x * axis.y + axis.z * s, oc * axis.y * axis.y + c,          oc * axis.y * axis.z - axis.x * s,
    oc * axis.z * axis.x - axis.y * s, oc * axis.y * axis.z + axis.x * s, oc * axis.z * axis.z + c
  );
}

void main() {
  vec3 pos = position;
  // Optional organic wobble, stepped like hand-drawn animation ("on twos")
  float stepped = floor(uTime * 8.0) / 8.0;
  pos += normal * sin(pos.y * 3.0 + stepped * 2.0) * uDisplace;
  vec3 objNormal = normal;
  // Hatch coords from LOCAL position so lines stick to each instance
  vHatchUv = (rotation3d(uHatchAxis, uHatchAngle) * pos).xy;

  // Custom ShaderMaterials must apply instanceMatrix themselves, otherwise every
  // instance of an InstancedMesh renders stacked at the origin.
  #ifdef USE_INSTANCING
    pos = (instanceMatrix * vec4(pos, 1.0)).xyz;
    objNormal = mat3(instanceMatrix) * objNormal;
  #endif

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  vNormalV = normalize(normalMatrix * objNormal);
  vDepth = -mv.z;
}
