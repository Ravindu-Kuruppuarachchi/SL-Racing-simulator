class_name Logo
extends Control
# "SL RACING" with a speed streak and the island's colours.

func _draw() -> void:
	var f := UITheme.title_font
	var y := size.y * 0.62
	# speed streaks behind the words
	for i in 4:
		var yy := y - 46 + i * 13
		draw_line(Vector2(0, yy), Vector2(size.x * (0.35 + i * 0.12), yy), Color(1, 0.55, 0.12, 0.18 + i * 0.05), 5)
	draw_string_outline(f, Vector2(4, y + 4), "SL", HORIZONTAL_ALIGNMENT_LEFT, -1, 96, 14, Color(0, 0, 0, 0.35))
	draw_string(f, Vector2(0, y), "SL", HORIZONTAL_ALIGNMENT_LEFT, -1, 96, UITheme.GOLD)
	var w := f.get_string_size("SL ", HORIZONTAL_ALIGNMENT_LEFT, -1, 96).x
	draw_string_outline(f, Vector2(w + 4, y + 4), "RACING", HORIZONTAL_ALIGNMENT_LEFT, -1, 96, 14, Color(0, 0, 0, 0.35))
	draw_string(f, Vector2(w, y), "RACING", HORIZONTAL_ALIGNMENT_LEFT, -1, 96, Color.WHITE)
	# a stripe in the flag's colours underneath
	var cols := [Color("#8d153a"), Color("#eb7400"), Color("#00534e"), Color("#ffbe29")]
	var sx := 4.0
	for i in cols.size():
		draw_rect(Rect2(sx + i * 60, y + 16, 54, 7), cols[i], true)
	var sub := "SRI LANKA ROAD RACING"
	draw_string(UITheme.bold_font, Vector2(sx + 250, y + 26), sub, HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color(1, 1, 1, 0.75))
