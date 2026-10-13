class_name RaceAudio
extends Node
# Sound, all synthesised (nothing to license): your engine (its note rises through the
# gears with speed, roars on nitro), tyre squeal in drifts, and short effects for coins,
# item boxes, power-ups, bumps and crashes, landings and the countdown.

const RATE := 22050.0

var race: Race
var engine: AudioStreamPlayer
var playback: AudioStreamGeneratorPlayback
var squeal: AudioStreamPlayer
var phase := 0.0
var phase2 := 0.0
var rpm := 0.2
var sfx := {}
var players := []
var enabled := true


func setup(r: Race) -> void:
	race = r
	enabled = Game.save.get("sound", true)
	var gen := AudioStreamGenerator.new()
	gen.mix_rate = RATE
	gen.buffer_length = 0.12
	engine = AudioStreamPlayer.new()
	engine.stream = gen
	engine.volume_db = -9.0
	add_child(engine)
	if enabled:
		engine.play()
		playback = engine.get_stream_playback()
	squeal = AudioStreamPlayer.new()
	squeal.stream = _make(0.6, func(t, i): return (randf() * 2 - 1) * 0.25 * (0.6 + 0.4 * sin(t * 2900.0)), true)
	squeal.volume_db = -60.0
	add_child(squeal)
	if enabled:
		squeal.play()
	sfx = {
		"coin": _make(0.18, func(t, i): return sin(TAU * (1320.0 if t < 0.06 else 1760.0) * t) * 0.4 * (1.0 - t / 0.18)),
		"box": _make(0.3, func(t, i): return sin(TAU * (520.0 + 1400.0 * t) * t) * 0.35 * (1.0 - t / 0.3)),
		"boost": _make(0.7, func(t, i): return (randf() * 2 - 1) * 0.45 * sin(PI * t / 0.7) * (0.5 + 0.5 * sin(TAU * 60 * t))),
		"crash": _make(0.45, func(t, i): return (randf() * 2 - 1) * 0.8 * exp(-t * 9.0) + sin(TAU * 70 * t) * 0.5 * exp(-t * 6.0)),
		"bump": _make(0.18, func(t, i): return sin(TAU * 90 * t) * 0.7 * exp(-t * 20.0) + (randf() * 2 - 1) * 0.25 * exp(-t * 30.0)),
		"land": _make(0.25, func(t, i): return sin(TAU * (80 - 40 * t) * t) * 0.8 * exp(-t * 14.0)),
		"hit": _make(0.6, func(t, i): return sin(TAU * (700 - 900 * t) * t) * 0.4 * (1 - t / 0.6) + (randf() * 2 - 1) * 0.3 * exp(-t * 8)),
		"shield_block": _make(0.5, func(t, i): return sin(TAU * 1900 * t) * 0.3 * exp(-t * 7) + sin(TAU * 2850 * t) * 0.2 * exp(-t * 9)),
		"fire_rocket": _make(0.6, func(t, i): return (randf() * 2 - 1) * 0.5 * exp(-t * 3) * (0.6 + 0.4 * sin(TAU * 30 * t))),
		"fire_coconut": _make(0.25, func(t, i): return sin(TAU * (300 + 300 * t) * t) * 0.4 * (1 - t / 0.25)),
		"fire_oil": _make(0.4, func(t, i): return (randf() * 2 - 1) * 0.3 * (1 - t / 0.4) * sin(TAU * 12 * t)),
		"fire_shield": _make(0.5, func(t, i): return sin(TAU * (600 + 800 * t) * t) * 0.3 * (1 - t / 0.5)),
		"fire_boost": _make(0.8, func(t, i): return (randf() * 2 - 1) * 0.5 * sin(PI * t / 0.8)),
		"beep": _make(0.22, func(t, i): return sin(TAU * 660 * t) * 0.4 * (1 - t / 0.22)),
		"go": _make(0.5, func(t, i): return sin(TAU * 1320 * t) * 0.4 * (1 - t / 0.5)),
	}
	for i in 6:
		var p := AudioStreamPlayer.new()
		add_child(p)
		players.append(p)


func _make(seconds: float, f: Callable, loop := false) -> AudioStreamWAV:
	var n := int(seconds * RATE)
	var data := PackedByteArray()
	data.resize(n * 2)
	for i in n:
		var v: float = clampf(f.call(i / RATE, i), -1.0, 1.0)
		data.encode_s16(i * 2, int(v * 32000))
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = int(RATE)
	w.stereo = false
	w.data = data
	if loop:
		w.loop_mode = AudioStreamWAV.LOOP_FORWARD
		w.loop_end = n
	return w


func play(name_: String, volume := 0.0) -> void:
	if not enabled or not sfx.has(name_):
		return
	for p in players:
		if not p.playing:
			p.stream = sfx[name_]
			p.volume_db = volume
			p.play()
			return


func beep(go: bool) -> void:
	play("go" if go else "beep", -4.0)


func update(dt: float, steer: float) -> void:
	if not enabled:
		return
	var p := race.player
	for s in race.sounds:
		var mine: bool = s.car == p
		var vol := 0.0 if mine else -12.0
		if s.kind == "fire_boost" and not mine:
			continue
		play(s.kind, vol)
	race.sounds.clear()
	# the engine: the note climbs through each gear with speed
	var speed := absf(p.v)
	var gears := [0.0, 9.0, 17.0, 25.0, 33.0, 60.0]
	var g := 0
	while g < gears.size() - 2 and speed > gears[g + 1]:
		g += 1
	var within := clampf((speed - gears[g]) / (gears[g + 1] - gears[g]), 0.0, 1.0)
	var target := 0.25 + within * 0.7 + (0.15 if p.boost > 0 else 0.0)
	if race.counting():
		target = 0.18 + 0.1 * sin(Time.get_ticks_msec() * 0.004)
	rpm = lerpf(rpm, target, minf(1.0, dt * 8.0))
	var freq := 55.0 + rpm * 120.0
	var load := 0.55 if p.boost > 0 else 0.4
	if playback:
		var frames := playback.get_frames_available()
		for i in frames:
			phase = fmod(phase + freq / RATE, 1.0)
			phase2 = fmod(phase2 + freq * 0.5 / RATE, 1.0)
			var saw := phase * 2.0 - 1.0
			var sub := 1.0 if phase2 < 0.5 else -1.0
			var v := (saw * 0.55 + sub * 0.25 + sin(phase * TAU * 2.0) * 0.2) * load
			playback.push_frame(Vector2(v, v))
	var sq := p.drift if p.grounded and speed > 10 else 0.0
	squeal.volume_db = lerpf(squeal.volume_db, -60.0 + sq * 50.0, minf(1.0, dt * 10.0))
	squeal.pitch_scale = 0.9 + sq * 0.2
