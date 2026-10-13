class_name Menu
extends Control
# The menus over a 3D showroom (your car on a turntable): home, the map picker, the
# garage (buy cars, upgrades and paints) and the online lobby (host or join a race with
# friends). Screens are rebuilt from the save each time they open.

var first_screen := "home"
var screen := ""
var showroom: Showroom
var layer: Control # the current screen's UI
var coins_label: Label
var garage_index := 0
var garage_tab := "upgrades"
var map_scroll: ScrollContainer
var toast: Label
var toast_time := 0.0


func _ready() -> void:
	theme = Game.ui_theme
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	showroom = Showroom.new()
	add_child(showroom)
	garage_index = maxi(0, Cars.CARS.find(Cars.get_car(Game.save.car)))
	open(first_screen)
	if Game.lobby and not Game.lobby.updated.is_connected(_lobby_changed):
		_watch_lobby()


func _process(dt: float) -> void:
	toast_time -= dt
	if toast:
		toast.modulate.a = clampf(toast_time * 2, 0, 1)


func open(name_: String) -> void:
	screen = name_
	if layer:
		layer.queue_free()
	layer = Control.new()
	layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(layer)
	match name_:
		"home": _home()
		"maps": _maps()
		"garage": _garage()
		"lobby": _lobby()
	_top_bar()
	toast = UITheme.label("", "Heading", HORIZONTAL_ALIGNMENT_CENTER)
	toast.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	toast.grow_horizontal = Control.GROW_DIRECTION_BOTH
	toast.grow_vertical = Control.GROW_DIRECTION_BEGIN
	toast.position.y -= 40
	toast.modulate.a = 0
	layer.add_child(toast)
	# slide the new screen in
	layer.modulate.a = 0
	create_tween().tween_property(layer, "modulate:a", 1.0, 0.18)


func say(text: String) -> void:
	toast.text = text
	toast_time = 2.2


func _margin(parent: Control, m := 28) -> MarginContainer:
	var c := MarginContainer.new()
	c.set_anchors_preset(Control.PRESET_FULL_RECT)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for side in ["left", "right", "top", "bottom"]:
		c.add_theme_constant_override("margin_" + side, m)
	parent.add_child(c)
	return c


func _top_bar() -> void:
	var bar := HBoxContainer.new()
	bar.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	bar.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	bar.position += Vector2(-24, 22)
	layer.add_child(bar)
	var pill := PanelContainer.new()
	pill.theme_type_variation = "Pill"
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 8)
	var coin = CoinIcon.new()
	coin.custom_minimum_size = Vector2(26, 26)
	h.add_child(coin)
	coins_label = UITheme.label(_fmt(Game.save.coins), "Bold")
	coins_label.add_theme_color_override("font_color", UITheme.GOLD)
	coins_label.add_theme_font_size_override("font_size", 26)
	h.add_child(coins_label)
	pill.add_child(h)
	bar.add_child(pill)
	if screen != "home":
		var back := UITheme.button("✕", "RoundButton", 0, _back)
		back.custom_minimum_size = Vector2(60, 60)
		back.add_theme_font_size_override("font_size", 24)
		bar.add_child(back)


func _back() -> void:
	if screen == "lobby" and Game.lobby:
		Game.lobby.close()
	elif Game.lobby and screen == "garage":
		open("lobby") # changing car while in a room
		return
	open("home")


static func _fmt(n: int) -> String:
	var s := str(n)
	var out := ""
	while s.length() > 3:
		out = "," + s.substr(s.length() - 3) + out
		s = s.substr(0, s.length() - 3)
	return s + out


func _refresh_coins() -> void:
	coins_label.text = _fmt(Game.save.coins)


# ---- home ------------------------------------------------------------------------------------
func _home() -> void:
	showroom.show_car(Game.save.car, Game.car_entry().paint, Vector2(0.62, 0.55))
	var m := _margin(layer, 36)
	var left := VBoxContainer.new()
	left.add_theme_constant_override("separation", 14)
	left.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	left.mouse_filter = Control.MOUSE_FILTER_IGNORE
	m.add_child(left)
	var logo = Logo.new()
	logo.custom_minimum_size = Vector2(430, 120)
	left.add_child(logo)
	var spacer := Control.new()
	spacer.custom_minimum_size.y = 6
	left.add_child(spacer)
	var race := UITheme.button("RACE", "", 400, func(): Game.start_race({"map": Game.save.map, "mode": "race", "seed": randi() % 1000 + 1}))
	race.add_theme_font_size_override("font_size", 40)
	race.custom_minimum_size.y = 84
	left.add_child(race)
	var row := HBoxContainer.new()
	row.add_child(UITheme.button("Free drive", "GhostButton", 193, func(): Game.start_race({"map": Game.save.map, "mode": "free", "seed": randi() % 1000 + 1})))
	row.add_child(UITheme.button("Garage", "GhostButton", 193, func(): open("garage")))
	left.add_child(row)
	left.add_child(UITheme.button("Race friends online", "BlueButton", 400, func(): open("lobby")))
	# the chosen map, bottom left
	var fill := Control.new()
	fill.size_flags_vertical = Control.SIZE_EXPAND_FILL
	fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	left.add_child(fill)
	left.add_child(_map_chip())
	# your car's name, bottom right
	var car: Dictionary = Cars.get_car(Game.save.car)
	var name_box := VBoxContainer.new()
	name_box.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	name_box.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	name_box.grow_vertical = Control.GROW_DIRECTION_BEGIN
	name_box.position += Vector2(-40, -36)
	name_box.add_theme_constant_override("separation", 0)
	var n := UITheme.label(car.name.to_upper(), "Heading", HORIZONTAL_ALIGNMENT_RIGHT)
	name_box.add_child(n)
	var stats := UITheme.label("%d wins · %d races" % [int(Game.save.get("wins", 0)), int(Game.save.get("races", 0))], "Small", HORIZONTAL_ALIGNMENT_RIGHT)
	name_box.add_child(stats)
	layer.add_child(name_box)


func _map_chip() -> Control:
	var map := Maps.get_map(Game.save.map)
	var b := Button.new()
	b.theme_type_variation = "GhostButton"
	b.custom_minimum_size = Vector2(400, 92)
	b.focus_mode = Control.FOCUS_NONE
	b.pressed.connect(func(): open("maps"))
	var h := HBoxContainer.new()
	h.set_anchors_preset(Control.PRESET_FULL_RECT)
	h.mouse_filter = Control.MOUSE_FILTER_IGNORE
	h.add_theme_constant_override("separation", 14)
	b.add_child(h)
	var thumb := TextureRect.new()
	thumb.texture = _thumb(map.id)
	thumb.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	thumb.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	thumb.custom_minimum_size = Vector2(130, 0)
	thumb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var clip := _rounded(thumb, 16)
	clip.custom_minimum_size = Vector2(130, 0)
	h.add_child(clip)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 0)
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(UITheme.label("MAP", "Small"))
	var nm := UITheme.label(map.name, "Bold")
	nm.add_theme_font_size_override("font_size", 26)
	v.add_child(nm)
	var best: float = Game.save.best.get(map.id, -1.0)
	v.add_child(UITheme.label(("Best %d:%04.1f" % [int(best / 60), fmod(best, 60)]) if best > 0 else map.route, "Small"))
	h.add_child(v)
	var m := MarginContainer.new()
	m.add_theme_constant_override("margin_left", 8)
	m.add_theme_constant_override("margin_top", 8)
	m.add_theme_constant_override("margin_bottom", 8)
	m.mouse_filter = Control.MOUSE_FILTER_IGNORE
	h.reparent(m)
	m.set_anchors_preset(Control.PRESET_FULL_RECT)
	b.add_child(m)
	return b


func _thumb(map_id: String) -> Texture2D:
	var p := "res://assets/thumbs/%s.jpg" % map_id
	if ResourceLoader.exists(p):
		return load(p)
	return null


func _rounded(child: Control, radius: int) -> Control:
	# clip a picture to a rounded rectangle
	var p := Panel.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color.WHITE
	sb.set_corner_radius_all(radius)
	sb.corner_detail = 8
	p.add_theme_stylebox_override("panel", sb)
	p.clip_children = CanvasItem.CLIP_CHILDREN_ONLY
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	child.set_anchors_preset(Control.PRESET_FULL_RECT)
	p.add_child(child)
	return p


# ---- maps --------------------------------------------------------------------------------------
func _maps() -> void:
	showroom.show_car("", "", Vector2.ZERO)
	var m := _margin(layer, 32)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 18)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	m.add_child(v)
	v.add_child(UITheme.label("CHOOSE A ROAD", "Title"))
	map_scroll = ScrollContainer.new()
	map_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	map_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	map_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
	v.add_child(map_scroll)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 20)
	map_scroll.add_child(row)
	for map in Maps.MAPS:
		row.add_child(_map_card(map))


func _map_card(map: Dictionary) -> Control:
	var selected: bool = map.id == Game.save.map
	var card := PanelContainer.new()
	card.theme_type_variation = "SelectedCard" if selected else "CardPanel"
	card.custom_minimum_size = Vector2(330, 0)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	card.add_child(v)
	var thumb := TextureRect.new()
	thumb.texture = _thumb(map.id)
	thumb.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	thumb.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	var clip := _rounded(thumb, 16)
	clip.custom_minimum_size = Vector2(0, 170)
	v.add_child(clip)
	var name_ := UITheme.label(map.name.to_upper(), "Heading")
	name_.add_theme_font_size_override("font_size", 30)
	v.add_child(name_)
	var route := UITheme.label(map.route, "Bold")
	route.add_theme_color_override("font_color", map.look.accent.lightened(0.3))
	route.add_theme_font_size_override("font_size", 19)
	v.add_child(route)
	var tag := UITheme.label(map.tagline, "Small")
	tag.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	tag.custom_minimum_size.x = 290
	v.add_child(tag)
	var hazards: Array = map.hard.values().slice(0, 4)
	var hz := UITheme.label("· " + "  · ".join(hazards), "Small")
	hz.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hz.custom_minimum_size.x = 290
	hz.add_theme_font_size_override("font_size", 16)
	v.add_child(hz)
	var fill := Control.new()
	fill.size_flags_vertical = Control.SIZE_EXPAND_FILL
	v.add_child(fill)
	var best: float = Game.save.best.get(map.id, -1.0)
	v.add_child(UITheme.label(("Best time  %d:%04.1f" % [int(best / 60), fmod(best, 60)]) if best > 0 else "No time yet", "Small"))
	var h := HBoxContainer.new()
	var pick := UITheme.button("Selected" if selected else "Select", "GhostButton", 0, func():
		Game.save.map = map.id
		Game.write_save()
		open("maps"))
	pick.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.add_child(pick)
	var go := UITheme.button("Race ▶", "", 0, func():
		Game.save.map = map.id
		Game.write_save()
		Game.start_race({"map": map.id, "mode": "race", "seed": randi() % 1000 + 1}))
	go.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.add_child(go)
	v.add_child(h)
	return card


# ---- garage ------------------------------------------------------------------------------------
func _garage() -> void:
	var car: Dictionary = Cars.CARS[garage_index]
	var entry: Dictionary = Game.save.cars[car.id]
	var owned: bool = entry.owned
	showroom.show_car(car.id, entry.paint, Vector2(0.3, 0.5), 1.25)
	var m := _margin(layer, 28)
	var h := HBoxContainer.new()
	h.mouse_filter = Control.MOUSE_FILTER_IGNORE
	m.add_child(h)
	# left: the car switcher over the showroom
	var left := VBoxContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.mouse_filter = Control.MOUSE_FILTER_IGNORE
	h.add_child(left)
	left.add_child(UITheme.label("GARAGE", "Title"))
	var fill := Control.new()
	fill.size_flags_vertical = Control.SIZE_EXPAND_FILL
	fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	left.add_child(fill)
	var nav := HBoxContainer.new()
	nav.alignment = BoxContainer.ALIGNMENT_CENTER
	var prev := UITheme.button("◀", "RoundButton", 0, func():
		garage_index = (garage_index + Cars.CARS.size() - 1) % Cars.CARS.size()
		open("garage"))
	prev.custom_minimum_size = Vector2(72, 72)
	nav.add_child(prev)
	var info := VBoxContainer.new()
	info.add_theme_constant_override("separation", 0)
	info.custom_minimum_size.x = 320
	var nm := UITheme.label(car.name.to_upper(), "Heading", HORIZONTAL_ALIGNMENT_CENTER)
	info.add_child(nm)
	info.add_child(UITheme.label("%d / %d" % [garage_index + 1, Cars.CARS.size()], "Small", HORIZONTAL_ALIGNMENT_CENTER))
	nav.add_child(info)
	var next := UITheme.button("▶", "RoundButton", 0, func():
		garage_index = (garage_index + 1) % Cars.CARS.size()
		open("garage"))
	next.custom_minimum_size = Vector2(72, 72)
	nav.add_child(next)
	left.add_child(nav)
	var act := HBoxContainer.new()
	act.alignment = BoxContainer.ALIGNMENT_CENTER
	if not owned:
		var buy := UITheme.button("Buy  ● %s" % _fmt(car.price), "GoldButton", 300, func():
			if Game.spend(car.price):
				entry.owned = true
				Game.save.car = car.id
				Game.write_save()
				say("%s is yours!" % car.name)
				open("garage")
			else:
				say("Not enough coins yet"))
		buy.disabled = Game.save.coins < car.price
		act.add_child(buy)
	elif Game.save.car == car.id:
		act.add_child(UITheme.label("✓ DRIVING THIS ONE", "Bold", HORIZONTAL_ALIGNMENT_CENTER))
	else:
		act.add_child(UITheme.button("Drive this car", "GreenButton", 300, func():
			Game.save.car = car.id
			Game.write_save()
			if Game.lobby:
				Game.lobby.set_me(car.id, entry.paint, Game.upgrades_of(car.id))
			open("garage")))
	left.add_child(act)

	# right: stats, upgrades and paints
	var right := VBoxContainer.new()
	h.add_child(right)
	var gap := Control.new()
	gap.custom_minimum_size.y = 64 # under the coins and close button
	right.add_child(gap)
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(500, 0)
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	right.add_child(panel)
	var pm := MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]:
		pm.add_theme_constant_override("margin_" + side, 10)
	panel.add_child(pm)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	pm.add_child(v)
	var blurb := UITheme.label(car.blurb, "Small")
	blurb.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	v.add_child(blurb)
	var stats := CarSim.make_stats(car, Game.upgrades_of(car.id))
	var base := CarSim.make_stats(car, {})
	v.add_child(_stat("Top speed", stats.top, base.top, 24, 42, "%d km/h" % int(stats.top * 3.6)))
	v.add_child(_stat("Acceleration", stats.accel, base.accel, 8, 20))
	v.add_child(_stat("Handling", stats.turn * stats.grip, base.turn * base.grip, 6, 14))
	v.add_child(_stat("Weight", car.mass, car.mass, 0.6, 1.6))
	var tabs := HBoxContainer.new()
	tabs.add_theme_constant_override("separation", 8)
	for t in [["upgrades", "Upgrades"], ["paint", "Paint"]]:
		var b := UITheme.button(t[1], "TabButton" if garage_tab != t[0] else "", 0, func():
			garage_tab = t[0]
			open("garage"))
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		if garage_tab == t[0]:
			b.add_theme_font_size_override("font_size", 20)
		tabs.add_child(b)
	v.add_child(tabs)
	if garage_tab == "upgrades":
		for u in Cars.UPGRADES:
			v.add_child(_upgrade_row(car, entry, u, owned))
	else:
		v.add_child(_paints(car, entry, owned))


func _stat(label: String, value: float, base: float, lo: float, hi: float, text := "") -> Control:
	var h := HBoxContainer.new()
	var l := UITheme.label(label, "Small")
	l.custom_minimum_size.x = 140
	h.add_child(l)
	var bar = StatBar.new()
	bar.value = clampf((value - lo) / (hi - lo), 0.04, 1.0)
	bar.base = clampf((base - lo) / (hi - lo), 0.04, 1.0)
	bar.custom_minimum_size = Vector2(200, 14)
	bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	h.add_child(bar)
	if text != "":
		var t := UITheme.label(text, "Small")
		t.custom_minimum_size.x = 90
		t.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		h.add_child(t)
	return h


func _upgrade_row(car: Dictionary, entry: Dictionary, u: Dictionary, owned: bool) -> Control:
	var level := int(entry.upgrades[u.key])
	var h := HBoxContainer.new()
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 2)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_child(UITheme.label(u.name, "Bold"))
	var pips = Pips.new()
	pips.level = level
	pips.custom_minimum_size = Vector2(150, 10)
	v.add_child(pips)
	h.add_child(v)
	var eff := UITheme.label(Cars.upgrade_effect(u.key, level) if level > 0 else "Stock", "Small")
	eff.custom_minimum_size.x = 150
	h.add_child(eff)
	if level >= Cars.MAX_LEVEL:
		var mx := UITheme.label("MAX", "Bold")
		mx.custom_minimum_size.x = 120
		mx.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		mx.add_theme_color_override("font_color", UITheme.GOLD)
		h.add_child(mx)
	else:
		var price := Cars.upgrade_price(car, level)
		var b := UITheme.button("● %s" % _fmt(price), "GoldButton", 120, func():
			if Game.spend(price):
				entry.upgrades[u.key] = level + 1
				Game.write_save()
				if Game.lobby and Game.save.car == car.id:
					Game.lobby.set_me(car.id, entry.paint, Game.upgrades_of(car.id))
				say("%s upgraded!" % u.name)
				open("garage")
			else:
				say("Not enough coins yet"))
		b.add_theme_font_size_override("font_size", 20)
		b.disabled = not owned or Game.save.coins < price
		h.add_child(b)
	return h


func _paints(car: Dictionary, entry: Dictionary, owned: bool) -> Control:
	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 10)
	for i in car.paints.size():
		var pid: String = car.paints[i]
		var paint: Array = Cars.PAINTS[pid]
		var has: bool = pid in entry.paints
		var price := Cars.paint_price(car, i)
		var b := Button.new()
		b.focus_mode = Control.FOCUS_NONE
		b.custom_minimum_size = Vector2(150, 78)
		var sb := UITheme.box(paint[1], 18, 3 if entry.paint == pid else 0, Color.WHITE, 6, 5, paint[1].darkened(0.4))
		b.add_theme_stylebox_override("normal", sb)
		b.add_theme_stylebox_override("hover", sb)
		b.add_theme_stylebox_override("pressed", sb)
		b.add_theme_stylebox_override("disabled", sb)
		var dark: bool = paint[1].get_luminance() > 0.6
		var txt = paint[0] if has else "%s\n● %s" % [paint[0], _fmt(price)]
		b.text = txt
		b.add_theme_font_size_override("font_size", 17)
		for k in ["font_color", "font_hover_color", "font_pressed_color", "font_disabled_color"]:
			b.add_theme_color_override(k, Color(0.05, 0.05, 0.1) if dark else Color.WHITE)
		b.pressed.connect(func():
			if not owned:
				say("Buy the car first")
				return
			if not has:
				if not Game.spend(price):
					say("Not enough coins yet")
					return
				entry.paints.append(pid)
			entry.paint = pid
			Game.write_save()
			if Game.lobby and Game.save.car == car.id:
				Game.lobby.set_me(car.id, pid, Game.upgrades_of(car.id))
			open("garage"))
		grid.add_child(b)
	return grid


# ---- online lobby ------------------------------------------------------------------------------------
func _watch_lobby() -> void:
	var l := Game.lobby
	l.updated.connect(_lobby_changed)
	l.started.connect(_lobby_started)
	l.failed.connect(func(msg):
		say(msg)
		if screen == "lobby":
			open("lobby"))
	l.host_left.connect(func():
		say("The host has left the race")
		if screen == "lobby":
			open("lobby"))
	l.reconnecting.connect(func(): say("Reconnecting…"))


func _lobby_changed() -> void:
	if screen == "lobby" and is_inside_tree():
		open("lobby")


func _lobby_started() -> void:
	var l := Game.lobby
	Game.start_race({"map": l.map, "mode": "online", "seed": l.seed_value, "players": l.players})


func _new_lobby(role: String, code: String) -> void:
	var l := Lobby.new()
	l.code = code
	l.role = role
	l.url = Game.RELAY_URL
	l.map = Game.save.map
	l.me = {"vehicle": Game.save.car, "skin": Game.car_entry().paint, "upgrades": Game.upgrades_of(Game.save.car)}
	Game.lobby = l
	Game.add_child(l)
	_watch_lobby()
	l.open()
	open("lobby")


func _lobby() -> void:
	var l := Game.lobby
	showroom.show_car(Game.save.car, Game.car_entry().paint, Vector2(0.78, 0.6))
	var m := _margin(layer, 32)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 16)
	v.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	m.add_child(v)
	v.add_child(UITheme.label("RACE FRIENDS", "Title"))
	if l == null:
		var sub := UITheme.label("Host a race and share the link, or join a friend's race with their code. Up to 6 players.", "Small")
		sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		sub.custom_minimum_size.x = 560
		v.add_child(sub)
		v.add_child(UITheme.button("Host a race", "", 460, func(): _new_lobby("host", Lobby.new_code())))
		var panel := PanelContainer.new()
		panel.custom_minimum_size.x = 460
		v.add_child(panel)
		var pv := VBoxContainer.new()
		panel.add_child(pv)
		pv.add_child(UITheme.label("Join with a code", "Bold"))
		var row := HBoxContainer.new()
		var code := LineEdit.new()
		code.placeholder_text = "ABCDE"
		code.max_length = 40
		code.custom_minimum_size = Vector2(230, 72)
		code.alignment = HORIZONTAL_ALIGNMENT_CENTER
		code.virtual_keyboard_type = LineEdit.KEYBOARD_TYPE_DEFAULT
		code.text_changed.connect(func(t):
			var c := Lobby.parse_code(t)
			if c != "" and c != t:
				code.text = c
				code.caret_column = c.length())
		row.add_child(code)
		var join := UITheme.button("Join", "GreenButton", 0, func():
			var c := Lobby.parse_code(code.text)
			if c == "":
				say("Type the 5-letter code")
			else:
				_new_lobby("join", c))
		row.add_child(join)
		pv.add_child(row)
		var paste := UITheme.button("Paste link", "GhostButton", 0, func():
			var c := Lobby.parse_code(DisplayServer.clipboard_get())
			if c == "":
				say("No race link on the clipboard")
			else:
				code.text = c)
		pv.add_child(paste)
		return
	# in a room
	var head := HBoxContainer.new()
	var code_box := VBoxContainer.new()
	code_box.add_theme_constant_override("separation", 0)
	code_box.add_child(UITheme.label("ROOM CODE", "Small"))
	var code_l := UITheme.label(l.code, "Big")
	code_l.add_theme_font_size_override("font_size", 64)
	code_l.add_theme_color_override("font_color", UITheme.GOLD)
	code_box.add_child(code_l)
	head.add_child(code_box)
	var share := VBoxContainer.new()
	share.add_child(UITheme.button("Copy link", "GhostButton", 220, func():
		DisplayServer.clipboard_set(l.share_link())
		say("Link copied: send it to your friends")))
	share.add_child(UITheme.button("Share on WhatsApp", "GreenButton", 220, func():
		OS.shell_open("https://wa.me/?text=" + ("Race me in SL Racing! Code %s  %s" % [l.code, l.share_link()]).uri_encode())))
	head.add_child(share)
	v.add_child(head)
	var status := "Connecting…"
	if l.connected():
		status = "Waiting for the host to start" if not l.is_host() else "Choose the road and start when everyone is in"
	var st := UITheme.label(status, "Small")
	v.add_child(st)
	var plist := PanelContainer.new()
	plist.custom_minimum_size.x = 560
	v.add_child(plist)
	var pv2 := VBoxContainer.new()
	pv2.add_theme_constant_override("separation", 6)
	plist.add_child(pv2)
	pv2.add_child(UITheme.label("Players  %d / %d" % [l.players.size(), Lobby.MAX_PLAYERS], "Bold"))
	for i in l.players.size():
		var p: Dictionary = l.players[i]
		var line := HBoxContainer.new()
		var dot := ColorRect.new()
		dot.color = Cars.PAINTS.get(p.skin, Cars.PAINTS.red)[1]
		dot.custom_minimum_size = Vector2(18, 18)
		dot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		line.add_child(dot)
		var who := ("You" if p.id == l.id else "Player %d" % (i + 1)) + ("  (host)" if p.id == l.host_id else "")
		if l.away.has(p.id):
			who += "  · away"
		var wl := UITheme.label(who, "Bold" if p.id == l.id else "")
		wl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		line.add_child(wl)
		line.add_child(UITheme.label(Cars.get_car(p.vehicle).name, "Small"))
		pv2.add_child(line)
	# the road
	var map := Maps.get_map(l.map)
	var maprow := HBoxContainer.new()
	if l.is_host():
		maprow.add_child(UITheme.button("◀", "RoundButton", 0, func(): l.set_map(_step_map(l.map, -1))))
	var ml := UITheme.label(map.name, "Heading", HORIZONTAL_ALIGNMENT_CENTER)
	ml.custom_minimum_size.x = 300
	maprow.add_child(ml)
	if l.is_host():
		maprow.add_child(UITheme.button("▶", "RoundButton", 0, func(): l.set_map(_step_map(l.map, 1))))
	v.add_child(maprow)
	var buttons := HBoxContainer.new()
	if l.is_host():
		var start := UITheme.button("Start race", "", 240, func(): l.start())
		start.disabled = not l.connected() or l.players.size() < 2
		buttons.add_child(start)
	buttons.add_child(UITheme.button("Change car", "GhostButton", 0, func(): open("garage")))
	buttons.add_child(UITheme.button("Leave", "GhostButton", 0, func():
		l.close()
		open("lobby")))
	v.add_child(buttons)


func _step_map(id: String, dir: int) -> String:
	var i := 0
	for k in Maps.MAPS.size():
		if Maps.MAPS[k].id == id:
			i = k
	return Maps.MAPS[(i + dir + Maps.MAPS.size()) % Maps.MAPS.size()].id
