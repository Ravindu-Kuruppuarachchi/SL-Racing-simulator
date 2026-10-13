class_name Pips
extends Control
# Upgrade level: five pips.

var level := 0

func _draw() -> void:
	var w := (size.x - 4 * 6) / 5.0
	for i in 5:
		var col := UITheme.ACCENT if i < level else Color(1, 1, 1, 0.15)
		draw_rect(Rect2(i * (w + 6), 0, w, size.y), col, true)
