class_name Track
extends RefCounted
# A route: the map's towns joined by one winding, climbing road, from the first town to
# the last (point to point). No nodes here, so it runs headless in tests.
#
# The road is a centreline sampled every STEP metres. A car's place on it is (s, d):
# s metres along the road, d metres to the right of the centre line. World axes: x and z
# across the ground, y up; heading 0 points along +x and a growing heading turns right
# (towards +z).

const STEP := 2.0 # metres between centreline samples
const ROAD_HALF := 7.0 # half the tarmac width
const SHOULDER := 2.5 # verge each side before the barriers
const WALL := ROAD_HALF + SHOULDER # |d| where the barriers stand
const TOWN_GAP := 300.0 # metres between the town boards (checkpoints)
const MAX_TOWNS := 8 # a route ends at the 8th town (~2.4 km, under two minutes)

# curveR: bend radii (m); bend: bend angles (rad); straight: lengths between bends (m);
# deviate: how far the road may turn from its overall direction; hills: how big its
# climbs, drops, valleys and ridges are (1 = hill country).
const ROUTES := {
	"hills": {"curveR": [45, 150], "bend": [0.4, 1.5], "straight": [30, 110], "deviate": 1.3, "hills": 1.0},
	"coast": {"curveR": [140, 420], "bend": [0.25, 0.8], "straight": [70, 220], "deviate": 0.7, "hills": 0.45, "sea": 1},
	"colombo": {"curveR": [26, 45], "bend": [1.2, 1.6], "straight": [70, 170], "deviate": 1.6, "hills": 0.4},
	"knuckles": {"curveR": [28, 70], "bend": [0.6, 2.0], "straight": [20, 70], "deviate": 1.7, "hills": 1.2},
	"kelani": {"curveR": [40, 110], "bend": [0.5, 1.6], "straight": [25, 90], "deviate": 1.3, "hills": 0.9},
	"rajarata": {"curveR": [90, 300], "bend": [0.3, 1.0], "straight": [90, 260], "deviate": 0.9, "hills": 0.4},
}

# section lengths (m), and whether the road must run straight through them
const SECTIONS := {
	"rolling": {"len": [60, 110]},
	"climb": {"len": [90, 140]},
	"drop": {"len": [70, 110]},
	"valley": {"len": [60, 90]},
	"ridge": {"len": [45, 65], "straight": true},
	"kicker": {"len": [44, 44], "straight": true},
	"dunes": {"len": [70, 80], "straight": true},
	"steps": {"len": [60, 70]},
	"rocky": {"len": [60, 90]},
	"wrecks": {"len": [60, 80]},
	"wetland": {"len": [50, 70]},
	"ford": {"len": [46, 60], "straight": true},
	"lake": {"len": [70, 100], "straight": true},
	"cave": {"len": [70, 90]},
	"gorge": {"len": [90, 110]},
	"bridge": {"len": [110, 110], "straight": true},
}
const ONCE := {"bridge": 1, "cave": 2, "gorge": 1}
const SIGNATURE := {"hills": "valley", "coast": "dunes", "colombo": "bridge", "knuckles": "gorge", "kelani": "cave", "rajarata": "lake"}

var map: Dictionary
var style: Dictionary
var rng: Rng
var towns: Array = [] # [{name, s}]
var length: float
var finish: float
var n: int
var sea: int = 0

var sections: Array = [] # [{type, s0, s1, label}]
var kappa: PackedFloat64Array
var px: PackedFloat64Array
var pz: PackedFloat64Array
var hdg: PackedFloat64Array
var py: PackedFloat64Array

var jumps: Array = []
var fords: Array = [] # [{s0, s1, kind, level}]
var caves: Array = []
var gorges: Array = []
var bridge = null # {s0, s1} or null
var obstacles: Array = []
var signs: Array = []
var boxes: Array = []
var pads: Array = []
var coins: Array = []

# circuits (hand-made loops raced over laps): the arrays hold one lap; s keeps counting
# up lap after lap and the sampling wraps it
var circuit := false
var laps := 1
var loop_len := 0.0
var turn := 0.0 # how far the heading turns over one lap (±TAU)
var world_len := 0.0 # the stretch of road the 3D world is built for
var base_py := PackedFloat64Array()
var point_s := [] # s of each control point (circuits)
var lap_boxes := 0 # item boxes in one lap (they repeat each lap)
var lap_coins := 0

var cell := 40.0
var grid := {}
var bounds := {}


func _init(map_id: String, seed_value: int = 1, lap_count: int = 3) -> void:
	map = Maps.get_map(map_id)
	if map.has("circuit"):
		_build_circuit(lap_count)
		return
	style = ROUTES[map.id]
	rng = Rng.new(seed_value * 7919 + map.id.length() * 104729)
	var town_names: Array = map.towns.slice(0, MAX_TOWNS)
	for i in town_names.size():
		towns.append({"name": town_names[i], "s": (i + 1) * TOWN_GAP})
	finish = towns[-1].s
	length = finish + 60.0
	n = int(ceil(length / STEP)) + 1
	sea = style.get("sea", 0)
	_plan_sections()
	# a winding road can wander back near itself: draw it again until it doesn't
	for attempt in 40:
		_layout()
		if self_gap() > WALL * 2 + 30:
			break
	_build_profile()
	_place_obstacles()
	_place_pickups()
	_build_index()
	world_len = length - 1
	lap_boxes = boxes.size()
	lap_coins = coins.size()


# ---- circuits ---------------------------------------------------------------------------------
static func _catmull(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, t: float) -> Vector3:
	var t2 := t * t
	var t3 := t2 * t
	return 0.5 * ((2.0 * p1) + (-p0 + p2) * t + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3)


func _build_circuit(lap_count: int) -> void:
	circuit = true
	laps = lap_count
	var c: Dictionary = map.circuit
	style = {"hills": 1.0}
	rng = Rng.new(map.id.hash() & 0xFFFF)
	var pts: Array = c.points
	var np := pts.size()
	# a smooth closed curve through the control points, then resampled every STEP metres
	var dense := []
	var dense_at_point := []
	for i in np:
		dense_at_point.append(dense.size())
		var p0: Vector3 = pts[(i - 1 + np) % np]
		var p1: Vector3 = pts[i]
		var p2: Vector3 = pts[(i + 1) % np]
		var p3: Vector3 = pts[(i + 2) % np]
		for k in 40:
			dense.append(_catmull(p0, p1, p2, p3, k / 40.0))
	dense.append(dense[0])
	var cum := PackedFloat64Array([0.0])
	for i in range(1, dense.size()):
		var a: Vector3 = dense[i - 1]
		var b: Vector3 = dense[i]
		cum.append(cum[i - 1] + Vector2(b.x - a.x, b.z - a.z).length())
	var true_len := cum[cum.size() - 1]
	n = int(round(true_len / STEP))
	loop_len = n * STEP
	var k := loop_len / true_len
	for i in np:
		point_s.append(cum[dense_at_point[i]] * k)
	px = PackedFloat64Array(); px.resize(n)
	pz = PackedFloat64Array(); pz.resize(n)
	base_py = PackedFloat64Array(); base_py.resize(n)
	var j := 0
	for i in n:
		var target := i * true_len / n
		while cum[j + 1] < target:
			j += 1
		var t := (target - cum[j]) / maxf(1e-6, cum[j + 1] - cum[j])
		var p: Vector3 = (dense[j] as Vector3).lerp(dense[j + 1], t)
		px[i] = p.x
		pz[i] = p.z
		base_py[i] = p.y
	# headings (unwrapped) and curvature
	hdg = PackedFloat64Array(); hdg.resize(n)
	kappa = PackedFloat64Array(); kappa.resize(n)
	var prev := 0.0
	for i in n:
		var a := (i - 1 + n) % n
		var b := (i + 1) % n
		var h := atan2(pz[b] - pz[a], px[b] - px[a])
		if i > 0:
			h = prev + wrapf(h - prev, -PI, PI)
		hdg[i] = h
		prev = h
	var h_end := atan2(pz[1] - pz[n - 1], px[1] - px[n - 1])
	turn = (hdg[n - 1] + wrapf(h_end - hdg[n - 1], -PI, PI)) - hdg[0]
	turn = TAU * round(turn / TAU)
	for i in n:
		var nxt := hdg[(i + 1) % n] + (turn if i == n - 1 else 0.0)
		kappa[i] = (nxt - hdg[i]) / STEP
	# the features along the lap, from the control points
	for f in c.features:
		var s0: float = point_s[f.at] + f.get("offset", 0.0)
		sections.append({"type": f.type, "s0": s0, "s1": s0 + f.len, "label": f.get("label", "")})
	sections.sort_custom(func(a, b): return a.s0 < b.s0)
	finish = loop_len # while building one lap
	length = loop_len + 200.0
	_build_profile()
	_place_obstacles()
	_place_pickups()
	world_len = loop_len
	lap_boxes = boxes.size()
	lap_coins = coins.size()
	# the line is at START_S in every lap; the race is `laps` times round
	var start_s := 31.5
	for lap in range(1, laps):
		towns.append({"name": "LAP %d" % (lap + 1), "s": lap * loop_len + start_s})
	finish = laps * loop_len + start_s
	length = finish + 120.0
	towns.append({"name": "FINISH", "s": finish})
	# repeat everything on the road for every lap
	for list in [boxes, coins, pads, obstacles]:
		var one: Array = list.duplicate()
		for lap in range(1, laps + 1):
			for item in one:
				var copy: Dictionary = item.duplicate()
				copy.s += lap * loop_len
				list.append(copy)
	_build_index()


## s within one lap (circuits), or s itself (routes).
func lap_s(s: float) -> float:
	return fposmod(s, loop_len) if circuit else s


func r(lo: float, hi: float) -> float:
	return rng.range_f(lo, hi)


func rr(pair: Array) -> float:
	return rng.range_f(pair[0], pair[1])


static func smooth(a: PackedFloat64Array, passes: int, radius: int) -> PackedFloat64Array:
	var out := a
	for p in passes:
		var next := PackedFloat64Array()
		next.resize(out.size())
		for i in out.size():
			var sum := 0.0
			var cnt := 0
			for j in range(maxi(0, i - radius), mini(out.size() - 1, i + radius) + 1):
				sum += out[j]
				cnt += 1
			next[i] = sum / cnt
		out = next
	return out


static func ease3(t: float) -> float:
	return t * t * (3.0 - 2.0 * t)


# ---- the plan: which sections, where ----------------------------------------------------
func _plan_sections() -> void:
	var weights := []
	for sec in map.sections:
		if not SECTIONS.has(sec[0]):
			continue
		var k := 0.15 if sec[0] == "rolling" else 1.0
		weights.append([sec[0], sec[1] * k, sec[2] * k])
	var signature: String = SIGNATURE[map.id]
	var counts := {}
	var s := 90.0
	var last_type := "rolling"
	while s < finish - 50:
		var progress := s / finish
		var pool := []
		for w in weights:
			if counts.get(w[0], 0) < ONCE.get(w[0], 1 << 30) and not (w[0] == last_type and w[0] != "rolling"):
				pool.append(w)
		var total := 0.0
		for w in pool:
			total += w[1] + (w[2] - w[1]) * progress
		var pick := rng.next() * total
		var type := "rolling"
		for w in pool:
			pick -= w[1] + (w[2] - w[1]) * progress
			if pick < 0:
				type = w[0]
				break
		if not counts.has(signature) and progress > 0.3:
			type = signature
		var sec_len: float = round(rr(SECTIONS[type].len) / STEP) * STEP
		# keep 20 m of plain road either side of every town board
		var town = null
		for t in towns:
			if t.s > s - 20 and t.s < s + sec_len + 20:
				town = t
				break
		if town != null and type != "rolling":
			s = town.s + 22
			continue
		if s + sec_len > finish - 30:
			break
		sections.append({"type": type, "s0": s, "s1": s + sec_len, "label": map.hard.get(type, "")})
		counts[type] = counts.get(type, 0) + 1
		last_type = type
		s += sec_len + round(r(20, 50) / STEP) * STEP


# ---- bends and the centreline ------------------------------------------------------------
func _layout() -> void:
	var k := PackedFloat64Array()
	k.resize(n)
	var s := 70.0 # a straight start for the grid
	var heading := 0.0
	while s < length - 40:
		s += rr(style.straight)
		var radius := rr(style.curveR)
		var angle := rr(style.bend)
		var sign: float
		if absf(heading) > style.deviate * 0.55:
			sign = -signf(heading)
		else:
			sign = -1.0 if rng.next() < 0.5 else 1.0
		var seg: float = minf(angle * radius, length - 40 - s)
		if seg <= 0:
			break
		for i in range(int(floor(s / STEP)), mini(n, int(ceil((s + seg) / STEP)))):
			k[i] = sign / radius
		heading += sign * seg / radius
		s += seg
	# straight through jumps, crossings and the viaduct (and a little either side)
	for sec in sections:
		if not SECTIONS[sec.type].get("straight", false):
			continue
		for i in range(maxi(0, int(floor((sec.s0 - 25) / STEP))), mini(n, int(ceil((sec.s1 + 15) / STEP)))):
			k[i] = 0.0
	kappa = smooth(k, 3, 6)
	px = PackedFloat64Array(); px.resize(n)
	pz = PackedFloat64Array(); pz.resize(n)
	hdg = PackedFloat64Array(); hdg.resize(n)
	var x := 0.0
	var z := 0.0
	var h := 0.0
	for i in n:
		px[i] = x
		pz[i] = z
		hdg[i] = h
		h += kappa[i] * STEP
		x += cos(h) * STEP
		z += sin(h) * STEP


## How close the road comes to a part of itself more than 150 m further along.
func self_gap() -> float:
	var c := 60.0
	var g := {}
	for i in range(0, n, 2):
		var key := Vector2i(int(floor(px[i] / c)), int(floor(pz[i] / c)))
		if not g.has(key):
			g[key] = []
		g[key].append(i)
	var gap := INF
	for i in range(0, n, 2):
		var cx := int(floor(px[i] / c))
		var cz := int(floor(pz[i] / c))
		for gx in range(cx - 1, cx + 2):
			for gz in range(cz - 1, cz + 2):
				for j in g.get(Vector2i(gx, gz), []):
					var apart := absi(i - j)
					if circuit:
						apart = mini(apart, n - apart) # a loop: the end meets the start
					if apart * STEP < 150:
						continue
					gap = minf(gap, Vector2(px[i] - px[j], pz[i] - pz[j]).length())
	return gap


# ---- sampling ---------------------------------------------------------------------------
func _fi(s: float) -> float:
	if circuit:
		return fposmod(s, loop_len) / STEP
	return clampf(s / STEP, 0.0, n - 1.001)


func _next(i: int) -> int:
	return (i + 1) % n if circuit else i + 1


func kappa_at(s: float) -> float:
	var f := _fi(s)
	var i := int(f)
	return lerpf(kappa[i], kappa[_next(i)], f - i)


func height_at(s: float) -> float:
	var f := _fi(s)
	var i := int(f)
	return lerpf(py[i], py[_next(i)], f - i)


func _hdg_next(i: int) -> float:
	if circuit and i == n - 1:
		return hdg[0] + turn
	return hdg[i + 1]


func grade_at(s: float) -> float:
	return (height_at(s + 1) - height_at(s - 1)) / 2.0


func heading_at(s: float) -> float:
	var f := _fi(s)
	var i := int(f)
	return lerpf(hdg[i], _hdg_next(i), f - i)


## World position of road place (s, d), on the road surface.
func point(s: float, d: float = 0.0) -> Vector3:
	var f := _fi(s)
	var i := int(f)
	var t := f - i
	var i1 := _next(i)
	var h := lerpf(hdg[i], _hdg_next(i), t)
	return Vector3(lerpf(px[i], px[i1], t) - sin(h) * d, height_at(s), lerpf(pz[i], pz[i1], t) + cos(h) * d)


## Unit vectors along the road and to its right at s (flat, ignoring the slope).
func frame(s: float) -> Array:
	var h := heading_at(s)
	return [Vector3(cos(h), 0, sin(h)), Vector3(-sin(h), 0, cos(h))]


func in_ford(s: float):
	s = lap_s(s)
	for f in fords:
		if s > f.s0 and s < f.s1:
			return f
	return null


func in_cave(s: float) -> bool:
	s = lap_s(s)
	for c in caves:
		if s > c.s0 and s < c.s1:
			return true
	return false


func in_gorge(s: float):
	s = lap_s(s)
	for g in gorges:
		if s > g.s0 and s < g.s1:
			return g
	return null


func on_bridge(s: float) -> bool:
	s = lap_s(s)
	return bridge != null and s > bridge.s0 and s < bridge.s1


func section_at(s: float):
	s = lap_s(s)
	for sec in sections:
		if s >= sec.s0 and s < sec.s1:
			return sec
	return null


# ---- the road's rise and fall, section by section ------------------------------------------
func _add(y: PackedFloat64Array, sec: Dictionary, f: Callable) -> void:
	for i in range(int(ceil(sec.s0 / STEP)), n):
		var t: float = (i * STEP - sec.s0) / (sec.s1 - sec.s0)
		y[i] += f.call(minf(1.0, t)) # f(1) carries on past the section (climbs and drops stay)


func _build_profile() -> void:
	var scale: float = style.hills
	var y := PackedFloat64Array()
	y.resize(n)
	if circuit:
		y = base_py.duplicate()
	for sec in sections:
		var sec_len: float = sec.s1 - sec.s0
		match sec.type:
			"rolling":
				var a := r(1.5, 4) * scale
				_add(y, sec, func(t): return a * sin(PI * t) if t < 1 else 0.0)
			"climb":
				var rise: float = minf(sec_len * 0.13, r(12, 22) * scale)
				_add(y, sec, func(t): return rise * ease3(t))
			"drop":
				var fall: float = minf(sec_len * 0.13, r(10, 20) * scale)
				_add(y, sec, func(t): return -fall * ease3(t))
			"valley":
				var depth := r(6, 10) * maxf(0.6, scale)
				_add(y, sec, func(t): return -depth * pow(sin(PI * t), 1.4) if t < 1 else 0.0)
			"ridge":
				var hh := r(3.5, 6) * maxf(0.6, scale)
				_add(y, sec, func(t): return hh * pow(sin(PI * t), 2.2) if t < 1 else 0.0)
			"kicker":
				# a ramp, then the road drops away: a jump
				var hk := r(1.8, 2.6)
				var ramp := func(t: float) -> float:
					var x: float = t * sec_len
					if t >= 1:
						return 0.0
					if x < 14:
						return hk * pow(x / 14.0, 2)
					if x < 17:
						return hk * (1.0 - (x - 14.0) / 3.0)
					return 0.0
				_add(y, sec, ramp)
				jumps.append({"s": sec.s0 + 14, "height": hk})
			"dunes":
				_add(y, sec, func(t): return 1.9 * pow(sin(PI * t * 3), 2) if t < 1 else 0.0)
			"steps":
				var dropv := r(0.5, 0.75)
				_add(y, sec, func(t): return -dropv * minf(4.0, floor(t * 4.5)))
			"ford", "lake", "wetland":
				var deep := 0.25 if sec.type == "wetland" else 0.55
				_add(y, sec, func(t): return -deep * sin(PI * t) if t < 1 else 0.0)
				fords.append({"s0": sec.s0, "s1": sec.s1, "kind": sec.type})
			"cave":
				caves.append({"s0": sec.s0, "s1": sec.s1})
				_add(y, sec, func(t): return 0.8 * sin(PI * t * 2) if t < 1 else 0.0)
			"gorge":
				var dg := r(8, 12) * scale
				_add(y, sec, func(t): return -dg * ease3(minf(1.0, t * 2.6)) * ease3(minf(1.0, (1 - t) * 2.6)) if t < 1 else 0.0)
				gorges.append({"s0": sec.s0, "s1": sec.s1})
				fords.append({"s0": sec.s0 + sec_len * 0.42, "s1": sec.s0 + sec_len * 0.58, "kind": "stream"})
			"bridge":
				bridge = {"s0": sec.s0, "s1": sec.s1}
	py = smooth(y, 1, 2)
	for f in fords:
		f.level = maxf(height_at(f.s0), height_at(f.s1)) - 0.08


# ---- obstacles: rows across the road, always with a way through -----------------------------
func _row(s: float, fill: Callable, spacing: Array = [2.8, 3.8]) -> void:
	var gap := r(-3.5, 3.5) # the way through
	var d := -ROAD_HALF + 1
	while d <= ROAD_HALF - 1:
		if absf(d - gap) >= 4.4 and rng.next() < 0.75:
			fill.call(s + r(-1.5, 1.5), d)
		d += rr(spacing)


func _place_obstacles() -> void:
	var rocks: String = map.rocks
	var rocky_count := 0
	for sec in sections:
		var sec_len: float = sec.s1 - sec.s0
		if sec.type == "rocky":
			var elephants: bool = map.id == "rajarata" and rocky_count % 2 == 0
			rocky_count += 1
			if elephants:
				# a herd crossing: elephants amble from one side to the other and back
				sec.label = "Elephant crossing"
				for k in 2:
					obstacles.append({"kind": "elephant", "s": sec.s0 + sec_len * (0.3 + 0.4 * k), "d": 0.0, "hs": 1.9, "hd": 1.2, "h": 3.0, "solid": true, "phase": r(0, 6.3), "speed": r(0.25, 0.4)})
				continue
			var s: float = sec.s0 + 8
			while s < sec.s1 - 6:
				if map.id == "kelani" and rng.next() < 0.45:
					# a fallen tree across the half of the road away from the gap
					var g := r(-3, 3)
					var side := -1.0 if g > 0 else 1.0
					obstacles.append({"kind": "log", "s": s, "d": side * (ROAD_HALF - 3), "hs": 0.5, "hd": 3.0, "h": 0.8, "solid": true})
				else:
					var fill := func(rs: float, d: float) -> void:
						if rocks == "rubble":
							obstacles.append({"kind": "pothole", "s": rs, "d": d, "hs": 1.1, "hd": 1.1, "h": 0.0, "solid": false})
						else:
							obstacles.append({"kind": "coral" if rocks == "coral" else "boulder", "s": rs, "d": d, "hs": r(0.8, 1.1), "hd": r(0.8, 1.1), "h": 1.4, "solid": true, "rot": r(0, TAU)})
					_row(s, fill)
				s += r(13, 18)
		elif sec.type == "wrecks":
			var s: float = sec.s0 + 10
			while s < sec.s1 - 8:
				_row(s, func(rs, d): obstacles.append({"kind": "wreck", "s": rs, "d": d, "hs": 2.1, "hd": 1.0, "h": 1.5, "solid": true, "tilt": r(-0.5, 0.5)}), [4.8, 6.0])
				s += r(16, 22)
		elif sec.type == "wetland":
			var s: float = sec.s0 + 6
			while s < sec.s1 - 4:
				obstacles.append({"kind": "puddle", "s": s, "d": r(-5, 5), "hs": 2.2, "hd": 1.8, "h": 0.0, "solid": false})
				s += r(8, 12)
	for sec in sections:
		if sec.label != "":
			signs.append({"s": maxf(40.0, sec.s0 - 22), "label": sec.label})


## Where an obstacle is at race time `time` (elephants walk to and fro across the road).
func obstacle_d(o: Dictionary, time: float) -> float:
	if o.kind == "elephant":
		return sin(time * o.speed + o.phase) * (ROAD_HALF - 1.5)
	return o.d


# ---- item boxes, boost pads and coins -------------------------------------------------------
func _clear_of_towns(si: float, gap: float) -> bool:
	for t in towns:
		if absf(t.s - si) <= gap:
			return false
	return si > 120 and si < finish - 60


func _calm(si: float, gap: float) -> bool:
	for sec in sections:
		if sec.type != "rolling" and si > sec.s0 - gap and si < sec.s1 + gap:
			return false
	return true


func _straight_at(si: float, span: float) -> bool:
	var t := si - span
	while t <= si + span:
		if absf(kappa_at(t)) > 1.0 / 200.0:
			return false
		t += STEP
	return true


func _nudge(si: float, ok: Callable) -> float:
	var off := 0.0
	while off < 100:
		if ok.call(si + off): return si + off
		if ok.call(si - off): return si - off
		off += STEP
	return si


func _place_pickups() -> void:
	# item boxes: a row across the road every ~220 m
	var si := 170.0
	while si < finish - 60:
		var at := _nudge(si, func(t): return _clear_of_towns(t, 25) and _calm(t, 12))
		for d in [-4.5, -1.5, 1.5, 4.5]:
			boxes.append({"s": at, "d": d})
		si += 220
	# boost pads on some straights
	var found := []
	for tries in 400:
		if found.size() >= 4:
			break
		var p: float = round(r(150, finish - 80) / STEP) * STEP
		if not (_straight_at(p, 20) and _clear_of_towns(p, 30) and _calm(p, 10)):
			continue
		var far := true
		for o in found:
			if absf(o - p) <= 80:
				far = false
		if far:
			found.append(p)
	found.sort()
	for p in found:
		pads.append({"s": p, "d": r(-4, 4)})
	# coin lines along a lane
	si = 110.0
	while si < finish - 40:
		var d := r(-5, 5)
		for k in 6:
			var cs := si + k * 4
			var blocked := false
			for o in obstacles:
				if absf(o.s - cs) < o.hs + 2 and absf(o.d - d) < o.hd + 1.5:
					blocked = true
					break
			if not blocked:
				coins.append({"s": cs, "d": d})
		si += 130


# ---- the ground around the road ---------------------------------------------------------------
func _build_index() -> void:
	var x0 := INF
	var x1 := -INF
	var z0 := INF
	var z1 := -INF
	for i in n:
		var key := Vector2i(int(floor(px[i] / cell)), int(floor(pz[i] / cell)))
		if not grid.has(key):
			grid[key] = PackedInt32Array()
		grid[key].append(i)
		x0 = minf(x0, px[i]); x1 = maxf(x1, px[i])
		z0 = minf(z0, pz[i]); z1 = maxf(z1, pz[i])
	bounds = {"x0": x0, "x1": x1, "z0": z0, "z1": z1}


## The road place nearest to world (x, z) within `reach` m: {i, s, dist, side} or {}.
func nearest(x: float, z: float, reach: float = 160.0) -> Dictionary:
	var cells := int(ceil(reach / cell))
	var cx := int(floor(x / cell))
	var cz := int(floor(z / cell))
	var best := -1
	var best_d := reach * reach
	for gx in range(cx - cells, cx + cells + 1):
		for gz in range(cz - cells, cz + cells + 1):
			var list = grid.get(Vector2i(gx, gz))
			if list == null:
				continue
			for i in list:
				var dx := x - px[i]
				var dz := z - pz[i]
				var dd := dx * dx + dz * dz
				if dd < best_d:
					best_d = dd
					best = i
	if best < 0:
		return {}
	var h := hdg[best]
	var side := -sin(h) * (x - px[best]) + cos(h) * (z - pz[best])
	return {"i": best, "s": best * STEP, "dist": sqrt(best_d), "side": side}
