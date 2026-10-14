import bpy, os, sys

# Variante de personnage Mixamo sans animations (les clips viennent de swat.glb : mêmes os mixamorig).
# Usage : blender --background --python tools/convert_variant.py -- <entrée.fbx> <sortie.glb>
argv = sys.argv[sys.argv.index("--") + 1:]
src, out = argv[0], argv[1]
TARGET_TRIS, TEX = 9000, 1024

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
tris = lambda o: sum(len(p.vertices) - 2 for p in o.data.polygons)
total = sum(tris(m) for m in meshes)
print("triangles avant :", total)
if total > TARGET_TRIS:
    ratio = TARGET_TRIS / total
    for m in meshes:
        bpy.context.view_layer.objects.active = m
        mod = m.modifiers.new("dec", 'DECIMATE')
        mod.ratio = ratio
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception as e:
            print("decimate echec", e)
print("triangles apres :", sum(tris(m) for m in meshes))
for img in bpy.data.images:
    if img.size[0] > TEX or img.size[1] > TEX:
        k = TEX / max(img.size[0], img.size[1])
        img.scale(max(1, int(img.size[0] * k)), max(1, int(img.size[1] * k)))
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=False,
                          export_image_format='JPEG', export_jpeg_quality=80)
print("EXPORT", out, os.path.getsize(out) // 1024, "Ko")
