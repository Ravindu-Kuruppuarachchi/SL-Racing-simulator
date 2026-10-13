extends Node
# Game state (autoload "Game"): the save (coins, cars owned, upgrades, paints, best
# times), switching between the menus and a race, and the online lobby while one is open.
#
# Testing from the command line (user args after --):
#   --race=<map>        start a race on that map straight away (--free for a free drive)
#   --car=<id>          drive this car
#   --screen=<name>     open a menu screen (home, garage, maps, lobby)
#   --shot=<file.png>   save a screenshot after --after=<seconds> (default 4) and quit
#   --at=<s>            put the player this far along the road (for screenshots)

const SAVE_PATH := "user://save.json"
const RELAY_URL := "https://tuktuk-relay.ravindukrashmika.workers.dev"

var save := {}
var args := {}
var lobby: Lobby = null
var current: Node = null
var ui_theme: Theme


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		var kv: PackedStringArray = a.trim_prefix("--").split("=", true, 1)
		args[kv[0]] = kv[1] if kv.size() > 1 else "1"
	load_save()
	ui_theme = UITheme.build()
	get_tree().root.theme = ui_theme
	if args.has("shot"):
		var after := float(args.get("after", "4"))
		get_tree().create_timer(after, true, false, true).timeout.connect(_shoot)
	get_tree().auto_accept_quit = true
	call_deferred("_start")
	if args.has("debug-ui"):
		add_child(load("res://tools/debug_ui.gd").new())


func _start() -> void:
	if args.has("nettest"):
		add_child(load("res://tools/net_test.gd").new())
	elif args.has("race"):
		var mode := "free" if args.has("free") else "race"
		start_race({"map": args.race, "mode": mode, "seed": int(args.get("seed", "1"))})
	else:
		show_menu(args.get("screen", "home"))


func _shoot() -> void:
	var img := get_viewport().get_texture().get_image()
	img.save_png(args.shot)
	print("saved ", args.shot)
	get_tree().quit()


# ---- the save ---------------------------------------------------------------------------------
func default_save() -> Dictionary:
	var cars := {}
	for c in Cars.CARS:
		cars[c.id] = {"owned": c.price == 0, "upgrades": {"engine": 0, "handling": 0, "tyres": 0, "nitro": 0}, "paints": [c.paints[0]], "paint": c.paints[0]}
	return {"coins": 500, "car": Cars.CARS[0].id, "map": Maps.MAPS[0].id, "cars": cars, "best": {}, "wins": 0, "races": 0, "sound": true}


func load_save() -> void:
	save = default_save()
	if FileAccess.file_exists(SAVE_PATH):
		var data = JSON.parse_string(FileAccess.get_file_as_string(SAVE_PATH))
		if data is Dictionary:
			for k in data:
				if k == "cars":
					for id in data.cars:
						if save.cars.has(id):
							save.cars[id].merge(data.cars[id], true)
				else:
					save[k] = data[k]
	if not save.cars.has(save.car) or not save.cars[save.car].owned:
		save.car = Cars.CARS[0].id
	if args.has("car") and save.cars.has(args.car):
		save.car = args.car
		save.cars[args.car].owned = true


func write_save() -> void:
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(save))


func car_entry(id: String = "") -> Dictionary:
	return save.cars[id if id != "" else save.car]


func upgrades_of(id: String) -> Dictionary:
	var u: Dictionary = save.cars[id].upgrades
	return {"engine": int(u.engine), "handling": int(u.handling), "tyres": int(u.tyres), "nitro": int(u.nitro)}


func spend(amount: int) -> bool:
	if save.coins < amount:
		return false
	save.coins -= amount
	write_save()
	return true


# ---- screens ---------------------------------------------------------------------------------
func _swap(node: Node) -> void:
	if current:
		current.queue_free()
	current = node
	get_tree().root.add_child.call_deferred(node)


func show_menu(screen: String = "home") -> void:
	var m := Menu.new()
	m.first_screen = screen
	_swap(m)


## config: {map, mode: race|free|online, seed, players? (online)}
func start_race(config: Dictionary) -> void:
	var r := RaceView.new()
	r.config = config
	_swap(r)


func record_result(map_id: String, place: int, time: float, coins: int, mode: String) -> int:
	var prize := 0
	if mode != "free":
		save.races = int(save.get("races", 0)) + 1
		if place == 1:
			save.wins = int(save.get("wins", 0)) + 1
		prize = Race.PRIZES[mini(place - 1, Race.PRIZES.size() - 1)]
		if mode == "race":
			var best: float = save.best.get(map_id, INF)
			if time < best:
				save.best[map_id] = time
	save.coins += prize + coins
	write_save()
	return prize


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_IN or what == NOTIFICATION_APPLICATION_RESUMED:
		if lobby:
			lobby.wake()
