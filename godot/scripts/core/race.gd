class_name Race
extends RefCounted
# A race (or a free drive): the cars on one route, item boxes and power-ups, boost pads,
# coins, positions and the finish. No nodes here, so it runs headless in tests.
#
# Power-ups, from item boxes (cars further back get the better ones):
#   rocket   a homing Vesak rocket that spins out the car it reaches
#   coconut  three coconuts lobbed ahead; they lie on the road until someone hits them
#   oil      an oil slick dropped behind
#   shield   blocks the next hit (for a few seconds)
#   boost    nitro

const ITEMS := {
	"rocket": {"name": "Vesak Rocket", "icon": "🚀"},
	"coconut": {"name": "Coconut Bombs", "icon": "🥥"},
	"oil": {"name": "Oil Slick", "icon": "🛢"},
	"shield": {"name": "Shield", "icon": "🛡"},
	"boost": {"name": "Nitro", "icon": "🔥"},
}
const ITEM_KINDS := ["rocket", "coconut", "oil", "shield", "boost"]
const COUNTDOWN := 3.0
const BOX_RESPAWN := 3.0
const PAD_BOOST := 1.2
const ROCKET_SPEED := 62.0
const COIN_VALUE := 5
const PRIZES := [300, 180, 110, 70, 40, 20]

var track: Track
var rng: Rng
var free := false
var clock: Callable # real time in seconds (online races), or an empty Callable
var start_clock := -1.0
var time := 0.0
var cars: Array = [] # [CarSim]
var player: CarSim
var boxes: Array = []
var coins: Array = []
var hazards: Array = [] # rockets in flight, coconuts, oil slicks
var finishers: Array = []
var events: Array = [] # [{text, t}] for the HUD
var fired: Array = [] # items the player used this step (sent to friends online)
var sounds: Array = [] # [{kind, car}] for the game to play
var next_hazard := 0


## racers: [{car (Cars entry), upgrades, paint, kind: player|bot|remote, id?, name?}]
func _init(t: Track, racers: Array, is_free: bool = false, seed_value: int = 0, real_clock: Callable = Callable()) -> void:
	track = t
	free = is_free
	rng = Rng.new(seed_value if seed_value != 0 else randi())
	clock = real_clock
	time = 0.0 if free else -COUNTDOWN
	for i in racers.size():
		var r: Dictionary = racers[i]
		# starting grid: rows of two, staggered, behind the line
		var row := i / 2
		var c := CarSim.new(t, r.car, CarSim.make_stats(r.car, r.get("upgrades", {})), 30.0 - row * 7 - (i % 2) * 2, 2.6 if i % 2 else -2.6)
		c.kind = r.kind
		c.id = r.get("id", i)
		c.name = r.get("name", r.car.name)
		c.paint = r.get("paint", r.car.paints[0])
		c.lane = fmod(i * 0.37, 1.0) * 2 - 1
		c.skill = 0.7 + rng.next() * 0.25
		cars.append(c)
		if c.kind == "player" and player == null:
			player = c
	for b in t.boxes:
		boxes.append({"s": b.s, "d": b.d, "gone": 0.0})
	for c in t.coins:
		coins.append({"s": c.s, "d": c.d, "taken": false})


func counting() -> bool:
	return time < 0


func done() -> bool:
	return not free and player != null and player.finished()


## Everyone in race order: finishers by time, then by distance along the road.
func standings() -> Array:
	var list := cars.duplicate()
	list.sort_custom(func(a, b):
		var fa: float = a.finish_time if a.finished() else INF
		var fb: float = b.finish_time if b.finished() else INF
		if fa != fb:
			return fa < fb
		return a.s > b.s)
	return list


func place_of(c: CarSim) -> int:
	return standings().find(c) + 1


func say(text: String) -> void:
	events.append({"text": text, "t": time})


func step(input: Dictionary, dt: float) -> void:
	time += dt
	if time < 0:
		return
	if clock.is_valid() and start_clock < 0:
		start_clock = clock.call()
	fired.clear()
	var order := standings()
	for c in cars:
		if c.kind == "remote":
			_follow_remote(c, dt)
			continue
		var was_finished: bool = c.finished()
		var control: Dictionary
		if c.kind == "player" and not was_finished:
			control = input
		else:
			var others := cars.filter(func(o): return o != c)
			control = AI.input(c, others, c.lane, c.skill, obstacles_ahead(c))
			if was_finished:
				control.brake = c.v > 8 # roll to a stop past the line
		if c.kind == "bot":
			_rubber_band(c)
			_unstick(c, dt)
		var was_grounded: bool = c.grounded
		c.update(control, dt)
		if not was_grounded and c.grounded and c.jolt > 0.3:
			sounds.append({"kind": "land", "car": c})
		if c.bump > 0.2:
			sounds.append({"kind": "bump", "car": c})
		_hit_obstacles(c)
		if not was_finished:
			_check_finish(c)
		c.item_cooldown = maxf(0.0, c.item_cooldown - dt)
		if c.item != "":
			var wants: bool = input.get("fire", false) if c.kind == "player" else bot_wants_item(c, order)
			if wants:
				use_item(c)
	_collide()
	_pickups(order, dt)
	_move_hazards(dt)


# Bots ease off when far ahead of you and push when far behind, so races stay close.
func _rubber_band(c: CarSim) -> void:
	if player == null or free:
		return
	var gap := c.s - player.s
	var k := 1.0
	if gap > 60:
		k = maxf(0.9, 1.0 - (gap - 60) / 800.0)
	elif gap < -60:
		k = minf(1.08, 1.0 + (-gap - 60) / 900.0)
	if c.base_top < 0:
		c.base_top = c.stats.top
	c.stats.top = c.base_top * k


func _check_finish(c: CarSim) -> void:
	if free or not (c.s >= track.finish):
		return
	if c == player and clock.is_valid():
		c.finish_time = clock.call() - start_clock
	else:
		c.finish_time = time
	finishers.append(c)
	if c == player:
		say("You win!" if finishers.size() == 1 else "Finished %s" % ordinal(finishers.size()))
	elif finishers.size() == 1:
		say("%s wins!" % c.name)


static func ordinal(nn: int) -> String:
	var suffix := "th"
	if nn % 100 < 11 or nn % 100 > 13:
		match nn % 10:
			1: suffix = "st"
			2: suffix = "nd"
			3: suffix = "rd"
	return "%d%s" % [nn, suffix]


# An AI car stuck for a while is put back on the road a little further on.
func _unstick(c: CarSim, dt: float) -> void:
	c.stuck_time = c.stuck_time + dt if absf(c.v) < 2 and c.spin == 0 and not counting() else 0.0
	if c.stuck_time < 2.5:
		return
	c.stuck_time = 0.0
	var s := c.s + 6
	var clear := false
	while not clear:
		clear = true
		for o in track.obstacles:
			if absf(o.s - s) < o.hs + 3:
				clear = false
				s += 3
				break
	c.s = s
	c.d = 0.0
	c.psi = 0.0
	c.phi = 0.0
	c.v = 8.0
	c.y = track.height_at(s)
	c.vy = 0.0
	c.grounded = true


# ---- obstacles on the road ------------------------------------------------------------------
## Solid obstacles in the next stretch of road, where they are now (for the AI).
func obstacles_ahead(c: CarSim) -> Array:
	var out := []
	for o in track.obstacles:
		if o.solid and o.s > c.s - 2 and o.s < c.s + 70:
			out.append({"s": o.s, "d": track.obstacle_d(o, time), "hd": o.hd})
	return out


func _hit_obstacles(c: CarSim) -> void:
	for o in track.obstacles:
		var ds: float = c.s - o.s
		if absf(ds) > 8:
			continue
		var od := track.obstacle_d(o, time)
		var dd: float = c.d - od
		var reach_s: float = o.hs + 1.1
		var reach_d: float = o.hd + c.stats.half_width
		if absf(ds) > reach_s or absf(dd) > reach_d:
			continue
		if c.y - track.height_at(o.s) > o.h + 0.2:
			continue # flying over it
		if not o.solid:
			if c.obstacle_cooldown > 0 or not c.grounded:
				continue
			c.obstacle_cooldown = 0.6
			if o.kind == "pothole":
				c.v *= 0.82
				c.vy = 3.2 # a jolt up out of the hole
				c.grounded = false
				c.jolt = 0.8
				sounds.append({"kind": "bump", "car": c})
			else:
				c.v *= 0.88 # a puddle: splash, slow down
				c.splash = 1.0
			continue
		if reach_s - absf(ds) < reach_d - absf(dd):
			# nose (or tail) first: bounce back, and spin if it was hard
			c.s = o.s + (signf(ds) if ds != 0 else -1.0) * reach_s
			var impact: float = absf(c.v)
			c.v *= -0.15
			var away: float = signf(dd) if dd != 0 else (-1.0 if od > 0 else 1.0)
			c.psi += away * 0.35
			c.phi = c.psi
			c.d += away * 0.3
			c.crash = minf(1.0, impact / 20.0)
			if impact > 14:
				c.spin = maxf(c.spin, 0.55)
			if impact > 6:
				sounds.append({"kind": "crash", "car": c})
			if c == player and impact > 8:
				say("Mind the elephant!" if o.kind == "elephant" else "Crash!")
		else:
			# a glancing blow: pushed aside, losing a little speed
			c.d = od + signf(dd) * reach_d
			c.phi *= 0.3
			c.v *= 0.85
			c.crash = maxf(c.crash, 0.35)


# ---- cars bumping into each other -------------------------------------------------------------
func _collide() -> void:
	for i in cars.size():
		for j in range(i + 1, cars.size()):
			var a: CarSim = cars[i]
			var b: CarSim = cars[j]
			var ds := b.s - a.s
			var dd := b.d - a.d
			if absf(ds) > 3.4 or absf(dd) > 1.8 or absf(a.y - b.y) > 1.5:
				continue
			var wa: float = b.stats.mass / (a.stats.mass + b.stats.mass)
			var wb := 1.0 - wa
			var ra := a.kind == "remote"
			var rb := b.kind == "remote"
			if 1.8 - absf(dd) < 3.4 - absf(ds):
				var push: float = (1.8 - absf(dd)) * (signf(dd) if dd != 0 else 1.0)
				if not ra: a.d -= push * (1.0 if rb else wa)
				if not rb: b.d += push * (1.0 if ra else wb)
			else:
				var back: CarSim = a if ds > 0 else b
				var front: CarSim = b if ds > 0 else a
				var overlap: float = 3.4 - absf(ds)
				var rback := back.kind == "remote"
				var rfront := front.kind == "remote"
				if not rback: back.s -= overlap * (1.0 if rfront else 0.5)
				if not rfront: front.s += overlap * (0.0 if rback else 0.5)
				var dv := back.v - front.v
				if dv > 0:
					var m: float = back.stats.mass + front.stats.mass
					if not rback: back.v -= dv * front.stats.mass / m
					if not rfront: front.v += dv * 0.4 * back.stats.mass / m
					if dv > 4:
						sounds.append({"kind": "bump", "car": back})


# ---- item boxes, boost pads, coins ----------------------------------------------------------
func _roll_item(place: float) -> String:
	var w := [0.5 + 2 * place, 1.2, 1.6 - place, 1.2 - 0.6 * place, 0.6 + 1.6 * place]
	var total := 0.0
	for x in w:
		total += x
	var x := rng.next() * total
	for i in w.size():
		x -= w[i]
		if x < 0:
			return ITEM_KINDS[i]
	return "boost"


func _pickups(order: Array, dt: float) -> void:
	var nn := cars.size()
	for box in boxes:
		box.gone = maxf(0.0, box.gone - dt)
	for c in cars:
		if c.kind == "remote":
			continue
		for box in boxes:
			if box.gone > 0 or absf(box.s - c.s) > 1.8 or absf(box.d - c.d) > 1.4 or c.y - track.height_at(box.s) > 2:
				continue
			box.gone = BOX_RESPAWN
			if c == player:
				sounds.append({"kind": "box", "car": c})
			if c.item == "":
				var place: float = float(order.find(c)) / (nn - 1) if nn > 1 else 0.5
				c.item = _roll_item(place)
				c.item_cooldown = 0.6
				if c == player:
					say(ITEMS[c.item].name)
		for pad in track.pads:
			if absf(pad.s - c.s) < 2.2 and absf(pad.d - c.d) < 2 and c.grounded:
				if c.boost < 0.2 and c == player:
					sounds.append({"kind": "boost", "car": c})
				c.boost = maxf(c.boost, PAD_BOOST)
		if c != player:
			continue
		for coin in coins:
			if not coin.taken and absf(coin.s - c.s) < 1.6 and absf(coin.d - c.d) < 1.3 and c.y - track.height_at(coin.s) < 2.5:
				coin.taken = true
				c.coins += COIN_VALUE
				sounds.append({"kind": "coin", "car": c})


# ---- power-ups ------------------------------------------------------------------------------
func bot_wants_item(c: CarSim, order: Array) -> bool:
	if c.item_cooldown > 0 or c.spin > 0:
		return false
	match c.item:
		"rocket":
			return _near(c, 1, 110)
		"coconut":
			return _near(c, 1, 45)
		"oil":
			return _near(c, -1, 30)
		"shield":
			for h in hazards:
				if h.kind == "rocket" and h.target == c:
					return true
			return order.find(c) == 0
		"boost":
			return absf(track.kappa_at(c.s + 30)) < 1.0 / 150.0
	return false


func _near(c: CarSim, dir: int, reach: float) -> bool:
	for o in cars:
		if o != c and (o.s - c.s) * dir > 0 and absf(o.s - c.s) < reach:
			return true
	return false


func use_item(c: CarSim) -> void:
	var kind := c.item
	c.item = ""
	fire(c, kind)
	if c == player:
		fired.append(kind)


## Launch an item from `c` (also called for friends' items arriving online).
func fire(c: CarSim, kind: String) -> void:
	sounds.append({"kind": "fire_" + kind, "car": c})
	match kind:
		"shield":
			c.shield = 6.0
		"boost":
			c.boost = maxf(c.boost, c.stats.boost_time)
		"rocket":
			var target: CarSim = null
			for o in cars:
				if o != c and o.s > c.s and o.s - c.s < 160 and (target == null or o.s < target.s):
					target = o
			hazards.append({"id": _hid(), "kind": kind, "s": c.s + 3, "d": c.d, "y": c.y + 1, "v": maxf(ROCKET_SPEED, c.v + 25), "owner": c, "target": target, "ttl": 4.5})
		"coconut":
			for i in 3:
				var off: float = [-1.6, 0.0, 1.6][i]
				hazards.append({"id": _hid(), "kind": kind, "s": c.s, "d": c.d, "y": c.y + 1.5, "from_s": c.s, "to_s": c.s + 16 + i * 6, "to_d": clampf(c.d + off, -Track.ROAD_HALF, Track.ROAD_HALF), "flight": 0.0, "owner": c, "ttl": 12.0, "grace": 1.0})
		"oil":
			hazards.append({"id": _hid(), "kind": kind, "s": maxf(0.0, c.s - 4), "d": c.d, "y": track.height_at(c.s - 4), "owner": c, "grace": 1.5, "ttl": 14.0, "flight": 1.0})


func _hid() -> int:
	next_hazard += 1
	return next_hazard


func _move_hazards(dt: float) -> void:
	for h in hazards:
		h.ttl -= dt
		if h.kind == "rocket":
			h.s += h.v * dt
			if h.target != null:
				h.d += clampf(h.target.d - h.d, -9 * dt, 9 * dt) # home in sideways
			h.y = track.height_at(h.s) + 1
			for c in cars:
				if c == h.owner or h.ttl <= 0:
					continue
				if absf(c.s - h.s) < 2.6 and absf(c.d - h.d) < 1.7:
					if c.kind != "remote":
						_hit_car(c, 1.6, h.owner, "rocket")
					h.ttl = 0.0
		elif h.kind == "coconut" and h.flight < 1:
			h.flight = minf(1.0, h.flight + dt / 0.7)
			h.s = lerpf(h.from_s, h.to_s, h.flight)
			h.d = lerpf(h.d, h.to_d, minf(1.0, dt * 6))
			h.y = track.height_at(h.s) + 0.3 + sin(PI * h.flight) * 4
		else:
			# lying on the road: coconuts and oil
			h.grace = maxf(0.0, h.get("grace", 1.0) - dt)
			var rs := [2.6, 1.9, 1.1] if h.kind == "oil" else [1.5, 1.2, 1.0]
			for c in cars:
				if h.ttl <= 0 or (c == h.owner and h.grace > 0) or c.kind == "remote":
					continue
				if absf(c.s - h.s) < rs[0] and absf(c.d - h.d) < rs[1] and c.y - track.height_at(h.s) < 1:
					_hit_car(c, rs[2], h.owner, h.kind)
					h.ttl = 0.0
	hazards = hazards.filter(func(h): return h.ttl > 0)


func _hit_car(c: CarSim, seconds: float, by: CarSim, kind: String) -> void:
	var hurt := c.hit(seconds)
	sounds.append({"kind": "hit" if hurt else "shield_block", "car": c})
	if c == player:
		say("Spun out!" if hurt else "Shield blocked it!")
	elif by == player and hurt:
		say("Direct hit!" if kind == "rocket" else "Got one!")


# ---- friends online -----------------------------------------------------------------------------
# A friend's car is placed where their phone says it is (gliding between updates).
func _follow_remote(c: CarSim, dt: float) -> void:
	var t = c.target
	if t == null:
		return
	var k: float = minf(1.0, dt * 10)
	if absf(t.s - c.s) > 25:
		c.s = t.s
		c.d = t.d
	c.s += (t.s + t.v * 0.07 - c.s) * k
	c.d += (t.d - c.d) * k
	c.psi += (t.psi - c.psi) * k
	c.v = t.v
	c.y = t.y
	c.grounded = t.get("g", true)
	c.spin = t.get("spin", 0.0)
	c.spin_angle = t.get("sa", 0.0)
	c.boost = t.get("boost", 0.0)
	c.shield = t.get("shield", 0.0)


func _remote(rid: int) -> CarSim:
	for c in cars:
		if c.kind == "remote" and c.id == rid:
			return c
	return null


func remote_pose(rid: int, pose: Dictionary) -> void:
	var c := _remote(rid)
	if c != null:
		c.target = pose


func remote_fire(rid: int, kind: String) -> void:
	var c := _remote(rid)
	if c != null and kind in ITEMS:
		fire(c, kind)


func remote_finish(rid: int, t: float) -> void:
	var c := _remote(rid)
	if c != null and not c.finished():
		c.finish_time = t
		finishers.append(c)
		if finishers.size() == 1:
			say("%s wins!" % c.name)
