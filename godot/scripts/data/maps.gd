class_name Maps
# The six routes: towns (the checkpoints), the landmark seen as you approach each town,
# which road sections appear ([section, weight at the start, weight at the end]) and the
# warning-sign labels, as in Tuk Tuk Climb (src/maps.js), plus each map's 3D look.
#
# look: ground textures (res://assets/textures/<name>), how much forest and town,
# which trees (Kenney nature kit), the sky (HDRI) and its haze.

const MAPS := [
	{
		"id": "beach", "name": "Palm Beach", "route": "3-lap circuit",
		"tagline": "Sun, sand and surf: a tropical island circuit",
		"towns": [], "landmarks": {}, "sections": [], "rocks": "granite",
		"hard": {"cave": "Tunnel", "bridge": "Lagoon bridge", "kicker": "Jumps", "ford": "Creek splash", "dunes": "Sand dunes"},
		# a hand-made loop: control points (x, height, z), the sea lies to the south (+z)
		"circuit": {
			"points": [
				Vector3(-60, 1.5, 10), Vector3(60, 1.2, 14), Vector3(180, 1.5, 6), Vector3(280, 2.5, -22),
				Vector3(345, 5.0, -85), Vector3(365, 9.0, -175), Vector3(325, 14.0, -262), Vector3(240, 17.0, -308),
				Vector3(140, 15.0, -298), Vector3(80, 11.0, -238), Vector3(55, 7.0, -160), Vector3(0, 4.0, -112),
				Vector3(-85, 3.0, -108), Vector3(-165, 4.0, -138), Vector3(-235, 5.0, -105), Vector3(-252, 3.0, -38),
				Vector3(-205, 1.8, 10), Vector3(-135, 1.5, 22),
			],
			"features": [
								{"type": "kicker", "at": 2, "offset": 30, "len": 44, "label": "Jump"},
				{"type": "rocky", "at": 4, "offset": 0, "len": 70, "label": "Rocks"},
				{"type": "cave", "at": 6, "offset": 10, "len": 85, "label": "Tunnel"},
				{"type": "dunes", "at": 9, "offset": 0, "len": 70, "label": "Bumps"},
				{"type": "bridge", "at": 11, "offset": -10, "len": 100, "label": "Bridge"},
				{"type": "ford", "at": 13, "offset": 0, "len": 46, "label": "Splash!"},
				{"type": "kicker", "at": 14, "offset": 20, "len": 44, "label": "Jump"},
				{"type": "dunes", "at": 16, "offset": 0, "len": 72, "label": "Sand dunes"},
			],
		},
		"look": {
			"ground": "leafy_grass", "soil": "coast_sand_01", "tint": Color(0.7, 1.0, 0.55),
			"trees": ["tree_palmTall", "tree_palm", "tree_palmBend", "tree_palmDetailedTall", "tree_palmShort", "tree_palmDetailedShort"],
			"bushes": ["plant_bushLarge", "plant_bush", "plant_bushDetailed", "flower_redA", "flower_yellowA", "flower_purpleA"],
			"forest": 0.7, "town": 0.0, "sky": "kloofendal_48d_partly_cloudy_puresky", "fog": Color(0.75, 0.87, 0.98), "fog_density": 0.0009,
			"accent": Color(0.1, 0.75, 0.9),
			"road": "sand", "barrier": "tyres", "sea_z": 60.0, "sea_level": -0.6, "hills": 55.0, "decor": "beach",
		},
	},
	{
		"id": "hills", "name": "Hill Country", "route": "Kadugannawa → Pidurutalagala",
		"tagline": "Tea estates, waterfalls and misty climbs",
		"towns": ["Kadugannawa", "Peradeniya", "Gampola", "Pussellawa", "Ramboda", "Nuwara Eliya", "Hakgala", "Welimada"],
		"landmarks": {"Kadugannawa": "bibleRock", "Gampola": "ambuluwawa", "Ramboda": "rambodaFalls", "Nuwara Eliya": "postOffice", "Hakgala": "hakgalaRock"},
		"sections": [["rolling", 5, 3], ["climb", 2, 3], ["drop", 0.6, 1.6], ["rocky", 0.8, 2.8], ["kicker", 0.6, 2.1], ["steps", 0.4, 1.9], ["valley", 0.6, 1.8]],
		"hard": {"climb": "Steep climb", "rocky": "Rough road", "kicker": "Jump", "steps": "Terraces", "valley": "Deep dip", "drop": "Steep descent"},
		"rocks": "granite",
		"look": {
			"ground": "leafy_grass", "soil": "forest_ground_04", "tint": Color(0.75, 0.95, 0.6),
			"trees": ["tree_pineTallA", "tree_pineTallB", "tree_pineDefaultA", "tree_tall", "tree_detailed"],
			"bushes": ["plant_bushLarge", "plant_bush", "plant_bushDetailed"], "tea": true,
			"forest": 0.8, "town": 0.6, "sky": "kloofendal_misty_morning_puresky", "fog": Color(0.78, 0.85, 0.9), "fog_density": 0.0035,
			"accent": Color(0.3, 0.75, 0.35),
		},
	},
	{
		"id": "coast", "name": "Galle Road", "route": "Hambantota → Galle",
		"tagline": "The south coast, past dunes, palms and coral",
		"towns": ["Hambantota", "Ambalantota", "Tangalle", "Dikwella", "Dondra", "Matara", "Mirissa", "Weligama"],
		"landmarks": {"Hambantota": "harbour", "Tangalle": "mulkirigala", "Dikwella": "blowhole", "Dondra": "dondraLighthouse", "Matara": "paraviDuwa", "Mirissa": "whale", "Weligama": "taprobane"},
		"sections": [["rolling", 4, 2], ["dunes", 1.5, 2.5], ["climb", 0.8, 1.8], ["drop", 0.5, 1.2], ["rocky", 1, 3], ["kicker", 0.8, 2.4], ["valley", 0.5, 1.5]],
		"hard": {"dunes": "Sand dunes", "climb": "Headland", "rocky": "Coral rocks", "kicker": "Dune jump", "valley": "Lagoon dip", "drop": "Steep descent"},
		"rocks": "coral",
		"look": {
			"ground": "coast_sand_01", "soil": "coast_sand_01", "tint": Color(1, 0.97, 0.9),
			"trees": ["tree_palmTall", "tree_palm", "tree_palmBend", "tree_palmDetailedTall", "tree_palmShort"],
			"bushes": ["plant_bush", "grass_large"], "sea": true,
			"forest": 0.45, "town": 0.7, "sky": "kloofendal_48d_partly_cloudy_puresky", "fog": Color(0.75, 0.86, 0.95), "fog_density": 0.0012,
			"accent": Color(0.15, 0.7, 0.85),
		},
	},
	{
		"id": "colombo", "name": "Colombo", "route": "Negombo → Colombo → Kalutara",
		"tagline": "Weave through the city's streets and flyovers",
		"towns": ["Negombo", "Ja-Ela", "Wattala", "Peliyagoda", "Pettah", "Colombo Fort", "Slave Island", "Kollupitiya"],
		"landmarks": {"Negombo": "negomboLagoon", "Ja-Ela": "muthurajawela", "Peliyagoda": "kelaniBridge", "Pettah": "redMosque", "Colombo Fort": "twinTowers", "Slave Island": "lotusTower", "Kollupitiya": "galleFace"},
		"sections": [["rolling", 4, 2], ["bridge", 1.2, 2], ["wrecks", 0.8, 2.4], ["wetland", 1, 1.8], ["climb", 1, 1.8], ["drop", 0.4, 1.2], ["rocky", 0.6, 1.8], ["kicker", 0.5, 1.6], ["valley", 0.5, 1.4]],
		"hard": {"bridge": "Flyover", "wrecks": "Crash ahead", "wetland": "Flooded road", "rocky": "Potholes", "kicker": "Ramp", "valley": "Underpass", "climb": "Steep climb", "drop": "Steep descent"},
		"rocks": "rubble",
		"look": {
			"ground": "grass_concrete_pavement", "soil": "grass_concrete_pavement", "tint": Color(0.9, 0.95, 0.85),
			"trees": ["tree_palmTall", "tree_default", "tree_oak", "tree_fat"],
			"bushes": ["plant_bush", "plant_bushLarge"], "city": true,
			"forest": 0.2, "town": 1.0, "sky": "kloofendal_48d_partly_cloudy_puresky", "fog": Color(0.8, 0.82, 0.86), "fog_density": 0.002,
			"accent": Color(0.95, 0.55, 0.15),
		},
	},
	{
		"id": "knuckles", "name": "Knuckles", "route": "Kandy → Meemure",
		"tagline": "Over the misty ridges and gorges of the Knuckles Range",
		"towns": ["Kandy", "Kundasale", "Digana", "Rangala", "Corbett's Gap", "Meemure"],
		"landmarks": {"Kandy": "templeOfTooth", "Digana": "victoriaDam", "Rangala": "knucklesPeaks", "Corbett's Gap": "corbettsGap", "Meemure": "lakegala"},
		"sections": [["rolling", 4, 2], ["ridge", 1.4, 2.6], ["gorge", 0.6, 1.8], ["climb", 1.2, 2.2], ["drop", 0.8, 1.6], ["rocky", 0.6, 2], ["kicker", 0.4, 1.4], ["valley", 0.5, 1.2]],
		"hard": {"ridge": "Ridge", "gorge": "Gorge", "climb": "Steep climb", "drop": "Steep descent", "rocky": "Rough road", "kicker": "Jump", "valley": "Deep dip"},
		"rocks": "granite",
		"look": {
			"ground": "leafy_grass", "soil": "rock_face", "tint": Color(0.6, 0.85, 0.55),
			"trees": ["tree_detailed_dark", "tree_tall_dark", "tree_default_dark", "tree_pineTallA_detailed", "tree_blocks_dark"],
			"bushes": ["plant_bushLarge", "plant_bushDetailed", "plant_flatTall"],
			"forest": 1.0, "town": 0.45, "sky": "kloofendal_misty_morning_puresky", "fog": Color(0.72, 0.78, 0.8), "fog_density": 0.006,
			"accent": Color(0.4, 0.65, 0.5),
		},
	},
	{
		"id": "kelani", "name": "Kelani Valley", "route": "Avissawella → Talawakele",
		"tagline": "Rainforest caves, river crossings and waterfalls",
		"towns": ["Avissawella", "Yatiyantota", "Kitulgala", "Ginigathhena", "Watawala", "Hatton", "Kotagala", "Talawakele"],
		"landmarks": {"Yatiyantota": "rafting", "Kitulgala": "beliLena", "Ginigathhena": "aberdeenFalls", "Watawala": "carolinaFalls", "Hatton": "adamsPeak", "Kotagala": "devonFalls", "Talawakele": "stClairs"},
		"sections": [["rolling", 4, 2], ["cave", 1, 2], ["ford", 1.2, 2], ["climb", 1, 2], ["drop", 0.6, 1.4], ["rocky", 0.8, 2.2], ["valley", 0.5, 1.4], ["kicker", 0.3, 1.2]],
		"hard": {"cave": "Cave", "ford": "River crossing", "climb": "Steep climb", "drop": "Steep descent", "rocky": "Fallen trees", "valley": "Deep dip", "kicker": "Jump"},
		"rocks": "granite",
		"look": {
			"ground": "leafy_grass", "soil": "forest_ground_04", "tint": Color(0.55, 0.9, 0.5),
			"trees": ["tree_palmDetailedTall", "tree_detailed", "tree_fat", "tree_tall", "tree_palmBend"],
			"bushes": ["plant_bushLarge", "plant_bushDetailed", "plant_flatTall", "crops_bambooStageB"],
			"forest": 1.0, "town": 0.5, "sky": "kloofendal_misty_morning_puresky", "fog": Color(0.7, 0.8, 0.78), "fog_density": 0.0045,
			"accent": Color(0.2, 0.7, 0.45),
		},
	},
	{
		"id": "rajarata", "name": "Rajarata", "route": "Dambulla → Polonnaruwa",
		"tagline": "Ancient tanks, rock fortresses and elephants",
		"towns": ["Dambulla", "Kandalama", "Inamaluwa", "Sigiriya", "Pidurangala", "Habarana", "Minneriya", "Giritale"],
		"landmarks": {"Dambulla": "dambullaTemple", "Kandalama": "kandalama", "Sigiriya": "sigiriya", "Pidurangala": "pidurangala", "Minneriya": "elephants", "Giritale": "tankStumps"},
		"sections": [["rolling", 5, 3], ["lake", 1.4, 2.2], ["ridge", 0.6, 1.6], ["rocky", 0.8, 2.4], ["climb", 0.6, 1.4], ["drop", 0.4, 1.2], ["kicker", 0.6, 2], ["valley", 0.4, 1.2]],
		"hard": {"lake": "Tank crossing", "ridge": "Rock outcrop", "rocky": "Rocky track", "climb": "Steep climb", "drop": "Steep descent", "kicker": "Jump", "valley": "Deep dip"},
		"rocks": "granite",
		"look": {
			"ground": "red_laterite_soil_stones", "soil": "red_laterite_soil_stones", "tint": Color(1.0, 0.9, 0.8),
			"trees": ["tree_plateau", "tree_fat", "tree_default", "tree_oak", "tree_palmShort"],
			"bushes": ["plant_bush", "grass_large", "plant_flatShort"],
			"forest": 0.55, "town": 0.5, "sky": "kloofendal_48d_partly_cloudy_puresky", "fog": Color(0.88, 0.84, 0.76), "fog_density": 0.0015,
			"accent": Color(0.85, 0.45, 0.2),
		},
	},
]


static func get_map(id: String) -> Dictionary:
	for m in MAPS:
		if m.id == id:
			return m
	return MAPS[0]
