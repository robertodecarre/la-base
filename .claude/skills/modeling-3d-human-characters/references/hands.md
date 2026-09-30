# Hands: anatomy and posing in detail

Hands are where viewers notice errors first. Pose them from anatomy, measure them, and look at them
from above, below, the thumb side and the fingertip side.

## Structure that must read

- **27 bones**: 8 carpals, 5 metacarpals, 14 phalanges (thumb has 2). The palm is the metacarpals; the
  knuckles you see on a fist are the **metacarpal heads (MCP joints)**.
- **Arches**: the palm is bowed across (transverse metacarpal arch, deepest at the knuckles) and along
  (longitudinal, wrist → fingertips). A flat palm reads as a glove.
- **Knuckle line is not straight**: the knuckles form an arc; the middle knuckle is the highest and most
  prominent, index and pinky lower toward the edges, and the line slopes down toward the pinky (the pinky
  MCP is more proximal). Knuckles never align.
- **Cascade**: at rest, flexion increases from index to pinky (pinky curls most) — rest ≈ 0.24 / 0.32 / 0.40 /
  0.48 rad at MCP for index / middle / ring / pinky, middle phalanx ×1.15, distal ×0.7.
- **Thumb** sits on a different plane: its nail faces roughly sideways (≈ 60–90° from the other nails) and its
  base (CMC, on the trapezium) is near the wrist, not at the knuckle line. The **web** between thumb and
  index is soft tissue (first dorsal interosseous + adductor): it stretches when the thumb abducts and bulges
  slightly when adducted — it never creases sharply.

## Posing rules (rig-agnostic)

1. **Flex each finger joint about its anatomical axis** = cross(segment direction, palm normal), measured
   on the model in the posed hand. Never reuse one local axis for all bones (bone rolls differ) — that is
   what makes fingers twist "demonically".
2. **Hierarchical vs flat skeletons**: Mixamo/Blender rigs are hierarchical (rotate a bone, children follow).
   Hand-tracking/WebXR rigs are often flat (all joints siblings) → do forward kinematics per finger
   (`pos[i+1] = pos[i] + accum_i · segment_i`).
3. **Couple DIP to PIP** (≈ 0.5–0.7 ×): real fingers can't flex the tip joint independently.
4. **Spread is small** (MCP abduction): index ≤ ~5°, others ≤ ~8° in functional poses. Reach sideways with
   the hand/wrist. 14° index spread produced a visible "bunion" on the knuckle.
5. **Thumb**: keep the model's natural curl and **swing the chain split over its joints**
   (≈ 0.35 CMC / 0.40 MCP / 0.25 IP about one axis, 3–4 iterations toward the target). Swinging only the
   base ~27° creased the web; aiming each phalanx at a target folded the thumb across the palm.
6. **Don't aim bones at targets** (per-phalanx "look at" → claws; hand "look at" keys → wrist dives).
   Solve for joint angles instead (below).

## Solving a finger onto a target (typing, pressing, touching)

Two unknowns per finger — MCP and PIP (DIP coupled) — because fingers differ in length and one angle can
hit height or depth, not both:

```
for 10 iterations:                     # Gauss-Newton with a pull toward reference angles
  r  = tip(m, p) - target              # residual in (depth, height)
  Jm = d r / d m ,  Jp = d r / d p     # finite differences, h = 0.01 rad
  solve [Jm·Jm+λ  Jm·Jp ; Jm·Jp  Jp·Jp+λ] [dm dp] = -[Jm·r + λ(m-m0) ; Jp·r + λ(p-p0)]
  m, p += dm, dp  (clamped to ROM)
```

Then move the wrist target by the mean fingertip error and by the mean deviation from the reference angles
(extra MCP → hand too high; extra PIP → hand too far forward) and repeat (4 outer iterations → < 1 mm).
`tools/build_character.py` implements it (`flex_finger`, `pose_thumb`, `joint_angles`, `thumb_report`).

## Reference poses

| Pose | Wrist | MCP | PIP | DIP | Thumb | Spread |
|---|---|---|---|---|---|---|
| Relaxed (hanging / resting) | 10–20° ext, slight ulnar | cascade 14→28° index→pinky | ~30–45° | ~15–25° | alongside index, lightly flexed | slight |
| Typing (touch) | neutral, ~3° ext, level knuckles, palm ~12° pinky-down | 15–37° (index > pinky) | 35–45° | 14–28° | over the space bar under its own index, ~6 mm hover, curl ~20–35° per joint | ≤ 5–8° |
| Power grip (cylinder) | 20–35° ext | ~60–90 | ~80–100 | ~40–70 | wraps opposite, pad on fingers | 0 |
| Pinch (tip-to-tip) | 10–20° ext | index ~45 | ~60 | ~20–40 | opposed, IP flexed | index slight |
| Pointing | neutral | index 0, others 60–90 | index 0, others ~90 | — | resting on middle finger | 0 |

(Typing values: keyboard-kinematics studies — Sommerich 1996, Nelson 2000, Dennerlein et al.; ergonomics
guides: neutral straight wrist, knuckles ≈ wrist height, curved fingers "like on a piano". Grip/pinch values
are illustrative starting points — verify against references for the specific object.)

## Hard zones to inspect every time

- **Thumb–index web** from the inner side and from below (creases = swing on one bone).
- **Radial edge at the index knuckle** from above (bulge = too much spread).
- **Wrist** from the side (dive/snap = hand aimed at the target; candy-wrap = roll on one bone).
- **Fingertips vs target** per axis (row/depth, column, height) — print them.
- **Between the hands and the camera** in close-ups (sleeves can hide them).
