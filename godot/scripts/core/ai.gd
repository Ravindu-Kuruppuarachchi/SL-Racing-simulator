class_name AI
# AI drivers: steering and braking worked out from the road ahead.

const LAT_GRIP := 13.0 # m/s² of cornering the bots dare (they brake for anything tighter)


## Inputs for an AI car. `others`: the other cars (to steer round); `lane`: a personal
## offset (-1..1); `skill`: 0..1, how close to the limit they corner; `obstacles`: solid
## obstacles ahead, each {s, d, hd}.
static func input(car: CarSim, others: Array, lane: float = 0.0, skill: float = 0.8, obstacles: Array = []) -> Dictionary:
	var t := car.track
	var v: float = maxf(car.v, 5.0)

	# the tightest bend in the braking distance ahead sets the speed to carry
	var look := 20.0 + v * 1.6
	var k_max := 0.0
	var a := 5.0
	while a < look:
		k_max = maxf(k_max, absf(t.kappa_at(car.s + a)))
		a += 6.0
	var corner_speed := sqrt(LAT_GRIP * (0.75 + 0.35 * skill) / maxf(k_max, 1e-4))
	var brake := car.v > corner_speed + 2

	# racing line: the inside of the bend coming up, plus this bot's lane
	var ahead := t.kappa_at(car.s + 10 + v * 0.6)
	var target := clampf(lane * 3 + signf(ahead) * minf(4.0, absf(ahead) * 260), -Track.ROAD_HALF + 1.5, Track.ROAD_HALF - 1.5)
	# swerve round a car close in front
	for o in others:
		var gap: float = o.s - car.s
		if gap > 0 and gap < 12 + v * 0.3 and absf(o.d - car.d) < 2.2:
			target = o.d + (-2.8 if (o.d > car.d or o.d > Track.ROAD_HALF - 3) else 2.8)

	# obstacles ahead: block out the road they cover, aim for the free spot nearest the line
	var blocked := []
	var hw: float = car.stats.half_width
	for o in obstacles:
		var gap: float = o.s - car.s
		if gap > -1.5 and gap < 18 + v * 0.9:
			blocked.append(Vector2(o.d - o.hd - hw - 0.6, o.d + o.hd + hw + 0.6))
	if _is_blocked(blocked, target):
		var best := target
		var best_cost := INF
		var d := -Track.ROAD_HALF + 1
		while d <= Track.ROAD_HALF - 1:
			if not _is_blocked(blocked, d):
				var cost: float = absf(d - target) + absf(d - car.d) * 0.5
				if cost < best_cost:
					best_cost = cost
					best = d
			d += 0.25
		target = best

	# steer so the heading closes on the line over a short distance
	var reach := 8.0 + v * 0.5
	var want := atan2(target - car.d, reach)
	return {"steer": clampf((want - car.psi) * 2.2, -1.0, 1.0), "brake": brake}


static func _is_blocked(blocked: Array, d: float) -> bool:
	for b in blocked:
		if d > b.x and d < b.y:
			return true
	return false
