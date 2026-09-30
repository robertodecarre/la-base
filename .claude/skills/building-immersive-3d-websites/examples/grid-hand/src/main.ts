import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildBarycentric } from "./barycentric";
import { createForearm } from "./forearm";
import { createGridMaterial, createHandInfoMaterial, type GridMode } from "./gridMaterial";
import { HandRig } from "./handRig";
import { Membrane } from "./membrane";

const params = new URLSearchParams(location.search);
const MODE: GridMode = params.get("mode") === "bary" ? "bary" : "rest";
const SHOW_DOTS = params.has("dots");
const FORCE_HOLD = params.has("hold");
const CURL_SCALE = Number(params.get("curl") ?? 1); // debug: ?curl=3 exaggerates flexion
const SIDE_VIEW = params.has("side"); // debug: side camera to check the pose
const HAND_SCALE = 5;
const MEMBRANE_Z = -0.4;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#070b1e");
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 50);
if (SIDE_VIEW) camera.position.set(3.4, 0.1, 0.3);
else camera.position.set(0, 0.35, 3.2);
camera.lookAt(0, 0, 0);

const membrane = new Membrane(renderer, MEMBRANE_Z);
scene.add(membrane.mesh);

const gltf = await new GLTFLoader().loadAsync("/hand.glb");
let skinned: THREE.SkinnedMesh | undefined;
gltf.scene.traverse((o) => {
  if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh;
});
if (!skinned) throw new Error("hand.glb has no SkinnedMesh");
const hand = skinned;

// --- Orient: fingers toward -Z (into the screen), palm down. -----------------
gltf.scene.updateMatrixWorld(true);
const jointPos = (name: string) => {
  const bone = hand.skeleton.bones.find((b) => b.name === name);
  if (!bone) throw new Error(`missing joint ${name}`);
  return bone.getWorldPosition(new THREE.Vector3());
};
const wrist = jointPos("wrist");
const forward = jointPos("middle-finger-tip").sub(wrist).normalize();
const palm = new THREE.Vector3()
  .crossVectors(jointPos("index-finger-metacarpal").sub(wrist), jointPos("pinky-finger-metacarpal").sub(wrist))
  .normalize();
const q1 = new THREE.Quaternion().setFromUnitVectors(forward, new THREE.Vector3(0, 0, -1));
const palmAfter = palm.clone().applyQuaternion(q1);
const q2 = new THREE.Quaternion().setFromUnitVectors(
  new THREE.Vector3(palmAfter.x, palmAfter.y, 0).normalize(),
  new THREE.Vector3(0, -1, 0),
);
const orient = new THREE.Group();
orient.quaternion.copy(q2).multiply(q1);
orient.scale.setScalar(HAND_SCALE);
orient.add(gltf.scene);
// Wrist at the pivot's origin (gltf.scene starts at 0,0,0 inside orient).
orient.updateMatrixWorld(true);
gltf.scene.position.copy(orient.worldToLocal(jointPos("wrist"))).negate();
orient.updateMatrixWorld(true);

// Palm direction and forward axis, now in world (with orient) and in the
// mesh's geometry space (to build the forearm and the reveal).
const palmWorld = palm.clone().applyQuaternion(orient.quaternion).normalize();
const forwardWorld = jointPos("middle-finger-tip").sub(jointPos("wrist")).normalize();
const toGeometry = new THREE.Matrix4().copy(hand.matrixWorld).invert();
const forwardGeo = forwardWorld.clone().transformDirection(toGeometry);
const palmGeo = palmWorld.clone().transformDirection(toGeometry);

// --- Forearm up to the edge of the screen (the model ends at the wrist) ----
const wristBone = hand.skeleton.bones.find((b) => b.name === "wrist");
if (!wristBone) throw new Error("missing joint wrist");
const forearm = createForearm(hand, wristBone, forwardGeo, palmGeo);
const armMeshes: THREE.SkinnedMesh[] = [hand, forearm];

// --- Materials -------------------------------------------------------------
if (MODE === "bary") for (const m of armMeshes) m.geometry = buildBarycentric(m.geometry);
const gridMaterial = createGridMaterial(MODE);
const infoMaterial = createHandInfoMaterial();
for (const m of armMeshes) {
  m.material = gridMaterial;
  m.frustumCulled = false; // the bounding box is from the bind pose, not the animated one
}

// Reveal along the arm: from the end of the forearm to the fingertips.
let min = Infinity;
let max = -Infinity;
const tmp = new THREE.Vector3();
for (const m of armMeshes) {
  const attr = m.geometry.getAttribute("position");
  for (let i = 0; i < attr.count; i++) {
    const d = tmp.fromBufferAttribute(attr, i).dot(forwardGeo);
    min = Math.min(min, d);
    max = Math.max(max, d);
  }
}
gridMaterial.uniforms.uRevealAxis.value.copy(forwardGeo);
gridMaterial.uniforms.uRevealMin.value = min;
gridMaterial.uniforms.uRevealMax.value = max;

// --- Dots on the vertices (CPU skinning, ~1.4k + 1.6k vertices) -----------
const dots: THREE.Points[] = [];
if (SHOW_DOTS) {
  for (const m of armMeshes) {
    const g = new THREE.BufferGeometry();
    const count = m.geometry.getAttribute("position").count;
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const points = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        color: "#b8f0ff",
        size: 0.012,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    points.frustumCulled = false;
    points.userData.source = m;
    m.add(points); // same space as the skinned vertices
    dots.push(points);
  }
}
function updateDots() {
  for (const points of dots) {
    const source = points.userData.source as THREE.SkinnedMesh;
    const attr = points.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < attr.count; i++) {
      source.getVertexPosition(i, tmp); // morph + skinning, in the mesh's local space
      attr.setXYZ(i, tmp.x, tmp.y, tmp.z);
    }
    attr.needsUpdate = true;
  }
}

// reach: the wrist stays on this side and only the fingers cross the membrane.
const rig = new HandRig(hand, palmWorld, camera, { rest: 1.3, reach: MEMBRANE_Z + 0.55 });
rig.curlScale = CURL_SCALE;
rig.pivot.add(orient);
scene.add(rig.pivot);

// --- Input: pointer on desktop, "Hold & Move" button on touch -----------------
const holdButton = document.getElementById("hold") as HTMLButtonElement;
addEventListener("pointermove", (ev) => {
  rig.setPointer((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
});
const startHold = (ev: PointerEvent) => {
  rig.holding = true;
  (ev.target as Element).setPointerCapture?.(ev.pointerId);
};
const endHold = () => (rig.holding = FORCE_HOLD);
renderer.domElement.addEventListener("pointerdown", startHold);
holdButton.addEventListener("pointerdown", startHold);
addEventListener("pointerup", endHold);
addEventListener("pointercancel", endHold);
rig.holding = FORCE_HOLD;

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  // Portrait: open the FOV so the hand doesn't get cropped.
  camera.fov = camera.aspect < 1 ? 40 + (1 - camera.aspect) * 30 : 40;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
dispatchEvent(new Event("resize"));

// --- Loop ------------------------------------------------------------------
const planeEq = new THREE.Vector4();
const timer = new THREE.Timer();
membrane.plane(planeEq);
gridMaterial.uniforms.uPlane.value.copy(planeEq);
infoMaterial.uniforms.uPlane.value.copy(planeEq);

renderer.setAnimationLoop((timestamp) => {
  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), 1 / 20);
  const t = timer.getElapsed();
  rig.update(dt, t);
  if (SIDE_VIEW) {
    // Debug: hand still, pointing along -Z with the palm down, seen in profile.
    rig.pivot.position.set(0, 0, 0.6);
    rig.pivot.rotation.set(0, 0, 0);
  }
  gridMaterial.uniforms.uTime.value = t;
  gridMaterial.uniforms.uReveal.value = Math.min(1, t * 0.5); // draw-on on load
  scene.updateMatrixWorld();
  updateDots();

  // HandInfo pass: only the intersection band, seen from the plane.
  for (const m of armMeshes) m.material = infoMaterial;
  for (const d of dots) d.visible = false;
  renderer.setRenderTarget(membrane.handTarget);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(rig.pivot, membrane.infoCamera);
  renderer.setRenderTarget(null);
  renderer.setClearColor(scene.background as THREE.Color, 1);
  for (const m of armMeshes) m.material = gridMaterial;
  for (const d of dots) d.visible = true;

  membrane.update();
  renderer.render(scene, camera);
});

// Debug hook for verification from the console.
Object.assign(window, { __demo: { rig, hand, forearm, membrane, renderer, infoMaterial, gridMaterial, THREE } });
