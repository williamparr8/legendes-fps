import bpy, os, glob, sys

ROOT = r"C:\Users\willi\projets\legendes-fps\assets-src"
OUT = os.path.join(ROOT, "out")
os.makedirs(OUT, exist_ok=True)
TARGET_TRIS = 9000
TEX = 1024

bpy.ops.wm.read_factory_settings(use_empty=True)

def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)

# ---- personnage ----
bpy.ops.import_scene.fbx(filepath=os.path.join(ROOT, "SwatGuy_skin.fbx"))
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
total = sum(tris(m) for m in meshes)
print("PERSO triangles avant :", total, "meshes:", [(m.name, tris(m)) for m in meshes])
print("os :", len(arm.data.bones), "racine :", arm.data.bones[0].name)
if total > TARGET_TRIS:
    ratio = TARGET_TRIS / total
    for m in meshes:
        bpy.context.view_layer.objects.active = m
        mod = m.modifiers.new("dec", 'DECIMATE')
        mod.ratio = ratio
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception as e:
            print("decimate echec", m.name, e)
print("PERSO triangles apres :", sum(tris(m) for m in meshes))

# textures : réduites à 1024 px
for img in bpy.data.images:
    if img.size[0] > TEX or img.size[1] > TEX:
        w, h = img.size
        k = TEX / max(w, h)
        img.scale(max(1, int(w * k)), max(1, int(h * k)))
print("images :", [(i.name, tuple(i.size)) for i in bpy.data.images])

# ---- animations : on garde l'action de chaque FBX et on l'attache au personnage ----
arm.animation_data_create()
for f in sorted(glob.glob(os.path.join(ROOT, "anims", "*.fbx"))):
    name = os.path.splitext(os.path.basename(f))[0].replace(" ", "_")
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=f)
    new = [o for o in bpy.data.objects if o not in before]
    act = None
    for o in new:
        if o.type == 'ARMATURE' and o.animation_data and o.animation_data.action:
            act = o.animation_data.action
    if act is None:
        print("PAS D'ACTION :", name)
    else:
        act.name = name
        act.use_fake_user = True
        # piste NLA pour que l'export glTF garde chaque clip
        tr = arm.animation_data.nla_tracks.new()
        tr.name = name
        tr.strips.new(name, 0, act)
        print("anim", name, "frames", tuple(act.frame_range))
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)

arm.animation_data.action = None
out = os.path.join(OUT, "swat.glb")
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=True,
                          export_animation_mode='NLA_TRACKS', export_image_format='JPEG',
                          export_jpeg_quality=80, export_apply=False)
print("EXPORT :", out, os.path.getsize(out) // 1024, "Ko")
