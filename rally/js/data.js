// Go Fast Rally — game data: surfaces, themes, cars, featured stages.
(function () {
  const G = window.G;

  // Tyre/surface model parameters.
  // mu: peak friction, kp: longitudinal slip ratio at peak, ap: slip angle (rad) at peak,
  // tail: fraction of peak grip left when sliding fully, rr: rolling resistance coefficient,
  // dust: how much dust the surface throws, loose: loose (gravel-like) surface.
  G.SURF = {
    tarmac: { name: 'Tarmac', mu: 1.22, kp: 0.09, ap: 0.12, tail: 0.8, rr: 0.011, dust: 0.05, loose: 0, rough: 0.002, skid: [0.06, 0.06, 0.06, 0.55] },
    gravel: { name: 'Gravel', mu: 0.96, kp: 0.15, ap: 0.16, tail: 0.92, rr: 0.016, dust: 1, loose: 1, rough: 0.012, skid: [0.28, 0.22, 0.16, 0.45] },
    dirt: { name: 'Dirt', mu: 0.93, kp: 0.16, ap: 0.17, tail: 0.92, rr: 0.018, dust: 1.25, loose: 1, rough: 0.014, skid: [0.33, 0.16, 0.1, 0.45] },
    snow: { name: 'Snow', mu: 0.66, kp: 0.18, ap: 0.2, tail: 0.94, rr: 0.022, dust: 0.9, loose: 1, rough: 0.008, skid: [0.72, 0.76, 0.82, 0.5] },
    ice: { name: 'Ice', mu: 0.36, kp: 0.12, ap: 0.15, tail: 0.9, rr: 0.012, dust: 0.1, loose: 0, rough: 0.002, skid: [0.8, 0.86, 0.92, 0.35] },
    grass: { name: 'Grass', mu: 0.74, kp: 0.17, ap: 0.2, tail: 0.88, rr: 0.04, dust: 0.35, loose: 1, rough: 0.025, skid: [0.2, 0.25, 0.1, 0.4] },
    sand: { name: 'Sand', mu: 0.72, kp: 0.22, ap: 0.24, tail: 0.92, rr: 0.07, dust: 1.6, loose: 1, rough: 0.02, skid: [0.5, 0.3, 0.18, 0.45] },
    snowdeep: { name: 'Deep snow', mu: 0.52, kp: 0.22, ap: 0.26, tail: 0.92, rr: 0.09, dust: 1.4, loose: 1, rough: 0.015, skid: [0.8, 0.84, 0.9, 0.45] },
    rock: { name: 'Rock', mu: 0.8, kp: 0.12, ap: 0.17, tail: 0.8, rr: 0.03, dust: 0.3, loose: 0, rough: 0.03, skid: [0.2, 0.2, 0.2, 0.4] },
  };
  // Grip multipliers when it rains.
  G.RAIN_GRIP = { tarmac: 0.72, gravel: 0.9, dirt: 0.8, snow: 0.95, ice: 0.9, grass: 0.78, sand: 1.0, snowdeep: 0.95, rock: 0.75 };

  G.THEMES = {
    forest: {
      name: 'Pine Forest',
      blurb: 'Fast, flowing gravel through tall pines. Big crests and jumps.',
      surface: 'gravel',
      off: 'grass',
      amp: 42,
      scale: 1 / 950,
      detailAmp: 7,
      ridge: 0.25,
      widthHalf: 3.3,
      jumpChance: 0.5,
      crestChance: 0.45,
      treeDensity: 1.0,
      trees: { pine: 0.62, spruce: 0.2, birch: 0.18 },
      rocks: 0.25,
      bushes: 0.35,
      colors: {
        ground: '#5f7f3a', ground2: '#4d6c33', dry: '#8a8a4c', rock: '#7d7a70', dirt: '#7b6448',
        road: '#a48d6b', roadDark: '#7c6a50', roadLight: '#b8a283', shoulder: '#8a7656', snow: null,
      },
      dust: [0.69, 0.6, 0.47],
      fogMul: 1,
    },
    canyon: {
      name: 'Red Canyon',
      blurb: 'Rough red dirt, huge drops and tight canyon switchbacks.',
      surface: 'dirt',
      off: 'sand',
      amp: 80,
      scale: 1 / 1100,
      detailAmp: 12,
      ridge: 0.7,
      widthHalf: 3.5,
      jumpChance: 0.3,
      crestChance: 0.35,
      treeDensity: 0.22,
      trees: { cactus: 0.45, deadtree: 0.25, juniper: 0.3 },
      rocks: 1.0,
      bushes: 0.5,
      colors: {
        ground: '#c0733e', ground2: '#a85f34', dry: '#d39459', rock: '#9c4c2f', dirt: '#b86a3c',
        road: '#c98552', roadDark: '#a7653b', roadLight: '#d99a68', shoulder: '#b67445', snow: null,
      },
      dust: [0.8, 0.5, 0.32],
      fogMul: 0.75,
    },
    alpine: {
      name: 'Alpine Snow',
      blurb: 'Packed snow with icy patches. Lean on the snowbanks.',
      surface: 'snow',
      off: 'snowdeep',
      amp: 70,
      scale: 1 / 1000,
      detailAmp: 8,
      ridge: 0.5,
      widthHalf: 3.2,
      jumpChance: 0.3,
      crestChance: 0.4,
      treeDensity: 0.9,
      trees: { snowpine: 0.75, spruce: 0.25 },
      rocks: 0.2,
      bushes: 0.0,
      snowbanks: true,
      colors: {
        ground: '#e8eef4', ground2: '#d5dfe9', dry: '#c9d4de', rock: '#6f7681', dirt: '#b9c3cd',
        road: '#d6dde3', roadDark: '#aeb7c0', roadLight: '#eef3f7', shoulder: '#e3e9ef', snow: '#ffffff',
      },
      dust: [0.95, 0.97, 1.0],
      fogMul: 1.1,
    },
    coast: {
      name: 'Coastal Tarmac',
      blurb: 'Twisty mountain tarmac above the sea. Walls, cliffs, no room for error.',
      surface: 'tarmac',
      off: 'grass',
      amp: 75,
      scale: 1 / 800,
      detailAmp: 9,
      ridge: 0.45,
      widthHalf: 3.4,
      jumpChance: 0.05,
      crestChance: 0.3,
      treeDensity: 0.55,
      trees: { cypress: 0.4, broad: 0.4, pine: 0.2 },
      rocks: 0.5,
      bushes: 0.6,
      walls: true,
      sea: true,
      colors: {
        ground: '#7a9147', ground2: '#5f7a3a', dry: '#a59a5f', rock: '#9a9384', dirt: '#8f7b58',
        road: '#4a4c50', roadDark: '#3a3c40', roadLight: '#5a5c60', shoulder: '#8b8468', snow: null,
      },
      dust: [0.6, 0.6, 0.6],
      fogMul: 0.9,
    },
  };

  G.TIMES = {
    morning: { name: 'Morning', sunEl: 14, sunAz: 120, sun: '#ffd7a8', sunI: 1.0, hemiSky: '#bcd3ea', hemiGround: '#6b5e4a', hemiI: 0.62, skyTop: '#6f9fd8', skyHor: '#f3d6b6', night: false },
    noon: { name: 'Midday', sunEl: 55, sunAz: 200, sun: '#fff6e6', sunI: 1.12, hemiSky: '#c9defa', hemiGround: '#6e6650', hemiI: 0.6, skyTop: '#4f86d6', skyHor: '#cfe3f5', night: false },
    sunset: { name: 'Sunset', sunEl: 6, sunAz: 285, sun: '#ff9d5c', sunI: 1.05, hemiSky: '#e7a98f', hemiGround: '#4c3d3a', hemiI: 0.55, skyTop: '#3c4f8f', skyHor: '#ff9e6a', night: false },
    night: { name: 'Night', sunEl: 35, sunAz: 160, sun: '#8ea6d8', sunI: 0.16, hemiSky: '#29365a', hemiGround: '#0d0f16', hemiI: 0.28, skyTop: '#03060f', skyHor: '#152241', night: true },
  };

  G.WEATHER = {
    clear: { name: 'Clear', fog: 1.0, grip: 1, rain: false, snow: false },
    fog: { name: 'Fog', fog: 4.2, grip: 1, rain: false, snow: false },
    rain: { name: 'Rain', fog: 2.0, grip: 0, rain: true, snow: false },
    snow: { name: 'Snowfall', fog: 2.6, grip: 0, rain: false, snow: true },
  };

  G.DIFFICULTY = {
    flowing: { name: 'Flowing', w: { hp: 0.02, 1: 0.04, 2: 0.1, 3: 0.2, 4: 0.25, 5: 0.22, 6: 0.17 }, chicane: 0.12, straightMul: 1.25 },
    technical: { name: 'Technical', w: { hp: 0.08, 1: 0.1, 2: 0.17, 3: 0.2, 4: 0.2, 5: 0.14, 6: 0.11 }, chicane: 0.2, straightMul: 1.0 },
    brutal: { name: 'Brutal', w: { hp: 0.15, 1: 0.15, 2: 0.18, 3: 0.18, 4: 0.15, 5: 0.11, 6: 0.08 }, chicane: 0.3, straightMul: 0.8 },
  };

  // Engine torque curves are [rpm, Nm] points.
  G.CARS = [
    {
      id: 'sprite', name: 'Sprite R2', cls: 'R2 · FWD', blurb: 'Light front-drive hatch. Forgiving, nimble and great for learning.',
      body: 'hatch', drive: 'fwd', mass: 1060, power: 185, unlock: 0,
      torque: [[1000, 110], [2500, 150], [4000, 175], [5500, 190], [6800, 182], [7600, 160], [8000, 140]],
      idle: 950, redline: 7800, turbo: 0, gears: [3.15, 2.18, 1.66, 1.32, 1.08, 0.9], final: 5.7,
      wheelR: 0.31, track: 1.5, wheelbase: 2.48, cgFront: 0.6, cgH: 0.48, dims: [3.95, 1.73, 1.35],
      spring: 34000, damper: 3300, travel: 0.24, rest: 0.34, arbF: 9000, arbR: 6000,
      grip: 0.97, brake: 2600, bias: 0.66, lsd: 120, cda: 0.68, steerLock: 31,
      colors: ['#f4f4f4', '#1f6fd6', '#ffd23f'],
      stats: { power: 0.35, grip: 0.6, weight: 0.35, ease: 0.95 },
    },
    {
      id: 'vortex', name: 'Vortex R5', cls: 'R5 · AWD Turbo', blurb: 'The all-rounder. Four-wheel drive, turbo punch and a wide stance.',
      body: 'hatch', drive: 'awd', split: 0.47, mass: 1230, power: 290, unlock: 0,
      torque: [[1000, 180], [2500, 330], [3500, 420], [5000, 410], [6200, 360], [7000, 300], [7400, 250]],
      idle: 1000, redline: 7200, turbo: 0.35, gears: [2.92, 2.06, 1.6, 1.3, 1.1], final: 4.7,
      wheelR: 0.33, track: 1.58, wheelbase: 2.55, cgFront: 0.56, cgH: 0.5, dims: [4.0, 1.82, 1.42],
      spring: 38000, damper: 3600, travel: 0.26, rest: 0.35, arbF: 11000, arbR: 9000,
      grip: 1.0, brake: 3000, bias: 0.62, lsd: 220, cda: 0.75, steerLock: 30,
      colors: ['#ff3d2e', '#14181f', '#ffd23f'],
      stats: { power: 0.6, grip: 0.85, weight: 0.5, ease: 0.8 },
    },
    {
      id: 'mistral', name: 'Mistral 77', cls: 'Classic · RWD', blurb: 'A 70s rear-drive legend. Throttle steers it. Sideways is the fast way.',
      body: 'sedan', drive: 'rwd', mass: 1010, power: 225, unlock: 4,
      torque: [[1000, 120], [3000, 170], [5000, 215], [6500, 230], [7800, 205], [8400, 180], [8800, 150]],
      idle: 900, redline: 8500, turbo: 0, gears: [3.05, 2.1, 1.6, 1.26, 1.0], final: 4.9,
      wheelR: 0.31, track: 1.46, wheelbase: 2.4, cgFront: 0.53, cgH: 0.47, dims: [4.15, 1.68, 1.3],
      spring: 30000, damper: 2900, travel: 0.25, rest: 0.34, arbF: 9000, arbR: 4000,
      grip: 0.93, brake: 2500, bias: 0.6, lsd: 260, cda: 0.72, steerLock: 34,
      colors: ['#1a7a4c', '#f2efe6', '#e8b23a'],
      stats: { power: 0.45, grip: 0.45, weight: 0.3, ease: 0.45 },
    },
    {
      id: 'atlas', name: 'Atlas Raid', cls: 'Raid · AWD', blurb: 'Long-travel desert truck. Soaks up jumps and rough roads.',
      body: 'raid', drive: 'awd', split: 0.5, mass: 1720, power: 340, unlock: 8,
      torque: [[1000, 330], [2200, 520], [3500, 600], [4500, 560], [5500, 470], [6000, 420], [6300, 380]],
      idle: 800, redline: 6000, turbo: 0.25, gears: [3.4, 2.35, 1.72, 1.34, 1.08, 0.9], final: 4.3,
      wheelR: 0.4, track: 1.75, wheelbase: 2.85, cgFront: 0.52, cgH: 0.66, dims: [4.5, 2.0, 1.75],
      spring: 42000, damper: 4600, travel: 0.4, rest: 0.5, arbF: 12000, arbR: 10000,
      grip: 0.95, brake: 3800, bias: 0.6, lsd: 300, cda: 1.1, steerLock: 30,
      colors: ['#e9e4d8', '#e0562b', '#2b3a4a'],
      stats: { power: 0.7, grip: 0.7, weight: 1.0, ease: 0.85 },
    },
    {
      id: 'havoc', name: 'Havoc B', cls: 'Group B · AWD Turbo', blurb: '500 horsepower, a huge wing and big turbo lag. Only for heroes.',
      body: 'wedge', drive: 'awd', split: 0.4, mass: 1100, power: 500, unlock: 14,
      torque: [[1000, 160], [3000, 260], [4500, 470], [5500, 540], [6800, 500], [7600, 430], [8000, 380]],
      idle: 1100, redline: 8000, turbo: 0.6, gears: [2.75, 1.95, 1.5, 1.2, 1.0], final: 4.55,
      wheelR: 0.33, track: 1.62, wheelbase: 2.46, cgFront: 0.47, cgH: 0.47, dims: [4.0, 1.86, 1.3],
      spring: 40000, damper: 3700, travel: 0.25, rest: 0.34, arbF: 10000, arbR: 9500,
      grip: 1.0, brake: 3200, bias: 0.6, lsd: 240, cda: 0.8, steerLock: 30,
      colors: ['#ffffff', '#d81e2a', '#1a3ea8'],
      stats: { power: 1.0, grip: 0.8, weight: 0.4, ease: 0.25 },
    },
  ];
  // which tyre compound covers which surface
  G.TYRE_GROUP = { gravel: 'gravel', dirt: 'gravel', grass: 'gravel', sand: 'gravel', rock: 'gravel', snow: 'snow', snowdeep: 'snow', ice: 'snow', tarmac: 'tarmac' };

  // Upgrades: every car has its own levels (0 = stock .. 3). Costs are in credits (CR).
  G.PARTS = [
    { id: 'engine', name: 'Engine', icon: '⚙', costs: [450, 1100, 2400], desc: (l) => `+${l * 7}% torque` },
    { id: 'turbo', name: 'Turbo & intake', icon: '🌀', costs: [400, 950, 2000], desc: (l) => `+${l * 4}% top-end power, ${l * 22}% less turbo lag` },
    { id: 'gearbox', name: 'Gearbox', icon: '⛭', costs: [350, 800, 1700], desc: (l) => `shifts ${[120, 95, 75, 55][l]} ms, shorter final drive` },
    { id: 'brakes', name: 'Brakes', icon: '◎', costs: [300, 700, 1500], desc: (l) => `+${l * 12}% stopping power` },
    { id: 'suspension', name: 'Suspension', icon: '⇕', costs: [400, 900, 1900], desc: (l) => `+${l * 2} cm travel, firmer damping, less roll` },
    { id: 'weight', name: 'Weight reduction', icon: '⚖', costs: [500, 1200, 2600], desc: (l) => `−${l * 35} kg` },
    { id: 'tyre_gravel', name: 'Gravel tyres', icon: '◍', costs: [350, 850, 1800], desc: (l) => `+${l * 6}% grip on gravel, dirt and sand` },
    { id: 'tyre_snow', name: 'Snow studs', icon: '❄', costs: [350, 850, 1800], desc: (l) => `+${l * 8}% grip on snow and ice` },
    { id: 'tyre_tarmac', name: 'Tarmac slicks', icon: '●', costs: [350, 850, 1800], desc: (l) => `+${l * 5}% grip on tarmac` },
  ];
  G.TYRE_GAIN = { gravel: 0.06, snow: 0.08, tarmac: 0.05 };

  // Build an upgraded copy of a car's spec. ups = {engine: 2, brakes: 1, ...}
  G.tunedSpec = function (base, ups) {
    ups = ups || {};
    const L = (k) => G.clamp(ups[k] | 0, 0, 3);
    const s = Object.assign({}, base);
    const eng = 1 + L('engine') * 0.07;
    const tb = L('turbo');
    s.torque = base.torque.map(([r, t], i) => [r, t * eng * (1 + tb * 0.04 * (i / (base.torque.length - 1)))]);
    s.turbo = base.turbo > 0 ? base.turbo * (1 - tb * 0.22) : 0;
    s.shiftTime = [0.12, 0.095, 0.075, 0.055][L('gearbox')];
    s.final = base.final * (1 + L('gearbox') * 0.025);
    s.brake = base.brake * (1 + L('brakes') * 0.12);
    const su = L('suspension');
    s.travel = base.travel + su * 0.02;
    s.damper = base.damper * (1 + su * 0.1);
    s.spring = base.spring * (1 + su * 0.05);
    s.arbF = base.arbF * (1 + su * 0.12);
    s.arbR = base.arbR * (1 + su * 0.12);
    s.mass = base.mass - L('weight') * 35;
    s.tyre = { gravel: 1 + L('tyre_gravel') * G.TYRE_GAIN.gravel, snow: 1 + L('tyre_snow') * G.TYRE_GAIN.snow, tarmac: 1 + L('tyre_tarmac') * G.TYRE_GAIN.tarmac };
    s.ups = Object.assign({}, ups);
    return s;
  };
  // rough performance index for display / leaderboards
  G.perfIndex = function (base, ups) {
    const s = G.tunedSpec(base, ups);
    const peak = Math.max(...s.torque.map((x) => x[1]));
    const pw = (peak * 0.85 + base.power * 2) / (s.mass + 150);
    let lv = 0;
    for (const k in ups || {}) lv += ups[k] | 0;
    return Math.round(200 + pw * 900 + lv * 9 + base.grip * 60);
  };

  G.carById = (id) => G.CARS.find((c) => c.id === id) || G.CARS[1];

  G.LIVERY_PATTERNS = ['stripes', 'split', 'hoop', 'arrow', 'plain'];

  // Featured stages: fixed seeds with medal times. Stars come from medals.
  G.FEATURED = [
    { id: 'f1', name: 'Lakeside Sprint', theme: 'forest', seed: 1201, km: 2, diff: 'flowing', time: 'morning', weather: 'clear' },
    { id: 'f2', name: 'Kallio Jumps', theme: 'forest', seed: 7731, km: 4, diff: 'technical', time: 'sunset', weather: 'clear' },
    { id: 'f3', name: 'Red Mesa Run', theme: 'canyon', seed: 4410, km: 3, diff: 'flowing', time: 'noon', weather: 'clear' },
    { id: 'f4', name: "Devil's Staircase", theme: 'canyon', seed: 9182, km: 4, diff: 'brutal', time: 'noon', weather: 'clear' },
    { id: 'f5', name: 'Frostbite Pass', theme: 'alpine', seed: 3307, km: 3, diff: 'technical', time: 'morning', weather: 'clear' },
    { id: 'f6', name: 'Midnight Glacier', theme: 'alpine', seed: 6644, km: 4, diff: 'technical', time: 'night', weather: 'snow' },
    { id: 'f7', name: 'Corniche Coast', theme: 'coast', seed: 2025, km: 3, diff: 'technical', time: 'noon', weather: 'clear' },
    { id: 'f8', name: 'Cliffhanger Col', theme: 'coast', seed: 8128, km: 5, diff: 'brutal', time: 'sunset', weather: 'rain' },
    { id: 'f9', name: 'Fogbound Forest', theme: 'forest', seed: 5150, km: 6, diff: 'brutal', time: 'noon', weather: 'fog' },
  ];

  G.RIVALS = [
    'Eino Talvela', 'Marta Riquelme', 'Jonas Brekke', 'Lucie Ferrand', 'Kai Nyholm', 'Ines Barral', 'Tomas Hrubec',
    'Aiko Mori', 'Rafael Duarte', 'Sanna Ylönen', 'Owen Tremayne', 'Petra Novak', 'Liam Carrick', 'Nadia Volkova',
    'Henrik Saló', 'Chloé Marceau', 'Diego Arrabal', 'Freya Lind', 'Mateo Quiroga', 'Yuki Hanada',
  ];
})();
