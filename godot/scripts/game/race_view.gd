class_name RaceView
extends Node3D
# A race on screen: the world, the cars, item boxes, coins and power-ups in flight, the
# chase camera, the HUD and touch controls, sound, and (online) the poses and items
# exchanged with friends through the lobby.

var config: Dictionary
var track: Track
var world: World
var race: Race
var views := {} # CarSim -> CarView
var camera: Camera3D
var hud: Hud
var audio: RaceAudio
var box_nodes := []
var coin_mm: MultiMeshInstance3D
var hazard_nodes := {} # hazard dict id -> Node3D
var cam_pos := Vector3.ZERO
var cam_look := Vector3.ZERO
var shake := 0.0
var finished_shown := false
var paused := false
var send_timer := 0.0
var steer_input := 0.0
var online := false
var event_seen := 0


func _ready() -> void:
	var map_id: String = config.get("map", "hills")
	online = config.get("mode", "race") == "online"
	track = Track.new(map_id, int(config.get("seed", 1)), 30 if config.get("mode") == "free" else 3)
	var look: Dictionary = track.map.look
	var we := WorldEnvironment.new()
	we.environment = Sky3D.environment(look)
	add_child(we)
	add_child(Sky3D.sun(look))
	world = World.new()
	add_child(world)
	var t0 := Time.get_ticks_msec()
	world.build(track)
	print("world built in %d ms" % (Time.get_ticks_msec() - t0))
	race = Race.new(track, _racers(), config.get("mode") == "free", int(config.get("seed", 1)) * 31 + 7, Callable(self, "_clock") if online else Callable())
	for c in race.cars:
		var v := CarView.new()
		add_child(v)
		v.setup(c)
		views[c] = v
	_boxes()
	_coins()
	camera = Camera3D.new()
	camera.fov = 68
	camera.near = 0.3
	camera.far = 2500
	add_child(camera)
	camera.make_current()
	hud = Hud.new()
	hud.race_view = self
	add_child(hud)
	hud.visible = not Game.args.has("thumb")
	audio = RaceAudio.new()
	add_child(audio)
	audio.setup(race)
	if Game.args.has("at"):
		var p := race.player
		p.s = float(Game.args.at)
		p.y = track.height_at(p.s)
		race.time = 0.0
	_snap_camera()
	if online and Game.lobby:
		Game.lobby.pose3d.connect(_on_pose)
		Game.lobby.item.connect(_on_item)
		Game.lobby.finished.connect(_on_finish)
		Game.lobby.left.connect(_on_leave)


func _clock() -> float:
	return Time.get_ticks_msec() / 1000.0


func _racers() -> Array:
	var me: Dictionary = Cars.get_car(Game.save.car)
	var mine := {"car": me, "upgrades": Game.upgrades_of(me.id), "paint": Game.car_entry().paint, "kind": "player", "name": "You"}
	match config.get("mode", "race"):
		"free":
			return [mine]
		"online":
			var out := []
			for p in config.players:
				var c := Cars.get_car(p.vehicle)
				if p.id == Game.lobby.id:
					mine.id = p.id
					out.append(mine)
				else:
					out.append({"car": c, "upgrades": p.get("upgrades", {}), "paint": p.skin, "kind": "remote", "id": p.id, "name": "Player %d" % (out.size() + 1)})
			return out
	# a race: five rivals around your car's level, you start at the back
	var rng := Rng.new(int(config.get("seed", 1)) * 977 + Time.get_ticks_msec())
	var my_index := Cars.CARS.find(me)
	var level := 0
	for k in mine.upgrades:
		level += mine.upgrades[k]
	var out := []
	var names := ["Kasun", "Nimali", "Ruwan", "Dilini", "Sahan", "Tharushi", "Chamara", "Ishara"]
	for i in 5:
		var ci := clampi(my_index + rng.pick([-1, 0, 0, 1, 1, 2]) , 0, Cars.CARS.size() - 1)
		var c: Dictionary = Cars.CARS[ci]
		var lv := clampi(int(level / 4.0 + rng.range_f(-1, 1.5)), 0, 5)
		out.append({"car": c, "upgrades": {"engine": lv, "handling": lv, "tyres": lv, "nitro": lv}, "paint": rng.pick(c.paints), "kind": "bot", "name": names[(i + rng.next() * 8) as int % names.size()]})
	out.append(mine)
	return out


# ---- pickups on the road ---------------------------------------------------------------------
func _boxes() -> void:
	# one node per box on the road (on circuits the same boxes come round every lap)
	for i in track.lap_boxes:
		var b: Dictionary = race.boxes[i]
		var n := Props.item_box()
		n.position = track.point(b.s, b.d) + Vector3.UP * 1.1
		add_child(n)
		box_nodes.append(n)


func _coins() -> void:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = Props.coin_mesh()
	mm.instance_count = track.lap_coins
	coin_mm = MultiMeshInstance3D.new()
	coin_mm.multimesh = mm
	coin_mm.material_override = Looks.plain(Color(1.0, 0.78, 0.15), 0.25, 1.0, 0.35)
	add_child(coin_mm)


## Which lap's copy of the pickups to show: the one the player is on.
func _lap_offset(count: int, s: float) -> int:
	if not track.circuit:
		return 0
	return clampi(int(floor((race.player.s - s + 20.0) / track.loop_len)), 0, track.laps) * count


func _update_pickups(dt: float) -> void:
	var t := race.time
	for i in box_nodes.size():
		var b: Dictionary = race.boxes[i]
		var inst: Dictionary = race.boxes[mini(race.boxes.size() - 1, i + _lap_offset(track.lap_boxes, b.s))]
		var n: Node3D = box_nodes[i]
		n.visible = inst.gone <= 0
		n.rotation = Vector3(0.3, t * 1.6 + i, 0.2)
		n.position.y = track.height_at(b.s) + 1.2 + sin(t * 3 + i) * 0.15
	var mm := coin_mm.multimesh
	for i in track.lap_coins:
		var c: Dictionary = race.coins[i]
		var inst: Dictionary = race.coins[mini(race.coins.size() - 1, i + _lap_offset(track.lap_coins, c.s))]
		if inst.taken:
			mm.set_instance_transform(i, Transform3D(Basis().scaled(Vector3.ZERO), Vector3.ZERO))
		else:
			var p := track.point(c.s, c.d) + Vector3.UP * 1.0
			mm.set_instance_transform(i, Transform3D(Basis(Vector3.UP, t * 3 + i) * Basis(Vector3.RIGHT, PI / 2), p))


func _update_hazards() -> void:
	var alive := {}
	for h in race.hazards:
		var key: int = h.id
		alive[key] = true
		var n: Node3D = hazard_nodes.get(key)
		if n == null:
			match h.kind:
				"rocket": n = Props.rocket()
				"coconut": n = Props.coconut()
				"oil": n = Props.oil()
			add_child(n)
			hazard_nodes[key] = n
		var p := track.point(h.s, h.d)
		p.y = h.y
		n.position = p
		n.rotation.y = PI / 2 - track.heading_at(h.s)
		if h.kind == "coconut":
			n.rotation.x += 0.2
	for key in hazard_nodes.keys():
		if not alive.has(key):
			hazard_nodes[key].queue_free()
			hazard_nodes.erase(key)


# ---- the loop ----------------------------------------------------------------------------------
func _physics_process(dt: float) -> void:
	if paused:
		return
	var input := hud.read_input()
	steer_input = input.steer
	race.step(input, dt)
	world.update_obstacles(race.time)
	if online and Game.lobby:
		send_timer -= dt
		var p := race.player
		for kind in race.fired:
			Game.lobby.send({"t": "it", "kind": kind})
		if send_timer <= 0 and not race.counting():
			send_timer = 1.0 / 15.0
			Game.lobby.send({"t": "p3", "s": snappedf(p.s, 0.01), "d": snappedf(p.d, 0.01), "psi": snappedf(p.psi, 0.001), "v": snappedf(p.v, 0.01), "y": snappedf(p.y, 0.01), "g": p.grounded, "spin": snappedf(p.spin, 0.01), "sa": snappedf(p.spin_angle, 0.01), "boost": snappedf(p.boost, 0.01), "shield": snappedf(p.shield, 0.01)})


func _process(dt: float) -> void:
	for c in views:
		views[c].sync(steer_input if c == race.player else 0.0, dt)
	_update_pickups(dt)
	_update_hazards()
	_camera(dt)
	audio.update(dt, steer_input)
	while event_seen < race.events.size():
		hud.flash(race.events[event_seen].text)
		event_seen += 1
	if race.done() and not finished_shown:
		finished_shown = true
		_finish()


func _snap_camera() -> void:
	var p := race.player
	var pos := track.point(p.s, p.d)
	var f := track.frame(p.s)
	cam_pos = pos - f[0] * 8.0 + Vector3.UP * 3.6
	cam_look = pos + f[0] * 4.0 + Vector3.UP * 1.0
	camera.position = cam_pos
	camera.look_at(cam_look)


func _camera(dt: float) -> void:
	var p := race.player
	var pos := track.point(p.s, p.d)
	pos.y = p.y
	var h := track.heading_at(p.s) + p.psi * 0.6 # mostly the road's direction: steadier
	var fwd := Vector3(cos(h), 0, sin(h))
	var speed := absf(p.v)
	var back := 7.2 + speed * 0.04
	var want := pos - fwd * back + Vector3.UP * (3.0 + speed * 0.012)
	if Game.args.has("thumb"): # a higher, wider view for the map pictures
		back = 22.0
		want = pos - fwd * back + Vector3.UP * 11.0
	# stay above the road behind (over crests) and the ground
	want.y = maxf(want.y, track.height_at(p.s - back) + 2.2)
	cam_pos = cam_pos.lerp(want, minf(1.0, dt * 7.0))
	cam_look = cam_look.lerp(pos + fwd * 5.0 + Vector3.UP * 1.1, minf(1.0, dt * 12.0))
	shake = maxf(shake * exp(-dt * 6.0), maxf(p.jolt, p.crash) * 0.6)
	var jitter := Vector3(randf() - 0.5, randf() - 0.5, randf() - 0.5) * shake * 0.5
	camera.position = cam_pos + jitter
	camera.look_at(cam_look + jitter * 0.5)
	var fov := 66.0 + minf(speed, 40.0) * 0.18 + (8.0 if p.boost > 0 else 0.0)
	camera.fov = lerpf(camera.fov, fov, minf(1.0, dt * 4.0))


# ---- the finish ---------------------------------------------------------------------------------
func _finish() -> void:
	var p := race.player
	var place := race.place_of(p)
	if online and Game.lobby:
		Game.lobby.send({"t": "fin", "time": p.finish_time})
	await get_tree().create_timer(1.5).timeout
	var prize := Game.record_result(track.map.id, place, p.finish_time, p.coins, config.get("mode", "race"))
	hud.show_results(place, p.finish_time, prize, p.coins)


func restart() -> void:
	var c := config.duplicate()
	c.seed = int(c.get("seed", 1)) + 1 if c.get("mode") != "online" else c.seed
	Game.start_race(c)


func quit_to_menu() -> void:
	if online and Game.lobby:
		Game.lobby.end_race()
		Game.show_menu("lobby")
	else:
		Game.show_menu("home")


# ---- friends online --------------------------------------------------------------------------------
func _on_pose(from: int, m: Dictionary) -> void:
	race.remote_pose(from, m)


func _on_item(from: int, kind: String) -> void:
	race.remote_fire(from, kind)


func _on_finish(from: int, t: float) -> void:
	race.remote_finish(from, t)


func _on_leave(id: int) -> void:
	for c in race.cars:
		if c.kind == "remote" and c.id == id:
			views[c].visible = false
			c.s = -1000.0
