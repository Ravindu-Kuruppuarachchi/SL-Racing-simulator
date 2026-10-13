class_name Sky3D
# The sky (a Poly Haven HDRI), sunlight with soft shadows, haze and a filmic grade.


static func environment(look: Dictionary) -> Environment:
	var env := Environment.new()
	var sky := Sky.new()
	var mat := PanoramaSkyMaterial.new()
	mat.panorama = load("res://assets/hdri/%s.hdr" % look.sky)
	mat.energy_multiplier = 1.0
	sky.sky_material = mat
	sky.radiance_size = Sky.RADIANCE_SIZE_128
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 1.0
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.05
	env.tonemap_white = 6.0
	env.glow_enabled = true
	env.glow_intensity = 0.5
	env.glow_strength = 0.9
	env.glow_bloom = 0.04
	env.glow_hdr_threshold = 1.1
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SOFTLIGHT
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_EXPONENTIAL
	env.fog_light_color = look.fog
	env.fog_density = look.fog_density
	env.fog_aerial_perspective = 0.6
	env.fog_sky_affect = 0.15
	env.adjustment_enabled = true
	env.adjustment_saturation = 1.15
	env.adjustment_contrast = 1.06
	return env


static func sun(look: Dictionary) -> DirectionalLight3D:
	var l := DirectionalLight3D.new()
	l.light_color = Color(1.0, 0.95, 0.86)
	l.light_energy = 1.35
	l.rotation = Vector3(deg_to_rad(-48), deg_to_rad(35), 0)
	l.shadow_enabled = true
	l.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	l.directional_shadow_max_distance = 150.0
	l.shadow_blur = 1.2
	l.shadow_bias = 0.04
	l.shadow_normal_bias = 1.5
	if look.fog_density > 0.004:
		l.light_energy = 1.05 # misty mountains: softer light
	return l
