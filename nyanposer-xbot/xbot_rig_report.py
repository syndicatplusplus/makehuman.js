import bpy
from pathlib import Path

if not bpy.data.filepath:
    raise RuntimeError("Save the .blend file first so the report has somewhere to go.")

lines = []
lines.append("NYANPOSER X Bot rig report")
lines.append("=" * 72)
lines.append(f"Blend file: {bpy.data.filepath}")
lines.append("")

armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]

lines.append(f"Armature objects: {len(armatures)}")
lines.append(f"Mesh objects: {len(meshes)}")
lines.append("")

for arm in armatures:
    lines.append(f"ARMATURE: {arm.name}")
    lines.append(f"  location: {tuple(round(v, 6) for v in arm.location)}")
    lines.append(f"  rotation_euler: {tuple(round(v, 6) for v in arm.rotation_euler)}")
    lines.append(f"  scale: {tuple(round(v, 6) for v in arm.scale)}")
    lines.append(f"  bones: {len(arm.data.bones)}")
    lines.append("  hierarchy:")
    for bone in arm.data.bones:
        parent = bone.parent.name if bone.parent else "<ROOT>"
        lines.append(
            f"    {bone.name} | parent={parent} | "
            f"head={tuple(round(v, 6) for v in bone.head_local)} | "
            f"tail={tuple(round(v, 6) for v in bone.tail_local)}"
        )
    lines.append("")

for mesh in meshes:
    lines.append(f"MESH: {mesh.name}")
    lines.append(f"  location: {tuple(round(v, 6) for v in mesh.location)}")
    lines.append(f"  rotation_euler: {tuple(round(v, 6) for v in mesh.rotation_euler)}")
    lines.append(f"  scale: {tuple(round(v, 6) for v in mesh.scale)}")
    lines.append(f"  vertices: {len(mesh.data.vertices)}")
    lines.append(f"  polygons: {len(mesh.data.polygons)}")
    lines.append(f"  materials: {[slot.material.name if slot.material else '<None>' for slot in mesh.material_slots]}")
    lines.append("  modifiers:")
    for mod in mesh.modifiers:
        target = getattr(mod, "object", None)
        target_name = target.name if target else ""
        lines.append(f"    {mod.type}: {mod.name} {target_name}".rstrip())

    lines.append(f"  vertex groups: {len(mesh.vertex_groups)}")
    for group in mesh.vertex_groups:
        weighted_count = 0
        total_weight = 0.0
        for vert in mesh.data.vertices:
            for membership in vert.groups:
                if membership.group == group.index:
                    weighted_count += 1
                    total_weight += membership.weight
                    break
        lines.append(
            f"    {group.name} | weighted_vertices={weighted_count} | "
            f"weight_sum={total_weight:.6f}"
        )
    lines.append("")

report = "\n".join(lines)

out_path = Path(bpy.path.abspath("//xbot-rig-report.txt"))
out_path.write_text(report, encoding="utf-8")

print(report)
print("")
print(f"Saved report to: {out_path}")

text_name = "xbot-rig-report.txt"
if text_name in bpy.data.texts:
    bpy.data.texts.remove(bpy.data.texts[text_name])
text_block = bpy.data.texts.new(text_name)
text_block.write(report)
