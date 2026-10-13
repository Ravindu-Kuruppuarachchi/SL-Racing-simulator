# SL Racing (Godot 4)

The SL Racing rewrite in Godot 4.7 (GDScript), built for Android. It drives the same six
routes as the web version, with real 3D assets, PBR materials, an HDRI sky, shadows, glow
and fog, and redesigned menus.

- **Palm Beach** (the first map) is a hand-made 3-lap circuit in a Beach Buggy Racing style:
  a sandy track with striped tyre walls, kerbs and bunting. It has a tunnel through a
  headland, a lagoon bridge, jumps, dunes, a creek splash and rocks. The backdrop has the
  sea with palm islands and sailboats, a lighthouse, a pier, beach huts and parasols,
  hot-air balloons and green mountains. Circuits are defined in `data/maps.gd` as control
  points plus features (`circuit`), so more themed tracks are data, not code.
- **Race** five AI rivals, **Free drive**, or **Race friends** online (host a room, share
  the code or link, up to 6 players). The online part uses the same Cloudflare relay as
  Tuk Tuk Climb, with SL Racing's rooms kept separate (`game=racer`).
- **Power-ups**: Vesak Rocket, Coconut Bombs, Oil Slick, Shield, Nitro. Also drift boost,
  boost pads and coins.
- **Garage**: six cars (Street Sport, Rally GT, Classic Racer, Super SUV, Trophy Truck,
  Hypercar), each with Engine, Handling, Tyres and Nitro upgrades and six paints.
- **Roads**: each map has its own sections and obstacles: caves, the Colombo flyover,
  river fords, tank crossings, gorges, jumps, boulders, wrecks, fallen trees and elephants.
  Towns have brightly painted shops and houses, Buddhist flags, street lamps and a gantry
  with the town's name. Each town also has its landmark (Sigiriya, Adam's Peak, the Lotus
  Tower, the waterfalls and others).
- **Sound** is synthesised in code: engine, tyre squeal and effects.

## Run and build

```bash
GODOT=~/.local/share/godot-bin/Godot_v4.7.2-stable_linux.x86_64
$GODOT --path godot                                    # play on the desktop (arrows, Space, Esc)
$GODOT --path godot --headless -s tools/test_race.gd   # headless race checks, every map
$GODOT --path godot --headless --export-debug "Android" ../sl-racing-godot.apk
```

The online check needs the local relay running (`node server/dev-relay.js 8799`), then:
`$GODOT --path godot --headless -- --nettest --relay=http://localhost:8799`.

Testing flags (after `--`):

| Flag | What it does |
|---|---|
| `--race=<map>` | start a race on that map straight away |
| `--free` | make it a free drive |
| `--at=<m>` | start that many metres along the road |
| `--autopilot` | let the AI drive your car |
| `--screen=home\|maps\|garage\|lobby` | open a menu screen |
| `--shot=file.png --after=<s>` | save a screenshot after that many seconds, then quit |

## Code (`scripts/`)

| Folder | What's in it |
|---|---|
| `core/` | No nodes, so it runs headless. `track.gd` builds the road (sections, bends, profile, obstacles, pickups). `car_sim.gd` is the arcade handling in road coordinates. `ai.gd` drives the bots. `race.gd` runs the race (items, collisions, standings, remote cars). `rng.gd` is a seeded random generator, so every phone builds the same road. |
| `data/` | Maps (towns, landmarks, sections, look) and cars (ratings, paints, upgrade prices). |
| `world/` | `world.gd` builds the terrain grid, road strips, rails, water, caves, flyover, towns and scenery (MultiMeshes). `landmarks.gd` holds the landmark kits, `props.gd` the elephants, item boxes and power-ups, `looks.gd` the shaders and materials, `sky.gd` the environment. |
| `game/` | `race_view.gd` is the race scene (camera, pickups, online messages). `car_view.gd` repaints the Kenney models and adds wheels and effects. `race_audio.gd` is the sound. |
| `ui/` | The theme, the menus with the 3D showroom, and the HUD with multi-touch controls. |
| `net/lobby.gd` | The relay protocol (WebSocket), ported from `src/net.js`. |

## Assets and licences

- 3D models: Kenney Car Kit, City Kit (Commercial, Suburban), Nature Kit and Racing Kit, all
  CC0 (`assets/LICENSE-kenney-*.txt`).
- Textures and HDRI skies: Poly Haven, CC0.
- Fonts: Russo One and Exo 2, SIL Open Font License (`assets/fonts/OFL-*.txt`).
