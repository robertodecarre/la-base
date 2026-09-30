import * as THREE from "three";

/**
 * "Hold & Move" controller, Santioni style (see class Hand in their bundle):
 *  - progress: 0 → 1 while held, 1 → 0 on release (damp).
 *  - The hand's pivot chases the pointer unprojected to a depth that
 *    grows with progress (reaching forward). Santioni: distHand 2.5 → 3.5.
 *  - The pose goes from relaxed to reaching. Santioni scrubs frames 25→55
 *    of a clip with easeInSine(progress); here, with no clip, it's procedural.
 *  - Soft noise per finger (it's never frozen).
 *
 * FORWARD KINEMATICS BY HAND. The WebXR hand (and many "tracking" rigs) has
 * a FLAT skeleton: all 25 joints are siblings under `Armature`, each with
 * its absolute pose. Rotating a knuckle does NOT carry the next phalanges
 * along → the fingers break apart and the hand looks deformed/demonic.
 * Here each finger is treated as a chain: flexing joint i rotates the
 * segment i→i+1 and ALL the following segments, and the wrist rotates
 * the whole hand. In a hierarchical rig (Blender/Mixamo) this isn't
 * needed: rotating bone.quaternion is enough.
 *
 * ANATOMY: each joint flexes around its own axis = cross(segment,
 * palm direction), computed in the bind pose. The pinky always curls more
 * than the index, and the middle phalanx flexes most — that's what reads
 * as a relaxed human hand.
 */
type Finger = "thumb" | "index" | "middle" | "ring" | "pinky";

const FINGER_POSE: Record<Finger, { rest: number; reach: number; spread: number; cup: number }> = {
  thumb: { rest: 0.22, reach: 0.08, spread: 0, cup: 0 },
  index: { rest: 0.24, reach: 0.06, spread: -0.06, cup: 0 },
  middle: { rest: 0.32, reach: 0.1, spread: 0, cup: 0 },
  ring: { rest: 0.4, reach: 0.16, spread: 0.06, cup: 0.04 },
  pinky: { rest: 0.48, reach: 0.24, spread: 0.12, cup: 0.08 },
};
/** Flexion per joint of the chain (the tip doesn't flex). */
const JOINT_FACTOR: Record<Finger, number[]> = {
  // metacarpal, proximal, (intermediate), distal
  thumb: [0.35, 0.8, 0.6],
  index: [0, 1, 1.15, 0.7],
  middle: [0, 1, 1.15, 0.7],
  ring: [0, 1, 1.15, 0.7],
  pinky: [0, 1, 1.15, 0.7],
};
const CHAINS: Record<Finger, string[]> = {
  thumb: ["thumb-metacarpal", "thumb-phalanx-proximal", "thumb-phalanx-distal", "thumb-tip"],
  index: chain("index"),
  middle: chain("middle"),
  ring: chain("ring"),
  pinky: chain("pinky"),
};
const NOISE_AMPLITUDE = 0.035;
const HOLD_RATE = 3; // λ for damp: how fast progress rises/falls
const FOLLOW_RATE = 6;

function chain(finger: string): string[] {
  const p = `${finger}-finger`;
  return [`${p}-metacarpal`, `${p}-phalanx-proximal`, `${p}-phalanx-intermediate`, `${p}-phalanx-distal`, `${p}-tip`];
}

type FingerChain = {
  finger: Finger;
  bones: THREE.Bone[];
  bindPos: THREE.Vector3[]; // parent (Armature) space
  bindQuat: THREE.Quaternion[];
  segments: THREE.Vector3[]; // bindPos[i+1] - bindPos[i]
  flexAxes: THREE.Vector3[];
  seed: number;
};

export class HandRig {
  progress = 0;
  holding = false;
  /** Global flexion multiplier (debug: ?curl=3 exaggerates it to check the direction). */
  curlScale = 1;
  readonly pivot = new THREE.Group();
  private readonly pointer = new THREE.Vector2();
  private readonly target = new THREE.Vector3();
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private readonly chains: FingerChain[] = [];
  private readonly wrist: THREE.Bone;
  private readonly wristBindPos = new THREE.Vector3();
  private readonly wristBindQuat = new THREE.Quaternion();
  private readonly palm = new THREE.Vector3(); // Armature space
  private readonly wristFlexAxis = new THREE.Vector3();
  // Scratch (no allocations in the loop).
  private readonly accum = new THREE.Quaternion();
  private readonly wristRot = new THREE.Quaternion();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly pos: THREE.Vector3[] = Array.from({ length: 5 }, () => new THREE.Vector3());

  /**
   * @param palmWorld direction (world, bind pose) from the back of the hand toward the palm.
   *   Must be built with the hand in its bind pose and matrices up to date.
   */
  constructor(
    skinned: THREE.SkinnedMesh,
    palmWorld: THREE.Vector3,
    private readonly camera: THREE.Camera,
    private readonly depths: { rest: number; reach: number },
  ) {
    const byName = new Map(skinned.skeleton.bones.map((b) => [b.name, b]));
    const wrist = byName.get("wrist");
    if (!wrist?.parent) throw new Error("HandRig: missing wrist (or it has no parent)");
    this.wrist = wrist;
    this.wristBindPos.copy(wrist.position);
    this.wristBindQuat.copy(wrist.quaternion);

    // Palm direction in the space of the joints' parent (Armature).
    const parentWorld = wrist.parent.getWorldQuaternion(new THREE.Quaternion());
    this.palm.copy(palmWorld).applyQuaternion(parentWorld.invert()).normalize();

    for (const finger of Object.keys(CHAINS) as Finger[]) {
      const bones = CHAINS[finger].map((name) => {
        const bone = byName.get(name);
        if (!bone) throw new Error(`HandRig: missing joint ${name}`);
        return bone;
      });
      const bindPos = bones.map((b) => b.position.clone());
      const segments = bindPos.slice(0, -1).map((p, i) => bindPos[i + 1].clone().sub(p));
      this.chains.push({
        finger,
        bones,
        bindPos,
        bindQuat: bones.map((b) => b.quaternion.clone()),
        segments,
        flexAxes: segments.map((s) => new THREE.Vector3().crossVectors(s, this.palm).normalize()),
        seed: Math.random() * 10,
      });
    }
    const middle = byName.get("middle-finger-metacarpal");
    const forward = middle ? middle.position.clone().sub(wrist.position).normalize() : new THREE.Vector3(0, 0, -1);
    this.wristFlexAxis.crossVectors(forward, this.palm).normalize();
  }

  setPointer(ndcX: number, ndcY: number): void {
    this.pointer.set(ndcX, ndcY);
  }

  update(dt: number, time: number): void {
    this.progress = THREE.MathUtils.damp(this.progress, this.holding ? 1 : 0, HOLD_RATE, dt);
    const p = easeInSine(this.progress);
    this.followPointer(dt, p);

    // Wrist: slight extension while reaching (negative = the back of the hand
    // rises) + breathing. It rotates the WHOLE hand around the wrist.
    const wristFlex = Math.sin(time * 0.5) * 0.03 - p * 0.12;
    const wristYaw = Math.sin(time * 0.37) * 0.03;
    this.wristRot
      .setFromAxisAngle(this.wristFlexAxis, wristFlex)
      .multiply(this.q.setFromAxisAngle(this.palm, wristYaw));
    this.wrist.position.copy(this.wristBindPos);
    this.wrist.quaternion.copy(this.wristRot).multiply(this.wristBindQuat);

    for (const c of this.chains) this.poseFinger(c, p, time);
  }

  private followPointer(dt: number, p: number): void {
    // Pointer → point on a plane parallel to the screen at the hand's depth.
    this.plane.constant = -THREE.MathUtils.lerp(this.depths.rest, this.depths.reach, p);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.raycaster.ray.intersectPlane(this.plane, this.target)) {
      // Not holding: it only drifts a little toward the pointer and waits off to one side.
      const reach = THREE.MathUtils.lerp(0.25, 1, p);
      this.target.x = this.target.x * reach + (1 - p) * 0.3;
      this.target.y = this.target.y * reach - 0.15;
      this.pivot.position.x = THREE.MathUtils.damp(this.pivot.position.x, this.target.x, FOLLOW_RATE, dt);
      this.pivot.position.y = THREE.MathUtils.damp(this.pivot.position.y, this.target.y, FOLLOW_RATE, dt);
      this.pivot.position.z = THREE.MathUtils.damp(this.pivot.position.z, this.target.z, FOLLOW_RATE, dt);
    }
    // Hesitant tilt: turns toward the pointer while reaching.
    this.pivot.rotation.y = THREE.MathUtils.lerp(1.0, 0.55 + this.pointer.x * 0.25, p);
    this.pivot.rotation.z = THREE.MathUtils.lerp(0.25, -this.pointer.x * 0.15, p);
  }

  /** FK of a finger: newPos[i+1] = newPos[i] + accum_i · segment_i, with accum_i = accum_{i-1} · R(axis_i, θ_i). */
  private poseFinger(c: FingerChain, p: number, time: number): void {
    const pose = FINGER_POSE[c.finger];
    const factors = JOINT_FACTOR[c.finger];
    const noise = (Math.sin(time * 0.8 + c.seed) * 0.7 + Math.sin(time * 1.9 + c.seed * 3) * 0.3) * NOISE_AMPLITUDE;
    const base = THREE.MathUtils.lerp(pose.rest, pose.reach, p) * this.curlScale + noise;

    // The whole chain first follows the wrist.
    this.accum.copy(this.wristRot);
    this.pos[0].copy(c.bindPos[0]).sub(this.wristBindPos).applyQuaternion(this.wristRot).add(this.wristBindPos);

    for (let i = 0; i < c.segments.length; i++) {
      let angle = base * (factors[i] ?? 0);
      if (i === 0) angle += pose.cup; // metacarpal: slight cupping of ring/pinky
      this.accum.multiply(this.q.setFromAxisAngle(c.flexAxes[i], angle));
      if (i === 1 && pose.spread !== 0) {
        this.accum.multiply(this.q.setFromAxisAngle(this.palm, pose.spread * (1 - p * 0.5)));
      }
      c.bones[i].position.copy(this.pos[i]);
      c.bones[i].quaternion.copy(this.accum).multiply(c.bindQuat[i]);
      this.v.copy(c.segments[i]).applyQuaternion(this.accum);
      this.pos[i + 1].copy(this.pos[i]).add(this.v);
    }
    const last = c.bones.length - 1;
    c.bones[last].position.copy(this.pos[last]);
    c.bones[last].quaternion.copy(this.accum).multiply(c.bindQuat[last]);
  }
}

function easeInSine(t: number): number {
  return 1 - Math.cos((t * Math.PI) / 2);
}
