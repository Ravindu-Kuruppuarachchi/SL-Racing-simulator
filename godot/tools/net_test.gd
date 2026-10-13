extends Node
# Online check against a relay (--relay=URL): a host and a friend join one room, the
# friend appears in the host's list, the host starts, poses and items arrive, and the
# finish is reported. Run: godot --headless -- --nettest --relay=http://localhost:8787

var failed := false
var host: Lobby
var friend: Lobby
var got := {}


func check(ok: bool, what: String) -> void:
	print(("ok   " if ok else "FAIL ") + what)
	if not ok:
		failed = true


func _make(role: String, code: String, car: String) -> Lobby:
	var l := Lobby.new()
	l.code = code
	l.role = role
	l.url = Game.args.get("relay", Game.RELAY_URL)
	l.me = {"vehicle": car, "skin": Cars.get_car(car).paints[0], "upgrades": {"engine": 2}}
	add_child(l)
	l.open()
	return l


func _wait(cond: Callable, seconds := 5.0) -> bool:
	var t := 0.0
	while not cond.call() and t < seconds:
		await get_tree().process_frame
		t += get_process_delta_time()
	return cond.call()


func _ready() -> void:
	var code := Lobby.new_code()
	check(Lobby.parse_code("https://x.workers.dev/race/" + code) == code and Lobby.parse_code(code.to_lower()) == code, "codes are read from links and typing")
	host = _make("host", code, "hyper")
	check(await _wait(func(): return host.id > 0), "the host gets into a room")
	friend = _make("join", code, "rally")
	check(await _wait(func(): return host.players.size() == 2 and friend.players.size() == 2), "the friend joins and both see two players")
	check(friend.players.size() == 2 and friend.players[1].vehicle == "rally" and int(friend.players[1].upgrades.get("engine", 0)) == 2, "players carry their car and upgrades")
	friend.started.connect(func(): got.start = true)
	host.set_map("knuckles")
	host.start()
	check(await _wait(func(): return got.has("start")), "the friend hears the start")
	check(friend.map == "knuckles" and friend.seed_value == host.seed_value, "both race the same road (map and seed)")
	host.pose3d.connect(func(from, m): got.pose = m)
	host.item.connect(func(from, k): got.item = k)
	host.finished.connect(func(from, t): got.fin = t)
	friend.send({"t": "p3", "s": 120.5, "d": 1.2, "psi": 0.05, "v": 31.0, "y": 4.0, "g": true})
	friend.send({"t": "it", "kind": "rocket"})
	friend.send({"t": "fin", "time": 81.25})
	check(await _wait(func(): return got.has("pose") and got.has("item") and got.has("fin")), "poses, power-ups and finishes reach the host")
	check(got.has("pose") and got.pose.s == 120.5 and got.get("item") == "rocket" and got.get("fin") == 81.25, "with the right values")
	var left := {}
	host.left.connect(func(id): left.id = id)
	friend.close()
	check(await _wait(func(): return left.has("id") and host.players.size() == 1), "a friend who leaves is taken off the list")
	host.close()
	get_tree().quit(1 if failed else 0)
