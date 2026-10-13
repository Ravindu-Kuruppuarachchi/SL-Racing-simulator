class_name Showroom
extends Node3D
# The 3D scene behind the menus: your car on a turntable under studio lights, on a
# glossy floor that fades into the dark. Drag to spin the car.

var camera: Camera3D
var turntable: Node3D
var car_node: Node3D
var car_key := ""
var spin := 0.0
var spin_speed := 0.35
var dragging := false
var target_offset := Vector2.ZERO
var target_zoom := 1.0
var zoom := 1.0


func _ready() -> void:
	var env := Environment.new()
	# the backdrop is a gradient drawn on a canvas layer behind the 3D
	env.background_mode = Environment.BG_CANVAS
	env.background_canvas_max_layer = -1
	var back := CanvasLayer.new()
	back.layer = -1
	add_child(back)
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.3, 1.0])
	g.colors = PackedColorArray([Color("#2a4f93"), Color("#14264d"), Color("#070d1c")])
	var tex := GradientTexture2D.new()
	tex.gradient = g
	tex.fill_from = Vector2(0.5, 0)
	tex.fill_to = Vector2(0.5, 1)
	tex.width = 4
	tex.height = 256
	var rect := TextureRect.new()
	rect.texture = tex
	rect.stretch_mode = TextureRect.STRETCH_SCALE
	rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	back.add_child(rect)
	var sky := Sky.new()
	var pano := PanoramaSkyMaterial.new()
	pano.panorama = load("res://assets/hdri/kloofendal_48d_partly_cloudy_puresky.hdr")
	sky.sky_material = pano
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.7
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.1
	env.glow_enabled = true
	env.glow_intensity = 0.6
	env.glow_bloom = 0.05
	env.fog_enabled = true
	env.fog_light_color = Color("#14264d")
	env.fog_density = 0.07
	env.fog_sky_affect = 0.0
	env.adjustment_enabled = true
	env.adjustment_saturation = 1.1
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	camera = Camera3D.new()
	camera.fov = 38
	camera.position = Vector3(0, 2.6, 9.5)
	camera.look_at_from_position(camera.position, Vector3(0, 0.8, 0))
	add_child(camera)
	camera.make_current()
	var key := DirectionalLight3D.new()
	key.rotation = Vector3(deg_to_rad(-50), deg_to_rad(-30), 0)
	key.light_energy = 1.4
	key.shadow_enabled = true
	add_child(key)
	for p in [Vector3(-5, 4, 3), Vector3(5, 3, -3)]:
		var spot := OmniLight3D.new()
		spot.position = p
		spot.omni_range = 14
		spot.light_energy = 0.9
		spot.light_color = Color(1.0, 0.75, 0.5) if p.x < 0 else Color(0.5, 0.75, 1.0)
		add_child(spot)
	# the floor and the turntable
	var floor_ := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(400, 400)
	floor_.mesh = pm
	floor_.material_override = Looks.plain(Color(0.08, 0.1, 0.17), 0.6, 0.0)
	add_child(floor_)
	turntable = Node3D.new()
	add_child(turntable)
	var disc := MeshInstance3D.new()
	disc.mesh = Props.cyl(3.4, 3.5, 0.16, 64)
	disc.material_override = Looks.plain(Color(0.12, 0.14, 0.2), 0.3, 0.6)
	disc.position.y = 0.08
	turntable.add_child(disc)
	var ring := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 3.42
	torus.outer_radius = 3.55
	torus.rings = 64
	ring.mesh = torus
	ring.material_override = Looks.plain(UITheme.ACCENT, 0.4, 0.0, 1.2)
	ring.position.y = 0.12
	add_child(ring)


func show_car(id: String, paint: String, screen_pos: Vector2, zoom := 1.0) -> void:
	visible = id != ""
	target_zoom = zoom
	camera.current = true
	var key := id + ":" + paint
	if key != car_key:
		car_key = key
		if car_node:
			car_node.queue_free()
			car_node = null
		if id != "":
			car_node = CarView.build_model(Cars.get_car(id), paint)
			car_node.position.y = 0.16
			turntable.add_child(car_node)
			# pop in
			car_node.scale *= 0.85
			create_tween().tween_property(car_node, "scale", car_node.scale / 0.85, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	# put the car at that point of the screen by shifting the view
	target_offset = Vector2((0.5 - screen_pos.x) * 7.5, (screen_pos.y - 0.5) * 4.0) if id != "" else Vector2.ZERO


func _process(dt: float) -> void:
	if not dragging:
		spin_speed = lerpf(spin_speed, 0.35, minf(1.0, dt * 2))
	spin += spin_speed * dt
	turntable.rotation.y = spin
	zoom = lerpf(zoom, target_zoom, minf(1.0, dt * 6))
	camera.position = Vector3(0, 0.8, 0) + Vector3(0, 1.8, 9.5) * zoom
	camera.look_at(Vector3(0, 0.8, 0))
	camera.h_offset = lerpf(camera.h_offset, target_offset.x * zoom, minf(1.0, dt * 6))
	camera.v_offset = lerpf(camera.v_offset, target_offset.y, minf(1.0, dt * 6))


func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventScreenTouch:
		dragging = e.pressed
	elif e is InputEventScreenDrag:
		spin_speed = e.relative.x * 0.6
