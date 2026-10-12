// Vehicle definitions: physics shapes and handling. Artwork lives in vehicle-art.js.
// All coordinates are chassis-local metres with y up. Wheels are listed rear first.
// The fixture tagged `head: true` ends the run if it touches the road.
// `drive` is each wheel's share of engine torque (rear, front).

const box = (hx, hy, cx = 0, cy = 0) => ({ box: [hx, hy, cx, cy] });
const poly = (...pts) => ({ poly: pts });

export const VEHICLES = [
  {
    id: 'tuktuk',
    rating: { power: 2, grip: 2, economy: 3 },
    name: 'Tuk Tuk',
    blurb: 'Reliable all-rounder.',
    price: 0,
    drive: [1, 1],
    torque: 9, // per wheel at a drive share of 1
    speed: 26, // wheel rad/s
    tank: 100,
    fuelUse: 1,
    suspension: 3.5,
    damping: 0.75,
    grip: 0.9,
    tilt: [3, 7], // [on the ground, in the air]
    wheelie: 0.25, // nose-up angle (rad) where launch control starts easing the throttle
    fixtures: [
      { ...box(1.25, 0.22), density: 2 },
      { ...poly([-1.15, 0.2], [0.95, 0.2], [0.75, 1.25], [-1.1, 1.25]), density: 0.4 },
      { ...box(1.15, 0.12, -0.15, 1.38), density: 0.2, head: true },
    ],
    wheels: [
      { x: -0.85, y: -0.45, r: 0.42 },
      { x: 1.0, y: -0.45, r: 0.38 },
    ],
  },
  {
    id: 'bike',
    rating: { power: 4, grip: 3, economy: 4 },
    name: 'Motorbike',
    blurb: 'Light, quick and thrifty. Flips easily.',
    price: 1200,
    drive: [1, 0],
    torque: 7,
    speed: 36,
    tank: 80,
    fuelUse: 0.6,
    suspension: 4,
    damping: 0.7,
    grip: 1,
    tilt: [2.2, 3.2],
    wheelie: 0.6, // bikes are allowed proper wheelies
    fixtures: [
      { ...poly([-0.62, -0.12], [0.55, -0.12], [0.52, 0.3], [-0.6, 0.28]), density: 2.5 },
      { ...poly([-0.32, 0.28], [0.02, 0.28], [0.22, 0.92], [-0.08, 0.95]), density: 0.8 }, // rider
      { circle: [0.14, 0.14, 1.05], density: 0.5, head: true },
    ],
    wheels: [
      { x: -0.68, y: -0.32, r: 0.34 },
      { x: 0.72, y: -0.32, r: 0.34 },
    ],
  },
  {
    id: 'hatchback',
    rating: { power: 3, grip: 3, economy: 3 },
    name: 'Hatchback',
    blurb: 'Tall city hatch. Front-wheel drive.',
    price: 3000,
    drive: [0.5, 1.5], // mostly front-wheel drive
    torque: 17,
    speed: 36,
    tank: 100,
    fuelUse: 0.85,
    suspension: 3.2,
    damping: 0.7,
    grip: 0.95,
    tilt: [3.5, 7],
    wheelie: 0.15,
    fixtures: [
      { ...poly([-1.72, -0.2], [1.75, -0.2], [1.75, 0.45], [-1.72, 0.45]), density: 1.2 },
      { ...poly([-1.68, 0.44], [1.25, 0.44], [0.6, 1.1], [-1.62, 1.1]), density: 0.4 },
      { ...box(1.08, 0.06, -0.5, 1.14), density: 0.2, head: true },
    ],
    wheels: [
      { x: -1.15, y: -0.36, r: 0.31 },
      { x: 1.2, y: -0.36, r: 0.31 },
    ],
  },
  {
    id: 'lorry',
    rating: { power: 3, grip: 3, economy: 2 },
    name: 'Mini Lorry',
    blurb: 'Little cab-over truck. Light rear end.',
    price: 4200,
    drive: [1.4, 0.6], // mostly rear-wheel drive
    torque: 19,
    speed: 34,
    tank: 110,
    fuelUse: 1.05,
    suspension: 3.1,
    damping: 0.7,
    grip: 1.0,
    tilt: [4, 8],
    wheelie: 0.15,
    fixtures: [
      { ...poly([-1.85, -0.2], [1.8, -0.2], [1.8, 0.5], [-1.85, 0.5]), density: 1.4 },
      { ...poly([0.55, 0.5], [1.75, 0.5], [1.5, 1.55], [0.55, 1.55]), density: 0.4 },
      { ...box(0.45, 0.06, 0.95, 1.6), density: 0.2, head: true },
    ],
    wheels: [
      { x: -1.1, y: -0.36, r: 0.31 },
      { x: 1.15, y: -0.36, r: 0.31 },
    ],
  },
  {
    id: 'hybrid',
    rating: { power: 3, grip: 2, economy: 5 },
    name: 'Hybrid',
    blurb: 'Hybrid: sips fuel, soft ride, low clearance.',
    price: 5500,
    drive: [0.5, 1.5], // mostly front-wheel drive
    torque: 16,
    speed: 36,
    tank: 100,
    fuelUse: 0.5,
    suspension: 2.9,
    damping: 0.65,
    grip: 0.95,
    tilt: [3.5, 7],
    wheelie: 0.12,
    fixtures: [
      { ...poly([-1.95, -0.26], [2.0, -0.26], [2.05, 0.15], [1.2, 0.5], [-1.95, 0.62]), density: 1.1 },
      { ...poly([-1.85, 0.5], [1.2, 0.5], [0.1, 0.98], [-0.9, 0.95], [-1.75, 0.72]), density: 0.35 },
      { ...box(0.65, 0.06, -0.4, 0.99), density: 0.2, head: true },
    ],
    wheels: [
      { x: -1.3, y: -0.34, r: 0.33 },
      { x: 1.35, y: -0.34, r: 0.33 },
    ],
  },
  {
    id: 'van',
    rating: { power: 4, grip: 3, economy: 2 },
    name: 'Van',
    blurb: 'Roomy diesel van. Tall, so mind the corners.',
    price: 7000,
    drive: [1.5, 0.5], // rear-wheel drive
    torque: 23,
    speed: 36,
    tank: 120,
    fuelUse: 1.15,
    suspension: 2.9,
    damping: 0.65,
    grip: 1.05,
    tilt: [4.5, 9],
    wheelie: 0.14,
    fixtures: [
      { ...poly([-2.1, -0.2], [2.12, -0.2], [2.12, 0.9], [-2.1, 0.9]), density: 1.3 },
      { ...poly([-2.08, 0.9], [1.95, 0.9], [1.55, 1.78], [-2.08, 1.78]), density: 0.3 },
      { ...box(1.6, 0.06, -0.3, 1.84), density: 0.2, head: true },
    ],
    wheels: [
      { x: -1.3, y: -0.36, r: 0.34 },
      { x: 1.45, y: -0.36, r: 0.34 },
    ],
  },
  {
    id: 'jeep',
    rating: { power: 5, grip: 5, economy: 1 },
    name: 'Jeep',
    blurb: 'Heavy 4x4. Climbs anything, drinks fuel.',
    price: 9000,
    drive: [1, 1],
    torque: 21,
    speed: 25,
    tank: 120,
    fuelUse: 1.5,
    suspension: 2.6,
    damping: 0.6,
    grip: 1.3,
    tilt: [7, 13],
    wheelie: 0.2,
    fixtures: [
      { ...poly([-1.85, -0.12], [2.0, -0.12], [2.0, 0.82], [-1.85, 0.82]), density: 1.6 },
      { ...poly([-1.82, 0.8], [0.78, 0.8], [0.58, 1.5], [-1.82, 1.5]), density: 0.5 },
      { ...box(1.2, 0.06, -0.62, 1.55), density: 0.2, head: true },
    ],
    wheels: [
      { x: -1.15, y: -0.5, r: 0.48 },
      { x: 1.25, y: -0.5, r: 0.48 },
    ],
  },
];

export const getVehicle = (id) => VEHICLES.find((v) => v.id === id) ?? VEHICLES[0];

// ---- paint skins -------------------------------------------------------------
// [name, body, light, dark]: the 2D art shades with all three, the 3D models use body.
const PAINTS = {
  maroon: ['Maroon', '#8c1d2e', '#c23a4c', '#4e0e18'],
  red: ['Racing Red', '#b3121f', '#e5383b', '#660708'],
  blue: ['Ocean Blue', '#2f6eb5', '#6aa3e0', '#173e6b'],
  pearl: ['Pearl White', '#eef1f4', '#ffffff', '#aab3bc'],
  green: ['Estate Green', '#3b5e3b', '#6a9665', '#223a24'],
  leaf: ['Leaf Green', '#2e8b3e', '#5cc46b', '#15511f'],
  yellow: ['Taxi Yellow', '#e8b710', '#ffd84d', '#9a7406'],
  black: ['Midnight', '#22252b', '#4a4f58', '#0b0c0f'],
  orange: ['Sunset Orange', '#e0661b', '#ff9550', '#8a3507'],
  teal: ['Lagoon Teal', '#14897f', '#3fc2b5', '#08524b'],
  purple: ['Royal Purple', '#5b2a86', '#8a55b8', '#2f1248'],
  silver: ['Silver', '#a7aeb5', '#dfe3e7', '#5f666d'],
  pink: ['Bubblegum', '#e0559a', '#ff8cc4', '#8f2457'],
  sand: ['Desert Sand', '#c9a46a', '#e8cf9f', '#7d6036'],
  gold: ['Temple Gold', '#c9971f', '#f2cc5c', '#7a5608'],
};
// first paint is the factory colour (free); the rest cost more further down the list
const SKIN_LISTS = {
  tuktuk: ['maroon', 'leaf', 'yellow', 'blue', 'purple', 'gold'],
  bike: ['red', 'black', 'blue', 'orange', 'gold'],
  hatchback: ['blue', 'silver', 'red', 'pink', 'gold'],
  lorry: ['teal', 'red', 'yellow', 'pearl', 'gold'],
  hybrid: ['pearl', 'silver', 'black', 'teal', 'gold'],
  van: ['pearl', 'silver', 'black', 'maroon', 'gold'],
  jeep: ['green', 'sand', 'black', 'orange', 'gold'],
};
const SKIN_PRICES = [0, 300, 600, 1000, 1500, 2500];

export function skinsOf(id) {
  const v = getVehicle(id);
  const list = SKIN_LISTS[v.id];
  return list.map((key, i) => {
    const [name, body, light, dark] = PAINTS[key];
    // the gold paint is always the priciest; pricier vehicles cost more to repaint
    const tier = key === 'gold' ? SKIN_PRICES.length - 1 : i;
    const price = Math.round((SKIN_PRICES[tier] * (1 + v.price / 8000)) / 50) * 50;
    return { id: key, name, body, light, dark, price };
  });
}
export const getSkin = (vehicleId, skinId) => skinsOf(vehicleId).find((s) => s.id === skinId) ?? skinsOf(vehicleId)[0];

// Upgrade levels 0..5 scale the vehicle's base numbers.
export function vehicleStats(v, up) {
  return {
    torque: v.torque * (1 + up.engine / 3),
    speed: v.speed * (1 + up.engine * 0.15),
    tank: v.tank * (1 + up.tank * 0.25),
    suspension: v.suspension * (1 + up.suspension * 0.17),
    grip: v.grip + up.tires * 0.15,
  };
}
