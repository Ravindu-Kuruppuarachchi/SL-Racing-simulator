class_name UITheme
# The look of every menu and the HUD: Exo 2 for text and Russo One for titles, glassy
# dark panels with soft shadows, and chunky rounded buttons with a pressed-in bottom edge.

const ACCENT := Color("#ff8a1f")
const ACCENT_DARK := Color("#b8520c")
const GOLD := Color("#ffd23f")
const INK := Color("#0b1220")
const PANEL := Color(0.05, 0.08, 0.15, 0.84)
const GOOD := Color("#2ecc71")
const SKY := Color("#29b6f6")

static var title_font: Font
static var body_font: Font
static var bold_font: Font


static func fonts() -> void:
	if title_font:
		return
	title_font = load("res://assets/fonts/RussoOne-Regular.ttf")
	var exo: FontFile = load("res://assets/fonts/Exo2.ttf")
	var body := FontVariation.new()
	body.base_font = exo
	body.variation_opentype = {TextServerManager.get_primary_interface().name_to_tag("wght"): 560}
	body_font = body
	var bold := FontVariation.new()
	bold.base_font = exo
	bold.variation_opentype = {TextServerManager.get_primary_interface().name_to_tag("wght"): 800}
	bold_font = bold


static func box(bg: Color, radius := 22, border := 0, border_colour := Color.TRANSPARENT, shadow := 0, bottom := 0, bottom_colour := Color.TRANSPARENT) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.set_corner_radius_all(radius)
	s.corner_detail = 10
	s.anti_aliasing = true
	if border > 0:
		s.set_border_width_all(border)
		s.border_color = border_colour
	if bottom > 0:
		s.border_width_bottom = bottom
		s.border_color = bottom_colour
	if shadow > 0:
		s.shadow_size = shadow
		s.shadow_color = Color(0, 0, 0, 0.35)
		s.shadow_offset = Vector2(0, shadow * 0.4)
	s.content_margin_left = 26
	s.content_margin_right = 26
	s.content_margin_top = 12
	s.content_margin_bottom = 12
	return s


static func button_styles(t: Theme, type: String, bg: Color, edge: Color, text: Color, radius := 22) -> void:
	var normal := box(bg, radius, 0, Color.TRANSPARENT, 8, 6, edge)
	var hover := box(bg.lightened(0.12), radius, 0, Color.TRANSPARENT, 10, 6, edge)
	var pressed := box(bg.darkened(0.08), radius, 0, Color.TRANSPARENT, 3, 2, edge)
	pressed.content_margin_top = 16
	var disabled := box(Color(0.35, 0.38, 0.45, 0.7), radius, 0, Color.TRANSPARENT, 0, 4, Color(0.2, 0.22, 0.28, 0.7))
	var focus := box(Color.TRANSPARENT, radius + 2, 3, Color(1, 1, 1, 0.8))
	t.set_stylebox("normal", type, normal)
	t.set_stylebox("hover", type, hover)
	t.set_stylebox("pressed", type, pressed)
	t.set_stylebox("disabled", type, disabled)
	t.set_stylebox("focus", type, focus)
	t.set_stylebox("hover_pressed", type, pressed)
	t.set_color("font_color", type, text)
	t.set_color("font_hover_color", type, text)
	t.set_color("font_pressed_color", type, text)
	t.set_color("font_focus_color", type, text)
	t.set_color("font_hover_pressed_color", type, text)
	t.set_color("font_disabled_color", type, Color(1, 1, 1, 0.55))


static func build() -> Theme:
	fonts()
	var t := Theme.new()
	t.default_font = body_font
	t.default_font_size = 24
	# buttons: the big orange ones, and quieter variations
	button_styles(t, "Button", ACCENT, ACCENT_DARK, Color.WHITE)
	t.set_font("font", "Button", title_font)
	t.set_font_size("font_size", "Button", 26)
	t.set_constant("outline_size", "Button", 0)
	for v in [["GhostButton", Color(1, 1, 1, 0.12), Color(1, 1, 1, 0.05), Color.WHITE], ["GreenButton", GOOD, GOOD.darkened(0.35), Color.WHITE], ["BlueButton", SKY, SKY.darkened(0.4), Color.WHITE], ["GoldButton", GOLD, GOLD.darkened(0.4), INK]]:
		t.set_type_variation(v[0], "Button")
		button_styles(t, v[0], v[1], v[2], v[3])
	t.set_type_variation("RoundButton", "Button")
	button_styles(t, "RoundButton", Color(1, 1, 1, 0.14), Color(0, 0, 0, 0.25), Color.WHITE, 60)
	t.set_font_size("font_size", "RoundButton", 34)
	t.set_type_variation("TabButton", "Button")
	button_styles(t, "TabButton", Color(1, 1, 1, 0.08), Color(0, 0, 0, 0.2), Color(1, 1, 1, 0.8), 16)
	t.set_font_size("font_size", "TabButton", 20)
	# panels
	t.set_stylebox("panel", "PanelContainer", box(PANEL, 26, 1, Color(1, 1, 1, 0.07), 18))
	t.set_type_variation("CardPanel", "PanelContainer")
	t.set_stylebox("panel", "CardPanel", box(Color(1, 1, 1, 0.07), 22, 2, Color(1, 1, 1, 0.1), 0))
	t.set_type_variation("SelectedCard", "PanelContainer")
	t.set_stylebox("panel", "SelectedCard", box(Color(1, 0.55, 0.12, 0.22), 22, 3, ACCENT, 10))
	t.set_type_variation("Pill", "PanelContainer")
	var pill := box(Color(0, 0, 0, 0.45), 40, 1, Color(1, 1, 1, 0.1), 0)
	pill.content_margin_top = 6
	pill.content_margin_bottom = 6
	pill.content_margin_left = 18
	pill.content_margin_right = 18
	t.set_stylebox("panel", "Pill", pill)
	# text
	t.set_color("font_color", "Label", Color(1, 1, 1, 0.95))
	t.set_color("font_shadow_color", "Label", Color(0, 0, 0, 0.35))
	t.set_constant("shadow_offset_y", "Label", 2)
	t.set_constant("shadow_offset_x", "Label", 0)
	for v in [["Title", title_font, 64], ["Heading", title_font, 36], ["Big", title_font, 46], ["Small", body_font, 19], ["Bold", bold_font, 24], ["Huge", title_font, 150]]:
		t.set_type_variation(v[0], "Label")
		t.set_font("font", v[0], v[1])
		t.set_font_size("font_size", v[0], v[2])
	t.set_color("font_color", "Small", Color(1, 1, 1, 0.7))
	t.set_constant("outline_size", "Huge", 18)
	t.set_color("font_outline_color", "Huge", Color(0.04, 0.06, 0.12))
	t.set_constant("outline_size", "Big", 10)
	t.set_color("font_outline_color", "Big", Color(0.04, 0.06, 0.12, 0.9))
	# progress bars (stats)
	t.set_stylebox("background", "ProgressBar", box(Color(1, 1, 1, 0.1), 8))
	t.set_stylebox("fill", "ProgressBar", box(ACCENT, 8))
	for sb in [t.get_stylebox("background", "ProgressBar"), t.get_stylebox("fill", "ProgressBar")]:
		sb.content_margin_top = 0
		sb.content_margin_bottom = 0
		sb.content_margin_left = 0
		sb.content_margin_right = 0
	t.set_constant("separation", "HBoxContainer", 14)
	t.set_constant("separation", "VBoxContainer", 12)
	# line edit (room code)
	var le := box(Color(1, 1, 1, 0.1), 18, 2, Color(1, 1, 1, 0.25))
	t.set_stylebox("normal", "LineEdit", le)
	t.set_stylebox("focus", "LineEdit", box(Color(1, 1, 1, 0.14), 18, 3, ACCENT))
	t.set_font("font", "LineEdit", title_font)
	t.set_font_size("font_size", "LineEdit", 40)
	t.set_color("font_color", "LineEdit", Color.WHITE)
	t.set_color("font_placeholder_color", "LineEdit", Color(1, 1, 1, 0.3))
	return t


## A full-screen gradient backdrop for the menus.
static func backdrop(top := Color("#13254a"), bottom := Color("#060a14")) -> TextureRect:
	var g := Gradient.new()
	g.set_color(0, top)
	g.set_color(1, bottom)
	var tex := GradientTexture2D.new()
	tex.gradient = g
	tex.fill_from = Vector2(0.5, 0)
	tex.fill_to = Vector2(0.5, 1)
	tex.width = 8
	tex.height = 256
	var r := TextureRect.new()
	r.texture = tex
	r.stretch_mode = TextureRect.STRETCH_SCALE
	r.set_anchors_preset(Control.PRESET_FULL_RECT)
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return r


static func label(text: String, variation := "", align := HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	var l := Label.new()
	l.text = text
	l.theme_type_variation = variation
	l.horizontal_alignment = align
	return l


static func button(text: String, variation := "", min_w := 0.0, cb: Callable = Callable()) -> Button:
	var b := Button.new()
	b.text = text
	b.theme_type_variation = variation
	b.custom_minimum_size = Vector2(min_w, 0)
	b.focus_mode = Control.FOCUS_NONE
	if cb.is_valid():
		b.pressed.connect(cb)
	return b
