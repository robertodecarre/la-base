# Postures with target measurements

Pose from the root outward (pelvis → spine → shoulders → arms → wrists → fingers → thumbs), and **solve
the environment distances for joint targets** rather than fixing them (e.g. the body-to-keyboard distance
that gives a 97° elbow). Each posture lists the numbers to measure afterwards.

## Seated, typing at a desk (verified on a MakeHuman male, 1.7 m)

Ergonomic basis (ISO 9241-5 and office-ergonomics guides): upper arms relaxed at the sides, elbows at
90–103°, forearms about parallel to the floor, shoulders relaxed (not raised), wrists straight/neutral,
hands hovering, fingers curved with pads on the home row, thighs about horizontal, feet flat.

| Measure (each side) | Target | Achieved |
|---|---|---|
| Elbow outside the torso (x vs torso half-width at elbow height/depth) | outside, ~5–12 cm | +11.7 cm |
| Upper-arm abduction / forward flexion | 10–15° / ~5–10° | 15° / 6–7° |
| Elbow angle | 90–103° | 96° |
| Forearm pitch | ~0° (parallel) | −8° |
| Wrist | neutral, knuckles ≈ wrist height | level +3° ext |
| MCP / PIP / DIP | 15–37 / 35–45 / 14–28° | 29–41 / 27–50 / 12–23° |
| Fingertip ↔ key | on the cap | < 1 cm per axis |
| Thumb base swing | ≲ 15° | 13–14° |
| Index MCP spread | ≤ 5° | 5° (capped) |

Recipe that produced it (`tools/build_character.py`):
1. Spine slightly forward but upright: bone directions ≈ (0, −0.06, 1), (0, −0.10, 1), (0, −0.13, 1) (figure
   faces −Y); neck/head inclined toward the screen.
2. Thighs ≈ horizontal, knees ~90–100°, feet flat; seat the body after baking (move meshes, not the rig).
3. **Arms by analytic two-bone IK**: elbow on the solution circle pushed **outward and down**
   (hint `(±sin 14°, −0.15, −1)`). Generic IK with a pole took the shortest path and buried the elbows.
4. **Bisection on the reach** (shoulder → home row, ~10 steps) until the elbow angle = 97°.
5. Hand: forearm direction blended 55/45 with straight ahead (slight ulnar deviation), made level, +3° ext,
   rolled palm-down with ~12° pinky-side tilt (roll split 50/50 forearm/hand).
6. Fingers solved onto keys (Gauss-Newton, `hands.md`), thumbs over the space bar, wrist target corrected
   by fingertip error, 4 outer iterations.

## Seated, relaxed (not working)

Hip flexion 90–100°, knees 90–110° with slight abduction (knees 10–20 cm apart for men) and external rotation
(feet point slightly out); spine slumps into a gentle C (distribute flexion over all spine bones); forearms
on thighs or armrests, hands in the relaxed cascade.

## Standing, relaxed

- Weight on one leg (**contrapposto**): the pelvis tilts down toward the free leg, the shoulders counter-tilt
  the other way, the spine curves between them; the standing leg's knee near straight, the free knee bent.
- Head over the supporting foot (balance line from the pit of the neck to the standing ankle).
- Arms hang with elbows 5–15° flexed, forearms neutral (palms toward the thighs), carrying angle visible;
  hands in the relaxed cascade, fingertips at ~0.377 H.
- Symmetric "T/A pose" reads as a mannequin — use it only for rigging.

## Reaching / holding

- Reach > ~60% of arm length: the shoulder protracts (scapula slides forward) and the trunk rotates/leans —
  don't do it with the arm alone.
- Holding an object: pick the grip type (`hands.md` table), put the object first, then solve the hand onto it.

Sources: ISO 9241-5 and ergonomics guides (UC Office of the President keyboard/mouse guidelines;
FlexiSpot typing guide), keyboard kinematics (Sommerich 1996; Nelson 2000; Dennerlein et al., Clinical
Biomechanics 2006), MX key pitch 19.05 mm (keyboard glossaries).
