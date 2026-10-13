class_name CarView
extends Node3D
# A car on screen: its Kenney model repainted in the chosen colour (the body's palette
# colour is swapped for the paint, with a clear-coat), wheels that spin and steer, and
# effects: tyre smoke in drifts, nitro flames, dust off the road, a shield bubble.

const PAINT_SHADER := """
shader_type spatial;
uniform sampler2D tex : source_color, filter_nearest;
uniform vec3 body; // hue, saturation, value of the body paint (sRGB)
uniform vec3 paint : source_color;
uniform float use_tex = 1.0;
uniform vec3 flat_colour : source_color = vec3(1.0);
vec3 hsv(vec3 c) {
	vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
	vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
	vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
	float d = q.x - min(q.w, q.y);
	return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
void fragment() {
	vec3 c = use_tex > 0.5 ? texture(tex, UV).rgb : flat_colour;
	vec3 h = hsv(pow(c, vec3(1.0 / 2.2)));
	float dh = abs(h.x - body.x);
	dh = min(dh, 1.0 - dh);
	float m = (1.0 - smoothstep(0.04, 0.07, dh)) * smoothstep(0.18, 0.28, h.y);
	float shade = pow(clamp(h.z / max(0.05, body.z), 0.55, 1.25), 2.2);
	ALBEDO = mix(c, paint * shade, m);
	METALLIC = m * 0.45;
	ROUGHNESS = mix(0.6, 0.22, m);
	CLEARCOAT = m;
	CLEARCOAT_ROUGHNESS = 0.08;
	// glass: Kenney's pale blue-white windows become dark, glossy tinted glass
	float glassy = use_tex * smoothstep(0.8, 0.86, h.z) * (1.0 - smoothstep(0.05, 0.1, h.y)) * (1.0 - m);
	ALBEDO = mix(ALBEDO, vec3(0.02, 0.03, 0.045), glassy);
	ROUGHNESS = mix(ROUGHNESS, 0.04, glassy);
	METALLIC = mix(METALLIC, 0.9, glassy);
}
"""

static var _body_cache := {}

var sim: CarSim
var model: Node3D
var wheels: Array = [] # [[node, front?, radius]]
var wheel_spin := 0.0
var smoke: GPUParticles3D
var flames: Array = []
var dust: GPUParticles3D
var splash: GPUParticles3D
var shield: MeshInstance3D
var steer_shown := 0.0
var holder: Node3D


static func build_model(car: Dictionary, paint_id: String) -> Node3D:
	var m := Looks.instance(car.model)
	var paint: Color = Cars.PAINTS.get(paint_id, Cars.PAINTS.red)[1]
	var body := body_colour(car.model, m)
	_repaint(m, body, paint)
	m.scale = Vector3.ONE * car.scale
	return m


## The body's paint as (hue, saturation, value): the saturated hue covering the most surface.
static func body_colour(model_name: String, root: Node) -> Color:
	if _body_cache.has(model_name):
		return _body_cache[model_name]
	var area := {}
	_measure(root, area)
	var bins := {}
	for c in area:
		var col: Color = c
		if col.s < 0.28:
			continue
		var bin := int(col.h * 20.0) % 20
		if not bins.has(bin):
			bins[bin] = [0.0, 0.0, 0.0] # area, area * hue, area * value
		bins[bin][0] += area[c]
		bins[bin][1] += area[c] * col.h
		bins[bin][2] += area[c] * col.v
	var best = null
	for bin in bins:
		# merge each bin with its neighbours so a hue split across two bins still wins
		var total: float = bins[bin][0] + bins.get((bin + 1) % 20, [0.0])[0] + bins.get((bin + 19) % 20, [0.0])[0]
		if best == null or total > best[0]:
			best = [total, bin]
	var out := Color(0, 0, 1)
	if best != null:
		var b: Array = bins[best[1]]
		out = Color(b[1] / b[0], 0.6, b[2] / b[0])
	_body_cache[model_name] = out
	return out


static func _measure(n: Node, area: Dictionary) -> void:
	if n is MeshInstance3D and not String(n.name).begins_with("wheel"):
		var mi := n as MeshInstance3D
		for si in mi.mesh.get_surface_count():
			var mat := mi.get_active_material(si) as StandardMaterial3D
			var arrays := mi.mesh.surface_get_arrays(si)
			var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
			var uvs = arrays[Mesh.ARRAY_TEX_UV]
			var ind = arrays[Mesh.ARRAY_INDEX]
			var img: Image = null
			if mat and mat.albedo_texture:
				img = mat.albedo_texture.get_image()
				if img.is_compressed():
					img = img.duplicate()
					img.decompress()
			var tri_count: int = (ind.size() if ind else verts.size()) / 3
			for t in tri_count:
				var i0: int = ind[t * 3] if ind else t * 3
				var i1: int = ind[t * 3 + 1] if ind else t * 3 + 1
				var i2: int = ind[t * 3 + 2] if ind else t * 3 + 2
				var a := (verts[i1] - verts[i0]).cross(verts[i2] - verts[i0]).length() / 2
				var col: Color = mat.albedo_color if mat else Color.WHITE
				if img and uvs:
					var uv: Vector2 = (uvs[i0] + uvs[i1] + uvs[i2]) / 3.0
					col = img.get_pixel(clampi(int(uv.x * img.get_width()), 0, img.get_width() - 1), clampi(int(uv.y * img.get_height()), 0, img.get_height() - 1))
				var key := Color(snappedf(col.r, 0.02), snappedf(col.g, 0.02), snappedf(col.b, 0.02))
				area[key] = area.get(key, 0.0) + a
	for c in n.get_children():
		_measure(c, area)


static func _repaint(n: Node, body: Color, paint: Color) -> void:
	if n is MeshInstance3D:
		var mi := n as MeshInstance3D
		for si in mi.mesh.get_surface_count():
			var mat := mi.get_active_material(si) as StandardMaterial3D
			var sm := ShaderMaterial.new()
			sm.shader = Looks.shader(PAINT_SHADER)
			sm.set_shader_parameter("body", body)
			sm.set_shader_parameter("paint", paint)
			if mat and mat.albedo_texture:
				sm.set_shader_parameter("tex", mat.albedo_texture)
				sm.set_shader_parameter("use_tex", 1.0)
			else:
				sm.set_shader_parameter("use_tex", 0.0)
				sm.set_shader_parameter("flat_colour", mat.albedo_color if mat else Color.WHITE)
			mi.set_surface_override_material(si, sm)
	for c in n.get_children():
		_repaint(c, body, paint)


func setup(c: CarSim) -> void:
	sim = c
	holder = Node3D.new()
	add_child(holder)
	model = build_model(c.car, c.paint)
	holder.add_child(model)
	_find_wheels(model)
	_effects()


func _find_wheels(n: Node) -> void:
	var nm := String(n.name).to_lower()
	if nm.begins_with("wheel") and n is MeshInstance3D:
		var front := nm.contains("front")
		var r: float = (n as MeshInstance3D).get_aabb().size.y / 2 * sim.car.scale
		wheels.append([n, front, maxf(0.1, r)])
	for c in n.get_children():
		_find_wheels(c)


func _particles(amount: int, life: float, colour_a: Color, colour_b: Color, size: float, speed: float, gravity: float, additive := false) -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.amount = amount
	p.lifetime = life
	p.emitting = false
	p.local_coords = false
	var pm := ParticleProcessMaterial.new()
	pm.direction = Vector3(0, 1, 0)
	pm.spread = 35.0
	pm.initial_velocity_min = speed * 0.5
	pm.initial_velocity_max = speed
	pm.gravity = Vector3(0, gravity, 0)
	pm.damping_min = 1.0
	pm.damping_max = 2.0
	pm.scale_min = 0.6
	pm.scale_max = 1.2
	var curve := Curve.new()
	curve.add_point(Vector2(0, 0.4))
	curve.add_point(Vector2(1, 1.6))
	var ct := CurveTexture.new()
	ct.curve = curve
	pm.scale_curve = ct
	var grad := Gradient.new()
	grad.set_color(0, colour_a)
	grad.set_color(1, colour_b)
	var gt := GradientTexture1D.new()
	gt.gradient = grad
	pm.color_ramp = gt
	p.process_material = pm
	var quad := QuadMesh.new()
	quad.size = Vector2(size, size)
	var mat := StandardMaterial3D.new()
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.vertex_color_use_as_albedo = true
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	mat.albedo_texture = _soft_dot()
	if additive:
		mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	quad.material = mat
	p.draw_pass_1 = quad
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return p


static var _dot: Texture2D


static func _soft_dot() -> Texture2D:
	if _dot == null:
		var g := Gradient.new()
		g.set_color(0, Color(1, 1, 1, 1))
		g.set_color(1, Color(1, 1, 1, 0))
		var t := GradientTexture2D.new()
		t.gradient = g
		t.fill = GradientTexture2D.FILL_RADIAL
		t.fill_from = Vector2(0.5, 0.5)
		t.fill_to = Vector2(1.0, 0.5)
		t.width = 64
		t.height = 64
		_dot = t
	return _dot


func _effects() -> void:
	var len = 2.6 * sim.car.scale / 1.6
	smoke = _particles(48, 1.2, Color(0.9, 0.9, 0.9, 0.5), Color(0.8, 0.8, 0.8, 0.0), 1.4, 1.5, 0.8)
	smoke.position = Vector3(0, 0.3, -len * 0.35)
	holder.add_child(smoke)
	dust = _particles(40, 1.0, Color(0.6, 0.5, 0.38, 0.5), Color(0.6, 0.5, 0.4, 0.0), 1.6, 2.0, 0.4)
	dust.position = Vector3(0, 0.3, -len * 0.4)
	holder.add_child(dust)
	splash = _particles(60, 0.7, Color(0.85, 0.95, 1.0, 0.8), Color(0.8, 0.9, 1.0, 0.0), 0.8, 6.0, -12.0)
	splash.position = Vector3(0, 0.2, 0)
	(splash.process_material as ParticleProcessMaterial).spread = 70.0
	holder.add_child(splash)
	for x in [-0.3, 0.3]:
		var f := _particles(24, 0.25, Color(0.6, 0.85, 1.0, 1.0), Color(1.0, 0.4, 0.1, 0.0), 0.7, 5.0, 0.0, true)
		f.position = Vector3(x * sim.car.scale / 1.6, 0.45, -len * 0.5)
		(f.process_material as ParticleProcessMaterial).direction = Vector3(0, 0.1, -1)
		(f.process_material as ParticleProcessMaterial).spread = 8.0
		f.local_coords = true
		holder.add_child(f)
		flames.append(f)
	shield = Props.shield_bubble()
	shield.visible = false
	holder.add_child(shield)


func sync(steer: float, dt: float) -> void:
	var t := sim.track
	var p := t.point(sim.s, sim.d)
	p.y = sim.y
	var heading := t.heading_at(sim.s) + sim.psi
	position = p
	rotation = Vector3(0, PI / 2 - heading, 0)
	holder.rotation = Vector3(-sim.pitch(), sim.spin_angle, -steer_shown * 0.04 * minf(1.0, absf(sim.v) / 20.0))
	steer_shown = lerpf(steer_shown, steer, minf(1.0, dt * 10))
	wheel_spin += sim.v * dt
	for w in wheels:
		var node: Node3D = w[0]
		node.rotation = Vector3(wheel_spin / w[2], steer_shown * 0.45 if w[1] else 0.0, 0)
	var on_ground := sim.grounded
	smoke.emitting = on_ground and sim.drift > 0.3 and absf(sim.v) > 8
	dust.emitting = on_ground and absf(sim.d) > Track.ROAD_HALF and absf(sim.v) > 6
	splash.emitting = sim.splash > 0.2
	for f in flames:
		f.emitting = sim.boost > 0
	shield.visible = sim.shield > 0
