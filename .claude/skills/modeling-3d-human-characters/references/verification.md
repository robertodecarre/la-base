# Verifying a character: numbers, views, isolation

A pose isn't done until it passes all three. One screenshot from the "nice" angle hides most errors
(elbows in the torso, a crease under the thumb, a bulging knuckle).

## 1. Numbers (print them every build)

Per side, from bone heads/tails in world space after posing:
- Elbow: angle (upper arm vs forearm), position vs torso half-width at its height/depth (must be outside).
- Upper arm: abduction = asin(|dir.x|), forward flexion; forearm pitch.
- Wrist: flexion/extension and deviation vs forearm; knuckles vs wrist height.
- Each finger: MCP/PIP/DIP angles (angle between consecutive segment directions, hand → proximal → …),
  fingertip error per axis vs target.
- Thumb: curl per joint, base swing (angle before/after), pad error, clearance to the index.
- Spread per finger (the solved yaw).
Compare every number with `joints-rom.md` (inside ROM) and the posture's targets (`postures.md`).

## 2. Views (render each iteration)

Workbench or plain renders at ~900 px:
- Full body: front, side, back, top.
- Close-ups: hands from above, below, thumb side, fingertip (front) side; face/neck if visible.
- The **actual shot** the audience sees (camera from the scene) — plus nearby frames if animated.
Add markers (small cubes) at targets (keys, handles) so misses are obvious.

## 3. Isolation (A/B)

When something looks wrong but you don't know why, re-render with ONE suspect rotation disabled via an
env switch and compare the same view:
- `THUMB_MODE=none` separated a pose crease from a skinning artifact (the untouched thumb web was smooth →
  the pose caused it).
- `SPREAD_MODE=none` proved the index "bunion" came from MCP spread.
Keep the switches in the build script; they cost nothing.

## 4. Animation checks (web)

- Freeze any stylistic "boil" (`?noboil`) so only real motion shows.
- Capture 6–8 frames 60–110 ms apart, crop the hands, look for jumps, snapping or bending reversals;
  `magick compare -metric AE -fuzz 8%` between frames quantifies motion.
- Animate about the same anatomical axes measured on the loaded model; drive with eased envelopes and an
  accumulated clock (`clock += dt·speed`) — `time·speed` jumps when speed changes ("flick").

## Definition of done

All joints inside ROM and near their functional targets · fingertips/contacts < 1 cm · no creases, bulges or
penetrations in the hard zones (`hands.md`) · correct sex/build read from front and side · animation smooth
frame to frame · numbers and renders saved with the build.
