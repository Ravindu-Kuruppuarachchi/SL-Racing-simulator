class_name StatBar
extends Control
# A stat bar: the car's stock value, with upgrades shown brighter on top.

var value := 0.5
var base := 0.5

func _draw() -> void:
	var r := size.y / 2
	draw_rect(Rect2(Vector2.ZERO, size), Color(1, 1, 1, 0.1), true)
	draw_rect(Rect2(Vector2.ZERO, Vector2(size.x * value, size.y)), UITheme.GOLD, true)
	draw_rect(Rect2(Vector2.ZERO, Vector2(size.x * base, size.y)), UITheme.ACCENT, true)
