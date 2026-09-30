---
name: modeling-3d-human-characters
description: Use when creating, posing, animating or reviewing a human character in 3D (Blender, three.js, glTF, MakeHuman/MPFB2, Mixamo) — especially when a pose looks "off", hands or fingers look broken, elbows sink into the torso, knuckles bulge, thumbs fold across the palm, skin pinches at joints, the body reads as the wrong sex, or the character must type, sit, hold or reach for real-size objects.
---

# Modeling 3D Human Characters

## Overview

A believable human is **anatomy first, style second**. Get real proportions, joints inside their ranges of
motion and a physiologically plausible posture; any look (realistic, toon, comic ink) comes afterwards from
the shader. Judge poses **with numbers and multiple views**, never by one screenshot.

## When to use

- Building a character (never from code primitives — capsules/spheres always read as a doll).
- Posing for an action (typing, sitting, holding, reaching) against real-size props.
- Something "looks weird" and you need to find which joint and why.
- Animating fingers/hands/arms procedurally without glitches.

Not for: environment/props only; pure 2D illustration (but the proportion/ROM tables still help).

## Workflow

1. **Source a real body mesh** (MPFB2/MakeHuman, Mixamo, scan, artist) — `references/pipeline-mpfb2.md`.
   Decide sex/age/build explicitly (MakeHuman `gender 0.5` grows breasts under clothes).
2. **Check proportions** against `references/proportions.md`; build props at real size.
3. **Pose from the root outward**: pelvis/spine → shoulders/arms (analytic 2-bone, elbow out and down) →
   wrist neutral → fingers (anatomical axes) → thumb (swing split over its chain). Solve distances
   (e.g. body-to-desk) for target joint angles instead of fixing them. See `references/postures.md`,
   `references/hands.md`.
4. **Keep every joint inside its ROM and near its functional value** (`references/joints-rom.md`); split
   large rotations across neighbouring joints (skin can't follow ~25°+ on one bone).
5. **Verify** with `references/verification.md`: per-joint numbers, 6+ views, close-ups of hard zones, A/B
   renders with a suspect rotation disabled. Only then export/animate.

## Quick reference

| Need | Where |
|---|---|
| Segment lengths / heights as fractions of stature, head units, sex differences | `references/proportions.md` |
| Range of motion of every joint + functional/relaxed values + couplings | `references/joints-rom.md` |
| Hand & thumb anatomy, arches, knuckle cascade, relaxed/typing/grip poses | `references/hands.md` |
| Seated/typing, standing, relaxed postures with target measurements | `references/postures.md` |
| MPFB2 headless build, raised hood, props, bake, skinned GLB export, web animation | `references/pipeline-mpfb2.md` + `tools/build_character.py` |
| Procedural typing animation in three.js (rig, driver, skinned shader) | `examples/typing-character/` |
| How to prove a pose is right (numbers, views, A/B isolation) | `references/verification.md` |

## Common mistakes (all seen and fixed on a real character)

| Symptom | Cause | Fix |
|---|---|---|
| Elbows inside the torso, hands bunched | IK took the shortest path to the midline | Analytic 2-bone IK, elbow pushed outward/down; solve reach for elbow 90–103° |
| Fingers splayed / hands squeezed | Prop not at real size (keyboard 44% too big) | Real dimensions (key pitch 19.05 mm) |
| Claw fingers / diving wrist | Aiming each phalanx or the hand at the target | Neutral wrist; flex MCP/PIP/DIP about anatomical axes at measured angles |
| "Bunion" at the index knuckle | MCP abduction 14° | Cap spread (index ≤ 5°, others ≤ 8°); move the hand instead |
| Crease in the thumb–index web | Whole thumb swung ~27° from its base | Split swing ≈ 0.35 / 0.40 / 0.25 over CMC / MCP / IP |
| Thumbs crossing toward each other | Target key too far inside; per-phalanx aiming | Thumb under its own index, keep natural curl |
| Breasts on a male character | Androgynous macro default | Explicit `gender 1.0, cupsize 0` |
| Fingers "flick" in animation | Snapping inputs, `time·speed` clock | Eased envelopes, accumulated clock, no hatching boil on the figure |
