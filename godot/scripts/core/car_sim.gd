class_name CarSim
extends RefCounted
# Arcade car handling, worked out in road coordinates (Track): s along the road, d across
# it, headings measured from the road's direction. That keeps it stable and kart-like:
# you can't fall off the world, barriers line the road, and jumps happen wherever the road
# drops away faster than you fall. No nodes here, so it runs headless in tests.

const GRAVITY := 24.0 # a touch heavier than real: snappy, readable jumps
const DRIFT_MIN := 0.7 # seconds of sliding before letting go gives a boost

var track: Track
var car: Dictionary # Cars entry
var stats: Dictionary
var s := 0.0
var d := 0.0
var psi := 0.0 # where the car points, relative to the road (rad, + right)
var phi := 0.0 # where it's actually moving (slides lag behind psi)
var v := 0.0 # forward speed (m/s)
var y := 0.0 # height of the car's base
var vy := 0.0
var grounded := true
var air_time := 0.0
var spin := 0.0 # seconds of spin-out left
var spin_angle := 0.0
var boost := 0.0
var shield := 0.0
var item := ""
var drift := 0.0 # 0..1, how sideways (for smoke and sound)
var drift_charge := 0.0
var bump := 0.0 # a barrier hit this step (for effects)
var crash := 0.0 # an obstacle hit (0..1); decays
var jolt := 0.0 # a pothole or hard landing (camera shake); decays
var splash := 0.0
var obstacle_cooldown := 0.0

# race bookkeeping (Race)
var kind := "bot" # player, bot or remote
var id := 0
var name := ""
var paint := ""
var lane := 0.0
var skill := 0.8
var finish_time := -1.0
var item_cooldown := 0.0
var coins := 0
var stuck_time := 0.0
var base_top := -1.0
var target = null # remote cars: the latest pose from the network


## Handling numbers for a car at upgrade levels `up`.
static func make_stats(c: Dictionary, up: Dictionary) -> Dictionary:
	return {
		"top": 24.0 + c.power * 2.2 + up.get("engine", 0) * 1.1, # m/s
		"accel": 8.0 + c.power * 1.4 + up.get("engine", 0) * 0.6,
		"turn": (1.5 + c.grip * 0.08) * (1.0 + up.get("handling", 0) * 0.06),
		"grip": (3.5 + c.grip * 0.5) * (1.0 + up.get("tyres", 0) * 0.1),
		"offroad": 0.6 + c.grip * 0.05,
		"boost_time": 2.0 + up.get("nitro", 0) * 0.25,
		"mass": c.mass,
		"half_width": c.half_width,
	}


func _init(t: Track, c: Dictionary, st: Dictionary, start_s: float = 0.0, start_d: float = 0.0) -> void:
	track = t
	car = c
	stats = st
	s = start_s
	d = start_d
	y = t.height_at(s)


func speed_kmh() -> float:
	return absf(v) * 3.6


func finished() -> bool:
	return finish_time >= 0.0


## Spin out (from a power-up hit). Returns false if a shield stopped it.
func hit(seconds: float) -> bool:
	if shield > 0:
		shield = 0.0
		return false
	spin = maxf(spin, seconds)
	boost = 0.0
	return true


## input: {steer: -1..1, brake: bool}.
func update(input: Dictionary, dt: float) -> void:
	var t := track
	var st := stats
	bump = 0.0
	crash = maxf(0.0, crash - dt * 2)
	jolt = maxf(0.0, jolt - dt * 3)
	splash = maxf(0.0, splash - dt * 2)
	obstacle_cooldown = maxf(0.0, obstacle_cooldown - dt)
	spin = maxf(0.0, spin - dt)
	boost = maxf(0.0, boost - dt)
	shield = maxf(0.0, shield - dt)

	# ---- speed -------------------------------------------------------------------------
	var on_tarmac: bool = absf(d) < Track.ROAD_HALF
	var ford = t.in_ford(s)
	var top: float = st.top * (1.4 if boost > 0 else 1.0)
	if grounded and not on_tarmac:
		top *= st.offroad
	if ford != null and y < ford.level + 0.3:
		top *= 0.6
		if absf(v) > 6:
			splash = 1.0
	if spin > 0:
		v *= exp(-2.5 * dt)
		spin_angle += 14.0 * dt * minf(1.0, spin * 2)
	else:
		spin_angle *= exp(-10.0 * dt)
		if input.get("brake", false):
			if v > 1:
				v -= 28.0 * dt
			else:
				v = maxf(v - 9.0 * dt, -9.0)
		elif v < top:
			v += (st.accel * 2 if boost > 0 else st.accel) * maxf(0.15, 1.0 - v / top) * dt
		else:
			v -= (v - top) * 2.0 * dt
	if grounded:
		v -= GRAVITY * 0.35 * t.grade_at(s) * dt

	# ---- steering and sliding ------------------------------------------------------------
	var pace: float = maxf(0.45, minf(1.0, absf(v) / 10.0)) * (1.0 - 0.3 * minf(1.0, absf(v) / st.top))
	var steer: float = 0.0 if spin > 0 else clampf(float(input.get("steer", 0.0)), -1.0, 1.0)
	psi += steer * st.turn * pace * (signf(v) if v != 0 else 1.0) * (1.0 if grounded else 0.35) * dt
	var slip := psi - phi
	phi += slip * minf(1.0, st.grip * (1.0 if grounded else 0.15) * dt)
	drift = minf(1.0, absf(slip) * 3)
	v *= 1.0 - minf(0.5, absf(slip) * 0.6) * dt
	# drift boost: hold a slide through a bend, then straighten up for a burst of speed
	if grounded and absf(slip) > 0.1 and absf(v) > 14 and spin == 0:
		drift_charge += dt
	else:
		if drift_charge > DRIFT_MIN:
			boost = maxf(boost, minf(1.5, 0.45 + drift_charge * 0.5))
		drift_charge = 0.0

	# ---- move along the road ---------------------------------------------------------------
	var k := t.kappa_at(s)
	var ds := v * cos(phi) * dt / maxf(0.3, 1.0 - k * d)
	s = clampf(s + ds, 0.0, t.length - 1)
	d += v * sin(phi) * dt
	psi -= k * ds # the road turns underneath the car
	phi -= k * ds

	# barriers: bounce off, losing speed, turned back along the road
	var limit: float = Track.WALL - st.half_width
	if absf(d) > limit:
		var side := signf(d)
		d = side * limit
		if signf(phi) == side:
			bump = minf(1.0, absf(sin(phi)) * absf(v) / 10.0)
			v *= 1.0 - 0.5 * absf(sin(phi))
			phi = -phi * 0.2
			psi = phi + (psi - phi) * 0.3

	# ---- up and down: follow the road, or fly where it drops away -----------------------------
	var ground := t.height_at(s)
	if grounded:
		var ballistic := y + vy * dt - 0.5 * GRAVITY * dt * dt
		if ballistic > ground + 0.03 and v > 8:
			grounded = false
			vy -= GRAVITY * dt
			y = ballistic
			air_time = 0.0
		else:
			vy = (ground - y) / dt
			y = ground
	else:
		vy -= GRAVITY * dt
		y += vy * dt
		air_time += dt
		if y <= ground:
			jolt = maxf(jolt, minf(1.0, -vy / 14.0))
			y = ground
			vy = 0.0
			grounded = true


## Pitch for drawing: the road's slope on the ground, the flight path in the air.
func pitch() -> float:
	if grounded:
		return atan(track.grade_at(s))
	return atan2(vy, maxf(5.0, absf(v))) * 0.6
