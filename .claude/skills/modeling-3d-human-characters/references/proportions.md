# Proportions of the adult human body

Start from measured ratios, then adjust per character. Source for the fractions of stature **H**:
Drillis & Contini (1966), reproduced in Winter, *Biomechanics and Motor Control of Human Movement*,
Fig. 4.1 — "a good approximation in the absence of better data".

## Heights above the floor (standing, fraction of H)

| Landmark | × H | For H = 1.75 m |
|---|---|---|
| Top of head | 1.000 | 1.750 m |
| Eyes | 0.936 | 1.638 |
| Chin | 0.870 | 1.523 |
| Shoulder (acromion / glenohumeral) | 0.818 | 1.432 |
| Elbow | 0.630 | 1.103 |
| Hip joint (greater trochanter) | 0.530 | 0.928 |
| Wrist | 0.485 | 0.849 |
| Fingertip (arm hanging) | 0.377 | 0.660 |
| Knee | 0.285 | 0.499 |
| Ankle | 0.039 | 0.068 |

## Segment lengths and widths (fraction of H)

| Segment | × H | For H = 1.75 m |
|---|---|---|
| Head (chin → vertex) | 0.130 | 0.228 m |
| Upper arm (shoulder → elbow) | 0.186 | 0.326 |
| Forearm (elbow → wrist) | 0.146 | 0.256 |
| Hand (wrist → middle fingertip) | 0.108 | 0.189 |
| Thigh (hip → knee) | 0.245 | 0.429 |
| Shank (knee → ankle) | 0.246 | 0.431 |
| Foot length | 0.152 | 0.266 |
| Foot breadth | 0.055 | 0.096 |
| Shoulder width (biacromial) | 0.259 | 0.453 |
| Chest width | 0.174 | 0.305 |
| Hip width | 0.191 | 0.334 |

Quick checks (from the table): the elbow sits at about waist height; wrists at hip-joint height minus
~4.5 cm; hanging fingertips reach mid-thigh; hand length ≈ 0.83 × head height; thigh ≈ shank; upper arm ≈
1.27 × forearm.

## Head units (artist check, approximate)

Adult ≈ 7.5–8 heads tall (idealised figures 8). Shoulder width ≈ 2 heads (men), a bit less (women);
hip width ≈ 1.5–1.75 heads. Crotch ≈ half the height.

## Sex differences to get right (typical tendencies, not rules)

- Men: shoulders wider than hips; narrower pelvis; larger hands/feet relative to height; thicker neck;
  smaller elbow carrying angle (5–10°, women 10–15° — see `joints-rom.md`).
- Women: hips ≥ shoulders; wider pelvis → thighs converge more to the knees (larger Q angle); breasts
  present — in MakeHuman set `cupsize`/`firmness` deliberately, and for a man use `gender 1.0, cupsize 0.0`
  (`gender 0.5` = androgynous, grows a chest under clothes).

## Hand proportions (approximate)

- Hand length ≈ 0.108 H; palm ≈ 55–60% of it, middle finger ≈ 40–45%.
- Finger phalanges shorten distally, roughly proximal : middle : distal ≈ 1 : 0.6 : 0.45.
- Middle finger longest, then ring ≈ index, pinky shortest (tip near the ring's distal crease).
- Thumb tip reaches about the index's proximal phalanx midpoint when adducted.

## Props at real size

Posing against props only works if both are to scale. Examples used: keyboard key pitch 19.05 mm
(MX standard) with row stagger (Q +0.5u, A +0.75u, Z +1.25u, space row ~+1.5u); desk height ~0.72–0.75 m;
chair seat ~0.45–0.50 m. An oversized keyboard (27.5 mm pitch) forced splayed, bunched hands.
