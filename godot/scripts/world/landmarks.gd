class_name Landmarks
extends Node3D
# Each town's landmark beside the road as you approach it (maps.gd): Sigiriya, Adam's
# Peak, the Temple of the Tooth, the Lotus Tower, Dondra lighthouse, the waterfalls...
# Each kit stands on y = 0 with its front (+z) towards the road, in metres.

var world: World


func build(w: World) -> void:
	world = w
	var t := w.track
	for town in t.towns:
		var key: String = t.map.landmarks.get(town.name, "")
		if key == "" or not KITS.has(key):
			continue
		var kit: Dictionary = KITS[key]
		var dist: float = kit.dist
		# ahead of the town board, on the inland side (or out to sea)
		var s: float = clampf(town.s - 40.0, 60.0, t.finish - 20.0)
		var side := -1.0 if t.sea == 0 else -float(t.sea)
		if kit.get("sea", false):
			side = float(t.sea) if t.sea else 1.0
		var p := t.point(s, side * (Track.WALL + dist))
		var g := w.ground(p.x, p.z)
		var node: Node3D = call(kit.build)
		if kit.get("sea", false) and t.sea:
			g = w.sea_level
		node.position = Vector3(p.x, g - 0.5, p.z)
		# face the road
		node.rotation.y = w._face_road(t.heading_at(s), side)
		add_child(node)
		w.clear_zones.append({"pos": node.position, "r": kit.get("r", 40.0)})


const KITS := {
	"bibleRock": {"dist": 150, "build": "_bible_rock", "r": 60},
	"ambuluwawa": {"dist": 130, "build": "_ambuluwawa", "r": 55},
	"rambodaFalls": {"dist": 70, "build": "_ramboda", "r": 35},
	"postOffice": {"dist": 32, "build": "_post_office", "r": 22},
	"hakgalaRock": {"dist": 170, "build": "_hakgala", "r": 70},
	"harbour": {"dist": 80, "build": "_harbour", "sea": true, "r": 40},
	"mulkirigala": {"dist": 140, "build": "_mulkirigala", "r": 45},
	"blowhole": {"dist": 55, "build": "_blowhole", "sea": true, "r": 20},
	"dondraLighthouse": {"dist": 70, "build": "_lighthouse", "sea": true, "r": 20},
	"paraviDuwa": {"dist": 75, "build": "_paravi", "sea": true, "r": 20},
	"whale": {"dist": 120, "build": "_whale", "sea": true, "r": 15},
	"taprobane": {"dist": 100, "build": "_taprobane", "sea": true, "r": 25},
	"negomboLagoon": {"dist": 70, "build": "_lagoon", "r": 50},
	"muthurajawela": {"dist": 65, "build": "_marsh", "r": 45},
	"kelaniBridge": {"dist": 70, "build": "_kelani_bridge", "r": 60},
	"redMosque": {"dist": 34, "build": "_red_mosque", "r": 20},
	"twinTowers": {"dist": 70, "build": "_twin_towers", "r": 30},
	"lotusTower": {"dist": 75, "build": "_lotus_tower", "r": 15},
	"galleFace": {"dist": 45, "build": "_galle_face", "r": 30},
	"templeOfTooth": {"dist": 50, "build": "_temple_of_tooth", "r": 35},
	"victoriaDam": {"dist": 130, "build": "_victoria_dam", "r": 80},
	"knucklesPeaks": {"dist": 240, "build": "_knuckles_peaks", "r": 120},
	"corbettsGap": {"dist": 220, "build": "_corbetts_gap", "r": 120},
	"lakegala": {"dist": 200, "build": "_lakegala", "r": 100},
	"rafting": {"dist": 45, "build": "_rafting", "r": 40},
	"beliLena": {"dist": 90, "build": "_beli_lena", "r": 45},
	"aberdeenFalls": {"dist": 75, "build": "_aberdeen", "r": 35},
	"carolinaFalls": {"dist": 75, "build": "_carolina", "r": 40},
	"adamsPeak": {"dist": 280, "build": "_adams_peak", "r": 120},
	"devonFalls": {"dist": 85, "build": "_devon", "r": 35},
	"stClairs": {"dist": 75, "build": "_st_clairs", "r": 40},
	"dambullaTemple": {"dist": 110, "build": "_dambulla", "r": 65},
	"kandalama": {"dist": 110, "build": "_kandalama", "r": 50},
	"sigiriya": {"dist": 170, "build": "_sigiriya", "r": 60},
	"pidurangala": {"dist": 150, "build": "_pidurangala", "r": 60},
	"elephants": {"dist": 50, "build": "_elephants", "r": 35},
	"tankStumps": {"dist": 55, "build": "_tank_stumps", "r": 45},
}


# ---- kit pieces ---------------------------------------------------------------------------------
func _mat(c: Color, rough := 0.8) -> StandardMaterial3D:
	return Looks.plain(c, rough)


func _rock_mat(tint: Color) -> StandardMaterial3D:
	return Looks.textured("rock_face", 0.05, tint)


func _group(parts: Array) -> Node3D:
	var g := Node3D.new()
	for p in parts:
		g.add_child(p)
	return g


func _at(n: Node3D, pos: Vector3) -> Node3D:
	n.position = pos
	return n


## A lumpy granite dome, or a sheer-sided column (Sigiriya).
func _rock(w: float, h: float, tint := Color(0.75, 0.68, 0.6), column := false, garden := false) -> Node3D:
	var m: Mesh
	if column:
		m = Props.cyl(w * 0.42, w * 0.55, h, 14)
	else:
		m = Props.sphere(w / 2.0, 18)
	var arrays = m.get_mesh_arrays()
	var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	for i in verts.size():
		var v := verts[i]
		var k := 1.0 + sin(v.x * 0.37 + v.z * 0.51) * 0.07 + sin(v.y * 0.6 + v.x * 0.2) * 0.04
		verts[i] = Vector3(v.x * k, v.y, v.z * k)
	arrays[Mesh.ARRAY_VERTEX] = verts
	var st := SurfaceTool.new()
	var am := ArrayMesh.new()
	am.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	st.create_from(am, 0)
	st.generate_normals()
	st.generate_tangents()
	var mi := Props.part(st.commit(), _rock_mat(tint))
	if column:
		mi.position.y = h / 2
	else:
		mi.scale.y = h / (w / 2.0)
		mi.position.y = -h * 0.15
	var g := _group([mi])
	if garden:
		g.add_child(Props.part(Props.cyl(w * 0.43, w * 0.43, 1.5, 14), _mat(Color(0.35, 0.55, 0.25)), Vector3(0, h + 0.6, 0)))
		for i in 8:
			var a := i * TAU / 8
			g.add_child(Props.part(Props.sphere(2.5, 8), _mat(Color(0.2, 0.45, 0.2)), Vector3(cos(a) * w * 0.3, h + 2.5, sin(a) * w * 0.3)))
	return g


func _stupa(r: float, colour := Color(0.97, 0.96, 0.93)) -> Node3D:
	var white := _mat(colour, 0.6)
	return _group([
		Props.part(Props.cyl(r * 1.2, r * 1.25, r * 0.25, 32), white, Vector3(0, r * 0.12, 0)),
		Props.part(Props.cyl(r * 1.05, r * 1.1, r * 0.2, 32), white, Vector3(0, r * 0.35, 0)),
		Props.part(Props.sphere(r, 32), white, Vector3(0, r * 0.4, 0), Vector3(1, 1, 1)),
		Props.part(Props.box(r * 0.45, r * 0.3, r * 0.45), white, Vector3(0, r * 1.45, 0)),
		Props.part(Props.cyl(0.0, r * 0.14, r * 1.0, 16), Looks.plain(Color(0.9, 0.75, 0.35), 0.3, 0.8), Vector3(0, r * 2.05, 0)),
	])


func _waterfall(h: float, w: float, twin := false, cliff := Color(0.45, 0.6, 0.45)) -> Node3D:
	var g := _group([Props.part(Props.box(w * 6, h, 18), _rock_mat(cliff), Vector3(0, h / 2, -6))])
	var water := StandardMaterial3D.new()
	water.albedo_color = Color(0.92, 0.97, 1.0, 0.85)
	water.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	water.emission_enabled = true
	water.emission = Color(0.8, 0.9, 0.95)
	water.emission_energy_multiplier = 0.3
	var spray := Looks.plain(Color(1, 1, 1, 0.5), 0.9)
	var falls := [-w * 0.9, w * 0.9] if twin else [0.0]
	for x in falls:
		g.add_child(Props.part(Props.box(w, h, 0.4), water, Vector3(x, h / 2, 3.2)))
		g.add_child(Props.part(Props.sphere(w * 0.9, 12), spray, Vector3(x, 1, 4.5)))
	g.add_child(Props.part(Props.cyl(w * 2.5, w * 2.5, 0.4, 24), Looks.water(), Vector3(0, 0.4, 9)))
	# trees on top of the cliff
	for i in 6:
		var tree := Looks.instance("tree_detailed")
		tree.scale = Vector3.ONE * 7
		tree.position = Vector3((i - 2.5) * w, h, -6 + sin(i * 2.0) * 4)
		g.add_child(tree)
	return g


func _peak(h: float, tint := Color(0.5, 0.62, 0.58), shrine := false) -> Node3D:
	var m := Props.cyl(0.0, h * 0.8, h, 9)
	var arrays := m.get_mesh_arrays()
	var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	for i in verts.size():
		var v := verts[i]
		var k := 1.0 + sin(v.x * 0.05 + v.z * 0.07) * 0.12
		verts[i] = Vector3(v.x * k, v.y, v.z * k)
	arrays[Mesh.ARRAY_VERTEX] = verts
	var am := ArrayMesh.new()
	am.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var st := SurfaceTool.new()
	st.create_from(am, 0)
	st.generate_normals()
	st.generate_tangents()
	var g := _group([Props.part(st.commit(), Looks.textured("leafy_grass", 0.03, tint), Vector3(0, h / 2 - 2, 0))])
	if shrine:
		g.add_child(Props.part(Props.box(4, 3, 4), _mat(Color(0.95, 0.94, 0.9)), Vector3(0, h - 1, 0)))
	return g


func _tower(h: float, r: float, colour := Color(0.97, 0.97, 0.95), cap := Color(0.18, 0.18, 0.18)) -> Node3D:
	return _group([
		Props.part(Props.cyl(r * 0.7, r, h, 16), _mat(colour, 0.5), Vector3(0, h / 2, 0)),
		Props.part(Props.cyl(r * 0.9, r * 0.9, 3, 16), _mat(cap, 0.4), Vector3(0, h + 1.5, 0)),
	])


func _building(w: float, h: float, d: float, wall := Color(0.95, 0.94, 0.9), roof := Color(0.66, 0.31, 0.23)) -> Node3D:
	var g := _group([Props.part(Props.box(w, h, d), _mat(wall, 0.85), Vector3(0, h / 2, 0))])
	var prism := PrismMesh.new()
	prism.size = Vector3(w * 1.08, h * 0.45, d * 1.1)
	g.add_child(Props.part(prism, _mat(roof, 0.7), Vector3(0, h + h * 0.225, 0)))
	# rows of windows on the front
	var win := Looks.plain(Color(0.12, 0.16, 0.2), 0.15, 0.3)
	var rows := maxi(1, int(h / 4.0))
	for r in rows:
		var cols := maxi(2, int(w / 4.0))
		for c in cols:
			g.add_child(Props.part(Props.box(1.3, 1.8, 0.1), win, Vector3(-w / 2 + (c + 0.5) * w / cols, 2.2 + r * 4.0, d / 2 + 0.05)))
	return g


func _water_disc(r: float, colour := Color(0.36, 0.58, 0.65)) -> MeshInstance3D:
	return Props.part(Props.cyl(r, r, 0.3, 32), Looks.water(colour * 0.4, colour, 0.92), Vector3(0, 0.6, 0))


func _boats(n: int) -> Node3D:
	var g := Node3D.new()
	for i in n:
		var b := _group([
			Props.part(Props.box(6, 0.8, 1.4), _mat(Color(0.36, 0.23, 0.13)), Vector3(0, 0.4, 0)),
			Props.part(Props.box(0.15, 6, 0.15), _mat(Color(0.3, 0.2, 0.1)), Vector3(0.5, 3.4, 0)),
			Props.part(PrismMesh.new(), _mat(Color(0.94, 0.9, 0.82)), Vector3(1.4, 3.6, 0), Vector3(2.0, 5.0, 0.05)),
		])
		b.position = Vector3((i - n / 2.0) * 12, 0.5, sin(i * 2.3) * 8)
		b.rotation.y = i * 0.7
		g.add_child(b)
	return g


# ---- the landmarks ------------------------------------------------------------------------------
func _bible_rock() -> Node3D:
	var g := _peak(60, Color(0.45, 0.62, 0.55))
	var slab := Props.part(Props.box(70, 10, 30), _rock_mat(Color(0.6, 0.65, 0.62)), Vector3(0, 62, 0))
	slab.rotation.z = 0.06
	g.add_child(slab)
	return g


func _ambuluwawa() -> Node3D:
	var g := _peak(55, Color(0.4, 0.6, 0.35))
	var t := _tower(30, 2.4, Color(0.97, 0.96, 0.92), Color(0.97, 0.96, 0.92))
	t.position.y = 53
	g.add_child(t)
	# the spiral walkway
	for i in 10:
		var ring := Props.part(Props.cyl(3.2 - i * 0.12, 3.2 - i * 0.12, 0.3, 16), _mat(Color(0.95, 0.94, 0.9)), Vector3(0, 55 + i * 2.8, 0))
		g.add_child(ring)
	return g


func _ramboda() -> Node3D:
	return _waterfall(60, 9)


func _post_office() -> Node3D:
	var g := _building(28, 10, 12, Color(0.72, 0.33, 0.24), Color(0.36, 0.23, 0.18))
	var t := _tower(22, 2.6, Color(0.72, 0.33, 0.24), Color(0.36, 0.23, 0.18))
	t.position = Vector3(0, 0, 3)
	g.add_child(t)
	var clock := Props.part(Props.cyl(1.4, 1.4, 0.2, 24), _mat(Color(0.97, 0.95, 0.88)), Vector3(0, 19, 5.5), Vector3.ONE, Vector3(PI / 2, 0, 0))
	g.add_child(clock)
	return g


func _hakgala() -> Node3D:
	return _rock(110, 90, Color(0.55, 0.6, 0.55))


func _harbour() -> Node3D:
	var g := _group([
		Props.part(Props.box(40, 8, 12), _mat(Color(0.23, 0.37, 0.54)), Vector3(0, 2, 20)),
		Props.part(Props.box(12, 6, 10), _mat(Color(0.95, 0.95, 0.93)), Vector3(-10, 9, 20)),
	])
	for x in [-25.0, 0.0, 25.0]:
		g.add_child(Props.part(Props.box(2, 30, 2), _mat(Color(0.85, 0.66, 0.16)), Vector3(x, 15, 0)))
		g.add_child(Props.part(Props.box(22, 2, 2), _mat(Color(0.85, 0.66, 0.16)), Vector3(x, 30, 6)))
	for i in 6:
		g.add_child(Props.part(Props.box(6, 2.6, 2.4), _mat([Color(0.8, 0.2, 0.15), Color(0.15, 0.4, 0.75), Color(0.9, 0.7, 0.1)][i % 3]), Vector3(-14 + i * 6.5, 7.3, 20)))
	return g


func _mulkirigala() -> Node3D:
	var g := _rock(70, 60, Color(0.65, 0.63, 0.55))
	var s := _stupa(3.5)
	s.position.y = 58
	g.add_child(s)
	return g


func _blowhole() -> Node3D:
	var spout := Looks.plain(Color(1, 1, 1, 0.65), 0.9)
	return _group([_rock(30, 8, Color(0.55, 0.5, 0.47)), Props.part(Props.cyl(1.5, 4, 26, 12), spout, Vector3(0, 18, 0))])


func _lighthouse() -> Node3D:
	var g := _rock(26, 5, Color(0.5, 0.55, 0.42))
	var t := _tower(48, 3.2)
	t.position.y = 4
	g.add_child(t)
	g.add_child(Props.part(Props.cyl(2.2, 2.2, 3, 12), Looks.plain(Color(1.0, 0.9, 0.5), 0.3, 0.0, 3.0), Vector3(0, 55, 0)))
	return g


func _paravi() -> Node3D:
	var g := _rock(28, 4, Color(0.55, 0.5, 0.47))
	var s := _stupa(9)
	s.position.y = 3.5
	g.add_child(s)
	return g


func _whale() -> Node3D:
	var dark := _mat(Color(0.24, 0.29, 0.35), 0.4)
	var tail := Props.part(PrismMesh.new(), dark, Vector3(0, 7, 0), Vector3(10, 14, 1.2))
	return _group([tail, Props.part(Props.box(14, 1.5, 3), dark, Vector3(0, 14, 0), Vector3.ONE, Vector3(0, 0, 0.1)), Props.part(Props.sphere(4, 12), Looks.plain(Color(1, 1, 1, 0.6)), Vector3(6, 1, 0))])


func _taprobane() -> Node3D:
	var g := _rock(36, 14, Color(0.4, 0.55, 0.32))
	var b := _building(12, 6, 8, Color(0.95, 0.94, 0.9), Color(0.72, 0.33, 0.24))
	b.position.y = 12
	g.add_child(b)
	return g


func _lagoon() -> Node3D:
	var b := _boats(5)
	return _group([_water_disc(45), b])


func _marsh() -> Node3D:
	var g := _group([_water_disc(40, Color(0.43, 0.6, 0.54))])
	for i in 18:
		var bush := Looks.instance("plant_bushLarge")
		bush.scale = Vector3.ONE * (4 + i % 3)
		bush.position = Vector3(cos(i * 1.7) * 30, 0.3, sin(i * 2.3) * 30)
		g.add_child(bush)
	return g


func _kelani_bridge() -> Node3D:
	var white := _mat(Color(0.92, 0.92, 0.9), 0.5)
	var g := _group([Props.part(Props.box(110, 2, 12), _mat(Color(0.73, 0.73, 0.7)), Vector3(0, 10, 0)), Props.part(Props.box(3, 46, 3), white, Vector3(0, 23, 0)), _water_disc(55)])
	for x in [-50.0, -35.0, -20.0, 20.0, 35.0, 50.0]:
		var a := Vector3(0, 45, 0)
		var b := Vector3(x, 11, 0)
		var len := a.distance_to(b)
		var cable := Props.part(Props.cyl(0.12, 0.12, len, 6), white, (a + b) / 2)
		cable.rotation.z = atan2(b.x - a.x, a.y - b.y)
		g.add_child(cable)
	return g


func _red_mosque() -> Node3D:
	# the Jami Ul-Alfar mosque in Pettah: red and white candy stripes
	var red := Color(0.75, 0.22, 0.17)
	var g := _building(22, 16, 14, red, red)
	for i in 4:
		g.add_child(Props.part(Props.box(22.1, 0.8, 14.1), _mat(Color(0.97, 0.95, 0.92)), Vector3(0, 3 + i * 3.6, 0)))
	for x in [-9.0, 9.0]:
		g.add_child(Props.part(Props.cyl(1.4, 1.4, 26, 12), _mat(Color(0.95, 0.95, 0.93)), Vector3(x, 13, 7)))
		g.add_child(Props.part(Props.sphere(2.0, 12), _mat(red), Vector3(x, 27, 7)))
	return g


func _twin_towers() -> Node3D:
	var glass := Looks.plain(Color(0.42, 0.56, 0.68), 0.08, 0.7)
	var g := Node3D.new()
	for x in [-14.0, 14.0]:
		g.add_child(Props.part(Props.box(18, 150, 18), glass, Vector3(x, 75, 0)))
		for k in 15:
			g.add_child(Props.part(Props.box(18.3, 0.6, 18.3), _mat(Color(0.85, 0.87, 0.9), 0.4), Vector3(x, 8 + k * 10, 0)))
	return g


func _lotus_tower() -> Node3D:
	return _group([
		Props.part(Props.cyl(1.4, 3, 90, 16), _mat(Color(0.42, 0.3, 0.58), 0.4), Vector3(0, 45, 0)),
		Props.part(Props.sphere(6, 20), Looks.plain(Color(0.85, 0.45, 0.65), 0.3, 0.0, 0.4), Vector3(0, 95, 0), Vector3(1, 1.4, 1)),
		Props.part(Props.cyl(0.0, 0.4, 18, 6), _mat(Color(0.85, 0.83, 0.88)), Vector3(0, 112, 0)),
	])


func _galle_face() -> Node3D:
	return _group([_building(40, 14, 16, Color(0.96, 0.95, 0.9), Color(0.85, 0.82, 0.75)), Props.part(Props.box(0.4, 18, 0.4), _mat(Color(0.9, 0.9, 0.88)), Vector3(22, 9, 8))])


func _temple_of_tooth() -> Node3D:
	var g := _building(34, 9, 14)
	var o := _building(10, 14, 10)
	o.position = Vector3(20, 0, 2)
	g.add_child(o)
	g.add_child(Props.part(Props.cyl(0.0, 3.0, 5.0, 8), Looks.plain(Color(0.85, 0.66, 0.16), 0.3, 0.8), Vector3(-6, 13, 0)))
	g.add_child(_at(_water_disc(14), Vector3(0, 0, 22)))
	return g


func _victoria_dam() -> Node3D:
	var wall := CylinderMesh.new()
	wall.top_radius = 60
	wall.bottom_radius = 60
	wall.height = 50
	wall.cap_top = false
	wall.cap_bottom = false
	var concrete := _mat(Color(0.8, 0.8, 0.77), 0.8).duplicate()
	concrete.cull_mode = BaseMaterial3D.CULL_DISABLED
	var g := _group([Props.part(Props.box(120, 50, 4), concrete, Vector3(0, 25, -10)), _peak(70, Color(0.35, 0.55, 0.38))])
	var p2 := _peak(80, Color(0.35, 0.55, 0.38))
	p2.position.x = 90
	g.add_child(p2)
	var p3 := _peak(75, Color(0.35, 0.55, 0.38))
	p3.position.x = -90
	g.add_child(p3)
	return g


func _knuckles_peaks() -> Node3D:
	var g := Node3D.new()
	var xs := [-90.0, -45.0, 0.0, 45.0, 90.0]
	for i in xs.size():
		var p := _peak(110 + (i % 2) * 40, Color(0.5, 0.6, 0.62))
		p.position.x = xs[i]
		g.add_child(p)
	return g


func _corbetts_gap() -> Node3D:
	var g := Node3D.new()
	for x in [-60.0, 60.0]:
		var p := _peak(130, Color(0.45, 0.58, 0.52))
		p.position.x = x
		g.add_child(p)
	return g


func _lakegala() -> Node3D:
	return _peak(170, Color(0.45, 0.58, 0.55))


func _rafting() -> Node3D:
	var g := _group([Props.part(Props.box(120, 0.3, 16), Looks.water(Color(0.15, 0.3, 0.28), Color(0.4, 0.6, 0.55)), Vector3(0, 0.6, 0))])
	for x in [-20.0, 10.0]:
		g.add_child(Props.part(Props.box(5, 0.9, 2.2), _mat(Color(0.9, 0.44, 0.12), 0.5), Vector3(x, 1.0, 0)))
	return g


func _beli_lena() -> Node3D:
	var g := _rock(70, 40, Color(0.4, 0.5, 0.4))
	g.add_child(Props.part(Props.sphere(10, 14), _mat(Color(0.05, 0.05, 0.05)), Vector3(0, 0, 30), Vector3(1, 0.8, 0.5)))
	return g


func _aberdeen() -> Node3D:
	return _waterfall(55, 7)


func _carolina() -> Node3D:
	return _waterfall(45, 14, false, Color(0.4, 0.55, 0.4))


func _adams_peak() -> Node3D:
	return _peak(240, Color(0.55, 0.65, 0.72), true)


func _devon() -> Node3D:
	return _waterfall(65, 6)


func _st_clairs() -> Node3D:
	return _waterfall(35, 12, true, Color(0.4, 0.6, 0.4))


func _dambulla() -> Node3D:
	var g := _rock(110, 45, Color(0.65, 0.6, 0.53))
	g.add_child(Props.part(Props.box(60, 6, 4), _mat(Color(0.95, 0.94, 0.9)), Vector3(0, 18, 46)))
	g.add_child(Props.part(Props.sphere(7, 16), Looks.plain(Color(0.88, 0.7, 0.23), 0.3, 0.7), Vector3(50, 9, 40), Vector3(1, 1.4, 1)))
	return g


func _kandalama() -> Node3D:
	var g := _rock(80, 45, Color(0.65, 0.63, 0.55))
	for k in 4:
		g.add_child(Props.part(Props.box(50 - k * 8, 4, 6), _mat(Color(0.9, 0.89, 0.84)), Vector3(-10 + k * 4, 2 + k * 5, 34 - k * 4)))
	return g


func _sigiriya() -> Node3D:
	var g := _rock(90, 100, Color(0.72, 0.58, 0.48), true, true)
	g.add_child(Props.part(Props.box(14, 6, 6), _mat(Color(0.76, 0.66, 0.55)), Vector3(0, 3, 40)))
	# the lion's paws at the foot of the stairs
	for x in [-6.0, 6.0]:
		g.add_child(Props.part(Props.box(5, 4, 8), _rock_mat(Color(0.7, 0.6, 0.5)), Vector3(x, 2, 46)))
	return g


func _pidurangala() -> Node3D:
	return _rock(110, 60, Color(0.68, 0.6, 0.5))


func _elephants() -> Node3D:
	var g := Node3D.new()
	for i in 6:
		var e := Props.elephant()
		e.position = Vector3((i - 3) * 9, 0, sin(i * 1.9) * 10)
		e.rotation.y = i * 1.3
		e.scale = Vector3.ONE * (0.7 + (i % 3) * 0.2)
		g.add_child(e)
	return g


func _tank_stumps() -> Node3D:
	var g := _group([_water_disc(40)])
	for i in 12:
		g.add_child(Props.part(Props.cyl(0.3, 0.5, 8 + (i % 4) * 2, 6), _mat(Color(0.42, 0.38, 0.35)), Vector3(cos(i * 2.1) * 28, 4, sin(i * 1.7) * 28)))
	return g
