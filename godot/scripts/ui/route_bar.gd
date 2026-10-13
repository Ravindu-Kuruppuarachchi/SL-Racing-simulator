class_name RouteBar
extends Control
# The route at the top of the screen: a line from start to finish with the towns on it
# and a dot for every car (yours bigger, with a ring).

var race: Race


func _draw() -> void:
	if race == null:
		return
	var t := race.track
	var w := size.x
	var y := size.y * 0.62
	var x0 := 14.0
	var x1 := w - 30.0
	var bg := Color(0, 0, 0, 0.45)
	draw_line(Vector2(x0, y), Vector2(x1, y), bg, 12.0, true)
	draw_circle(Vector2(x0, y), 6, bg)
	draw_circle(Vector2(x1, y), 6, bg)
	var px := lerpf(x0, x1, clampf(race.player.s / t.finish, 0, 1))
	draw_line(Vector2(x0, y), Vector2(px, y), UITheme.ACCENT, 6.0, true)
	var font := UITheme.body_font
	for i in t.towns.size():
		var town: Dictionary = t.towns[i]
		var x := lerpf(x0, x1, town.s / t.finish)
		var passed: bool = race.player.s >= town.s
		draw_circle(Vector2(x, y), 5, UITheme.GOLD if passed else Color(1, 1, 1, 0.65))
	# the chequered flag at the end
	for k in 4:
		for j in 3:
			var c := Color.WHITE if (k + j) % 2 == 0 else Color.BLACK
			draw_rect(Rect2(x1 + 8 + k * 4, y - 16 + j * 4, 4, 4), c)
	draw_line(Vector2(x1 + 8, y - 16), Vector2(x1 + 8, y + 6), Color.WHITE, 2)
	# the cars
	for c in race.cars:
		if c == race.player:
			continue
		var x := lerpf(x0, x1, clampf(c.s / t.finish, 0, 1))
		var col: Color = Cars.PAINTS.get(c.paint, Cars.PAINTS.red)[1]
		draw_circle(Vector2(x, y), 7, Color(0, 0, 0, 0.6))
		draw_circle(Vector2(x, y), 5.5, col)
	var me: Color = Cars.PAINTS.get(race.player.paint, Cars.PAINTS.red)[1]
	draw_circle(Vector2(px, y), 11, Color.WHITE)
	draw_circle(Vector2(px, y), 8, me)
	# the next town's name
	for town in t.towns:
		if town.s > race.player.s:
			var txt: String = town.name
			var x := lerpf(x0, x1, town.s / t.finish)
			var tw := font.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 15).x
			draw_string(font, Vector2(clampf(x - tw / 2, 0, w - tw), y - 14), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color(1, 1, 1, 0.85))
			break
