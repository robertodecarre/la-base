# Characters in an immersive site

Anatomy, posing, hands, the MPFB2 → glTF pipeline, procedural animation and verification of human
characters live in their own skill: **REQUIRED SUB-SKILL: modeling-3d-human-characters** (body proportions,
joint ranges of motion, hand/thumb anatomy, postures with target measurements, `tools/build_character.py`,
`examples/typing-character/`).

What stays here is only the site-side integration:
- Never build a human from code primitives; if no 3D model is possible, use a 2D ink illustration on a
  camera-facing plane (Santioni-style) and keep it as the load-failure fallback for the 3D figure.
- Keep the story's style on the figure (per-part ink + skinned inverted-hull outline — see the
  character skill's pipeline reference), and no hatching "boil" on moving bodies.
- A character that must get out of the camera's way: push the camera **through** it with an ink-burn
  dissolve instead of moving it (moving a posed figure leaves hands floating).
- Credit CC-BY assets (clothes packs) in the footer.
