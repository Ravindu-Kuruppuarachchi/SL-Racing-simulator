class_name Cars
# The garage: six sporty cars (Kenney car kit models), their handling ratings, prices,
# paints and upgrades.
#
# rating: power and grip drive the handling (CarSim.stats); mass: shove in collisions;
# half_width: for the barriers and collisions; scale: model size in metres per unit.

const CARS := [
	{"id": "sport", "name": "Street Sport", "model": "sedan-sports", "blurb": "Quick, light and forgiving. A great starter.",
		"price": 0, "power": 2, "grip": 4, "mass": 0.9, "half_width": 0.95, "scale": 1.6,
		"paints": ["red", "blue", "white", "black", "teal", "gold"]},
	{"id": "rally", "name": "Rally GT", "model": "race", "blurb": "Grippy all-rounder, at home on gravel.",
		"price": 1500, "power": 3, "grip": 5, "mass": 1.0, "half_width": 0.95, "scale": 1.6,
		"paints": ["white", "blue", "red", "yellow", "green", "gold"]},
	{"id": "classic", "name": "Classic Racer", "model": "raceCarRed", "blurb": "A vintage single-seater: light and lively.",
		"price": 3000, "power": 4, "grip": 3, "mass": 0.8, "half_width": 0.85, "scale": 3.2,
		"paints": ["red", "silver", "green", "blue", "orange", "gold"]},
	{"id": "luxury", "name": "Super SUV", "model": "suv-luxury", "blurb": "Big power and weight: shoves rivals aside.",
		"price": 5000, "power": 5, "grip": 2, "mass": 1.35, "half_width": 1.0, "scale": 1.6,
		"paints": ["black", "white", "silver", "blue", "red", "gold"]},
	{"id": "truck", "name": "Trophy Truck", "model": "truck", "blurb": "Off-road racer: shrugs off bumps.",
		"price": 7000, "power": 4, "grip": 4, "mass": 1.5, "half_width": 1.0, "scale": 1.55,
		"paints": ["orange", "black", "sand", "white", "green", "gold"]},
	{"id": "hyper", "name": "Hypercar", "model": "race-future", "blurb": "The fastest thing on the island.",
		"price": 12000, "power": 6, "grip": 5, "mass": 1.05, "half_width": 0.95, "scale": 1.6,
		"paints": ["yellow", "red", "green", "black", "purple", "gold"]},
]

# [name, colour, stripe]
const PAINTS := {
	"red": ["Rosso", Color("#d1202f")],
	"yellow": ["Sunburst", Color("#f2c400")],
	"blue": ["Ocean Blue", Color("#1f5fd1")],
	"orange": ["Mango", Color("#f2701c")],
	"green": ["Racing Green", Color("#1f7a43")],
	"black": ["Midnight", Color("#1b1d22")],
	"white": ["Pearl", Color("#eef1f4")],
	"purple": ["Royal Purple", Color("#6a2fb0")],
	"teal": ["Lagoon", Color("#0fa39a")],
	"silver": ["Silver Arrow", Color("#a7aeb5")],
	"sand": ["Desert", Color("#d8b26a")],
	"gold": ["Temple Gold", Color("#d4a02a")],
}
const PAINT_PRICES := [0, 300, 600, 1000, 1500, 2500]

const UPGRADES := [
	{"key": "engine", "name": "Engine", "icon": "⚙"},
	{"key": "handling", "name": "Handling", "icon": "↻"},
	{"key": "tyres", "name": "Tyres", "icon": "◎"},
	{"key": "nitro", "name": "Nitro", "icon": "🔥"},
]
const MAX_LEVEL := 5


static func get_car(id: String) -> Dictionary:
	for c in CARS:
		if c.id == id:
			return c
	return CARS[0]


static func paint_price(car: Dictionary, index: int) -> int:
	var tier: int = PAINT_PRICES.size() - 1 if car.paints[index] == "gold" else index
	return int(round(PAINT_PRICES[tier] * (1.0 + car.price / 8000.0) / 50.0)) * 50


static func upgrade_price(car: Dictionary, level: int) -> int:
	# the price of going from `level` to level + 1
	return int(round((150 + level * level * 120) * (1.0 + car.price / 6000.0) / 10.0)) * 10


static func upgrade_effect(key: String, level: int) -> String:
	match key:
		"engine": return "Top speed +%d km/h" % (level * 4)
		"handling": return "Steering +%d%%" % (level * 6)
		"tyres": return "Grip +%d%%" % (level * 10)
		"nitro": return "Boosts +%.2f s" % (level * 0.25)
	return ""
