class_name Props
# Small models built from primitives: an elephant, a tuk tuk, the item box, a coin and
# rockets/coconuts/oil for the power-ups. Each stands on y = 0, facing +z.


static func part(mesh: Mesh, mat: Material, pos := Vector3.ZERO, scale := Vector3.ONE, rot := Vector3.ZERO) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = pos
	mi.scale = scale
	mi.rotation = rot
	return mi


static func sphere(r: float, segs := 16) -> SphereMesh:
	var m := SphereMesh.new()
	m.radius = r
	m.height = r * 2
	m.radial_segments = segs
	m.rings = segs / 2
	return m


static func cyl(r_top: float, r_bottom: float, h: float, segs := 16) -> CylinderMesh:
	var m := CylinderMesh.new()
	m.top_radius = r_top
	m.bottom_radius = r_bottom
	m.height = h
	m.radial_segments = segs
	return m


static func box(x: float, y: float, z: float) -> BoxMesh:
	var m := BoxMesh.new()
	m.size = Vector3(x, y, z)
	return m


static func elephant() -> Node3D:
	# root > body (child 0, swayed as it walks)
	var root := Node3D.new()
	var body := Node3D.new()
	root.add_child(body)
	var skin := Looks.plain(Color(0.42, 0.39, 0.37), 0.95)
	body.add_child(part(sphere(1.0), skin, Vector3(0, 2.2, 0), Vector3(1.25, 1.15, 1.9)))
	body.add_child(part(sphere(0.8), skin, Vector3(0, 2.75, 1.85)))
	for side in [-1.0, 1.0]:
		body.add_child(part(sphere(0.7, 10), skin, Vector3(side * 0.75, 2.8, 1.6), Vector3(0.2, 1.0, 0.85), Vector3(0, side * 0.4, 0)))
		body.add_child(part(cyl(0.08, 0.1, 0.9, 6), Looks.plain(Color(0.95, 0.92, 0.85), 0.6), Vector3(side * 0.35, 2.15, 2.4), Vector3.ONE, Vector3(1.1, 0, 0)))
	body.add_child(part(cyl(0.16, 0.3, 1.9, 8), skin, Vector3(0, 1.8, 2.45), Vector3.ONE, Vector3(-0.15, 0, 0)))
	for x in [-0.6, 0.6]:
		for z in [-1.1, 1.1]:
			root.add_child(part(cyl(0.34, 0.38, 1.8, 10), skin, Vector3(x, 0.9, z)))
	body.add_child(part(cyl(0.05, 0.1, 0.8, 6), skin, Vector3(0, 2.0, -1.95), Vector3.ONE, Vector3(-0.5, 0, 0)))
	# a festival caparison over its back
	body.add_child(part(box(1.9, 0.08, 2.2), Looks.plain(Color(0.75, 0.1, 0.12), 0.7), Vector3(0, 3.27, 0.1)))
	body.add_child(part(box(1.95, 0.1, 0.3), Looks.plain(Color(1.0, 0.75, 0.1), 0.4, 0.4), Vector3(0, 3.3, 1.2)))
	return root


static func tuk_tuk(colour: Color) -> Node3D:
	var root := Node3D.new()
	var paint := Looks.plain(colour, 0.35, 0.2)
	var dark := Looks.plain(Color(0.08, 0.08, 0.09), 0.6)
	var glass := Looks.plain(Color(0.15, 0.25, 0.3, 0.55), 0.05)
	root.add_child(part(box(1.3, 0.55, 2.5), paint, Vector3(0, 0.6, 0)))
	root.add_child(part(box(1.25, 0.08, 1.6), dark, Vector3(0, 1.82, -0.25)))
	root.add_child(part(box(1.28, 1.0, 1.5), Looks.plain(Color(0.1, 0.1, 0.1), 0.7), Vector3(0, 1.32, -0.3)))
	root.add_child(part(box(1.2, 0.9, 0.06), glass, Vector3(0, 1.35, 0.5), Vector3.ONE, Vector3(-0.25, 0, 0)))
	root.add_child(part(box(0.7, 0.9, 0.9), paint, Vector3(0, 0.8, 0.95)))
	root.add_child(part(box(1.3, 0.14, 2.0), paint, Vector3(0, 1.88, -0.2)))
	for p in [Vector3(0, 0.3, 1.15), Vector3(-0.6, 0.3, -0.75), Vector3(0.6, 0.3, -0.75)]:
		root.add_child(part(cyl(0.28, 0.28, 0.18, 12), dark, p, Vector3.ONE, Vector3(0, 0, PI / 2)))
	root.add_child(part(sphere(0.1, 8), Looks.plain(Color(1, 0.95, 0.7), 0.3, 0.0, 2.0), Vector3(0, 0.95, 1.42)))
	return root


static func item_box() -> Node3D:
	var root := Node3D.new()
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.25, 0.75, 1.0, 0.55)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.emission_enabled = true
	mat.emission = Color(0.2, 0.6, 1.0)
	mat.emission_energy_multiplier = 1.4
	mat.roughness = 0.1
	mat.metallic_specular = 1.0
	mat.rim_enabled = true
	mat.rim = 1.0
	root.add_child(part(box(1.2, 1.2, 1.2), mat))
	var frame := Looks.plain(Color(1.0, 0.85, 0.2), 0.3, 0.6, 0.8)
	for e in [Vector3(1, 1, 0), Vector3(1, -1, 0), Vector3(-1, 1, 0), Vector3(-1, -1, 0)]:
		root.add_child(part(box(0.1, 0.1, 1.3), frame, e * 0.6))
		root.add_child(part(box(1.3, 0.1, 0.1), frame, Vector3(0, e.x, e.y) * 0.6))
		root.add_child(part(box(0.1, 1.3, 0.1), frame, Vector3(e.x, 0, e.y) * 0.6))
	for face in [Vector3(0, 0, 0.62), Vector3(0, 0, -0.62), Vector3(0.62, 0, 0), Vector3(-0.62, 0, 0)]:
		var q := Label3D.new()
		q.text = "?"
		q.font = load("res://assets/fonts/RussoOne-Regular.ttf")
		q.font_size = 96
		q.pixel_size = 0.009
		q.outline_size = 16
		q.outline_modulate = Color(0.1, 0.2, 0.5)
		q.position = face
		q.look_at_from_position(face, face * 2, Vector3.UP)
		q.rotate_object_local(Vector3.UP, PI)
		root.add_child(q)
	return root


static func coin_mesh() -> Mesh:
	var m := cyl(0.45, 0.45, 0.1, 20)
	return m


static func rocket() -> Node3D:
	var root := Node3D.new()
	root.add_child(part(cyl(0.18, 0.18, 1.2, 10), Looks.plain(Color(0.85, 0.15, 0.2), 0.4), Vector3.ZERO, Vector3.ONE, Vector3(PI / 2, 0, 0)))
	root.add_child(part(cyl(0.0, 0.18, 0.45, 10), Looks.plain(Color(1.0, 0.85, 0.2), 0.3, 0.5), Vector3(0, 0, 0.82), Vector3.ONE, Vector3(PI / 2, 0, 0)))
	root.add_child(part(sphere(0.3, 10), Looks.plain(Color(1.0, 0.6, 0.15), 0.5, 0.0, 6.0), Vector3(0, 0, -0.7)))
	return root


static func coconut() -> Node3D:
	var root := Node3D.new()
	root.add_child(part(sphere(0.38, 12), Looks.plain(Color(0.95, 0.55, 0.1), 0.6), Vector3(0, 0.38, 0), Vector3(1, 1.15, 1)))
	return root


static func oil() -> Node3D:
	var root := Node3D.new()
	var m := Looks.plain(Color(0.03, 0.03, 0.04), 0.05, 0.6)
	root.add_child(part(cyl(2.0, 2.0, 0.03, 20), m, Vector3(0, 0.03, 0), Vector3(1, 1, 1.3)))
	return root


static func shield_bubble() -> MeshInstance3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.3, 0.8, 1.0, 0.18)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.emission_enabled = true
	mat.emission = Color(0.3, 0.8, 1.0)
	mat.emission_energy_multiplier = 0.6
	mat.rim_enabled = true
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	return part(sphere(2.6, 24), mat, Vector3(0, 0.9, 0), Vector3(1, 0.7, 1.3))
