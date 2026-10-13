class_name Looks
# Shared materials and models: the road, terrain, water and verge shaders, plain colours,
# and the Kenney models (loaded once, meshes pulled out for MultiMeshes).

static var _cache := {}
static var _models := {}

const TERRAIN_SHADER := """
shader_type spatial;
render_mode cull_back;
uniform sampler2D grass_albedo : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D grass_normal : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D soil_albedo : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D soil_normal : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform vec3 tint = vec3(1.0);
uniform vec3 soil_tint = vec3(1.0);
uniform float scale = 0.11;
varying vec3 wpos;
varying vec3 wnorm;
void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wnorm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
	TANGENT = normalize(vec3(1.0, 0.0, 0.0) - NORMAL * NORMAL.x);
	BINORMAL = normalize(cross(NORMAL, TANGENT));
}
void fragment() {
	vec2 uv = wpos.xz * scale;
	vec3 g = texture(grass_albedo, uv).rgb * 0.55 + texture(grass_albedo, uv * 0.23 + 0.37).rgb * 0.45;
	vec3 s = texture(soil_albedo, uv * 0.7).rgb;
	float big = texture(grass_albedo, uv * 0.031).g;
	float slope = 1.0 - wnorm.y;
	float m = clamp(max(smoothstep(0.32, 0.55, slope + (big - 0.4) * 0.3), COLOR.r), 0.0, 1.0);
	ALBEDO = mix(g * tint * (0.85 + big * 0.35), s * soil_tint, m) * COLOR.g;
	NORMAL_MAP = mix(texture(grass_normal, uv).rgb, texture(soil_normal, uv * 0.7).rgb, m);
	ROUGHNESS = 0.92;
	SPECULAR = 0.25;
}
"""

const ROAD_SHADER := """
shader_type spatial;
uniform sampler2D albedo_tex : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D normal_tex : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D rough_tex : hint_roughness_g, filter_linear_mipmap_anisotropic, repeat_enable;
uniform vec3 tint = vec3(0.62, 0.62, 0.66);
uniform vec3 centre_colour : source_color = vec3(1.0, 0.85, 0.2);
uniform float half_width = 7.0;
uniform float lines = 1.0; // painted lines (tarmac) or none (a sand track)
uniform float uv_scale = 6.0;
void fragment() {
	// UV.x: metres across the road (0 at the left edge); UV.y: metres along it
	vec2 uv = vec2(UV.x, UV.y) / uv_scale;
	vec3 a = texture(albedo_tex, uv).rgb * tint;
	float x = UV.x;
	float w = half_width * 2.0;
	// worn, darker tyre tracks along the racing lines
	float wob = sin(UV.y * 0.05) * 0.8;
	float ruts = exp(-pow((x - w * 0.32 - wob) / 1.1, 2.0)) + exp(-pow((x - w * 0.68 - wob) / 1.1, 2.0));
	a *= 1.0 - ruts * 0.22 * (1.0 - lines * 0.6);
	float edge = step(0.35, x) * step(x, 0.6) + step(w - 0.6, x) * step(x, w - 0.35);
	float dash = step(abs(x - half_width), 0.12) * step(fract(UV.y / 9.0), 0.55);
	float worn = texture(albedo_tex, uv * 0.37).r;
	vec3 paint = mix(vec3(0.95), centre_colour, dash);
	float m = clamp(edge + dash, 0.0, 1.0) * smoothstep(0.12, 0.3, worn + 0.15) * lines;
	ALBEDO = mix(a, paint, m);
	NORMAL_MAP = texture(normal_tex, uv).rgb;
	ROUGHNESS = mix(texture(rough_tex, uv).g, 0.5, m);
	SPECULAR = 0.4;
}
"""

const WATER_SHADER := """
shader_type spatial;
render_mode blend_mix, cull_disabled, depth_draw_always;
uniform vec3 deep : source_color = vec3(0.02, 0.22, 0.32);
uniform vec3 shallow : source_color = vec3(0.1, 0.55, 0.6);
uniform sampler2D wave : hint_normal, filter_linear_mipmap, repeat_enable;
uniform float alpha = 0.86;
varying vec3 wpos;
void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}
void fragment() {
	vec2 uv = wpos.xz * 0.04;
	vec3 n1 = texture(wave, uv + TIME * vec2(0.012, 0.007)).rgb;
	vec3 n2 = texture(wave, uv * 1.7 - TIME * vec2(0.009, -0.013)).rgb;
	NORMAL_MAP = normalize(mix(n1, n2, 0.5));
	NORMAL_MAP_DEPTH = 0.6;
	float fres = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 4.0);
	ALBEDO = mix(shallow, deep, 0.6 + 0.4 * fres);
	METALLIC = 0.0;
	ROUGHNESS = 0.04;
	SPECULAR = 0.7;
	ALPHA = mix(alpha, 1.0, fres);
}
"""

# a flat stripe pattern along the road edge (kerbs) or across it (start line)
const KERB_SHADER := """
shader_type spatial;
uniform vec3 a : source_color = vec3(0.85, 0.08, 0.1);
uniform vec3 b : source_color = vec3(0.95, 0.95, 0.95);
uniform float period = 2.0;
void fragment() {
	ALBEDO = mix(a, b, step(0.5, fract(UV.y / period)));
	ROUGHNESS = 0.6;
}
"""

const PAD_SHADER := """
shader_type spatial;
render_mode blend_add, unshaded, cull_disabled;
uniform vec3 colour : source_color = vec3(0.1, 0.8, 1.0);
void fragment() {
	// chevrons pointing along +V that run forwards
	float y = UV.y * 3.0 - TIME * 2.5;
	float chev = fract(y + abs(UV.x - 0.5) * 1.6);
	float m = smoothstep(0.45, 0.55, chev) * (1.0 - smoothstep(0.75, 0.85, chev));
	float edge = smoothstep(0.0, 0.08, UV.x) * smoothstep(1.0, 0.92, UV.x);
	ALBEDO = colour * (m * 1.8 + 0.25) * edge;
}
"""


static func tex(path: String) -> Texture2D:
	var key: String = "tex:" + path
	if not _cache.has(key):
		_cache[key] = load(path)
	return _cache[key]


static func surface(name: String) -> Array:
	# [albedo, normal, rough] from res://assets/textures/<name>
	var base := "res://assets/textures/%s/" % name
	return [tex(base + "albedo.jpg"), tex(base + "normal.jpg"), tex(base + "rough.jpg")]


static func shader(code: String) -> Shader:
	var key: String = "sh:" + str(code.hash())
	if not _cache.has(key):
		var s := Shader.new()
		s.code = code
		_cache[key] = s
	return _cache[key]


static func terrain(look: Dictionary) -> ShaderMaterial:
	var key: String = "terrain:" + look.ground + look.soil + str(look.tint)
	if not _cache.has(key):
		var m := ShaderMaterial.new()
		m.shader = shader(TERRAIN_SHADER)
		var g := surface(look.ground)
		var s := surface(look.soil)
		m.set_shader_parameter("grass_albedo", g[0])
		m.set_shader_parameter("grass_normal", g[1])
		m.set_shader_parameter("soil_albedo", s[0])
		m.set_shader_parameter("soil_normal", s[1])
		m.set_shader_parameter("tint", Vector3(look.tint.r, look.tint.g, look.tint.b))
		_cache[key] = m
	return _cache[key]


static func road(kind := "asphalt") -> ShaderMaterial:
	var key := "road:" + kind
	if not _cache.has(key):
		var m := ShaderMaterial.new()
		m.shader = shader(ROAD_SHADER)
		var a := surface("coast_sand_01" if kind == "sand" else "asphalt_02")
		m.set_shader_parameter("albedo_tex", a[0])
		m.set_shader_parameter("normal_tex", a[1])
		m.set_shader_parameter("rough_tex", a[2])
		m.set_shader_parameter("half_width", Track.ROAD_HALF)
		if kind == "sand":
			# packed, damp sand: a little darker and warmer than the beach
			m.set_shader_parameter("tint", Vector3(1.12, 0.98, 0.8))
			m.set_shader_parameter("lines", 0.0)
			m.set_shader_parameter("uv_scale", 3.0)
		_cache[key] = m
	return _cache[key]


static func water(deep := Color(0.02, 0.22, 0.32), shallow := Color(0.1, 0.55, 0.6), alpha := 0.86) -> ShaderMaterial:
	var key: String = "water:%s%s%s" % [deep, shallow, alpha]
	if not _cache.has(key):
		var m := ShaderMaterial.new()
		m.shader = shader(WATER_SHADER)
		m.set_shader_parameter("deep", deep)
		m.set_shader_parameter("shallow", shallow)
		m.set_shader_parameter("alpha", alpha)
		var nt := NoiseTexture2D.new()
		nt.width = 512
		nt.height = 512
		nt.seamless = true
		nt.as_normal_map = true
		nt.bump_strength = 6.0
		var fn := FastNoiseLite.new()
		fn.frequency = 0.02
		fn.fractal_octaves = 4
		nt.noise = fn
		m.set_shader_parameter("wave", nt)
		_cache[key] = m
	return _cache[key]


static func kerb(a := Color(0.85, 0.08, 0.1), b := Color(0.95, 0.95, 0.95), period := 2.0) -> ShaderMaterial:
	var key: String = "kerb:%s%s%s" % [a, b, period]
	if not _cache.has(key):
		var m := ShaderMaterial.new()
		m.shader = shader(KERB_SHADER)
		m.set_shader_parameter("a", a)
		m.set_shader_parameter("b", b)
		m.set_shader_parameter("period", period)
		_cache[key] = m
	return _cache[key]


static func pad() -> ShaderMaterial:
	if not _cache.has("pad"):
		var m := ShaderMaterial.new()
		m.shader = shader(PAD_SHADER)
		_cache["pad"] = m
	return _cache["pad"]


## A plain PBR colour (cached).
static func plain(c: Color, rough := 0.7, metal := 0.0, emit := 0.0) -> StandardMaterial3D:
	var key: String = "plain:%s:%s:%s:%s" % [c.to_html(), rough, metal, emit]
	if not _cache.has(key):
		var m := StandardMaterial3D.new()
		m.albedo_color = c
		m.roughness = rough
		m.metallic = metal
		if emit > 0:
			m.emission_enabled = true
			m.emission = c
			m.emission_energy_multiplier = emit
		if c.a < 1:
			m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_cache[key] = m
	return _cache[key]


static func textured(name: String, uv_scale := 0.25, tint := Color.WHITE, triplanar := true) -> StandardMaterial3D:
	var key: String = "textured:%s:%s:%s" % [name, uv_scale, tint]
	if not _cache.has(key):
		var t := surface(name)
		var m := StandardMaterial3D.new()
		m.albedo_texture = t[0]
		m.normal_enabled = true
		m.normal_texture = t[1]
		m.roughness_texture = t[2]
		m.albedo_color = tint
		m.uv1_triplanar = triplanar
		m.uv1_world_triplanar = triplanar
		m.uv1_scale = Vector3.ONE * uv_scale
		m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
		_cache[key] = m
	return _cache[key]


# ---- Kenney models -----------------------------------------------------------------------------
static func model_path(name: String) -> String:
	for dir in ["nature", "city", "suburb", "racing", "cars"]:
		var p := "res://assets/%s/%s.glb" % [dir, name]
		if ResourceLoader.exists(p):
			return p
	push_error("no model " + name)
	return ""


static func scene(name: String) -> PackedScene:
	if not _models.has(name):
		_models[name] = load(model_path(name))
	return _models[name]


static func instance(name: String) -> Node3D:
	return scene(name).instantiate()


## The model flattened into one mesh (all its parts, in model space), for MultiMeshes.
static func mesh(name: String) -> Mesh:
	var key: String = "mesh:" + name
	if _cache.has(key):
		return _cache[key]
	var root := instance(name)
	var st := SurfaceTool.new()
	var out := ArrayMesh.new()
	var by_material := {}
	_collect(root, Transform3D.IDENTITY, by_material)
	var nature := model_path(name).contains("/nature/")
	for mat in by_material:
		st.clear()
		for part in by_material[mat]:
			st.append_from(part[0], part[1], part[2])
		st.set_material(_greener(mat) if nature else mat)
		st.commit(out)
	root.free()
	_cache[key] = out
	return out


## Kenney's foliage is teal: turn it a richer tropical green.
static func _greener(mat: Material) -> Material:
	var m := mat as StandardMaterial3D
	if m == null:
		return mat
	var c := m.albedo_color
	if c.h > 0.36 and c.h < 0.56 and c.s > 0.2:
		var m2: StandardMaterial3D = m.duplicate()
		m2.albedo_color = Color.from_hsv(lerpf(c.h, 0.3, 0.75), minf(1.0, c.s * 1.15), c.v * 0.92)
		m2.roughness = 0.85
		return m2
	return mat


static func _collect(n: Node, xf: Transform3D, by_material: Dictionary) -> void:
	var here := xf
	if n is Node3D:
		here = xf * (n as Node3D).transform
	if n is MeshInstance3D:
		var mi := n as MeshInstance3D
		for si in mi.mesh.get_surface_count():
			var mat := mi.get_active_material(si)
			if not by_material.has(mat):
				by_material[mat] = []
			by_material[mat].append([mi.mesh, si, here])
	for c in n.get_children():
		_collect(c, here, by_material)


static func aabb(name: String) -> AABB:
	return mesh(name).get_aabb()
