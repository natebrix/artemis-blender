#!/usr/bin/env python3
"""
export_web.py - export a lightweight GLB of ARTEMIS.blend for the web simulator.

    python export_web.py [--blend ARTEMIS.blend] [--out sim/assets/artemis.glb] [--tris 220000]

Keeps the joint empties (J_*), joins the parts of each joint by material,
decimates them to the triangle budget and replaces refractive/procedural
materials with plain ones that three.js renders cheaply.
"""
import argparse
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("--blend", default=os.path.join(HERE, "ARTEMIS.blend"))
    ap.add_argument("--out", default=os.path.join(HERE, "sim", "assets", "artemis.glb"))
    ap.add_argument("--tris", type=int, default=220000)
    a = ap.parse_args(argv)
    bpy.ops.wm.open_mainfile(filepath=a.blend)
    sc = bpy.context.scene
    root = bpy.data.objects["ARTEMIS"]
    if root.animation_data:
        root.animation_data.action = None
    sc.frame_set(1)

    # drop studio, drivers and modifiers; the simulator animates joints itself
    for name in ("Studio",):
        col = bpy.data.collections.get(name)
        if col:
            for o in list(col.objects):
                bpy.data.objects.remove(o)
    for o in bpy.data.objects:
        if o.animation_data:
            for fc in list(o.animation_data.drivers):
                o.animation_data.drivers.remove(fc)
        for m in list(o.modifiers):
            o.modifiers.remove(m)
    for o in bpy.data.objects:
        if o.name.startswith("J_"):
            o.rotation_euler = (0, 0, 0)

    # simple materials
    for m in bpy.data.materials:
        if not m.node_tree:
            continue
        b = m.node_tree.nodes.get("Principled BSDF")
        if b is None:
            continue
        for sock in ("Base Color", "Roughness", "Normal"):
            for l in list(b.inputs[sock].links):
                m.node_tree.links.remove(l)
        n = m.name
        if n.startswith("Bumper Fabric"):
            b.inputs["Base Color"].default_value = (0.006, 0.026, 0.20, 1)
            b.inputs["Roughness"].default_value = 0.9
        elif n.startswith("Plywood"):
            b.inputs["Base Color"].default_value = (0.62, 0.45, 0.27, 1)
            b.inputs["Roughness"].default_value = 0.7
        elif n.startswith("Polycarbonate"):
            smoked = "Smoked" in n
            b.inputs["Transmission Weight"].default_value = 0.0
            b.inputs["Base Color"].default_value = (0.03, 0.03, 0.035, 1) if smoked else (0.8, 0.85, 0.9, 1)
            b.inputs["Alpha"].default_value = 0.55 if smoked else 0.22
            b.inputs["Roughness"].default_value = 0.08
            m.surface_render_method = "BLENDED"
        else:
            if b.inputs["Roughness"].default_value < 0.2:
                b.inputs["Roughness"].default_value = 0.3
            b.inputs["Subsurface Weight"].default_value = 0.0

    # join per (parent, material-set), keeping the sliding hopper walls separate
    groups = {}
    for o in bpy.data.objects:
        if o.type != "MESH" or o.parent is None:
            continue
        if "Hopper Side Wall" in o.name:
            continue
        key = (o.parent.name, tuple(s.material.name if s.material else "" for s in o.material_slots)[:1])
        groups.setdefault(key, []).append(o)
    joined = []
    bpy.ops.object.select_all(action="DESELECT")
    for (parent, mat), objs in groups.items():
        for o in objs:
            o.hide_set(False)
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1:
            bpy.ops.object.join()
        j = bpy.context.view_layer.objects.active
        j.name = f"{parent[2:] if parent.startswith('J_') else 'chassis'}__{len(joined):03d}"
        joined.append(j)
        bpy.ops.object.select_all(action="DESELECT")

    def tris(o):
        return sum(len(p.vertices) - 2 for p in o.data.polygons)

    total = sum(tris(o) for o in joined)
    ratio = min(1.0, a.tris / total)
    for o in joined:
        t = tris(o)
        if t > 300:
            mod = o.modifiers.new("dec", "DECIMATE")
            mod.ratio = max(ratio, min(1.0, 200 / t))
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier=mod.name)
        for p in o.data.polygons:
            p.use_smooth = True
    for o in bpy.data.objects:
        if o.type == "MESH":
            for k in list(o.keys()):
                del o[k]
    print("[web] triangles", total, "->", sum(tris(o) for o in joined), "in", len(joined), "meshes", flush=True)

    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=a.out, export_format="GLB", export_apply=True,
                              export_yup=True, export_animations=False, export_extras=False,
                              export_cameras=False, export_lights=False)
    print("[web] wrote", a.out, os.path.getsize(a.out) // 1024, "kB", flush=True)


if __name__ == "__main__":
    main()
