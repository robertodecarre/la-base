"""
Builds a detailed, dressed, posed, SKINNED man with MPFB2 (MakeHuman for Blender), headless, in an
ergonomic typing posture: analytic arms, reach solved for a 97 deg elbow, study-based finger angles
(Gauss-Newton per finger, MCP spread capped), thumbs over the space bar (swing split over the thumb
chain), raised hood, headset, KeyAnchor empty. See references/characters.md.

Usage: blender -b --python build_character.py -- <out_dir> [stage]
  stage = base   -> human + clothes in rest pose, preview renders
  stage = posed  -> + seated pose, hood up, headphones, preview renders + GLB export
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.assetservice import AssetService

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = ARGS[0] if ARGS else "/tmp"
STAGE = ARGS[1] if len(ARGS) > 1 else "base"
os.makedirs(OUT, exist_ok=True)


def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)


def asset(fragment, subdir):
    path = AssetService.find_asset_absolute_path(fragment, subdir)
    if not path:
        raise FileNotFoundError(f"{subdir}/{fragment}")
    return path


def build_human():
    macro = {
        "gender": 1.0, "age": 0.5, "muscle": 0.55, "weight": 0.5, "proportions": 0.6,
        "height": 0.55, "cupsize": 0.0, "firmness": 0.5,
        "race": {"african": 0.25, "asian": 0.25, "caucasian": 0.5},
    }
    body = HumanService.create_human(macro_detail_dict=macro, scale=0.1)
    rig = HumanService.add_builtin_rig(body, "mixamo")
    HumanService.set_character_skin(asset("young_caucasian_male_special_suit/young_caucasian_male_special_suit.mhmat", "skins")
                                    if False else AssetService.list_mhmat_assets("skins")[0].as_posix(), body)
    for frag, sub, kind in [
        ("eyebrow010/eyebrow010.mhclo", "eyebrows", "Eyebrows"),
        ("eyelashes01/eyelashes01.mhclo", "eyelashes", "Eyelashes"),
        ("short02/short02.mhclo", "hair", "Hair"),
        ("elvs_hooded_sweat_jacket1/elvs_hooded_sweat_jacket1.mhclo", "clothes", "Clothes"),
        ("elvs_jeans_straight_leg/elvs_jeans_straight_leg.mhclo", "clothes", "Clothes"),
        ("punkduck_comfortable_sneakers/punkduck_comfortable_sneakers.mhclo", "clothes", "Clothes"),
    ]:
        HumanService.add_mhclo_asset(asset(frag, sub), body, asset_type=kind, subdiv_levels=0)
    return body, rig


def preview(name, cam_loc, target=(0, 0, 0.95), lens=50):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_cavity = True
    scene.display.shading.show_shadows = True
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    cam_data = bpy.data.cameras.get("PreviewCam") or bpy.data.cameras.new("PreviewCam")
    cam_data.lens = lens
    cam = bpy.data.objects.get("PreviewCam") or bpy.data.objects.new("PreviewCam", cam_data)
    if cam.name not in scene.collection.objects:
        scene.collection.objects.link(cam)
    cam.location = Vector(cam_loc)
    direction = Vector(target) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.filepath = os.path.join(OUT, f"{name}.png")
    bpy.ops.render.render(write_still=True)




# ---------------------------------------------------------------- posing

def update():
    bpy.context.view_layer.update()


def aim(rig, bone_name, direction):
    """Rotate a pose bone (in world space, around its head) so it points along `direction`."""
    pb = rig.pose.bones[bone_name]
    update()
    world = rig.matrix_world @ pb.matrix
    head = world.translation.copy()
    current = (world.to_3x3() @ Vector((0, 1, 0))).normalized()
    rot = current.rotation_difference(Vector(direction).normalized()).to_matrix().to_4x4()
    new_world = Matrix.Translation(head) @ rot @ Matrix.Translation(-head) @ world
    pb.matrix = rig.matrix_world.inverted() @ new_world
    update()


def pose_seated(rig):
    L, R = "mixamorig:Left", "mixamorig:Right"
    targets = [
        ("mixamorig:Spine", (0, -0.06, 1)),
        ("mixamorig:Spine1", (0, -0.1, 1)),
        ("mixamorig:Spine2", (0, -0.13, 1)),
        ("mixamorig:Neck", (0, -0.42, 1)),
        ("mixamorig:Head", (0, -0.3, 1)),
        (L + "UpLeg", (0.1, -1, -0.1)), (R + "UpLeg", (-0.1, -1, -0.12)),
        (L + "Leg", (0.03, 0.3, -1)), (R + "Leg", (-0.02, -0.18, -1)),
        (L + "Foot", (0.05, -1, -0.45)), (R + "Foot", (-0.05, -1, -0.5)),
        (L + "Arm", (0.3, -0.42, -0.86)), (R + "Arm", (-0.34, -0.4, -0.84)),
        (L + "ForeArm", (-0.28, -1, 0.06)), (R + "ForeArm", (0.02, -1, 0.02)),
        (L + "Hand", (-0.12, -1, -0.12)), (R + "Hand", (0.04, -1, -0.16)),
    ]
    for bone, direction in targets:
        aim(rig, bone, direction)
    # relaxed, slightly curled fingers resting on keys / mouse
    for side in (L, R):
        hand = rig.pose.bones[side + "Hand"]
        base = ((rig.matrix_world @ hand.matrix).to_3x3() @ Vector((0, 1, 0))).normalized()
        for finger in ("Index", "Middle", "Ring", "Pinky"):
            for seg, bend in ((1, 0.25), (2, 0.55), (3, 0.7)):
                aim(rig, f"{side}Hand{finger}{seg}", base + Vector((0, 0, -bend)))


def seat_offset(rig, seat_height=0.5):
    """Vertical offset that rests the underside of the thighs on the seat (applied after baking)."""
    update()
    knee = min((rig.matrix_world @ rig.pose.bones[b].head).z for b in ("mixamorig:LeftLeg", "mixamorig:RightLeg"))
    return seat_height + 0.07 - knee


def bake(objects):
    """Apply every modifier (armature pose included) so the export is a clean static mesh."""
    for o in objects:
        bpy.context.view_layer.objects.active = o
        if o.data.shape_keys:
            # MakeHuman morphs live in shape keys: freeze the current mix so modifiers can be applied
            bpy.ops.object.select_all(action="DESELECT")
            o.select_set(True)
            bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
        for m in list(o.modifiers):
            try:
                bpy.ops.object.modifier_apply(modifier=m.name)
            except RuntimeError as err:
                print("MODIFIER_SKIP", o.name, m.name, err)


# ---------------------------------------------------------------- hands on the keyboard (IK)

# Keyboard geometry shared with the web (src/world/soc.ts KEYS): real MX pitch 19.05 mm and the standard
# row stagger (number row 0, Q row +0.5u, home row +0.75u, bottom row +1.25u, space row +1.5u).
# key (c, r) centre, keyboard-local metres: x = X0 + (c + STAGGER[r]) * PITCH, z = Z0 + r * PITCH (+z → person)
PITCH = 0.01905
X0 = -0.14
Z0 = -2 * PITCH
STAGGER = (0.0, 0.5, 0.75, 1.25, 1.5)
KEY_TOP = 0.771
TIP = 0.007             # fingertip pad radius: rest just on the keycap
ANCHOR_LOCAL_X = X0 + (5.5 + STAGGER[2]) * PITCH     # home-row midpoint between F (c4) and J (c7)
HOME = {
    "Left": {"Pinky": (1, 2), "Ring": (2, 2), "Middle": (3, 2), "Index": (4, 2), "Thumb": (5, 4)},
    "Right": {"Index": (7, 2), "Middle": (8, 2), "Ring": (9, 2), "Pinky": (10, 2), "Thumb": (6, 4)},
}
UPPER_ABDUCTION = math.radians(14)   # elbows just outside the torso (relaxed, "at your sides")
TARGET_ELBOW = 97.0                  # degrees (ergonomic 90–103)


def key_point(anchor, c, r):
    """Key (c, r) top centre in Blender space (figure faces -Y, its left is +X; web: x_world = -bx)."""
    x_local = X0 + (c + STAGGER[r]) * PITCH
    z_local = Z0 + r * PITCH
    return Vector((anchor.x - (x_local - ANCHOR_LOCAL_X), anchor.y + z_local, anchor.z))


def empty(name, location):
    ob = bpy.data.objects.new(name, None)
    ob.location = location
    bpy.context.scene.collection.objects.link(ob)
    return ob


def ik(rig, bone, target, chain, pole=None, pole_angle=0.0):
    c = rig.pose.bones[bone].constraints.new("IK")
    c.target = target
    c.chain_count = chain
    if pole is not None:
        c.pole_target = pole
        c.pole_angle = pole_angle
    return c


def bake_constraints(rig):
    """Freeze the IK result into the pose, then drop the constraints."""
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.visual_transform_apply()
    for pb in rig.pose.bones:
        for c in list(pb.constraints):
            pb.constraints.remove(c)
    bpy.ops.object.mode_set(mode="OBJECT")
    update()


def spin(rig, bone_name, angle):
    """Rotate a pose bone about its own (world) axis, around its head."""
    pb = rig.pose.bones[bone_name]
    update()
    world = rig.matrix_world @ pb.matrix
    head = world.translation.copy()
    axis = (world.to_3x3() @ Vector((0, 1, 0))).normalized()
    rot = Matrix.Rotation(angle, 4, axis)
    pb.matrix = rig.matrix_world.inverted() @ (Matrix.Translation(head) @ rot @ Matrix.Translation(-head) @ world)
    update()


def palm_down(rig, side):
    """Roll the hand so the knuckle line (index→pinky) is horizontal with the thumb toward the body's centre.
    The twist is shared with the forearm so the wrist skin doesn't candy-wrap."""
    def knuckles():
        update()
        i = rig.matrix_world @ rig.pose.bones[f"mixamorig:{side}HandIndex1"].head
        k = rig.matrix_world @ rig.pose.bones[f"mixamorig:{side}HandPinky1"].head
        return k - i
    hand = rig.pose.bones[f"mixamorig:{side}Hand"]
    axis = ((rig.matrix_world @ hand.matrix).to_3x3() @ Vector((0, 1, 0))).normalized()
    # typists don't fully pronate: the knuckle line tilts ~20 deg pinky-side-down, which lets the short
    # ring/pinky reach the home row with study-like flexion instead of curling into it
    tilt = math.radians(PALM_TILT_DEG)
    want = Vector(((1 if side == "Left" else -1) * math.cos(tilt), 0, -math.sin(tilt)))
    cur = knuckles()
    cur_p = (cur - axis * cur.dot(axis)).normalized()
    want_p = (want - axis * want.dot(axis)).normalized()
    angle = math.atan2(axis.dot(cur_p.cross(want_p)), cur_p.dot(want_p))
    spin(rig, f"mixamorig:{side}ForeArm", angle * 0.5)
    spin(rig, f"mixamorig:{side}Hand", angle * 0.5)
    # correct any residual after the forearm share moved the hand
    axis = ((rig.matrix_world @ hand.matrix).to_3x3() @ Vector((0, 1, 0))).normalized()
    cur = knuckles()
    cur_p = (cur - axis * cur.dot(axis)).normalized()
    want_p = (want - axis * want.dot(axis)).normalized()
    spin(rig, f"mixamorig:{side}Hand", math.atan2(axis.dot(cur_p.cross(want_p)), cur_p.dot(want_p)))


def rotate_about(rig, bone_name, axis, angle):
    """Rotate a pose bone around its head about a world axis (children follow: hierarchical FK)."""
    pb = rig.pose.bones[bone_name]
    update()
    world = rig.matrix_world @ pb.matrix
    head = world.translation.copy()
    rot = Matrix.Rotation(angle, 4, axis.normalized())
    pb.matrix = rig.matrix_world.inverted() @ (Matrix.Translation(head) @ rot @ Matrix.Translation(-head) @ world)
    update()


def bone_dir(rig, name):
    pb = rig.pose.bones[name]
    return ((rig.matrix_world @ pb.matrix).to_3x3() @ Vector((0, 1, 0))).normalized()


def palm_normal(rig, side):
    """Direction from the back of the hand toward the palm (points down when the palm faces the keys)."""
    update()
    i = rig.matrix_world @ rig.pose.bones[f"mixamorig:{side}HandIndex1"].head
    k = rig.matrix_world @ rig.pose.bones[f"mixamorig:{side}HandPinky1"].head
    n = (k - i).cross(bone_dir(rig, f"mixamorig:{side}Hand")).normalized()
    return n if n.z < 0 else -n


def tip(rig, side, finger):
    update()
    return rig.matrix_world @ rig.pose.bones[f"mixamorig:{side}Hand{finger}3"].tail


# Typing joint angles from keyboard kinematics studies (Sommerich 1996, Nelson 2000, Dennerlein; see
# references/characters.md): MCP 15-37 deg decreasing index -> pinky, PIP 35-45 deg, DIP 14-28 deg.
REF_DEG = {"Index": (34, 40, 20), "Middle": (30, 40, 20), "Ring": (24, 38, 18), "Pinky": (18, 36, 16)}
DIP_COUPLING = 0.5
SPREAD_CAP_DEG = {"Index": 5, "Middle": 8, "Ring": 8, "Pinky": 8}
PALM_TILT_DEG = 12


def snapshot(rig, names):
    return {n: rig.pose.bones[n].matrix.copy() for n in names}


def restore(rig, snap):
    for n, m in snap.items():
        rig.pose.bones[n].matrix = m
        update()


def flex_finger(rig, side, finger, key):
    """Finger: small spread toward its key column, PIP/DIP at the study angles, MCP bisected within
    +-12 deg of its reference so the pad lands exactly on the keycap. Flexion about the anatomical
    axis = segment x palm normal. Returns MCP deviation from the reference (rad).
    Thumb: relaxed over the space bar, pointing forward and a little inward, gently curved."""
    names = [f"mixamorig:{side}Hand{finger}{i}" for i in (1, 2, 3)]
    n = palm_normal(rig, side)
    if finger == "Thumb":
        return pose_thumb(rig, side, names, key)
    mcp = rig.matrix_world @ rig.pose.bones[names[0]].head
    seg = bone_dir(rig, names[0])
    to_key = key - mcp
    a = (seg - n * seg.dot(n)).normalized()
    b = (to_key - n * to_key.dot(n)).normalized()
    yaw = math.atan2(n.dot(a.cross(b)), a.dot(b))
    # MCP abduction limit: typists barely spread the index (a 14 deg turn made its knuckle bulge out
    # like a bunion); the hand's position absorbs the rest of the column offset
    cap = math.radians(SPREAD_CAP_DEG.get(finger, 8))
    if os.environ.get("SPREAD_MODE") == "none":
        yaw = 0.0
    yaw = max(-cap, min(cap, yaw))
    print("SPREAD_DEG", side, finger, round(math.degrees(yaw), 1))
    rotate_about(rig, names[0], n, yaw)
    base = snapshot(rig, names)
    ref = [math.radians(v) for v in REF_DEG[finger]]
    target = Vector((key.x, key.y, key.z + TIP))

    def apply(m, p):
        """MCP = m, PIP = p, DIP coupled to ~50% of PIP (it follows the PIP through shared tendons)."""
        restore(rig, base)
        for name, angle in zip(names, (m, p, p * DIP_COUPLING)):
            rotate_about(rig, name, bone_dir(rig, name).cross(n), angle)
        t = tip(rig, side, finger)
        return Vector((t.y - target.y, t.z - target.z))

    # Gauss-Newton on (MCP, PIP) for tip = key (row + height), softly pulled toward the study angles
    m, p = ref[0], ref[1]
    lam = 0.0004            # m^2/rad^2: ~2 cm of error is worth ~0.7 rad of deviation... only as a tie-breaker
    for _ in range(10):
        r = apply(m, p)
        h = 0.01
        jm = (apply(m + h, p) - r) / h
        jp = (apply(m, p + h) - r) / h
        # normal equations with Tikhonov pull toward the reference
        a11 = jm.dot(jm) + lam
        a12 = jm.dot(jp)
        a22 = jp.dot(jp) + lam
        b1 = -(jm.dot(r) + lam * (m - ref[0]))
        b2 = -(jp.dot(r) + lam * (p - ref[1]))
        det = a11 * a22 - a12 * a12
        if abs(det) < 1e-12:
            break
        dm = (b1 * a22 - b2 * a12) / det
        dp = (a11 * b2 - a12 * b1) / det
        m = min(max(m + dm, 0.0), math.radians(70))
        p = min(max(p + dp, math.radians(15)), math.radians(80))
        if abs(dm) + abs(dp) < 1e-4:
            break
    apply(m, p)
    return m - ref[0], p - ref[1]


THUMB_SHARE = (0.35, 0.4, 0.25)   # how the swing is split over CMC, MCP, IP (like a real thumb)
THUMB_HOVER = 0.006               # typists' thumbs hover just above the space bar


def pose_thumb(rig, side, names, key):
    """Thumb over the space bar: keep the model's natural curl and bring the pad above the bar with the
    swing SPLIT over the three thumb joints. Rotating only the base (CMC) by ~27 deg pinched the skin of
    the thumb-index web into a crease; a real thumb spreads that motion along its chain."""
    update()
    if os.environ.get("THUMB_MODE") == "none":
        return 0.0, 0.0
    goal = key + Vector((0, 0, THUMB_HOVER))
    before = bone_dir(rig, names[0])
    for _ in range(4):
        base = rig.matrix_world @ rig.pose.bones[names[0]].head
        t = tip(rig, side, "Thumb") - Vector((0, 0, TIP))
        q = (t - base).rotation_difference(goal - base)
        axis, angle = q.axis, q.angle
        if angle < 1e-4:
            break
        for name, share in zip(names, THUMB_SHARE):
            rotate_about(rig, name, axis, angle * share)
    print("THUMB1_SWING_DEG", side, round(math.degrees(before.angle(bone_dir(rig, names[0]))), 1))
    return 0.0, 0.0


def thumb_report(rig, side, key):
    """Tip error vs its key, curl (angle between thumb segments) and clearance to the index finger."""
    segs = [bone_dir(rig, f"mixamorig:{side}HandThumb{i}") for i in (1, 2, 3)]
    curl = [round(math.degrees(segs[i].angle(segs[i + 1])), 1) for i in range(2)]
    e = tip(rig, side, "Thumb") - key
    pts = lambda f: [rig.matrix_world @ rig.pose.bones[f"mixamorig:{side}Hand{f}{i}"].head for i in (1, 2, 3)] + [tip(rig, side, f)]
    gap = min((a - b).length for a in pts("Thumb")[1:] for b in pts("Index"))
    return f"curl {curl} tip err cm row {e.y*100:.2f} col {e.x*100:.2f} height {(e.z - TIP)*100:.2f} | min gap to index {gap*100:.1f} cm"


def joint_angles(rig, side, finger):
    """Measured flexion (deg) at MCP, PIP, DIP: angle between consecutive segments."""
    hand = bone_dir(rig, f"mixamorig:{side}Hand")
    segs = [bone_dir(rig, f"mixamorig:{side}Hand{finger}{i}") for i in (1, 2, 3)]
    chain = [hand] + segs
    return [round(math.degrees(chain[i].angle(chain[i + 1])), 1) for i in range(3)]


def orient_hand(rig, side):
    """Neutral wrist: the hand continues the forearm (tiny extension), palm facing the keys."""
    update()
    fore = rig.pose.bones[f"mixamorig:{side}ForeArm"]
    d = ((rig.matrix_world @ fore.tail) - (rig.matrix_world @ fore.head)).normalized()
    aim(rig, f"mixamorig:{side}Hand", d + Vector((0, 0, 0.06)))
    palm_down(rig, side)


def solve_arm(rig, side, wrist):
    """Analytic two-bone IK: elbow on the circle of solutions, pushed OUTWARD and DOWN (upper arm hanging
    at the side, slightly abducted) — never toward the midline where it would sink into the torso."""
    s = 1 if side == "Left" else -1
    update()
    arm, fore, hand = (rig.pose.bones[f"mixamorig:{side}{b}"] for b in ("Arm", "ForeArm", "Hand"))
    S = rig.matrix_world @ arm.head
    a = ((rig.matrix_world @ fore.head) - S).length
    b = ((rig.matrix_world @ hand.head) - (rig.matrix_world @ fore.head)).length
    d_vec = wrist - S
    d = min(d_vec.length, (a + b) * 0.999)
    u = d_vec.normalized()
    along = (a * a - b * b + d * d) / (2 * d)
    h = math.sqrt(max(0.0, a * a - along * along))
    hint = Vector((s * math.sin(UPPER_ABDUCTION), -0.15, -1.0))       # where the elbow should drop
    perp = (hint - u * hint.dot(u)).normalized()
    E = S + u * along + perp * h
    aim(rig, f"mixamorig:{side}Arm", E - S)
    aim(rig, f"mixamorig:{side}ForeArm", (S + u * d) - E)
    return E, S


def elbow_angle(S, E, W):
    v1, v2 = (S - E).normalized(), (W - E).normalized()
    return math.degrees(math.acos(max(-1.0, min(1.0, v1.dot(v2)))))


def orient_hand(rig, side):
    """Neutral wrist (no flexion/extension to speak of), a little ulnar deviation so the fingers line up
    with the key columns instead of pointing at the other hand; palm facing the keys."""
    update()
    fore = rig.pose.bones[f"mixamorig:{side}ForeArm"]
    d = ((rig.matrix_world @ fore.tail) - (rig.matrix_world @ fore.head)).normalized()
    straight = Vector((0, -1, 0))
    flat = d * 0.55 + straight * 0.45
    flat.z = 0.0                                   # knuckles at wrist height: the hand is level...
    aim(rig, f"mixamorig:{side}Hand", flat.normalized() + Vector((0, 0, 0.05)))   # ...+3 deg extension
    palm_down(rig, side)


def place_hands_on_keys(rig, dz):
    """Ergonomic typing posture (ISO 9241-5 / ergonomics guides): upper arms relaxed at the sides, elbows
    ~90-103 deg, forearms ~parallel to the floor, straight neutral wrists, curved fingers on the home row.
    The keyboard distance (REACH) is solved so the elbow angle hits TARGET_ELBOW; the wrist targets are
    corrected until the fingertips land on their keys. Returns the anchor."""
    update()
    rest = snapshot(rig, [pb.name for pb in rig.pose.bones])
    shoulder = rig.matrix_world @ rig.pose.bones["mixamorig:LeftArm"].head
    four = ("Index", "Middle", "Ring", "Pinky")
    reach_lo, reach_hi = 0.25, 0.55
    anchor = None
    for rit in range(10):                      # solve the keyboard distance for the elbow angle
        reach = (reach_lo + reach_hi) / 2
        anchor = Vector((0.0, shoulder.y - reach, KEY_TOP + TIP - dz))
        keys = {side: {f: key_point(anchor, c, r) for f, (c, r) in fingers.items()} for side, fingers in HOME.items()}
        # thumbs rest on the space bar roughly under their own index finger (a hair toward the centre),
        # not on the innermost key of the bottom row (with the row stagger that point is far inside)
        for side in ("Left", "Right"):
            sgn = 1 if side == "Left" else -1
            idx = keys[side]["Index"]
            keys[side]["Thumb"] = Vector((idx.x - sgn * 0.012, anchor.y + Z0 + 4 * PITCH, anchor.z + 0.004))
        offset = {side: Vector((0.0, 0.1, 0.05)) for side in ("Left", "Right")}
        for it in range(4):                    # land the fingertips on their keys
            restore(rig, rest)
            for side in ("Left", "Right"):
                palm = sum((keys[side][f] for f in four), Vector()) / 4
                solve_arm(rig, side, palm + offset[side])
                orient_hand(rig, side)
                dev = [flex_finger(rig, side, f, keys[side][f]) for f in four]
                flex_finger(rig, side, "Thumb", keys[side]["Thumb"])
                err = sum(((keys[side][f] - tip(rig, side, f)) for f in four), Vector()) / 4
                err.z = 0
                offset[side] += err
                # keep the solved angles near the study means: extra MCP flexion → hand too high,
                # extra PIP flexion → hand too far forward
                offset[side].z -= 0.05 * (sum(d[0] for d in dev) / len(dev))
                offset[side].y += 0.03 * (sum(d[1] for d in dev) / len(dev))
        update()
        S = rig.matrix_world @ rig.pose.bones["mixamorig:LeftArm"].head
        E = rig.matrix_world @ rig.pose.bones["mixamorig:LeftForeArm"].head
        W = rig.matrix_world @ rig.pose.bones["mixamorig:LeftHand"].head
        ang = elbow_angle(S, E, W)
        print("REACH", round(reach, 3), "elbow", round(ang, 1), "fingertip err cm", round(err.length * 100, 2))
    for side in ("Left", "Right"):
        print("THUMB", side, thumb_report(rig, side, keys[side]["Thumb"]))
        for f in four:
            e = tip(rig, side, f) - keys[side][f]
            print("JOINTS", side, f, joint_angles(rig, side, f), "ref", REF_DEG[f],
                  "tip err cm: row", round(e.y * 100, 2), "col", round(e.x * 100, 2), "height", round((e.z - TIP) * 100, 2))
        if ang > TARGET_ELBOW:
            reach_hi = reach       # arm too open → bring the keyboard closer
        else:
            reach_lo = reach
    return anchor


# ---------------------------------------------------------------- hood + headphones

def head_frame(rig):
    """Head centre and axes in world space (after posing)."""
    update()
    head = rig.pose.bones["mixamorig:Head"]
    m = rig.matrix_world @ head.matrix
    up = (m.to_3x3() @ Vector((0, 1, 0))).normalized()
    right = Vector((1, 0, 0))
    forward = up.cross(right).normalized()          # character faces -Y
    if forward.y > 0:
        forward = -forward
    right = forward.cross(up).normalized() * -1
    # the head bone starts at the nape: the skull centre (and the ears) sit a bit forward of it
    centre = m.translation + up * 0.085 + forward * 0.025
    return centre, up, right, forward


def mesh_from(verts, faces, name):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def remove_lowered_hood(jacket, centre, up, forward):
    """The sweatshirt's own hood hangs down the back: drop it, the raised hood replaces it."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(jacket.data)
    mw = jacket.matrix_world
    doomed = []
    for v in bm.verts:
        p = mw @ v.co
        rel = p - centre
        if rel.dot(up) > -0.13 and rel.dot(forward) < -0.02:   # the hood bundle behind the neck only
            doomed.append(v)
    bmesh.ops.delete(bm, geom=doomed, context="VERTS")
    bm.to_mesh(jacket.data)
    bm.free()
    print("HOOD_REMOVED_VERTS", len(doomed))


def build_hood(body, centre, up, right, forward):
    """Raised hood: a smoothed, inflated copy of the head/neck with the face opening cut out."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(body.data)
    mw = body.matrix_world
    keep = set()
    for v in bm.verts:
        rel = mw @ v.co - centre
        if rel.length < 0.27 and rel.dot(up) > -0.25:
            keep.add(v)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v not in keep], context="VERTS")
    # smooth away nose/ears/chin so the hood reads as fabric over a skull
    for _ in range(40):
        bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.6, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    for v in bm.verts:
        p = mw @ v.co
        rel = p - centre
        d = rel.normalized()
        back = max(0.0, -d.dot(forward))
        top = max(0.0, d.dot(up))
        low = min(1.0, max(0.0, (-rel.dot(up) - 0.06) / 0.18))   # neck/shoulder band: drape outward
        side = d.dot(right)
        seam = math.exp(-(side / 0.035) ** 2) * back * 0.012                 # centre seam groove
        under_band = math.exp(-(d.dot(forward) / 0.09) ** 2) * top * 0.022   # headband presses the fabric
        push = 0.05 + 0.05 * back + 0.045 * top * back + 0.06 * low - seam - under_band
        v.co = mw.inverted() @ (centre + d * (rel.length + push))
    # cut the face opening
    def is_opening(f):
        rel = (mw @ f.calc_center_median()) - centre
        return rel.normalized().dot(forward) > 0.42 and rel.dot(up) > -0.14
    opening = [f for f in bm.faces if is_opening(f)]
    bmesh.ops.delete(bm, geom=opening, context="FACES")
    me = bpy.data.meshes.new("Hood")
    bm.to_mesh(me)
    bm.free()
    hood = bpy.data.objects.new("Hood", me)
    hood.matrix_world = mw.copy()
    # same vertex-group order as the body: the deform layer copied by bmesh keeps its skin weights
    for vg in body.vertex_groups:
        hood.vertex_groups.new(name=vg.name)
    bpy.context.scene.collection.objects.link(hood)
    # fabric: soft wrinkles, then thickness with a rolled rim around the face opening
    tex = bpy.data.textures.new("hood_wrinkles", "CLOUDS")
    tex.noise_scale = 0.045
    tex.noise_depth = 2
    disp = hood.modifiers.new("wrinkles", "DISPLACE")
    disp.texture = tex
    disp.strength = 0.03
    disp.mid_level = 0.5
    sub = hood.modifiers.new("smooth", "SUBSURF")
    sub.levels = 1
    sol = hood.modifiers.new("thickness", "SOLIDIFY")
    sol.thickness = 0.008
    for poly in me.polygons:
        poly.use_smooth = True
    return hood


def tube(points, radius, name, resolution=4):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = resolution
    sp = cu.splines.new("POLY")
    sp.points.add(len(points) - 1)
    for p, pt in zip(sp.points, points):
        p.co = (pt.x, pt.y, pt.z, 1)
    ob = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def disc(name, centre, axis, radius, depth, bevel=0.005):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=radius, depth=depth, location=centre)
    ob = bpy.context.active_object
    ob.name = name
    ob.rotation_euler = Vector((0, 0, 1)).rotation_difference(axis).to_euler()
    b = ob.modifiers.new("bevel", "BEVEL")
    b.width = bevel
    b.segments = 3
    return ob


def ring(name, centre, axis, major, minor):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=48, minor_segments=12, location=centre)
    ob = bpy.context.active_object
    ob.name = name
    ob.rotation_euler = Vector((0, 0, 1)).rotation_difference(axis).to_euler()
    return ob


def build_headphones(centre, up, right, forward):
    """Over-ear headset worn over the hood: band + padding, yokes, cups, cushions, LED rings, mic boom."""
    shell, soft, led = [], [], []
    ear = 0.128       # hood surface at the ears
    for s in (-1, 1):
        axis = right * s
        c = centre + axis * (ear + 0.018) - up * 0.015
        shell.append(disc(f"cup{s}", c, axis, 0.05, 0.036))
        soft.append(ring(f"cushion{s}", centre + axis * ear - up * 0.015, axis, 0.042, 0.014))
        led.append(ring(f"led{s}", c + axis * 0.019, axis, 0.032, 0.0035))
        # yoke: from the cup top up into the band
        shell.append(tube([c + up * 0.045, c + up * 0.07 - axis * 0.004, c + up * 0.095 - axis * 0.012], 0.006, f"yoke{s}"))
    band = [centre + up * 0.03 + right * math.cos(t) * 0.14 + up * math.sin(t) * 0.142
            for t in [math.pi * i / 40 for i in range(41)]]
    shell.append(tube(band, 0.011, "band"))
    pad = [centre + up * 0.03 + right * math.cos(t) * 0.128 + up * math.sin(t) * 0.129
           for t in [math.pi * (0.2 + 0.6 * i / 30) for i in range(31)]]
    soft.append(tube(pad, 0.013, "pad"))
    # mic boom from the left cup to the mouth
    lc = centre - right * (ear + 0.03) - up * 0.03
    boom = [lc + forward * 0.02, lc + forward * 0.07 - up * 0.02 + right * 0.01,
            centre + forward * 0.12 - up * 0.075 - right * 0.07, centre + forward * 0.14 - up * 0.085 - right * 0.03]
    shell.append(tube(boom, 0.0045, "boom"))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.013, location=boom[-1])
    soft.append(bpy.context.active_object)

    def merge(objs, name):
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.convert(target="MESH")
        bpy.ops.object.join()
        out = bpy.context.active_object
        out.name = name
        for poly in out.data.polygons:
            poly.use_smooth = True
        return out

    return merge(shell, "HP_Shell"), merge(soft, "HP_Cushion"), merge(led, "HP_LED")


def make_pose_rest(rig):
    """The seated pose becomes the rest pose: the web only animates small offsets from it."""
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def parent_to_bone(objects, rig, bone):
    """Rigid props (headset) ride on a bone instead of being skinned."""
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    rig.data.bones.active = rig.data.bones[bone]
    bpy.ops.object.parent_set(type="BONE", keep_transform=True)


# ---------------------------------------------------------------- export

RENAME = {
    "Human": "Skin",
    "Human.elvs_hooded_sweat_jacket1": "Hoodie",
    "Human.elvs_jeans_straight_leg": "Jeans",
    "Human.punkduck_comfortable_sneakers": "Shoes",
    "Human.eyebrow010": "Brows",
    "Human.eyelashes01": "Lashes",
    "Human.short02": "Hair",
}


def export(path):
    bpy.ops.object.select_all(action="DESELECT")
    for o in bpy.data.objects:
        if o.type == "MESH" and o.name != "PreviewCam":
            o.select_set(True)
    for o in bpy.data.objects:
        if o.type in ("ARMATURE", "EMPTY"):
            o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True,
                              export_materials="NONE", export_texcoords=False, export_normals=True,
                              export_skins=True, export_animations=False, export_def_bones=True)
    tris = sum(len(o.data.loop_triangles) for o in bpy.data.objects if o.type == "MESH" and o.select_get())
    print("EXPORTED", path, "objects:", len(bpy.context.selected_objects))


# ---------------------------------------------------------------- main

clear_scene()
body, rig = build_human()
print("OBJECTS", [(o.name, o.type) for o in bpy.data.objects])

if STAGE == "base":
    preview("base_front", (0, -3.2, 1.0))
    preview("base_back", (0.6, 3.2, 1.2))
else:
    pose_seated(rig)
    dz = seat_offset(rig)
    anchor = place_hands_on_keys(rig, dz)
    centre, up, right, forward = head_frame(rig)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    bake(meshes)
    for o in meshes:
        o.name = RENAME.get(o.name, o.name)
        print("PARENT", o.name, o.parent.name if o.parent else None, o.parent_type)
        # MPFB parents clothes with parent_type ARMATURE = an implicit second deform; make it plain
        world = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = world
    remove_lowered_hood(bpy.data.objects["Hoodie"], centre, up, forward)
    hood = build_hood(bpy.data.objects["Skin"], centre, up, right, forward)
    bake([hood])
    phones = build_headphones(centre, up, right, forward)
    for o in [o for o in bpy.data.objects if o.type == "EMPTY"]:
        bpy.data.objects.remove(o, do_unlink=True)
    key_anchor = empty("KeyAnchor", anchor)     # web aligns this with the keyboard's F–J midpoint
    make_pose_rest(rig)
    skinned = [o for o in bpy.data.objects if o.type == "MESH" and not o.name.startswith("HP_")]
    for o in skinned:
        o.parent = rig
        o.matrix_parent_inverse = rig.matrix_world.inverted()
        mod = o.modifiers.new("Armature", "ARMATURE")
        mod.object = rig
    parent_to_bone(list(phones), rig, "mixamorig:Head")
    key_anchor.parent = rig
    key_anchor.matrix_parent_inverse = rig.matrix_world.inverted()
    rig.location.z += dz
    update()
    print("ANCHOR_FINAL", tuple(round(v, 3) for v in key_anchor.matrix_world.translation))
    for o in bpy.data.objects:
        if o.type == "MESH":
            o.data.calc_loop_triangles()
            print("TRIS", o.name, len(o.data.loop_triangles))
    preview("posed_back", (0.9, 2.3, 1.55), target=(0, -0.1, 0.95), lens=45)
    preview("posed_side", (2.4, -0.2, 1.1), target=(0, -0.15, 0.85), lens=45)
    preview("posed_front", (0.3, -2.2, 1.3), target=(0, 0, 1.0), lens=45)
    preview("chest", (0.25, -1.3, 1.05), target=(0, 0, 1.0), lens=50)
    a = bpy.data.objects["KeyAnchor"].matrix_world.translation
    dbg = []
    for side, fingers in HOME.items():               # preview-only key markers (not exported)
        for f, (c, r) in fingers.items():
            p = key_point(a, c, r)
            if f == "Thumb":
                sgn = 1 if side == "Left" else -1
                idx = key_point(a, *HOME[side]["Index"])
                p = Vector((idx.x - sgn * 0.012, a.y + Z0 + 4 * PITCH, a.z + 0.004))
            bpy.ops.mesh.primitive_cube_add(size=0.018, location=(p.x, p.y, p.z - 0.012))
            bpy.context.active_object.name = f"DBG_{side}{f}"
            dbg.append(bpy.context.active_object)
    preview("hands_close", (a.x + 0.45, a.y - 0.35, a.z + 0.35), target=(a.x, a.y + 0.03, a.z), lens=40)
    preview("hands_top", (a.x, a.y + 0.05, a.z + 0.75), target=(a.x, a.y + 0.05, a.z), lens=50)
    preview("hands_front", (a.x, a.y - 0.6, a.z + 0.12), target=(a.x, a.y, a.z + 0.03), lens=50)
    preview("hands_side", (a.x + 0.75, a.y + 0.02, a.z + 0.06), target=(a.x + 0.1, a.y + 0.04, a.z + 0.03), lens=60)
    preview("fingers_left", (a.x + 0.32, a.y - 0.14, a.z + 0.1), target=(a.x + 0.07, a.y + 0.02, a.z + 0.02), lens=70)
    preview("fingers_right", (a.x - 0.32, a.y - 0.14, a.z + 0.1), target=(a.x - 0.07, a.y + 0.02, a.z + 0.02), lens=70)
    preview("fingers_low", (a.x, a.y - 0.3, a.z + 0.01), target=(a.x, a.y + 0.04, a.z + 0.02), lens=60)
    preview("thumb_right", (a.x - 0.2, a.y - 0.12, a.z - 0.02), target=(a.x - 0.05, a.y + 0.05, a.z + 0.01), lens=85)
    # thenar web close-ups (left hand, whose thumb faces the centre): above, inner side, front
    wl = bpy.context.scene.objects  # noqa
    preview("web_top", (a.x + 0.06, a.y + 0.06, a.z + 0.28), target=(a.x + 0.06, a.y + 0.06, a.z + 0.02), lens=90)
    # index knuckle (MCP) of the left hand, from above-inside and from the radial side
    k = bpy.data.objects["Skin"]  # noqa
    preview("knuckle_top", (a.x + 0.05, a.y + 0.12, a.z + 0.34), target=(a.x + 0.06, a.y + 0.08, a.z + 0.04), lens=70)
    preview("knuckle_side", (a.x - 0.2, a.y + 0.14, a.z + 0.12), target=(a.x + 0.06, a.y + 0.08, a.z + 0.04), lens=70)
    preview("web_inner", (a.x - 0.12, a.y + 0.03, a.z + 0.06), target=(a.x + 0.06, a.y + 0.06, a.z + 0.03), lens=90)
    preview("web_front", (a.x + 0.05, a.y - 0.2, a.z + 0.07), target=(a.x + 0.06, a.y + 0.06, a.z + 0.03), lens=90)
    preview("thumb_under", (a.x, a.y + 0.05, a.z - 0.25), target=(a.x, a.y + 0.05, a.z), lens=60)
    for o in dbg:
        bpy.data.objects.remove(o, do_unlink=True)
    export(os.path.join(OUT, "analyst.glb"))
