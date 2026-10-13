class_name Lobby
extends Node
# Online races with friends: the phone's side of the race relay (server/ in the repo,
# the same one Tuk Tuk Climb uses; SL Racing's rooms are kept apart with game=racer).
#
# One phone hosts: it makes a room code, keeps the player list, picks the map and starts
# the race. Up to five friends join with the code. During a race each phone drives its own
# physics and sends its pose to the others, who draw it as a rival.
#
# relay -> phone:  welcome {id, hostId, token, resumed?}, join {id}, leave {id},
#                  away {id}, back {id}, host-left, error {message}
# phone -> relay:  hb (heartbeat), bye (leaving on purpose)
# phone -> phone (the relay stamps `from`):
#   hello {vehicle, skin, upgrades}        a newcomer introduces itself to the host
#   lobby {map, players, racing}           host: the player list
#   busy                                   host to a newcomer while racing
#   start {map, players, seed}             host: the countdown starts now
#   p3 {s, d, psi, v, y, ...}              a car's place on the road, ~15 a second
#   it {kind}                              a power-up fired
#   fin {time}                             a racer crossed the line

signal updated
signal started
signal failed(message: String)
signal host_left
signal reconnecting
signal reconnected
signal pose3d(from: int, m: Dictionary)
signal item(from: int, kind: String)
signal finished(from: int, time: float)
signal left(id: int)

const MAX_PLAYERS := 6
const CODE_CHARS := "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

var code := ""
var role := "host"
var me := {}
var map := "hills"
var seed_value := 1
var url := ""
var ws: WebSocketPeer
var id := -1
var host_id := -1
var token := ""
var players: Array = [] # [{id, vehicle, skin, upgrades}] in join order, the host first
var away := {}
var racing := false
var closed := false
var retries := 0
var retry_at := -1.0
var heartbeat := 0.0
var was_open := false


static func new_code() -> String:
	var s := ""
	for i in 5:
		s += CODE_CHARS[randi() % CODE_CHARS.length()]
	return s


## A race code from typed text or a link (…/race/ABCDE or slracing://join/ABCDE).
static func parse_code(text: String) -> String:
	var t := text.strip_edges().to_upper()
	var re := RegEx.new()
	re.compile("(?:JOIN|RACE)/([A-Z0-9]{5})\\b")
	var m := re.search(t)
	var c := ""
	if m:
		c = m.get_string(1)
	elif t.length() == 5:
		c = t
	for ch in c:
		if not CODE_CHARS.contains(ch):
			return ""
	return c


func is_host() -> bool:
	return role == "host"


func connected() -> bool:
	return ws != null and ws.get_ready_state() == WebSocketPeer.STATE_OPEN


func share_link() -> String:
	return "%s/race/%s" % [url, code]


func open() -> void:
	var resume := "&resume=" + token.uri_encode() if token != "" else ""
	ws = WebSocketPeer.new()
	var ws_url := url.replace("https://", "wss://").replace("http://", "ws://")
	var err := ws.connect_to_url("%s/room/%s?role=%s%s&game=racer" % [ws_url, code, role, resume])
	was_open = false
	if err != OK:
		_dropped()


func _process(dt: float) -> void:
	if closed or ws == null:
		if retry_at > 0 and Time.get_ticks_msec() / 1000.0 > retry_at and not closed:
			retry_at = -1.0
			open()
		return
	ws.poll()
	var state := ws.get_ready_state()
	if state == WebSocketPeer.STATE_OPEN:
		was_open = true
		while ws.get_available_packet_count() > 0:
			var data = JSON.parse_string(ws.get_packet().get_string_from_utf8())
			if data is Dictionary:
				_receive(data)
		heartbeat -= dt
		if heartbeat <= 0:
			heartbeat = 20.0
			send({"t": "hb"})
	elif state == WebSocketPeer.STATE_CLOSED:
		ws = null
		_dropped()


func _dropped() -> void:
	if closed:
		return
	if token == "":
		_fail("Could not reach the race server. Check your internet connection.")
		return
	# phones drop the connection in the background: get back in, with growing waits
	if retries == 0:
		reconnecting.emit()
	if retries > 12:
		_fail("Lost the connection to the race server.")
		return
	var wait: float = [0.5, 1.0, 2.0, 4.0, 8.0, 15.0][mini(retries, 5)]
	retries += 1
	retry_at = Time.get_ticks_msec() / 1000.0 + wait


## The app came back to the front: reconnect now rather than at the next retry.
func wake() -> void:
	if closed or connected():
		return
	if ws == null:
		retry_at = -1.0
		open()


func _fail(message: String) -> void:
	if closed:
		return
	failed.emit(message)
	close()


func send(msg: Dictionary) -> void:
	if connected():
		ws.send_text(JSON.stringify(msg))


func _receive(m: Dictionary) -> void:
	# the relay stamps `from` on everything a phone sends: messages without it are the
	# relay's own, and only the host may run the room
	var from_relay := not m.has("from")
	var from := int(m.get("from", -1))
	var from_host := not from_relay and from == host_id
	var t: String = str(m.get("t", ""))
	if t in ["welcome", "join", "leave", "away", "back", "host-left", "error"] and not from_relay:
		return
	if t in ["lobby", "busy", "start"] and not from_host:
		return
	match t:
		"welcome":
			id = int(m.id)
			host_id = int(m.hostId)
			token = str(m.token)
			retries = 0
			if is_host():
				if not m.get("resumed", false):
					players = [_me_entry(id)]
				share_lobby()
			else:
				send({"t": "hello", "to": host_id, "vehicle": me.vehicle, "skin": me.skin, "upgrades": me.upgrades})
			if m.get("resumed", false):
				reconnected.emit()
		"hello":
			if not is_host() or not (m.get("vehicle") is String) or not (m.get("skin") is String):
				return
			var known := false
			for p in players:
				if p.id == from:
					known = true # back after a dropped connection, or a new car
					p.vehicle = m.vehicle
					p.skin = m.skin
			if known:
				share_lobby()
			elif racing or players.size() >= MAX_PLAYERS:
				send({"t": "busy", "to": from})
			else:
				var up = m.get("upgrades", {})
				players.append({"id": from, "vehicle": m.vehicle, "skin": m.skin, "upgrades": up if up is Dictionary else {}})
				share_lobby()
		"lobby":
			if not (m.get("players") is Array):
				return
			players = _clean_players(m.players)
			map = str(m.get("map", map))
			racing = bool(m.get("racing", false))
			updated.emit()
		"busy":
			_fail("That race has already started. Wait for it to finish and join again.")
		"away", "back":
			var who := int(m.id)
			if t == "away":
				away[who] = true
			else:
				away.erase(who)
				if who == host_id and not is_host():
					send({"t": "hello", "to": host_id, "vehicle": me.vehicle, "skin": me.skin, "upgrades": me.upgrades})
			updated.emit()
		"leave":
			var who := int(m.id)
			away.erase(who)
			players = players.filter(func(p): return p.id != who)
			if is_host():
				share_lobby()
			left.emit(who)
			updated.emit()
		"host-left":
			host_left.emit()
			close()
		"error":
			_fail(str(m.get("message", "Something went wrong.")))
		"start":
			if not (m.get("players") is Array):
				return
			racing = true
			map = str(m.get("map", map))
			seed_value = int(m.get("seed", 1))
			players = _clean_players(m.players)
			started.emit()
		"p3":
			for k in ["s", "d", "psi", "v", "y"]:
				if not (m.get(k) is float or m.get(k) is int):
					return
			pose3d.emit(from, m)
		"it":
			if m.get("kind") is String:
				item.emit(from, m.kind)
		"fin":
			var tm = m.get("time")
			if (tm is float or tm is int) and tm > 0:
				finished.emit(from, float(tm))


func _me_entry(my_id: int) -> Dictionary:
	return {"id": my_id, "vehicle": me.vehicle, "skin": me.skin, "upgrades": me.upgrades}


func _clean_players(list: Array) -> Array:
	var out := []
	for p in list:
		if p is Dictionary and p.has("id") and p.get("vehicle") is String and p.get("skin") is String:
			var up = p.get("upgrades", {})
			out.append({"id": int(p.id), "vehicle": p.vehicle, "skin": p.skin, "upgrades": up if up is Dictionary else {}})
	return out


func share_lobby() -> void:
	send({"t": "lobby", "map": map, "players": players, "racing": racing})
	updated.emit()


# ---- host -------------------------------------------------------------------------------------
func set_map(m: String) -> void:
	map = m
	share_lobby()


func start() -> void:
	racing = true
	seed_value = randi() % 100000 + 1
	send({"t": "start", "map": map, "players": players, "seed": seed_value})
	started.emit()


## Back in the lobby after a race, so friends can join again.
func end_race() -> void:
	if not racing:
		return
	racing = false
	if is_host():
		share_lobby()


## Change my car while waiting in the lobby.
func set_me(vehicle: String, skin: String, upgrades: Dictionary) -> void:
	me = {"vehicle": vehicle, "skin": skin, "upgrades": upgrades}
	if is_host():
		for p in players:
			if p.id == id:
				p.vehicle = vehicle
				p.skin = skin
				p.upgrades = upgrades
		share_lobby()
	elif connected():
		send({"t": "hello", "to": host_id, "vehicle": vehicle, "skin": skin, "upgrades": upgrades})


## Leave the room for good (the relay then drops us at once).
func close() -> void:
	if closed:
		return
	send({"t": "bye"})
	closed = true
	if ws:
		ws.close()
	if Game.lobby == self:
		Game.lobby = null
	queue_free()
