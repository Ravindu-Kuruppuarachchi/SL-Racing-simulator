> **Godot version:** `godot/` holds SL Racing rebuilt in Godot 4 with CC0 3D assets (Android APK: `sl-racing-godot.apk`). See [godot/README.md](godot/README.md).

# SL Racing 🏁 (this branch)

A Beach Buggy Racing–style 3D racer on the routes of Tuk Tuk Climb's six maps: each race runs
from a map's first town to its last (up to eight towns, ~2.4 km, about 1½ minutes), through
3D tea country, the Galle coast, Colombo, the Knuckles, the Kelani Valley and Rajarata.

- Each road is built from its map's own sections, as in Tuk Tuk Climb, each with a warning
  sign: steep climbs and descents, deep valleys and ridges (airtime), jumps, dunes, terraces,
  rocky stretches, river fords and tank crossings, Kelani's caves, the Knuckles gorge and
  Colombo's flyover. Obstacles block the road in rows with a gap to find: boulders, coral,
  wrecked cars, fallen trees, potholes, flooded patches, and elephants crossing in Rajarata.
- Every town has its landmark in 3D ahead of it (Sigiriya, Adam's Peak, the Temple of the
  Tooth, the Lotus Tower, Dondra lighthouse, the waterfalls …), and houses, shops and lamp posts.
- Drift boost: hold a slide through a bend, then straighten up for a burst of speed.
- **Race** five AI rivals (you start at the back), **Free drive** a route on your own, or
  **Race friends** online: host a room and share the link, up to six players, no bots.
- **Power-ups** from the item boxes: Vesak Rocket (homing), Coconut Bombs (lobbed ahead),
  Oil Slick, Shield and Nitro. Cars further back get the better ones. Boost pads and coins too.
- **Garage**: six sporty cars (`src/racer/cars.js`): Dune Buggy (free), Rally GT, Roadster,
  Muscle Car, Trophy Truck and Supercar, each with Engine, Handling, Tyres and Nitro upgrades
  and paints with matching stripes. Coins come from races and the road.
- Towns are lively: painted shopfronts with signboards, awnings and goods on the shelves,
  houses with verandas, windows and doors, Buddhist flags and Vesak lanterns across the road,
  roadside shrines, king coconut stalls, bus halts, parked tuk tuks and people; a crowd at the
  start and finish. Colombo has shops all along the road.
- Controls: steer ◀ ▶ (or ←/→, A/D), brake (↓/S), power-up (Space). You accelerate by yourself.

It is its own Android app (`lk.slracing.game`, "SL Racing"), so it installs beside Tuk Tuk
Climb; `npm run apk` builds `sl-racing.apk`. Share links are `https://<relay>/race/CODE` and
open `slracing://join/CODE`. The relay keeps the two games' rooms apart (redeploy it from
`server/` after pulling this branch). Tuk Tuk Climb itself lives on the `main` branch; the
sections below describe it and the parts the two games share (vehicles, maps, relay).

**Code (`src/racer/`)**: `track.js` builds each route (bends, hills, jumps, fords, the
Kelani cave, the viaduct, item boxes, pads, coins); `car.js` is the arcade handling, in road
coordinates; `ai.js` the AI drivers; `race3d.js` a race (power-ups, collisions, positions,
friends' cars); `world.js` the 3D scene; `view.js` cars, effects and the chase camera;
`main.js` the screens. `npm run test:racer` checks every route and full races headless.

# Tuk Tuk Climb 🛺

A Hill Climb Racing–style physics game: drive six real Sri Lankan routes, from the hill country
(Kadugannawa → Nuwara Eliya → Ella …) to the Knuckles, the Kelani Valley and the ancient Rajarata,
collect coins, grab fuel, and don't land on the roof.

## Vehicles

| Vehicle | Price | Drive | Character |
|---|---|---|---|
| Tuk Tuk | free | both wheels | all-rounder |
| Motorbike | Rs 1,200 | rear | light and quick, thrifty, wheelies and flips easily |
| Hatchback | Rs 3,000 | mostly front | tall city hatch |
| Hybrid | Rs 5,500 | mostly front | half the fuel use, soft and low |
| Jeep | Rs 9,000 | 4x4 | heavy, huge grip and big wheels, thirsty |

The home screen shows your selected vehicle in 3D (drag to spin it, arrows to switch between
the ones you own) with Start and Garage buttons. In the garage you can view every vehicle on a
turntable, buy it, and upgrade it. Hovering an upgrade previews its effect on the stat bars.

Each vehicle has its own upgrades (pricier vehicles cost more to upgrade). Launch control eases
the engine when the nose lifts on the ground, so full gas won't flip you by itself. Holding gas
in the air still will.

## Run

```bash
npm install
npm run dev      # open the printed URL; --host also exposes it to your phone on the same Wi-Fi
npm test         # headless physics checks
npm run build    # production build in dist/
```

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Gas (also tilts back in the air) | → / D | GAS pedal |
| Brake / reverse (tilts forward) | ← / A | BRAKE pedal |
| Pause | Esc / P | ❚❚ button |

## Maps

Tap the road button on the home screen to open the map page: one card per road with a preview of its landmarks, the route, its hazards and your best distance there. Tap a card to select it, or **Drive ▶** to go straight away. Each map keeps its own best distance.

| Map | Route | Character |
|---|---|---|
| Hill Country | Kadugannawa → Pidurutalagala | tea estates and pine forest; steep climbs, terraces, deep dips |
| Galle Road | Hambantota → Galle | the south coast: sea, beach, coconut palms; sand dunes, coral rocks, dune jumps, slightly looser grip |
| Colombo | Negombo → Colombo → Kalutara | city streets, canals and wetlands; bridges, crashed vehicles to drive over, flooded dips, potholes |
| Knuckles | Kandy → Meemure | misty cloud forest and paddy terraces; knuckle ridges, deep gorges with a stream, damp grip |
| Kelani Valley | Avissawella → Talawakele | rainforest, the Kelani river and waterfalls; caves with a solid roof, river crossings, wet grip |
| Rajarata | Dambulla → Polonnaruwa | the dry zone: ancient tanks, granite rocks, scrub jungle; tank crossings, rock outcrops, laterite gravel |

Landmarks drift past in the distance (unlabelled) as you approach their town:

- **Hill Country:** Bible Rock, Ambuluwawa Tower, Ramboda Falls, Nuwara Eliya Post Office, Hakgala Rock,
  Nine Arch Bridge, Adam's Peak, World's End, Pidurutalagala.
- **Galle Road:** Hambantota Port, Mulkirigala, Hummanaya Blowhole, Dondra Head Lighthouse, Paravi Duwa,
  whales off Mirissa, Taprobane Island, the stilt fishermen, the Japanese Peace Pagoda, Galle Fort.
- **Colombo:** Negombo lagoon boats, Muthurajawela marsh, the New Kelani Bridge, the Red Mosque, the World Trade
  Center towers, Lotus Tower, Galle Face Green, Independence Memorial Hall, Mount Lavinia Hotel, Kalutara Bodhiya.
- **Knuckles:** the Temple of the Tooth on Kandy Lake, Victoria Dam, the Knuckles peaks, Corbett's Gap, Lakegala above Meemure.
- **Kelani Valley:** rafters on the Kelani, Belilena cave, Aberdeen Falls, Carolina Falls, Adam's Peak, Devon Falls, St. Clair's Falls.
- **Rajarata:** Dambulla cave temple, Kandalama, Sigiriya, Pidurangala, the elephant gathering at Minneriya, the drowned trees
  of Giritale tank, Gal Vihara.

## Road sections

The road is built from sections that get harder (and more frequent) up to ~3 km.
A yellow warning sign appears before each tough one. Hill Country sections:

| Section | What it is |
|---|---|
| Rolling hills | the default; hills get taller with distance |
| Steep climb / descent | up to ~50° slopes |
| Rough road | washboard bumps with boulders to drive over |
| Jump | a ramp with a drop and a dip to land in |
| Terraces | tea-estate steps |
| Deep dip | a steep-sided valley |

Galle Road swaps terraces for **sand dunes** (crests get sharper with distance), and its rough sections
are **coral rocks**; climbs are **headlands** and dips are **lagoon dips**.

Colombo adds **bridges** (ramp up onto a deck over a river: steel arch or cable-stayed), **crash scenes**
(wrecked cars and vans lying on the road: solid, low enough that no vehicle gets beached, with at least 5 m
between them), **flooded roads** (water standing in dips), and **potholes** with concrete rubble.

Knuckles adds **ridges** (one to three sharp crests in a row, granite on top) and **gorges** (a plunge to a stream
and a steep climb out). Kelani Valley adds **caves** (a rolling floor under a solid rock roof: bounce too high and
your head hits it; it gets dark inside) and **river crossings** (stony fords). Rajarata adds **tank crossings**
(long shallow wades with blue water lilies) and **rock outcrops**. Water slows you down the deeper it is.

## Online races

In race mode, **👥 Race friends online** opens the lobby. One phone hosts a race and shares a
link (or reads out the 5-letter code); up to five friends join. The host picks the road and
starts the race. Each phone drives its own vehicle and sends its position to the others about
15 times a second, so lag never affects your own driving. Finish times use the real clock, so
a slow phone can't post a flattering time.

The phones talk through a small relay server in `server/` (one Cloudflare Worker, free plan).
It only passes messages between the phones in a room and caps a room at six; the host's phone
runs the race. It also serves the share link `https://<relay>/join/CODE`, a page that opens the
installed app straight into that race (`tuktukclimb://join/CODE`) and shows the code to type in.

**Set it up once:**

```bash
cd server
npx wrangler login     # a free Cloudflare account
npx wrangler deploy    # prints the relay's address, e.g. https://tuktuk-relay.<you>.workers.dev
```

Then build the app with that address and install the new APK on everyone's phone:

```bash
echo "VITE_RELAY_URL=https://tuktuk-relay.<you>.workers.dev" > .env
npm run apk
```

**Without deploying**, for development: `npm run relay` runs the same relay on your computer
(port 8787) and `npm run dev` uses it automatically. In a browser, `?join=CODE` joins a race.
`npm run test:net` checks rooms, joining, the six-player limit, starting, poses and finishing.

## Code map

- `src/game.js`: physics simulation (planck.js): builds the chosen vehicle, fuel, coins, flips, launch control, water drag, cave roofs. No DOM.
- `src/vehicles.js`: vehicle physics definitions (shapes, wheels, torque split, fuel use, prices).
- `src/vehicle-art.js`: vehicle artwork, drivers and wheel styles (used in game and for garage thumbnails).
- `src/maps.js`: map definitions: towns, landmarks, which road sections appear, sign labels, ground colours.
- `src/terrain.js`: seeded procedural road sections (including caves and water) and boulders/coral, driven by the map.
- `src/landmarks.js`: the distant landmark drawings.
- `src/render.js`: canvas drawing: cached parallax layers (mountains, tea estates, forest),
  road, signs, and the vehicle (pre-rendered body sprites plus a live driver who leans with acceleration).
  Lowers render resolution automatically if the device can't keep up.
- `src/models3d.js`: low-poly 3D vehicle models (three.js). Car bodies extrude the same side profiles as the 2D art.
- `src/showroom.js`: the 3D scene behind the home screen and garage. It frames the vehicle into a DOM "slot" element.
  Falls back to the 2D artwork when WebGL isn't available.
- `src/main.js`: game loop, input, home/garage screens, upgrades, save data (localStorage).
- `src/sound.js`: synthesized engine sound per vehicle (Web Audio).
- `src/race.js`: race mode: checkpoints, rival bots, your ghost, the difficulty that keeps you winning about half, and friends' vehicles in online races. No DOM.
- `src/net.js`: online races: the lobby and the messages phones send each other through the relay.
- `server/`: the relay for online races (`worker.js` for Cloudflare, `dev-relay.js` locally, `room.js` shared).
- `scripts/`: headless tests: `npm test`, `npm run test:race`, `npm run test:net`.

## Debugging

In `npm run dev` only, the browser console has `__game()`. For example, `__game().teleport(1500)` jumps to 1500 m.
