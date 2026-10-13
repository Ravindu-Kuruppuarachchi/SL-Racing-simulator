class_name ItemIcon
extends Control
# The power-up held, drawn in the fire button: a Vesak rocket, coconuts, an oil drum,
# a shield or a nitro bottle. Empty: a faint "?" box outline.

var kind := ""
var t := 0.0


func _process(dt: float) -> void:
	t += dt


func _draw() -> void:
	var c := size / 2
	var r := minf(size.x, size.y) * 0.32
	match kind:
		"":
			draw_arc(c, r, 0, TAU, 32, Color(1, 1, 1, 0.25), 3, true)
			var f := UITheme.title_font
			draw_string(f, c + Vector2(-10, 14), "?", HORIZONTAL_ALIGNMENT_LEFT, -1, 38, Color(1, 1, 1, 0.3))
		"rocket":
			var body := PackedVector2Array([c + Vector2(-r * 0.25, r * 0.6), c + Vector2(-r * 0.25, -r * 0.35), c + Vector2(0, -r * 0.95), c + Vector2(r * 0.25, -r * 0.35), c + Vector2(r * 0.25, r * 0.6)])
			draw_colored_polygon(body, Color("#e2323c"))
			draw_colored_polygon(PackedVector2Array([c + Vector2(-r * 0.25, r * 0.2), c + Vector2(-r * 0.6, r * 0.7), c + Vector2(-r * 0.25, r * 0.6)]), Color("#ffd23f"))
			draw_colored_polygon(PackedVector2Array([c + Vector2(r * 0.25, r * 0.2), c + Vector2(r * 0.6, r * 0.7), c + Vector2(r * 0.25, r * 0.6)]), Color("#ffd23f"))
			draw_circle(c + Vector2(0, r * 0.85 + sin(t * 30) * 2), r * 0.22, Color("#ff9d2e"))
			draw_circle(c + Vector2(0, -r * 0.1), r * 0.13, Color(1, 1, 1, 0.9))
		"coconut":
			for o in [Vector2(-r * 0.45, r * 0.25), Vector2(r * 0.45, r * 0.25), Vector2(0, -r * 0.35)]:
				draw_circle(c + o, r * 0.42, Color("#f08a1c"))
				draw_circle(c + o + Vector2(-r * 0.12, -r * 0.12), r * 0.12, Color(1, 1, 1, 0.35))
		"oil":
			draw_rect(Rect2(c - Vector2(r * 0.5, r * 0.7), Vector2(r, r * 1.4)), Color("#2b2f38"))
			draw_rect(Rect2(c - Vector2(r * 0.5, r * 0.25), Vector2(r, r * 0.12)), Color("#ffd23f"))
			draw_rect(Rect2(c - Vector2(r * 0.5, -r * 0.2), Vector2(r, r * 0.12)), Color("#ffd23f"))
			draw_circle(c + Vector2(r * 0.6, r * 0.75), r * 0.2, Color("#111"))
		"shield":
			var pts := PackedVector2Array([c + Vector2(-r * 0.7, -r * 0.7), c + Vector2(r * 0.7, -r * 0.7), c + Vector2(r * 0.65, 0), c + Vector2(0, r * 0.85), c + Vector2(-r * 0.65, 0)])
			draw_colored_polygon(pts, Color("#29b6f6"))
			draw_colored_polygon(PackedVector2Array([c + Vector2(-r * 0.45, -r * 0.5), c + Vector2(0, -r * 0.5), c + Vector2(0, r * 0.55), c + Vector2(-r * 0.45, 0)]), Color(1, 1, 1, 0.35))
		"boost":
			draw_rect(Rect2(c - Vector2(r * 0.32, r * 0.55), Vector2(r * 0.64, r * 1.25)), Color("#2f7de1"))
			draw_rect(Rect2(c - Vector2(r * 0.14, r * 0.85), Vector2(r * 0.28, r * 0.32)), Color("#cfd8e3"))
			draw_string(UITheme.title_font, c + Vector2(-r * 0.28, r * 0.35), "N", HORIZONTAL_ALIGNMENT_LEFT, -1, int(r * 0.9), Color.WHITE)
