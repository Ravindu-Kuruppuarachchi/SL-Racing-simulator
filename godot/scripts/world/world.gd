class_name World
extends Node3D
# The 3D scene of a route: terrain that rises into hills around the road, the road itself
# (tarmac with painted lines, gravel shoulders, guard rails, kerbs on bends), water (the
# sea, tanks, rivers, flooded patches), the Kelani caves, the Colombo flyover, gorges,
# forests and towns (Kenney models), warning signs, and the start and finish.
#
# The ground is a height grid: every cell knows how far it is from the road and how high
# the road is there, so it can sink below the road beside it and rise into hills further away.

const CELL := 8.0 # ground grid spacing (m)
const MARGIN := 360.0 # ground beyond the road's furthest bends
const REACH := 90.0 # how far from the road cells learn the road's height
const CHUNK := 32 # cells per terrain chunk side

var track: Track
var look: Dictionary
var rng: Rng
var noise := FastNoiseLite.new()
var detail := FastNoiseLite.new()

var gx0: float
var gz0: float
var gnx: int
var gnz: int
var gh := PackedFloat32Array() # ground height
var gdist := PackedFloat32Array() # distance to the road centreline
var grh := PackedFloat32Array() # road height there
var gside := PackedFloat32Array() # + right of the road
var gs := PackedFloat32Array() # road place s there
var sea_level := -1000.0
var water_zones := [] # [{s0, s1, level, reach}]
var clear_zones := [] # [{pos: Vector3, r}] no trees here (landmarks, the grid)
var scenery := {} # chunk key -> {model name -> [Transform3D]}
var obstacle_nodes := [] # [[obstacle, node]] that move (elephants)
var town_zone := 75.0
var bobbers := [] # [node, base y, phase, amount] floating things (boats, balloons)


var _t0 := 0


func _lap(what: String) -> void:
	if OS.is_debug_build() and Game.args.has("profile"):
		print("  %-14s %5d ms" % [what, Time.get_ticks_msec() - _t0])
	_t0 = Time.get_ticks_msec()


func build(t: Track) -> void:
	_t0 = Time.get_ticks_msec()
	track = t
	look = t.map.look
	rng = Rng.new(t.map.id.hash() & 0xFFFF)
	noise.seed = t.map.id.hash() & 0xFFFF
	noise.frequency = 0.0042
	noise.fractal_octaves = 4
	detail.seed = noise.seed + 7
	detail.frequency = 0.03
	detail.fractal_octaves = 2
	if look.has("sea_level"):
		sea_level = look.sea_level
	if t.sea:
		var lowest := INF
		for y in t.py:
			lowest = minf(lowest, y)
		sea_level = lowest - 1.6
	for f in t.fords:
		var reach: float = {"lake": 110.0, "ford": 70.0, "wetland": 26.0, "stream": 30.0}[f.kind]
		if t.circuit and f.kind == "ford":
			reach = 26.0 # a creek across the track, not a lake
		water_zones.append({"s0": f.s0, "s1": f.s1, "level": f.level, "reach": reach, "kind": f.kind})
	clear_zones.append({"pos": t.point(20), "r": 30.0})
	clear_zones.append({"pos": t.point(t.finish), "r": 30.0})
	_grid()
	_lap("_grid")
	_terrain()
	_lap("_terrain")
	_road()
	_lap("_road")
	_rails()
	_lap("_rails")
	_water()
	_lap("_water")
	if t.caves.size():
		for c in t.caves:
			_cave(c)
	if t.bridge != null:
		_bridge(t.bridge)
	if track.circuit:
		_decor()
	else:
		_towns()
	_lap("decor/towns")
	var lm := Landmarks.new()
	add_child(lm)
	lm.build(self)
	_trees()
	_lap("_trees")
	_flush_scenery()
	_lap("_flush_scenery")
	_signs()
	_start_finish()
	_obstacles()
	_pads()


# ---- the ground grid --------------------------------------------------------------------------
func idx(ix: int, iz: int) -> int:
	return iz * gnx + ix


func _grid() -> void:
	var b := track.bounds
	gx0 = b.x0 - MARGIN
	gz0 = b.z0 - MARGIN
	gnx = int(ceil((b.x1 - b.x0 + 2 * MARGIN) / CELL)) + 1
	gnz = int(ceil((b.z1 - b.z0 + 2 * MARGIN) / CELL)) + 1
	var count := gnx * gnz
	gh.resize(count)
	gdist.resize(count)
	gdist.fill(1e9)
	grh.resize(count)
	gside.resize(count)
	gs.resize(count)
	# near the road: the exact distance, road height and side, from the centreline samples
	var cells := int(ceil(REACH / CELL))
	for i in range(0, track.n, 2):
		var px := track.px[i]
		var pz := track.pz[i]
		var h := track.hdg[i]
		var nx := -sin(h)
		var nz := cos(h)
		var cx := int(round((px - gx0) / CELL))
		var cz := int(round((pz - gz0) / CELL))
		for iz in range(maxi(0, cz - cells), mini(gnz, cz + cells + 1)):
			var wz := gz0 + iz * CELL
			for ix in range(maxi(0, cx - cells), mini(gnx, cx + cells + 1)):
				var wx := gx0 + ix * CELL
				var dx := wx - px
				var dz := wz - pz
				var dd := sqrt(dx * dx + dz * dz)
				var k := iz * gnx + ix
				if dd < gdist[k]:
					gdist[k] = dd
					grh[k] = track.py[i]
					gside[k] = dx * nx + dz * nz
					gs[k] = i * Track.STEP
	# far away: a smooth base height, weighted from points along the road
	var samples := []
	for i in range(0, track.n, 12):
		samples.append(Vector3(track.px[i], track.py[i], track.pz[i]))
	var coarse := 6 # cells per coarse step
	var cnx := gnx / coarse + 2
	var cnz := gnz / coarse + 2
	var base := PackedFloat32Array()
	base.resize(cnx * cnz)
	for cz in cnz:
		for cx in cnx:
			var wx := gx0 + cx * coarse * CELL
			var wz := gz0 + cz * coarse * CELL
			var wsum := 0.0
			var hsum := 0.0
			for p in samples:
				var d2: float = (p.x - wx) * (p.x - wx) + (p.z - wz) * (p.z - wz) + 400.0
				var w := 1.0 / (d2 * d2)
				wsum += w
				hsum += w * p.y
			base[cz * cnx + cx] = hsum / wsum
	var amp: float = look.get("hills", 0.0) if track.circuit else {"hills": 60.0, "coast": 14.0, "colombo": 4.0, "knuckles": 85.0, "kelani": 55.0, "rajarata": 10.0}[track.map.id]
	var inside := -signf(track.turn) # circuits: which side of the road the infield is
	for iz in gnz:
		for ix in gnx:
			var k := iz * gnx + ix
			var wx := gx0 + ix * CELL
			var wz := gz0 + iz * CELL
			var fx := float(ix) / coarse
			var fz := float(iz) / coarse
			var bx := int(fx)
			var bz := int(fz)
			var tx := fx - bx
			var tz := fz - bz
			var b0 := lerpf(base[bz * cnx + bx], base[bz * cnx + bx + 1], tx)
			var b1 := lerpf(base[(bz + 1) * cnx + bx], base[(bz + 1) * cnx + bx + 1], tx)
			var far := lerpf(b0, b1, tz)
			var dist := gdist[k]
			var road_h := grh[k] if dist < 1e8 else far
			var flat := lerpf(road_h, far, smoothstep(40.0, REACH, dist))
			var hills := amp * (0.55 + 0.45 * noise.get_noise_2d(wx, wz)) * smoothstep(22.0, 260.0, dist)
			if track.circuit and dist < 1e8 and gside[k] * inside > 0:
				hills *= 0.12 # the infield stays low so you can see across it
			var bumps := 1.6 * detail.get_noise_2d(wx, wz) * smoothstep(14.0, 40.0, dist)
			var h := lerpf(road_h - 0.55, flat + hills + bumps, smoothstep(Track.WALL + 1.5, 46.0, dist))
			# coast: the beach runs down into the sea on its side of the road
			if track.sea and dist < 1e8 and gside[k] * track.sea > 0:
				h = lerpf(h, sea_level - 7.0, smoothstep(16.0, 110.0, dist))
			elif track.sea and dist >= 1e8:
				h = minf(h, sea_level + 6.0)
			if look.has("sea_z") and not (dist < 1e8 and gside[k] * inside > 0):
				# circuits by the sea: the beach slopes into it beyond sea_z
				var shore: float = look.sea_z + detail.get_noise_2d(wx * 0.3, 0.0) * 18.0
				h = lerpf(h, sea_level - 8.0, smoothstep(shore - 10.0, shore + 70.0, wz) * smoothstep(Track.WALL + 4.0, 24.0, dist))
			var s := gs[k]
			if dist < 1e8:
				for g in track.gorges:
					var w := _window(s, g.s0 - 10, g.s1 + 10, 25.0)
					h += w * 26.0 * smoothstep(11.0, 30.0, dist) * (0.8 + 0.4 * detail.get_noise_2d(wx * 2, wz * 2))
				for c in track.caves:
					var w := _window(s, c.s0 - 4, c.s1 + 4, 14.0)
					h = lerpf(h, maxf(h, road_h + 14.0 - dist * 0.25), w * smoothstep(14.0, 24.0, dist))
				if track.bridge != null:
					var w := _window(s, track.bridge.s0 + 8, track.bridge.s1 - 8, 20.0)
					h = lerpf(h, road_h - 10.0, w * (1.0 - smoothstep(60.0, 110.0, dist)))
				for z in water_zones:
					var w := _window(s, z.s0 - 6, z.s1 + 6, 10.0)
					if z.kind == "lake":
						w = _window(s, z.s0 - 30, z.s1 + 30, 40.0)
					var deep: float = z.level - (1.6 if z.kind != "wetland" else 0.5)
					h = lerpf(h, minf(h, deep), w * (1.0 - smoothstep(z.reach * 0.6, z.reach, dist)))
			gh[k] = h


func _window(s: float, a: float, b: float, ramp: float) -> float:
	return smoothstep(a - ramp, a, s) * (1.0 - smoothstep(b, b + ramp, s))


## Ground height at world (x, z).
func ground(x: float, z: float) -> float:
	var fx := clampf((x - gx0) / CELL, 0.0, gnx - 1.001)
	var fz := clampf((z - gz0) / CELL, 0.0, gnz - 1.001)
	var ix := int(fx)
	var iz := int(fz)
	var tx := fx - ix
	var tz := fz - iz
	var h0 := lerpf(gh[idx(ix, iz)], gh[idx(ix + 1, iz)], tx)
	var h1 := lerpf(gh[idx(ix, iz + 1)], gh[idx(ix + 1, iz + 1)], tx)
	return lerpf(h0, h1, tz)


## Distance to the road and road place at world (x, z) (from the grid).
func road_info(x: float, z: float) -> Array:
	var ix := clampi(int(round((x - gx0) / CELL)), 0, gnx - 1)
	var iz := clampi(int(round((z - gz0) / CELL)), 0, gnz - 1)
	var k := idx(ix, iz)
	return [gdist[k], gs[k], gside[k]]


func _terrain() -> void:
	var mat := Looks.terrain(look)
	for cz0 in range(0, gnz - 1, CHUNK):
		for cx0 in range(0, gnx - 1, CHUNK):
			var cx1 := mini(cx0 + CHUNK, gnx - 1)
			var cz1 := mini(cz0 + CHUNK, gnz - 1)
			var verts := PackedVector3Array()
			var cols := PackedColorArray()
			var indices := PackedInt32Array()
			var w := cx1 - cx0 + 1
			for iz in range(cz0, cz1 + 1):
				for ix in range(cx0, cx1 + 1):
					var k := idx(ix, iz)
					verts.append(Vector3(gx0 + ix * CELL, gh[k], gz0 + iz * CELL))
					var dist := gdist[k]
					# dirt near the road, in gorges and on the beach
					var dirt := 1.0 - smoothstep(Track.WALL + 1.0, Track.WALL + 6.0, dist)
					if look.has("sea_z"):
						dirt = maxf(dirt, smoothstep(look.sea_z - 40.0, look.sea_z - 15.0, gz0 + iz * CELL))
					if track.sea and gside[k] * track.sea > 0 and dist < 1e8:
						dirt = maxf(dirt, smoothstep(20.0, 40.0, dist))
					if dist < 1e8 and track.in_gorge(gs[k]) != null:
						dirt = maxf(dirt, smoothstep(14.0, 24.0, dist))
					cols.append(Color(dirt, 0.92 + 0.08 * detail.get_noise_2d(ix * 9.0, iz * 9.0), 0))
			var skip_any := false
			for iz in range(cz1 - cz0):
				for ix in range(cx1 - cx0):
					var a := iz * w + ix
					# cut the ground out where it would poke into a cave
					var k := idx(cx0 + ix, cz0 + iz)
					if gdist[k] < 13.0 and track.in_cave(gs[k]):
						skip_any = true
						continue
					indices.append_array([a, a + 1, a + w, a + 1, a + w + 1, a + w])
			if indices.is_empty():
				continue
			var st := SurfaceTool.new()
			st.begin(Mesh.PRIMITIVE_TRIANGLES)
			for i in verts.size():
				st.set_color(cols[i])
				st.add_vertex(verts[i])
			for i in indices:
				st.add_index(i)
			st.generate_normals()
			var mi := MeshInstance3D.new()
			mi.mesh = st.commit()
			mi.material_override = mat
			mi.name = "Ground"
			add_child(mi)


# ---- the road ---------------------------------------------------------------------------------
## A strip along the road: `profile` is [[d, dy], ...] across it (dy: height over the road);
## UV.x is metres from the first point across, UV.y metres along.
func strip(profile: Array, mat: Material, s0: float = 0.0, s1: float = -1.0, step: float = Track.STEP, name_: String = "Strip", shadows := true) -> MeshInstance3D:
	if s1 < 0:
		s1 = track.world_len
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var cols := profile.size()
	var rows := 0
	var s := s0
	while true:
		var p := track.point(s)
		var f := track.frame(s)
		var u := 0.0
		for j in cols:
			var d: float = profile[j][0]
			if j > 0:
				u += Vector2(d - profile[j - 1][0], profile[j][1] - profile[j - 1][1]).length()
			st.set_uv(Vector2(u, s))
			st.add_vertex(p + f[1] * d + Vector3.UP * profile[j][1])
		rows += 1
		if s >= s1:
			break
		s = minf(s + step, s1)
	for r in rows - 1:
		for j in cols - 1:
			var a := r * cols + j
			st.add_index(a)
			st.add_index(a + cols)
			st.add_index(a + 1)
			st.add_index(a + 1)
			st.add_index(a + cols)
			st.add_index(a + cols + 1)
	st.generate_normals()
	st.generate_tangents()
	var mi := MeshInstance3D.new()
	mi.mesh = st.commit()
	mi.material_override = mat
	mi.name = name_
	if not shadows:
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	return mi


func _in_town(s: float) -> bool:
	if track.circuit:
		return false
	for t in track.towns:
		if absf(t.s - s) < town_zone:
			return true
	return track.map.id == "colombo"


func _road() -> void:
	var r := Track.ROAD_HALF
	var w := Track.WALL
	strip([[-r, 0.0], [r, 0.0]], Looks.road(look.get("road", "asphalt")), 0, -1, Track.STEP, "Road", false)
	var verge := Looks.textured("red_laterite_soil_stones" if track.map.id == "rajarata" else "forest_ground_04", 0.2, Color(0.9, 0.85, 0.8))
	if track.map.id == "coast":
		verge = Looks.textured("coast_sand_01", 0.2)
	if track.map.id == "colombo":
		verge = Looks.textured("grass_concrete_pavement", 0.25)
	# shoulders and an embankment down to the ground each side
	for side in [-1.0, 1.0]:
		var prof := [[r, -0.01], [w, -0.04], [w + 1.5, -0.3], [w + 6.0, -2.6]]
		if side < 0:
			prof.reverse()
			for p in prof:
				p[0] = -p[0]
		strip(prof, verge, 0, -1, Track.STEP * 2, "Shoulder", false)
	# kerbs on the bends and through the towns
	var s := 0.0
	var bend_k := 1.0 / (140.0 if track.circuit else 90.0)
	while s < track.world_len - 4:
		var bend := absf(track.kappa_at(s)) > bend_k
		var start := s
		while s < track.world_len - 4 and (absf(track.kappa_at(s)) > bend_k) == bend:
			s += Track.STEP
		if bend and s - start > 6:
			for side in [-1.0, 1.0]:
				var a := r - 0.05 if side > 0 else -r - 0.9
				strip([[a, 0.02], [a + 0.95, 0.06]], Looks.kerb(), start, s, Track.STEP, "Kerb", false)
		s += Track.STEP
	# a pale line along the very edge of the tarmac where it meets the shoulder
	for side in [-1.0, 1.0]:
		var edge := Looks.plain(Color(0.28, 0.27, 0.26), 0.9)
		var a: float = (r if side > 0 else -r - 0.25)
		strip([[a, 0.0], [a + 0.25, -0.01]], edge, 0, -1, Track.STEP * 2, "Edge", false)


func _rails() -> void:
	# guard rails each side, except in towns, caves, on the bridge and through water
	var rail_mat := Looks.plain(Color(0.78, 0.8, 0.82), 0.3, 0.85)
	var post_mesh := BoxMesh.new()
	post_mesh.size = Vector3(0.14, 1.0, 0.14)
	var posts := []
	var s := 0.0
	while s < track.world_len - 4:
		var open := _in_town(s) or track.in_cave(s) or track.on_bridge(s) or track.in_ford(s) != null or s < 50 or absf(s - track.finish) < 40
		var start := s
		while s < track.world_len - 4 and (_in_town(s) or track.in_cave(s) or track.on_bridge(s) or track.in_ford(s) != null or s < 50 or absf(s - track.finish) < 40) == open:
			s += Track.STEP
		if not open and s - start > 8 and look.get("barrier", "") == "tyres":
			_tyre_wall(start, s)
		elif not open and s - start > 8:
			for side in [-1.0, 1.0]:
				var d = (Track.WALL + 0.15) * side
				var prof := [[d, 0.45], [d, 0.62], [d + 0.12 * side, 0.7], [d, 0.78], [d, 0.95]]
				if side < 0:
					prof.reverse()
				strip(prof, rail_mat, start, s, Track.STEP, "Rail")
				var ps := start
				while ps < s:
					var p := track.point(ps, d + 0.15 * side)
					var f := track.frame(ps)
					posts.append(Transform3D(Basis.looking_at(f[0]), p + Vector3.UP * 0.4))
					ps += 4.0
		s += Track.STEP
	_multimesh(post_mesh, posts, Looks.plain(Color(0.55, 0.57, 0.6), 0.4, 0.7))


# race-track walls of stacked tyres, painted in bright alternating colours
const WALL_PAIRS := [[Color("#e8312f"), Color("#f5f5f5")], [Color("#1e6fe0"), Color("#ffd23f")], [Color("#14b37d"), Color("#f5f5f5")], [Color("#ff8a1f"), Color("#3b2a8f")]]
var _wall_count := 0


func _tyre_wall(s0: float, s1: float) -> void:
	var pair: Array = WALL_PAIRS[_wall_count % WALL_PAIRS.size()]
	_wall_count += 1
	var mat := Looks.kerb(pair[0], pair[1], 1.6)
	for side in [-1.0, 1.0]:
		var d = (Track.WALL + 0.2) * side
		var w = 0.7 * side
		var prof := [[d, -0.2], [d, 0.55], [d + w * 0.15, 0.8], [d + w * 0.85, 0.8], [d + w, 0.55], [d + w, -0.2]]
		if side < 0:
			prof.reverse()
		strip(prof, mat, s0, s1, Track.STEP, "TyreWall")


func _multimesh(mesh: Mesh, xforms: Array, mat: Material = null, shadows := true) -> MultiMeshInstance3D:
	if xforms.is_empty():
		return null
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = mesh
	mm.instance_count = xforms.size()
	for i in xforms.size():
		mm.set_instance_transform(i, xforms[i])
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	if mat:
		mmi.material_override = mat
	if not shadows:
		mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mmi)
	return mmi


# ---- water --------------------------------------------------------------------------------------
func _water() -> void:
	if sea_level > -999:
		var b := track.bounds
		var plane := PlaneMesh.new()
		plane.size = Vector2(b.x1 - b.x0 + 4000, b.z1 - b.z0 + 4000)
		plane.subdivide_width = 1
		plane.subdivide_depth = 1
		var mi := MeshInstance3D.new()
		mi.mesh = plane
		mi.material_override = Looks.water(Color(0.0, 0.2, 0.36), Color(0.05, 0.6, 0.65), 0.9)
		mi.position = Vector3((b.x0 + b.x1) / 2, sea_level, (b.z0 + b.z1) / 2)
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.name = "Sea"
		add_child(mi)
	for z in water_zones:
		var reach: float = z.reach
		var a: float = z.s0 - (30.0 if z.kind == "lake" else 8.0)
		var b2: float = z.s1 + (30.0 if z.kind == "lake" else 8.0)
		var mat := Looks.water(Color(0.05, 0.22, 0.2), Color(0.25, 0.45, 0.32), 0.82)
		if z.kind == "lake":
			mat = Looks.water(Color(0.02, 0.18, 0.28), Color(0.1, 0.45, 0.5), 0.88)
		var mi := strip([[-reach, 0.0], [reach, 0.0]], mat, maxf(0.0, a), minf(track.world_len, b2), 4.0, "Water", false)
		# the strip follows the road's height: flatten it to the water level
		mi.mesh = _flatten(mi.mesh, z.level)
		if z.kind == "lake":
			_lilies(z)


func _flatten(m: ArrayMesh, level: float) -> ArrayMesh:
	var arrays := m.surface_get_arrays(0)
	var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	for i in verts.size():
		verts[i].y = level
	arrays[Mesh.ARRAY_VERTEX] = verts
	var normals: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
	for i in normals.size():
		normals[i] = Vector3.UP
	arrays[Mesh.ARRAY_NORMAL] = normals
	var out := ArrayMesh.new()
	out.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return out


func _lilies(z: Dictionary) -> void:
	var pad := CylinderMesh.new()
	pad.top_radius = 0.6
	pad.bottom_radius = 0.6
	pad.height = 0.04
	pad.radial_segments = 10
	var flower := SphereMesh.new()
	flower.radius = 0.16
	flower.height = 0.2
	var pads := []
	var flowers := []
	for i in 70:
		var s := rng.range_f(z.s0 - 20, z.s1 + 20)
		var d := rng.range_f(Track.WALL + 2, z.reach * 0.7) * (1.0 if rng.next() < 0.5 else -1.0)
		var p := track.point(s, d)
		p.y = z.level + 0.03
		pads.append(Transform3D(Basis(Vector3.UP, rng.next() * TAU), p))
		if rng.next() < 0.4:
			flowers.append(Transform3D(Basis(), p + Vector3.UP * 0.1))
	_multimesh(pad, pads, Looks.plain(Color(0.2, 0.5, 0.2), 0.6), false)
	_multimesh(flower, flowers, Looks.plain(Color(0.45, 0.55, 1.0), 0.5, 0.0, 0.2), false)


# ---- caves and the flyover ----------------------------------------------------------------------
func _cave(c: Dictionary) -> void:
	# a rocky hill with an arched tunnel through it, open at both ends
	var outer := [[-34.0, -3.0], [-22.0, 5.0], [-13.0, 11.0], [-6.0, 13.5], [0.0, 14.5], [6.0, 13.5], [13.0, 11.0], [22.0, 5.0], [34.0, -3.0]]
	var inner := []
	for k in 13:
		var a := PI * k / 12.0
		inner.append([cos(a) * -(Track.WALL + 0.6), sin(a) * 7.5 - 0.2])
	var rock: StandardMaterial3D = Looks.textured("rock_face", 0.12, Color(0.75, 0.7, 0.62)).duplicate()
	rock.cull_mode = BaseMaterial3D.CULL_DISABLED # the roof is seen from below
	strip(outer, rock, c.s0, c.s1, 2.0, "CaveHill")
	strip(inner, rock, c.s0, c.s1, 2.0, "CaveRoof")
	# the faces around each mouth
	for s in [c.s0, c.s1]:
		var st := SurfaceTool.new()
		st.begin(Mesh.PRIMITIVE_TRIANGLES)
		var p := track.point(s)
		var f := track.frame(s)
		var ring_o := []
		for k in 13:
			var a := PI * k / 12.0
			ring_o.append(p + f[1] * (cos(a) * -34.0) + Vector3.UP * (sin(a) * 15.0 - 3.0))
		var ring_i := []
		for v in inner:
			ring_i.append(p + f[1] * v[0] + Vector3.UP * v[1])
		for k in 12:
			for tri in [[ring_o[k], ring_o[k + 1], ring_i[k]], [ring_o[k + 1], ring_i[k + 1], ring_i[k]]]:
				for v in tri:
					st.set_uv(Vector2(v.x, v.y) * 0.1)
					st.add_vertex(v)
		st.generate_normals()
		var mi := MeshInstance3D.new()
		mi.mesh = st.commit()
		mi.material_override = rock
		var m2 := rock.duplicate()
		m2.cull_mode = BaseMaterial3D.CULL_DISABLED
		mi.material_override = m2
		add_child(mi)
	# lamps along the tunnel roof
	var lamp := SphereMesh.new()
	lamp.radius = 0.3
	lamp.height = 0.4
	var xs := []
	var s2: float = c.s0 + 8
	while s2 < c.s1 - 4:
		xs.append(Transform3D(Basis(), track.point(s2) + Vector3.UP * 7.0))
		s2 += 12
	_multimesh(lamp, xs, Looks.plain(Color(1.0, 0.8, 0.45), 0.5, 0.0, 6.0), false)


func _bridge(b: Dictionary) -> void:
	# a concrete flyover deck over a canal, with piers, railings and lamp posts
	var concrete := Looks.textured("grass_concrete_pavement", 0.15, Color(0.75, 0.75, 0.75))
	var r := Track.WALL + 0.6
	strip([[-r, -0.05], [-r, -1.6], [r, -1.6], [r, -0.05]], concrete, b.s0 - 4, b.s1 + 4, 4.0, "Deck")
	for side in [-1.0, 1.0]:
		var d = Track.WALL * side
		var prof := [[d, -0.05], [d, 1.1], [d + 0.4 * side, 1.1], [d + 0.4 * side, -0.05]]
		if side < 0:
			prof.reverse()
		strip(prof, Looks.kerb(Color("#1e6fe0"), Color("#f5f5f5"), 3.0) if track.circuit else Looks.plain(Color(0.86, 0.86, 0.84), 0.6), b.s0 - 4, b.s1 + 4, 4.0, "Parapet")
	var pier := BoxMesh.new()
	pier.size = Vector3(3.0, 1.0, 2 * Track.WALL - 2)
	var piers := []
	var s: float = b.s0 + 20
	while s < b.s1 - 10:
		var p := track.point(s)
		var g := ground(p.x, p.z)
		var hgt := p.y - 1.6 - g + 2.0
		var f := track.frame(s)
		piers.append(Transform3D(Basis.looking_at(f[1]).scaled(Vector3(1, hgt, 1)), Vector3(p.x, g - 2.0 + hgt / 2, p.z)))
		s += 26
	_multimesh(pier, piers, concrete)
	# the canal under it
	var mid: float = (b.s0 + b.s1) / 2
	var p := track.point(mid)
	var f := track.frame(mid)
	var canal := PlaneMesh.new()
	canal.size = Vector2(60, 260)
	var mi := MeshInstance3D.new()
	mi.mesh = canal
	mi.material_override = Looks.water(Color(0.05, 0.2, 0.22), Color(0.2, 0.4, 0.35), 0.9)
	mi.transform = Transform3D(Basis.looking_at(f[1]), Vector3(p.x, p.y - 8.0, p.z))
	add_child(mi)


# ---- scenery ------------------------------------------------------------------------------------
## Queue a model for the scenery MultiMeshes: `pos` is where its base centre stands.
func put(model: String, pos: Vector3, yaw: float, scale: float) -> void:
	var box := Looks.aabb(model)
	var basis := Basis(Vector3.UP, yaw).scaled(Vector3.ONE * scale)
	var centre := Vector3(box.position.x + box.size.x / 2, box.position.y, box.position.z + box.size.z / 2)
	var xf := Transform3D(basis, pos - basis * centre)
	var key := Vector2i(int(floor(pos.x / 200.0)), int(floor(pos.z / 200.0)))
	if not scenery.has(key):
		scenery[key] = {}
	if not scenery[key].has(model):
		scenery[key][model] = []
	scenery[key][model].append(xf)


func clear_at(p: Vector3, gap: float) -> bool:
	for z in clear_zones:
		if Vector2(p.x - z.pos.x, p.z - z.pos.z).length() < z.r + gap:
			return false
	return true


func _in_water(s: float, dist: float) -> bool:
	for z in water_zones:
		var ext := 30.0 if z.kind == "lake" else 8.0
		if s > z.s0 - ext and s < z.s1 + ext and dist < z.reach:
			return true
	if track.bridge != null and s > track.bridge.s0 - 10 and s < track.bridge.s1 + 10 and dist < 110:
		return true
	return false


func _trees() -> void:
	var trees: Array = look.trees
	var bushes: Array = look.bushes
	var forest: float = look.forest
	var rocks := ["rock_largeA", "rock_largeB", "rock_largeC", "rock_tallA", "rock_tallB", "stone_largeA", "stone_largeC"]
	for iz in range(0, gnz, 1):
		for ix in range(0, gnx, 1):
			var k := idx(ix, iz)
			var dist := gdist[k]
			if dist < Track.WALL + 4.0 or dist > 320.0:
				continue
			var s := gs[k]
			var town := _in_town(s) and dist < 70.0
			# denser close to the road, where it's seen
			var p_tree := forest * (0.75 if dist < 60 else (0.45 if dist < 160 else 0.22))
			if town:
				p_tree *= 0.15
			if track.sea and gside[k] * track.sea > 0 and dist > 30:
				p_tree *= 0.1 # the beach
			if _in_water(s, dist):
				continue
			if look.has("sea_z") and gz0 + iz * CELL > look.sea_z - 28.0:
				p_tree *= 0.12 # the beach: open sand with the odd palm
			var wx := gx0 + ix * CELL + rng.range_f(-CELL * 0.45, CELL * 0.45)
			var wz := gz0 + iz * CELL + rng.range_f(-CELL * 0.45, CELL * 0.45)
			var gy := ground(wx, wz)
			if sea_level > -999 and gy < sea_level + 0.6:
				continue
			var p := Vector3(wx, gy - 0.1, wz)
			if not clear_at(p, 6.0):
				continue
			var roll := rng.next()
			if roll < p_tree:
				var m: String = rng.pick(trees)
				put(m, p, rng.next() * TAU, rng.range_f(6.5, 10.0) if m.begins_with("tree_palm") else rng.range_f(5.5, 8.5))
				if rng.next() < 0.35 and dist < 120:
					put(rng.pick(bushes), p + Vector3(rng.range_f(-3, 3), 0, rng.range_f(-3, 3)), rng.next() * TAU, rng.range_f(3.0, 5.0))
			elif roll < p_tree + 0.18 and dist < 90:
				if look.get("tea", false) and not town and dist > 16 and dist < 70:
					# tea bushes in rows across the slope
					for j in 3:
						put("plant_bushSmall", p + Vector3(j * 2.4 - 2.4, 0, 0), 0.0, rng.range_f(2.6, 3.2))
				else:
					put(rng.pick(bushes), p, rng.next() * TAU, rng.range_f(2.5, 4.5))
			elif roll < p_tree + 0.22 and track.map.rocks != "rubble":
				put(rng.pick(rocks), p, rng.next() * TAU, rng.range_f(2.0, 5.0))
			elif roll < p_tree + 0.3 and dist < 50:
				put(rng.pick(["flower_redA", "flower_yellowA", "flower_purpleA", "grass_large", "grass_leafsLarge"]), p, rng.next() * TAU, rng.range_f(2.0, 3.5))


# Sri Lankan shopfronts and houses are painted bright: each building gets its own wall colour
const WALL_COLOURS := [Color("#f4c430"), Color("#3cc4b4"), Color("#f07aa0"), Color("#8bc34a"), Color("#f7953d"), Color("#64a8e8"), Color("#ffffff"), Color("#c98ae0"), Color("#ffd966"), Color("#4fc3a1")]
const WALL_SHADER := """
shader_type spatial;
uniform sampler2D tex : source_color, filter_nearest;
varying vec3 tint;
void vertex() { tint = COLOR.rgb; }
void fragment() {
	vec3 c = texture(tex, UV).rgb;
	float hi = max(c.r, max(c.g, c.b));
	float lo = min(c.r, min(c.g, c.b));
	// pale, unsaturated texels are the walls: paint them
	float wall = smoothstep(0.55, 0.7, hi) * (1.0 - smoothstep(0.06, 0.14, hi - lo));
	ALBEDO = mix(c, c * tint * 1.08, wall);
	ROUGHNESS = 0.8;
}
"""


func _flush_scenery() -> void:
	for key in scenery:
		for model in scenery[key]:
			var mmi := _multimesh(Looks.mesh(model), scenery[key][model])
			mmi.visibility_range_end = 700.0
			mmi.name = model
			if model.begins_with("building-"):
				_paint_walls(mmi, model)
	scenery.clear()


func _paint_walls(mmi: MultiMeshInstance3D, model: String) -> void:
	var mesh := Looks.mesh(model)
	var mat := mesh.surface_get_material(0) as StandardMaterial3D
	if mat == null or mat.albedo_texture == null:
		return
	var sm := ShaderMaterial.new()
	sm.shader = Looks.shader(WALL_SHADER)
	sm.set_shader_parameter("tex", mat.albedo_texture)
	mmi.material_override = sm
	# rebuild the MultiMesh with a colour per building
	var old := mmi.multimesh
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.mesh = old.mesh
	mm.instance_count = old.instance_count
	for i in old.instance_count:
		mm.set_instance_transform(i, old.get_instance_transform(i))
		var c: Color = rng.pick(WALL_COLOURS) if not model.contains("skyscraper") else Color(0.9, 0.95, 1.0)
		mm.set_instance_color(i, c)
	mmi.multimesh = mm


# ---- towns --------------------------------------------------------------------------------------
const SHOPS := ["building-a", "building-b", "building-c", "building-d", "building-e", "building-f", "building-g", "building-h", "building-k"]
const BIG := ["building-i", "building-j", "building-l", "building-m", "building-n"]
const TOWERS := ["building-skyscraper-a", "building-skyscraper-b", "building-skyscraper-c", "building-skyscraper-d", "building-skyscraper-e"]
const HOUSES := ["building-type-a", "building-type-b", "building-type-c", "building-type-d", "building-type-e", "building-type-f", "building-type-g", "building-type-h", "building-type-j", "building-type-k", "building-type-o", "building-type-p", "building-type-s", "building-type-u"]


func _towns() -> void:
	var city = track.map.id == "colombo"
	var along := []
	if city:
		var s := 40.0
		while s < track.length:
			along.append(s)
			s += 1.0
	for t in track.towns:
		_town_board(t)
		_flags(t.s - 30.0)
		_flags(t.s + 34.0)
	# buildings face the road along both sides
	for side in [-1.0, 1.0]:
		var s := 30.0
		while s < track.length - 10:
			var town := _in_town(s)
			if not town or track.on_bridge(s) or track.in_cave(s) or track.in_ford(s) != null or absf(s - 20) < 25:
				s += 6.0
				continue
			var near_centre := false
			for t in track.towns:
				if absf(t.s - s) < 45:
					near_centre = true
			var model: String
			var scale := 8.0
			if near_centre or (city and rng.next() < 0.6):
				model = rng.pick(SHOPS + (BIG if city else []))
			else:
				model = rng.pick(HOUSES)
				scale = 6.5
			var box := Looks.aabb(model)
			var width := box.size.x * scale
			var depth := box.size.z * scale
			var d = side * (Track.WALL + 3.5 + depth / 2)
			var p := track.point(s + width / 2, d)
			var road_y := p.y
			p.y = minf(road_y, ground(p.x, p.z)) - 0.2
			if absf(ground(p.x, p.z) - road_y) > 6:
				s += width + 4
				continue
			p.y = road_y - 0.25
			var h := track.heading_at(s + width / 2)
			put(model, p, _face_road(h, side), scale)
			_plinth(p, width, depth, h, side)
			# city: towers behind the shops
			if city and rng.next() < 0.5:
				var tm: String = rng.pick(TOWERS)
				var tp := track.point(s + width / 2, side * (Track.WALL + 30 + rng.range_f(0, 40)))
				tp.y = ground(tp.x, tp.z) - 0.5
				if clear_at(tp, 10):
					put(tm, tp, _face_road(h, side), rng.range_f(9, 12))
			s += width + rng.range_f(1.5, 4.0)
	# street lamps through the towns
	var lamps := []
	for t in track.towns:
		var s: float = t.s - town_zone
		while s < t.s + town_zone:
			for side in [-1.0, 1.0]:
				var p := track.point(s, side * (Track.WALL + 0.8))
				lamps.append([p, track.heading_at(s), side])
			s += 28
	for l in lamps:
		_lamp(l[0], l[1], l[2])


func _face_road(heading: float, side: float) -> float:
	# yaw that turns a model's front (+z) towards the road from `side`
	# the road's right is (-sin h, cos h); on the right side the front must point left
	var dir := Vector3(sin(heading), 0, -cos(heading)) * side
	return atan2(dir.x, dir.z)


func _plinth(p: Vector3, width: float, depth: float, heading: float, side: float) -> void:
	# a footing under a building, so it never floats where the ground falls away
	var b := BoxMesh.new()
	b.size = Vector3(width * 0.98, 4.0, depth * 0.98)
	var mi := MeshInstance3D.new()
	mi.mesh = b
	mi.material_override = Looks.plain(Color(0.55, 0.52, 0.48), 0.9)
	mi.transform = Transform3D(Basis(Vector3.UP, _face_road(heading, side)), p - Vector3.UP * 2.0)
	add_child(mi)


func _lamp(p: Vector3, heading: float, side: float) -> void:
	var pole := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 0.08
	cyl.bottom_radius = 0.12
	cyl.height = 7.0
	pole.mesh = cyl
	pole.material_override = Looks.plain(Color(0.35, 0.37, 0.4), 0.4, 0.8)
	pole.position = p + Vector3.UP * 3.5
	add_child(pole)
	var arm := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.1, 0.1, 2.0)
	arm.mesh = bm
	arm.material_override = pole.material_override
	var inward := Vector3(sin(heading), 0, -cos(heading)) * side
	arm.position = p + Vector3.UP * 7.0 + inward * 1.0
	arm.basis = Basis.looking_at(inward)
	add_child(arm)
	var head := MeshInstance3D.new()
	var hm := BoxMesh.new()
	hm.size = Vector3(0.35, 0.12, 0.7)
	head.mesh = hm
	head.material_override = Looks.plain(Color(1.0, 0.92, 0.7), 0.5, 0.0, 3.0)
	head.position = p + Vector3.UP * 6.92 + inward * 1.9
	head.basis = arm.basis
	add_child(head)


func _town_board(t: Dictionary) -> void:
	# a gantry across the road with the town's name: the checkpoint
	_gantry(t.s, t.name.to_upper(), false)


func _gantry(s: float, text: String, chequered: bool) -> void:
	var p := track.point(s)
	var f := track.frame(s)
	var root := Node3D.new()
	root.transform = Transform3D(Basis.looking_at(f[0]), p)
	add_child(root)
	var steel := Looks.plain(Color(0.2, 0.22, 0.26), 0.4, 0.7)
	for side in [-1.0, 1.0]:
		var leg := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(0.5, 7.0, 0.5)
		leg.mesh = bm
		leg.material_override = steel
		leg.position = Vector3(side * (Track.WALL + 0.6), 3.5, 0)
		root.add_child(leg)
	var beam := MeshInstance3D.new()
	var bb := BoxMesh.new()
	bb.size = Vector3(2 * Track.WALL + 1.8, 1.9, 0.35)
	beam.mesh = bb
	beam.material_override = _checker_mat() if chequered else Looks.plain(Color(0.06, 0.38, 0.22), 0.5)
	beam.position = Vector3(0, 6.6, 0)
	root.add_child(beam)
	var trim := MeshInstance3D.new()
	var tb := BoxMesh.new()
	tb.size = Vector3(2 * Track.WALL + 1.9, 0.22, 0.4)
	trim.mesh = tb
	trim.material_override = Looks.plain(Color(1.0, 0.75, 0.1), 0.4, 0.2, 0.3)
	trim.position = Vector3(0, 5.6, 0)
	root.add_child(trim)
	if chequered:
		var panel := MeshInstance3D.new()
		var pm := BoxMesh.new()
		pm.size = Vector3(9.0, 1.5, 0.5)
		panel.mesh = pm
		panel.material_override = Looks.plain(Color(0.85, 0.1, 0.12), 0.5)
		panel.position = Vector3(0, 6.6, 0)
		root.add_child(panel)
	for face in [1.0, -1.0]:
		var label := Label3D.new()
		label.text = text
		label.font = load("res://assets/fonts/RussoOne-Regular.ttf")
		label.font_size = 120
		label.pixel_size = 0.009
		label.outline_size = 0
		label.modulate = Color(1, 1, 1)
		label.position = Vector3(0, 6.65, 0.19 * face)
		label.rotation.y = 0.0 if face > 0 else PI
		# the near face is the one approaching cars see: -z in the root's frame
		label.rotation.y = PI if face > 0 else 0.0
		label.position.z = -0.19 if face > 0 else 0.19
		root.add_child(label)


func _flags(s: float) -> void:
	# a string of Buddhist flags (blue, yellow, red, white, orange) across the road
	if s < 0 or s > track.length - 2:
		return
	var colours := [Color("#1f4fd1"), Color("#f2c400"), Color("#d1202f"), Color("#f4f4f4"), Color("#f2701c")]
	var a := track.point(s, -Track.WALL - 0.4) + Vector3.UP * 6.2
	var b := track.point(s, Track.WALL + 0.4) + Vector3.UP * 6.2
	var flag := QuadMesh.new()
	flag.size = Vector2(0.42, 0.6)
	var xs := {}
	for c in colours:
		xs[c] = []
	var count := 34
	var dir := (b - a).normalized()
	for i in count:
		var t := (i + 0.5) / count
		var p := a.lerp(b, t) - Vector3.UP * (sin(PI * t) * 1.3 + 0.3)
		var c: Color = colours[i % 5]
		xs[c].append(Transform3D(Basis.looking_at(dir.cross(Vector3.UP)), p))
	for c in colours:
		var m := Looks.plain(c, 0.8).duplicate()
		m.cull_mode = BaseMaterial3D.CULL_DISABLED
		_multimesh(flag, xs[c], m, false)
	for side in [-1.0, 1.0]:
		var pole := MeshInstance3D.new()
		var cyl := CylinderMesh.new()
		cyl.top_radius = 0.07
		cyl.bottom_radius = 0.09
		cyl.height = 6.4
		pole.mesh = cyl
		pole.material_override = Looks.plain(Color(0.9, 0.9, 0.88), 0.6)
		pole.position = (a if side < 0 else b) - Vector3.UP * 3.0
		add_child(pole)


# ---- signs, start and finish ------------------------------------------------------------------------
func _signs() -> void:
	for sg in track.signs:
		var side := 1.0
		var p := track.point(sg.s, side * (Track.WALL + 0.9))
		var root := Node3D.new()
		root.transform = Transform3D(Basis.looking_at(track.frame(sg.s)[0]), p)
		add_child(root)
		var post := MeshInstance3D.new()
		var cyl := CylinderMesh.new()
		cyl.top_radius = 0.07
		cyl.bottom_radius = 0.07
		cyl.height = 2.6
		post.mesh = cyl
		post.material_override = Looks.plain(Color(0.6, 0.62, 0.65), 0.4, 0.8)
		post.position.y = 1.3
		root.add_child(post)
		var board := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(1.9, 1.9, 0.06)
		board.mesh = bm
		board.material_override = Looks.plain(Color(1.0, 0.78, 0.05), 0.5)
		board.position.y = 3.2
		board.rotation.z = PI / 4
		root.add_child(board)
		var edge := MeshInstance3D.new()
		var em := BoxMesh.new()
		em.size = Vector3(2.1, 2.1, 0.04)
		edge.mesh = em
		edge.material_override = Looks.plain(Color(0.08, 0.08, 0.08), 0.5)
		edge.position = Vector3(0, 3.2, -0.02)
		edge.rotation.z = PI / 4
		root.add_child(edge)
		var label := Label3D.new()
		label.text = sg.label.to_upper().replace(" ", "\n")
		label.font = load("res://assets/fonts/RussoOne-Regular.ttf")
		label.font_size = 64
		label.pixel_size = 0.0055
		label.modulate = Color(0.08, 0.08, 0.08)
		label.outline_size = 0
		label.position = Vector3(0, 3.2, 0.04)
		label.width = 260
		label.autowrap_mode = TextServer.AUTOWRAP_WORD
		root.add_child(label)


func _start_finish() -> void:
	var lines := [[30.0 + 1.5, "START"], [track.finish, "FINISH"]]
	if track.circuit:
		lines = [[31.5, "FINISH"]]
	for at in lines:
		var s: float = at[0]
		# a chequered line across the road
		var st := strip([[-Track.ROAD_HALF, 0.02], [Track.ROAD_HALF, 0.02]], Looks.kerb(Color(0.05, 0.05, 0.05), Color(0.95, 0.95, 0.95), 1.0), s - 1.0, s + 1.0, 1.0, "Line", false)
		st.material_override = _checker()
		var p := track.point(s)
		_gantry(s, at[1], true)
		# grandstands and a crowd beside the line
		for side in [-1.0, 1.0]:
			for k in 2:
				var gp := track.point(s - 8 + k * 16, side * (Track.WALL + (14.0 if track.circuit else 9.0)))
				gp.y = maxf(ground(gp.x, gp.z), p.y - 3)
				put("grandStandCovered", gp, _face_road(track.heading_at(s), side), 12.0)
				clear_zones.append({"pos": gp, "r": 12.0})
	_flush_scenery()


func _checker_mat() -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = Looks.shader("""
shader_type spatial;
varying vec3 lp;
void vertex() { lp = VERTEX; }
void fragment() {
	vec2 c = floor(vec2(lp.x, lp.y) / 0.45);
	ALBEDO = vec3(mod(c.x + c.y, 2.0) < 1.0 ? 0.04 : 0.95);
	ROUGHNESS = 0.6;
}
""")
	return m


func _checker() -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = Looks.shader("""
shader_type spatial;
void fragment() {
	vec2 c = floor(vec2(UV.x / 1.0, UV.y / 1.0));
	ALBEDO = vec3(mod(c.x + c.y, 2.0) < 1.0 ? 0.04 : 0.95);
	ROUGHNESS = 0.6;
}
""")
	return m


# ---- obstacles and pads -------------------------------------------------------------------------
func _obstacles() -> void:
	for o in track.obstacles:
		if track.circuit and o.s >= track.loop_len:
			continue # the same obstacles again on later laps
		var p := track.point(o.s, o.d)
		var h := track.heading_at(o.s)
		var node: Node3D
		match o.kind:
			"boulder", "coral":
				var m: String = rng.pick(["rock_largeA", "rock_largeB", "rock_largeC", "rock_largeD", "rock_largeE"])
				node = Looks.instance(m)
				var box := Looks.aabb(m)
				node.scale = Vector3(o.hd * 2 / box.size.x, 1.5 / box.size.y, o.hs * 2 / box.size.z)
				if o.kind == "coral":
					_tint(node, Color(1.0, 0.75, 0.7))
			"log":
				node = Looks.instance("log_large")
				var box := Looks.aabb("log_large")
				var long_axis := maxf(box.size.x, box.size.z)
				node.scale = Vector3.ONE * (o.hd * 2 / long_axis)
				node.rotation.y = PI / 2 if box.size.x > box.size.z else 0.0
			"wreck":
				var m: String = rng.pick(["sedan", "van", "taxi", "delivery"])
				node = Looks.instance(m)
				node.scale = Vector3.ONE * 1.6
				node.rotation = Vector3(0, PI / 2 + o.tilt, 0.25)
				_tint(node, Color(0.45, 0.4, 0.38))
			"pothole":
				node = MeshInstance3D.new()
				var cm := CylinderMesh.new()
				cm.top_radius = 1.1
				cm.bottom_radius = 0.8
				cm.height = 0.06
				node.mesh = cm
				node.material_override = Looks.plain(Color(0.1, 0.09, 0.08), 0.95)
				p.y += 0.01
			"puddle":
				node = MeshInstance3D.new()
				var cm2 := CylinderMesh.new()
				cm2.top_radius = 2.0
				cm2.bottom_radius = 2.0
				cm2.height = 0.04
				node.mesh = cm2
				node.material_override = Looks.water(Color(0.15, 0.2, 0.2), Color(0.3, 0.35, 0.3), 0.75)
				node.scale = Vector3(1.1, 1, 0.9)
				p.y += 0.03
			"elephant":
				node = Props.elephant()
				obstacle_nodes.append([o, node])
		if node == null:
			continue
		var holder := Node3D.new()
		holder.transform = Transform3D(Basis(Vector3.UP, PI / 2 - h), p)
		holder.add_child(node)
		add_child(holder)
		if o.kind == "elephant":
			obstacle_nodes[-1][1] = holder


func _tint(n: Node, c: Color) -> void:
	if n is MeshInstance3D:
		var mi := n as MeshInstance3D
		for i in mi.mesh.get_surface_count():
			var m := mi.get_active_material(i)
			if m is StandardMaterial3D:
				var m2: StandardMaterial3D = m.duplicate()
				m2.albedo_color = m2.albedo_color * c
				mi.set_surface_override_material(i, m2)
	for ch in n.get_children():
		_tint(ch, c)


## Move the elephants to where they are at race time `time`.
func update_obstacles(time: float) -> void:
	for b in bobbers:
		var node: Node3D = b[0]
		node.position.y = b[1] + sin(time * 0.9 + b[2]) * b[3]
		node.rotation.z = sin(time * 0.7 + b[2]) * 0.04 * b[3]
	for pair in obstacle_nodes:
		var o: Dictionary = pair[0]
		var node: Node3D = pair[1]
		var d := track.obstacle_d(o, time)
		var p := track.point(o.s, d)
		var vel := cos(time * o.speed + o.phase) # which way it's walking
		node.position = p
		node.rotation.y = PI / 2 - track.heading_at(o.s) + (PI / 2 if vel > 0 else -PI / 2)
		var legs: Node3D = node.get_child(0)
		legs.rotation.z = sin(time * 4.0) * 0.03


func _pads() -> void:
	for pd in track.pads:
		if track.circuit and pd.s >= track.loop_len:
			continue
		var mi := strip([[pd.d - 1.8, 0.03], [pd.d + 1.8, 0.03]], Looks.pad(), pd.s - 3.5, pd.s + 3.5, 1.0, "Pad", false)
		# re-map UVs: 0..1 across, 0..1 along
		var arrays := mi.mesh.surface_get_arrays(0)
		var uvs: PackedVector2Array = arrays[Mesh.ARRAY_TEX_UV]
		for i in uvs.size():
			uvs[i] = Vector2(uvs[i].x / 3.6, (uvs[i].y - (pd.s - 3.5)) / 7.0)
		arrays[Mesh.ARRAY_TEX_UV] = uvs
		var am := ArrayMesh.new()
		am.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
		mi.mesh = am


# ---- circuit scenery: the beach -------------------------------------------------------------
func _decor() -> void:
	match look.get("decor", ""):
		"beach":
			_beach()


func _beach() -> void:
	var b := track.bounds
	var kit := Landmarks.new()
	kit.world = self
	add_child(kit)
	var sea_z: float = look.sea_z
	# islands with palms out at sea
	for i in 7:
		var w := rng.range_f(50, 150)
		var h := rng.range_f(14, 42)
		var isle := kit._rock(w, h, Color(0.5, 0.62, 0.45))
		isle.position = Vector3(lerpf(b.x0 - 450, b.x1 + 500, i / 6.0) + rng.range_f(-60, 60), sea_level - 2.0, sea_z + rng.range_f(260, 720))
		add_child(isle)
		for k in int(w / 14):
			var palm := Looks.instance(rng.pick(["tree_palmTall", "tree_palm", "tree_palmBend"]))
			var a := rng.next() * TAU
			var r := rng.next() * w * 0.22
			palm.position = isle.position + Vector3(cos(a) * r, h * 0.78, sin(a) * r)
			palm.scale = Vector3.ONE * rng.range_f(7, 10)
			palm.rotation.y = rng.next() * TAU
			add_child(palm)
	# green mountains behind
	for i in 8:
		var peak := kit._peak(rng.range_f(140, 280), Color(0.38, 0.6, 0.36))
		peak.position = Vector3(lerpf(b.x0 - 700, b.x1 + 700, i / 7.0) + rng.range_f(-80, 80), 0.0, b.z0 - rng.range_f(380, 760))
		add_child(peak)
	# a red-and-white lighthouse on a rocky point at the end of the beach
	var point := kit._rock(46, 10, Color(0.55, 0.5, 0.45))
	point.position = Vector3(b.x1 + 70, sea_level - 1.0, sea_z + 30)
	add_child(point)
	for k in 6:
		var band := Props.part(Props.cyl(3.0 - k * 0.22, 3.2 - k * 0.22, 5.0, 20), Looks.plain(Color("#e8312f") if k % 2 == 0 else Color("#f5f5f5"), 0.5), point.position + Vector3(0, 10.5 + k * 5.0, 0))
		add_child(band)
	add_child(Props.part(Props.cyl(1.8, 1.8, 2.6, 16), Looks.plain(Color(1.0, 0.9, 0.5), 0.3, 0.0, 4.0), point.position + Vector3(0, 41.5, 0)))
	add_child(Props.part(Props.cyl(0.0, 2.4, 2.2, 16), Looks.plain(Color("#e8312f"), 0.5), point.position + Vector3(0, 44, 0)))
	# sailboats
	var sails := [Color("#ff5a5f"), Color("#ffd23f"), Color("#29b6f6"), Color("#ffffff"), Color("#ff8a1f"), Color("#8bc34a")]
	for i in 12:
		var boat := Node3D.new()
		boat.add_child(Props.part(Props.box(2.2, 0.9, 7.0), Looks.plain(Color(0.95, 0.95, 0.97), 0.4), Vector3(0, 0.3, 0)))
		boat.add_child(Props.part(Props.cyl(0.08, 0.08, 9.0, 6), Looks.plain(Color(0.8, 0.8, 0.82), 0.4, 0.6), Vector3(0, 5.0, 0.5)))
		var sail := Props.part(PrismMesh.new(), Looks.plain(rng.pick(sails), 0.7), Vector3(0, 5.0, -1.2), Vector3(0.06, 8.0, 4.4))
		sail.rotation.y = PI / 2
		boat.add_child(sail)
		var p := Vector3(rng.range_f(b.x0 - 250, b.x1 + 300), sea_level, sea_z + rng.range_f(70, 380))
		boat.position = p
		boat.rotation.y = rng.next() * TAU
		add_child(boat)
		bobbers.append([boat, sea_level - 0.1, rng.next() * TAU, 0.25])
	# a wooden pier with a hut at the end
	var px0 := lerpf(b.x0, b.x1, 0.45)
	var wood := Looks.plain(Color(0.55, 0.38, 0.22), 0.85)
	var deck_len := 110.0
	var start_z := sea_z - 18.0
	add_child(Props.part(Props.box(4.0, 0.4, deck_len), wood, Vector3(px0, sea_level + 2.2, start_z + deck_len / 2)))
	for k in range(0, int(deck_len), 8):
		for x in [-1.8, 1.8]:
			add_child(Props.part(Props.cyl(0.18, 0.18, 6.0, 6), wood, Vector3(px0 + x, sea_level - 0.8, start_z + k)))
	_hut(Vector3(px0, sea_level + 2.4, start_z + deck_len + 3), 0.0)
	# beach huts, parasols, towels and surfboards along the sand
	var towels := [Color("#ff5a5f"), Color("#29b6f6"), Color("#ffd23f"), Color("#8bc34a"), Color("#c98ae0")]
	var x = b.x0 - 40
	while x < b.x1 + 40:
		var z := sea_z - rng.range_f(6, 18)
		var gy := ground(x, z)
		var info := road_info(x, z)
		if gy > sea_level + 0.4 and info[0] > Track.WALL + 8 and clear_at(Vector3(x, gy, z), 4):
			var roll := rng.next()
			if roll < 0.25:
				_hut(Vector3(x, gy, z - 4), rng.range_f(-0.3, 0.3))
			else:
				put(rng.pick(["detail-parasol-a", "detail-parasol-b"]), Vector3(x, gy - 0.05, z), rng.next() * TAU, 9.0)
				var towel := Props.part(Props.box(1.2, 0.03, 2.2), Looks.plain(rng.pick(towels), 0.9), Vector3(x + 2.2, gy + 0.03, z + 0.5))
				towel.rotation.y = rng.range_f(-0.4, 0.4)
				add_child(towel)
				if rng.next() < 0.4:
					var board := Props.part(Props.box(0.6, 2.4, 0.12), Looks.plain(rng.pick(towels), 0.4), Vector3(x - 2.0, gy + 1.0, z - 1.0))
					board.rotation = Vector3(0.15, rng.next() * TAU, 0)
					add_child(board)
		x += rng.range_f(14, 26)
	# hot-air balloons drifting over the hills
	var cols := [Color("#ff5a5f"), Color("#ffd23f"), Color("#29b6f6"), Color("#8bc34a"), Color("#ff8a1f")]
	for i in 5:
		var bal := Node3D.new()
		var c: Color = cols[i % cols.size()]
		bal.add_child(Props.part(Props.sphere(7.0, 20), Looks.plain(c, 0.6), Vector3(0, 9, 0), Vector3(1, 1.2, 1)))
		bal.add_child(Props.part(Props.cyl(3.6, 7.05, 3.0, 20), Looks.plain(c.lightened(0.5), 0.6), Vector3(0, 7.2, 0)))
		bal.add_child(Props.part(Props.box(2.0, 1.4, 2.0), Looks.plain(Color(0.5, 0.33, 0.18), 0.9), Vector3(0, -1.5, 0)))
		var p := Vector3(rng.range_f(b.x0, b.x1), 0, rng.range_f(b.z0 - 250, b.z1))
		p.y = ground(p.x, p.z) + rng.range_f(60, 120)
		bal.position = p
		add_child(bal)
		bobbers.append([bal, p.y, rng.next() * TAU, 3.0])
	# race furniture: banner towers and billboards along the start straight, bunting over the road
	for k in 6:
		var ss := 50.0 + k * 45.0
		var side := -1.0 if k % 2 == 0 else 1.0
		var tp := track.point(ss, side * (Track.WALL + 2.5))
		put("bannerTowerRed" if k % 2 == 0 else "bannerTowerGreen", tp, track.heading_at(ss), 8.0)
	var words := ["TURBO!", "PALM BEACH", "GO GO GO", "SL RACING", "SURF'S UP"]
	for k in 5:
		var ss := track.loop_len * (0.12 + k * 0.18)
		var side := 1.0 if k % 2 == 0 else -1.0
		var bp := track.point(ss, side * (Track.WALL + 6.0))
		bp.y = maxf(bp.y - 0.5, ground(bp.x, bp.z))
		_billboard(bp, _face_road(track.heading_at(ss), side), words[k], cols[k])
	for k in 4:
		_flags(track.loop_len * (0.05 + k * 0.25))


func _hut(p: Vector3, yaw: float) -> void:
	var root := Node3D.new()
	root.position = p
	root.rotation.y = yaw
	add_child(root)
	var bamboo := Looks.plain(Color(0.78, 0.62, 0.38), 0.85)
	for x in [-1.8, 1.8]:
		for z in [-1.8, 1.8]:
			root.add_child(Props.part(Props.cyl(0.12, 0.12, 3.0, 6), bamboo, Vector3(x, 1.5, z)))
	root.add_child(Props.part(Props.box(4.2, 0.2, 4.2), bamboo, Vector3(0, 1.2, 0)))
	root.add_child(Props.part(Props.box(3.6, 0.9, 0.12), bamboo, Vector3(0, 1.75, 1.8)))
	var roof := Props.part(Props.cyl(0.0, 3.8, 2.4, 4), Looks.plain(Color(0.86, 0.72, 0.4), 0.95), Vector3(0, 4.1, 0))
	roof.rotation.y = PI / 4
	root.add_child(roof)


func _billboard(p: Vector3, yaw: float, text: String, colour: Color) -> void:
	var root := Node3D.new()
	root.position = p
	root.rotation.y = yaw
	add_child(root)
	for x in [-3.5, 3.5]:
		root.add_child(Props.part(Props.box(0.3, 6.0, 0.3), Looks.plain(Color(0.25, 0.27, 0.3), 0.4, 0.7), Vector3(x, 3.0, 0)))
	root.add_child(Props.part(Props.box(9.0, 3.6, 0.3), Looks.plain(colour, 0.5), Vector3(0, 5.5, 0)))
	root.add_child(Props.part(Props.box(9.4, 0.25, 0.4), Looks.plain(Color.WHITE, 0.5), Vector3(0, 7.4, 0)))
	var label := Label3D.new()
	label.text = text
	label.font = load("res://assets/fonts/RussoOne-Regular.ttf")
	label.font_size = 130
	label.pixel_size = 0.011
	label.outline_size = 22
	label.outline_modulate = Color(0.05, 0.05, 0.1)
	label.position = Vector3(0, 5.5, 0.18)
	root.add_child(label)
