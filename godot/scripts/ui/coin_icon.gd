class_name CoinIcon
extends Control
# A gold coin.

func _draw() -> void:
	var c := size / 2
	var r := minf(size.x, size.y) / 2
	draw_circle(c, r, UITheme.GOLD.darkened(0.3))
	draw_circle(c - Vector2(0, 1.5), r - 2, UITheme.GOLD)
	draw_circle(c - Vector2(0, 1.5), r * 0.55, UITheme.GOLD.lightened(0.25))
