class_name Hud
extends CanvasLayer
# The race HUD: place, time and speed, the route bar with every car on it, the power-up
# slot, messages and the countdown; touch controls (steer, brake, fire: several fingers at
# once) and the keyboard; the pause menu and the results.

var race_view: RaceView
var root: Control
var place_label: Label
var place_of: Label
var time_label: Label
var speed_label: Label
var coin_label: Label
var message: Label
var countdown: Label
var bar: RouteBar
var item_slot: ItemIcon
var pads := {} # name -> Control (touch zones)
var touches := {} # index -> position
var keys := {"left": false, "right": false, "brake": false}
var fire_queued := false
var message_time := 0.0
var overlay: Control
var last_count := 4
var last_lap := 1


func _ready() -> void:
	root = Control.new()
	root.theme = Game.ui_theme
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	var safe := MarginContainer.new()
	safe.set_anchors_preset(Control.PRESET_FULL_RECT)
	safe.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for side in ["left", "right", "top", "bottom"]:
		safe.add_theme_constant_override("margin_" + side, 22)
	root.add_child(safe)
	var layer := Control.new()
	layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	safe.add_child(layer)

	# top left: place and time
	var tl := VBoxContainer.new()
	tl.position = Vector2(0, 0)
	tl.add_theme_constant_override("separation", 0)
	layer.add_child(tl)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 4)
	tl.add_child(row)
	place_label = UITheme.label("6", "Big")
	place_label.add_theme_font_size_override("font_size", 64)
	row.add_child(place_label)
	place_of = UITheme.label("th / 6", "Heading")
	place_of.add_theme_font_size_override("font_size", 26)
	place_of.size_flags_vertical = Control.SIZE_SHRINK_END
	row.add_child(place_of)
	time_label = UITheme.label("0:00.0", "Bold")
	time_label.add_theme_font_size_override("font_size", 26)
	tl.add_child(time_label)

	# top centre: the route
	bar = RouteBar.new()
	bar.race = race_view.race
	bar.set_anchors_preset(Control.PRESET_CENTER_TOP)
	bar.custom_minimum_size = Vector2(520, 46)
	bar.position = Vector2(-260, 4)
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(bar)
	bar.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP, Control.PRESET_MODE_KEEP_SIZE)

	# top right: coins and pause
	var tr := HBoxContainer.new()
	tr.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	tr.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	layer.add_child(tr)
	var coin_pill := PanelContainer.new()
	coin_pill.theme_type_variation = "Pill"
	coin_label = UITheme.label("● 0", "Bold")
	coin_label.add_theme_color_override("font_color", UITheme.GOLD)
	coin_pill.add_child(coin_label)
	tr.add_child(coin_pill)
	var pause := UITheme.button("II", "RoundButton", 0, _pause)
	pause.custom_minimum_size = Vector2(64, 64)
	pause.add_theme_font_size_override("font_size", 24)
	tr.add_child(pause)

	# messages and the countdown
	message = UITheme.label("", "Big", HORIZONTAL_ALIGNMENT_CENTER)
	message.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	message.position.y = 110
	message.grow_horizontal = Control.GROW_DIRECTION_BOTH
	message.modulate.a = 0
	layer.add_child(message)
	countdown = UITheme.label("", "Huge", HORIZONTAL_ALIGNMENT_CENTER)
	countdown.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	countdown.grow_horizontal = Control.GROW_DIRECTION_BOTH
	countdown.grow_vertical = Control.GROW_DIRECTION_BOTH
	layer.add_child(countdown)

	# speed, bottom centre
	speed_label = UITheme.label("0", "Big", HORIZONTAL_ALIGNMENT_CENTER)
	speed_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	speed_label.grow_horizontal = Control.GROW_DIRECTION_BOTH
	speed_label.grow_vertical = Control.GROW_DIRECTION_BEGIN
	speed_label.position.y -= 26
	layer.add_child(speed_label)
	var kmh := UITheme.label("KM/H", "Small", HORIZONTAL_ALIGNMENT_CENTER)
	kmh.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	kmh.grow_horizontal = Control.GROW_DIRECTION_BOTH
	kmh.grow_vertical = Control.GROW_DIRECTION_BEGIN
	layer.add_child(kmh)

	# touch pads
	_pad(layer, "left", "◀", Control.PRESET_BOTTOM_LEFT, Vector2(0, 0), 130)
	_pad(layer, "right", "▶", Control.PRESET_BOTTOM_LEFT, Vector2(150, 0), 130)
	_pad(layer, "brake", "BRAKE", Control.PRESET_BOTTOM_RIGHT, Vector2(0, 0), 110)
	var fire := _pad(layer, "fire", "", Control.PRESET_BOTTOM_RIGHT, Vector2(-10, -150), 120)
	item_slot = ItemIcon.new()
	item_slot.set_anchors_preset(Control.PRESET_FULL_RECT)
	item_slot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	fire.add_child(item_slot)


func _pad(parent: Control, name_: String, text: String, preset: int, offset: Vector2, size_: float) -> Control:
	var p := Panel.new()
	var sb := UITheme.box(Color(1, 1, 1, 0.13), int(size_ / 2), 3, Color(1, 1, 1, 0.28))
	p.add_theme_stylebox_override("panel", sb)
	p.custom_minimum_size = Vector2(size_, size_)
	p.size = Vector2(size_, size_)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(p)
	p.set_anchors_and_offsets_preset(preset, Control.PRESET_MODE_KEEP_SIZE)
	p.position += offset
	if text != "":
		var l := UITheme.label(text, "Heading", HORIZONTAL_ALIGNMENT_CENTER)
		l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		l.set_anchors_preset(Control.PRESET_FULL_RECT)
		if text.length() > 2:
			l.add_theme_font_size_override("font_size", 22)
		else:
			l.add_theme_font_size_override("font_size", 52)
		p.add_child(l)
	pads[name_] = p
	return p


# ---- input ---------------------------------------------------------------------------------------
func _input(e: InputEvent) -> void:
	if e is InputEventScreenTouch:
		if e.pressed:
			touches[e.index] = e.position
			if _hit("fire", e.position):
				fire_queued = true
		else:
			touches.erase(e.index)
	elif e is InputEventScreenDrag:
		touches[e.index] = e.position
	elif e is InputEventKey:
		var k: int = e.physical_keycode
		if k in [KEY_LEFT, KEY_A]: keys.left = e.pressed
		elif k in [KEY_RIGHT, KEY_D]: keys.right = e.pressed
		elif k in [KEY_DOWN, KEY_S]: keys.brake = e.pressed
		elif k == KEY_SPACE and e.pressed and not e.echo: fire_queued = true
		elif k in [KEY_ESCAPE, KEY_P] and e.pressed and not e.echo: _pause()


func _hit(name_: String, pos: Vector2) -> bool:
	var p: Control = pads[name_]
	var r := p.get_global_rect().grow(18)
	return r.has_point(pos)


func _held(name_: String) -> bool:
	for i in touches:
		if _hit(name_, touches[i]):
			return true
	return false


func read_input() -> Dictionary:
	var left = keys.left or _held("left")
	var right = keys.right or _held("right")
	var steer := (1.0 if right else 0.0) - (1.0 if left else 0.0)
	var out := {"steer": steer, "brake": keys.brake or _held("brake"), "fire": fire_queued}
	if Game.args.has("autopilot"): # testing: the AI drives your car
		var race := race_view.race
		var p := race.player
		out = AI.input(p, race.cars.filter(func(o): return o != p), 0.0, 0.9, race.obstacles_ahead(p))
		out.fire = p.item != "" and race.bot_wants_item(p, race.standings())
	fire_queued = false
	for n in ["left", "right", "brake"]:
		pads[n].modulate = Color(1.6, 1.4, 1.0) if (n == "left" and left) or (n == "right" and right) or (n == "brake" and out.brake) else Color.WHITE
	return out


# ---- every frame --------------------------------------------------------------------------------
func _process(dt: float) -> void:
	var race := race_view.race
	var p := race.player
	var n := race.cars.size()
	var place := race.place_of(p)
	if race.free:
		place_label.text = "%d" % int(p.s)
		place_of.text = " m"
	else:
		place_label.text = str(place)
		place_of.text = Race.ordinal(place).substr(str(place).length()) + " / %d" % n
	var t := maxf(0.0, race.time) if not p.finished() else p.finish_time
	time_label.text = "%d:%04.1f" % [int(t / 60), fmod(t, 60.0)]
	var tr := race.track
	if tr.circuit and not race.free:
		var lap := clampi(int(floor((p.s - 31.5) / tr.loop_len)) + 1, 1, tr.laps)
		time_label.text = "LAP %d/%d   %s" % [lap, tr.laps, time_label.text]
		if lap != last_lap and lap > 1 and not p.finished():
			flash("FINAL LAP!" if lap == tr.laps else "LAP %d" % lap)
		last_lap = lap
	speed_label.text = str(int(p.speed_kmh()))
	coin_label.text = "● %d" % p.coins
	item_slot.kind = p.item
	item_slot.queue_redraw()
	bar.visible = not (race.free and race.track.circuit)
	bar.queue_redraw()
	# countdown
	if race.counting():
		var c := int(ceil(-race.time))
		countdown.text = str(c)
		if c != last_count:
			last_count = c
			race_view.audio.beep(false)
			_pop(countdown)
	elif race.time < 1.0 and not race.free:
		if last_count != 0:
			last_count = 0
			countdown.text = "GO!"
			race_view.audio.beep(true)
			_pop(countdown)
		countdown.modulate.a = 1.0 - race.time
	else:
		countdown.text = ""
	message_time -= dt
	message.modulate.a = clampf(message_time * 2.0, 0.0, 1.0)


func _pop(l: Control) -> void:
	l.pivot_offset = l.size / 2
	l.scale = Vector2(1.6, 1.6)
	l.modulate.a = 1.0
	var tw := create_tween()
	tw.tween_property(l, "scale", Vector2.ONE, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func flash(text: String) -> void:
	message.text = text
	message_time = 1.6
	_pop(message)


# ---- pause and results ----------------------------------------------------------------------------
func _overlay() -> VBoxContainer:
	if overlay:
		overlay.queue_free()
	overlay = ColorRect.new()
	(overlay as ColorRect).color = Color(0.02, 0.03, 0.07, 0.6)
	overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(overlay)
	var centre := CenterContainer.new()
	centre.set_anchors_preset(Control.PRESET_FULL_RECT)
	overlay.add_child(centre)
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(520, 0)
	centre.add_child(panel)
	var m := MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]:
		m.add_theme_constant_override("margin_" + side, 22)
	panel.add_child(m)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 16)
	m.add_child(v)
	panel.pivot_offset = Vector2(260, 200)
	panel.scale = Vector2(0.85, 0.85)
	panel.modulate.a = 0
	var tw := create_tween().set_parallel()
	tw.tween_property(panel, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(panel, "modulate:a", 1.0, 0.2)
	return v


func _pause() -> void:
	if overlay or race_view.race.done():
		return
	race_view.paused = not race_view.online # online races keep running
	var v := _overlay()
	v.add_child(UITheme.label("PAUSED", "Title", HORIZONTAL_ALIGNMENT_CENTER))
	v.add_child(UITheme.button("Resume", "", 0, _resume))
	if not race_view.online:
		v.add_child(UITheme.button("Restart", "GhostButton", 0, race_view.restart))
	v.add_child(UITheme.button("Leave race" if race_view.online else "Quit to menu", "GhostButton", 0, race_view.quit_to_menu))


func _resume() -> void:
	race_view.paused = false
	overlay.queue_free()
	overlay = null


func show_results(place: int, time: float, prize: int, coins: int) -> void:
	var race := race_view.race
	var v := _overlay()
	if race.free:
		v.add_child(UITheme.label("FREE DRIVE", "Title", HORIZONTAL_ALIGNMENT_CENTER))
	else:
		var title := UITheme.label("YOU WIN!" if place == 1 else Race.ordinal(place).to_upper() + " PLACE", "Title", HORIZONTAL_ALIGNMENT_CENTER)
		title.add_theme_color_override("font_color", UITheme.GOLD if place == 1 else Color.WHITE)
		v.add_child(title)
	v.add_child(UITheme.label("%s  ·  %d:%04.1f" % [race.track.map.name, int(time / 60), fmod(time, 60.0)], "Bold", HORIZONTAL_ALIGNMENT_CENTER))
	# the finishing order
	var list := VBoxContainer.new()
	list.add_theme_constant_override("separation", 4)
	var order := race.standings()
	for i in order.size():
		var c: CarSim = order[i]
		var line := HBoxContainer.new()
		var l1 := UITheme.label(Race.ordinal(i + 1), "Bold")
		l1.custom_minimum_size.x = 70
		line.add_child(l1)
		var l2 := UITheme.label(c.name, "Bold" if c == race.player else "")
		l2.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		if c == race.player:
			l2.add_theme_color_override("font_color", UITheme.ACCENT)
		line.add_child(l2)
		var t: String = "%d:%04.1f" % [int(c.finish_time / 60), fmod(c.finish_time, 60.0)] if c.finished() else "—"
		line.add_child(UITheme.label(t, "Small"))
		list.add_child(line)
	v.add_child(list)
	var reward := UITheme.label("+ %d coins" % (prize + coins), "Heading", HORIZONTAL_ALIGNMENT_CENTER)
	reward.add_theme_color_override("font_color", UITheme.GOLD)
	v.add_child(reward)
	var buttons := HBoxContainer.new()
	buttons.alignment = BoxContainer.ALIGNMENT_CENTER
	if not race_view.online:
		buttons.add_child(UITheme.button("Race again", "", 0, race_view.restart))
	buttons.add_child(UITheme.button("Back to lobby" if race_view.online else "Menu", "GhostButton", 0, race_view.quit_to_menu))
	v.add_child(buttons)
