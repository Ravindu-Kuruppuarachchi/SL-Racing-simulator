extends SceneTree
# Writes the circuit's layout (top-down) to a PNG and prints its tightest bend and features.
func _init():
	var id: String = OS.get_cmdline_user_args()[0]
	var out: String = OS.get_cmdline_user_args()[1]
	var t := Track.new(id, 1, 3)
	var img := Image.create(800, 800, false, Image.FORMAT_RGB8)
	img.fill(Color(0.1, 0.15, 0.25))
	var b := t.bounds
	var sc: float = 700.0 / maxf(b.x1 - b.x0, b.z1 - b.z0)
	var kmax := 0.0
	for i in t.n:
		kmax = maxf(kmax, absf(t.kappa[i]))
		var x := int(50 + (t.px[i] - b.x0) * sc)
		var y := int(50 + (t.pz[i] - b.z0) * sc)
		var sec = t.section_at(i * Track.STEP)
		var col := Color.WHITE if sec == null else Color.from_hsv(float(sec.type.hash() % 360) / 360.0, 0.8, 1.0)
		for dx in range(-2, 3):
			for dy in range(-2, 3):
				img.set_pixel(clampi(x + dx, 0, 799), clampi(y + dy, 0, 799), col)
	img.save_png(out)
	print("lap %.0f m, tightest bend radius %.0f m, heights %.1f..%.1f, turn %.2f" % [t.loop_len, 1.0 / kmax, t.py.to_byte_array().size(), 0, t.turn])
	for sec in t.sections:
		print("  %s %d-%d" % [sec.type, sec.s0, sec.s1])
	print("boxes per lap %d, coins %d, obstacles %d" % [t.lap_boxes, t.lap_coins, t.obstacles.size()])
	quit()
