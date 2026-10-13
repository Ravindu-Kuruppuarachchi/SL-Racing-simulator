extends SceneTree
# Headless check, on every map: the route never comes back near itself, a six-car race
# finishes with power-ups used and hitting, and a friend's (online) car follows the poses
# sent for it.  Run: godot --headless -s tools/test_race.gd

var failed := false


func check(ok: bool, what: String) -> void:
	print(("ok   " if ok else "FAIL ") + what)
	if not ok:
		failed = true


func _init() -> void:
	var up := {"engine": 1, "handling": 1, "tyres": 1, "nitro": 1}
	for m in Maps.MAPS:
		var t0 := Time.get_ticks_msec()
		var t := Track.new(m.id, 1)
		var built := Time.get_ticks_msec() - t0
		check(t.self_gap() > Track.WALL * 2 + 30, "%s: the road keeps %d m from its other stretches (built in %d ms, %d obstacles)" % [m.name, t.self_gap(), built, t.obstacles.size()])
		var racers := []
		for i in range(1, 6):
			racers.append({"car": Cars.CARS[i], "upgrades": up, "kind": "bot"})
		racers.append({"car": Cars.CARS[0], "upgrades": up, "kind": "player"})
		var race := Race.new(t, racers, false, 7)
		var p := race.player
		var steps := 0
		t0 = Time.get_ticks_msec()
		var used := 0
		var hits := 0
		while race.finishers.size() < racers.size() and race.time < 300:
			var others := race.cars.filter(func(o): return o != p)
			var ai := AI.input(p, others, 0.3, 0.8, race.obstacles_ahead(p))
			ai.fire = p.item != "" and race.bot_wants_item(p, race.standings())
			race.step(ai, 1.0 / 60.0)
			for snd in race.sounds:
				if snd.kind.begins_with("fire_"):
					used += 1
				elif snd.kind == "hit" or snd.kind == "shield_block":
					hits += 1
			race.sounds.clear()
			steps += 1
		var ms := Time.get_ticks_msec() - t0
		var times := race.finishers.map(func(c): return c.finish_time)
		check(race.finishers.size() == racers.size(), "%s: all %d cars finish (%d-%d s), %.2f ms per step" % [m.name, racers.size(), times.min() if times.size() else 0, times.max() if times.size() else 0, float(ms) / steps])
		check(used > 3 and hits > 0, "%s: power-ups used (%d) and hitting (%d)" % [m.name, used, hits])

	# online: a friend's car goes where their phone says
	var tr := Track.new("hills", 1)
	var race := Race.new(tr, [
		{"car": Cars.CARS[0], "upgrades": up, "kind": "player", "id": 1},
		{"car": Cars.CARS[5], "upgrades": up, "kind": "remote", "id": 2, "name": "Player 2"},
	])
	while race.counting():
		race.step({}, 1.0 / 60.0)
	var friend: CarSim = race.cars[1]
	race.remote_pose(2, {"s": 140.0, "d": 2.0, "psi": 0.1, "v": 30.0, "y": tr.height_at(140), "g": true})
	for i in 60:
		race.step({}, 1.0 / 60.0)
	check(abs(friend.s - 142) < 4 and abs(friend.d - 2) < 0.1, "a friend's car follows their pose (at %.1f m)" % friend.s)
	race.remote_fire(2, "shield")
	check(friend.shield > 0, "a friend's power-up takes effect")
	race.remote_finish(2, 77.5)
	check(friend.finish_time == 77.5 and race.standings()[0] == friend, "a friend's finish puts them first")

	# the same seed builds the same road (online races rely on it)
	var a := Track.new("knuckles", 42)
	var b := Track.new("knuckles", 42)
	check(a.px[a.n - 1] == b.px[b.n - 1] and a.obstacles.size() == b.obstacles.size(), "the same seed builds the same road")
	quit(1 if failed else 0)
