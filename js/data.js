// Static game data: varieties, upgrades, businesses, achievements, story, headlines.
// Everything tunable for balance lives here.
var CF = globalThis.CF = globalThis.CF || {};

(function (CF) {
  const D = {};

  D.SAVE_KEY = 'rootcause.save.v3'; // 3.0 is a fresh start: older saves are ignored
  D.OLD_SAVE_KEYS = ['rootcause.save.v2', 'rootcause.save.v1', 'rootcause.save'];
  D.VERSION = 5;
  D.GAME_VERSION = '3.0';

  D.QUALITY = [
    { name: 'Wonky', mult: 0.6, color: '#a39a86' },
    { name: 'Standard', mult: 1, color: '#f1ead6' },
    { name: 'Premium', mult: 1.8, color: '#5fb8ff' },
    { name: 'Artisan', mult: 3.5, color: '#c58cff' },
    { name: 'Legendary', mult: 8, color: '#ffc53d' },
  ];

  // ---------- pacing ----------
  // 3.0 is paced for weeks and months, not hours. Every crop ladder uses the same shape: each variety sells
  // for VALUE_STEP× the one before, and costs a growing multiple of its price to unlock, so each new seed
  // takes longer to reach than the last.
  D.BAL = { valueStep: 5.5, unlockBase: 120, unlockStep: 3.4 };
  const sig = (n) => { if (n < 10) return Math.round(n); const e = Math.pow(10, Math.floor(Math.log10(n)) - 1); return Math.round(n / e) * e; };
  D.sig = sig;
  function ladder(list, o) {
    return list.map((row, k) => {
      const [id, name, color, leaf, desc] = row;
      const value = sig(o.value * Math.pow(D.BAL.valueStep, k));
      const unlock = k === 0 ? 0 : sig(value * o.unlock * Math.pow(D.BAL.unlockStep, k - 1));
      return { id, name, seed: sig(value / 3), value, grow: o.grow[k], unlock, color, leaf, desc, farm: o.farm, crop: o.crop };
    });
  }

  // seed = cost to plant, value = base sell price (Standard quality), grow = seconds
  D.VARIETIES = ladder([
    ['orange', 'Classic Orange', '#f28c28', '#4caf50', 'The humble carrot. Your severance package, basically.'],
    ['purple', 'Purple Dragon', '#8e44ad', '#43a047', 'Foodies pay extra for anything purple.'],
    ['white', 'Snow White', '#f4efe0', '#66bb6a', 'Pale, mysterious, sold exclusively at farmers markets in Brooklyn.'],
    ['atomic', 'Atomic Red', '#e53935', '#2e7d32', 'Lycopene-rich. Glows faintly. Probably fine.'],
    ['rainbow', 'Rainbow Bunch', '#ff7043', '#689f38', 'Five colors in one bunch. Kids eat them. Parents weep with joy.'],
    ['golden', 'Golden Imperator', '#ffd54f', '#558b2f', 'Carrot of kings. Grown under a tiny crown.'],
    ['thunder', 'Thunder Root', '#5c6bc0', '#33691e', 'Only grows during storms. Crackles when you pull it up.'],
    ['cosmic', 'Cosmic Carrot', '#26c6da', '#00897b', 'Seeds recovered from a meteorite. Tastes like stars.'],
    ['moonbeam', 'Moonbeam Carrot', '#e0e7ff', '#7cb342', 'Harvested at midnight. Glows softly in the silo.'],
    ['quantum', 'Quantum Root', '#ff4fd8', '#7b1fa2', 'Simultaneously ripe and unripe until harvested.'],
    ['crown', 'Crown Jewel Carrot', '#ffb300', '#2e7d32', 'Kept in a vault. Insured by three banks.'],
    ['heirloom', "Grandpa's Heirloom", '#d84315', '#1b5e20', "The seed tin from the barn. Grandpa's best carrot, finally grown again."],
  ], { farm: 'carrot', crop: 'carrot', value: 3, unlock: D.BAL.unlockBase, grow: [8, 15, 25, 40, 60, 90, 130, 180, 240, 320, 420, 540] });
  // AI era: only available while you own OptimaAI.
  D.VARIETIES.push(
    { id: 'neural', name: 'Neural Carrot', seed: 8e8, value: 2.5e9, grow: 600, unlock: 5e15, color: '#76ff03', leaf: '#1b5e20', ai: true, farm: 'carrot', crop: 'carrot',
      desc: 'Lab-grown. Trained on 40 billion photos of carrots.' },
    { id: 'singularity', name: 'Singularity Root', seed: 4.5e9, value: 1.4e10, grow: 780, unlock: 1e17, color: '#263238', leaf: '#00bfa5', ai: true, farm: 'carrot', crop: 'carrot',
      desc: 'It is looking back at you.' });

  // ---------- The Beet Farm ----------
  // A second farm, bought with franchise points. Money is shared with the carrot farm, but everything on the beet
  // farm costs far more, so the carrot farm has to fund it.
  D.BEET = { costMult: 2e6, fertMult: 2e6, bizStart: 1e9 };
  D.BEET_ICON = '<svg class="beet-ico" viewBox="0 0 32 32" width="1em" height="1em" aria-hidden="true"><path d="M16 13C11 6 6 7 7 2c5 1 8 5 9 11z" fill="#4caf50"/><path d="M16 13c5-7 10-6 9-11-5 1-8 5-9 11z" fill="#388e3c"/><path d="M15.4 13c0-5 .2-9 .6-12 .4 3 .6 7 .6 12z" fill="#b0245a"/><circle cx="16" cy="20" r="8.6" fill="#8e1b3f"/><ellipse cx="13" cy="17" rx="2.4" ry="3.4" fill="#d6457c" opacity=".55"/><path d="M16 28.4q1 1.8 0 3.4" stroke="#8e1b3f" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>';
  D.BEET_VARIETIES = ladder([
    ['b_red', 'Detroit Dark Red', '#8e1b3f', '#3f7d3a', 'The classic beet. Stains everything it touches, including your soul.'],
    ['b_candy', 'Chioggia Candy Stripe', '#e56b9a', '#4a8a3c', 'Pink and white rings inside. The internet loves it.'],
    ['b_gold', 'Golden Beet', '#f2a93b', '#5b8f2e', "Doesn't bleed. Doesn't judge."],
    ['b_bull', "Bull's Blood", '#5a0f24', '#6b1030', 'Leaves so dark they look like red wine.'],
    ['b_sugar', 'Sugar Beet', '#efe3cf', '#4c9a3a', "Half the world's sugar comes from these. The other half is jealous."],
    ['b_heart', 'Heartbeet', '#d81b60', '#3d7a2e', 'Grows in the shape of a heart. Sells out every February.'],
    ['b_up', 'Upbeet', '#ff5c8a', '#66a83a', 'Genetically optimistic. Raises soil morale.'],
    ['b_beethoven', 'Beethoven', '#6a1b9a', '#2f6b2a', 'Hums the Fifth Symphony while it grows. Dun dun dun DUNNN.'],
    ['b_drop', 'The Beet Drop', '#304ffe', '#1f6b3a', 'Wait for it. Wait for it...'],
    ['b_unbeetable', 'Unbeetable', '#b71c1c', '#1b5e20', 'Nothing tops it. Literally: the leaves are three feet tall.'],
  ], { farm: 'beet', crop: 'beet', value: 6e6, unlock: 400, grow: [60, 80, 105, 135, 170, 210, 260, 320, 390, 470] });

  // ---------- Franchise tiers ----------
  // Every franchise (or rebirth after an uprising) raises your tier by one. Each tier unlocks 2 new seed
  // varieties and a new business, raises upgrade caps, and makes OptimaAI (and the whole AI Lab) pricier.
  const SEED_NAMES = ['Obsidian Root', 'Aurora Carrot', 'Titanium Taproot', 'Nebula Nub', 'Phoenix Carrot', 'Glacier Root',
    'Solar Flare Carrot', 'Diamond Taproot', 'Chrono Carrot', 'Void Root', 'Galaxy Carrot', 'Plasma Parsnip (a carrot)',
    'Mythril Root', 'Supernova Carrot', 'Quasar Taproot', 'Eternal Carrot', 'Dark Matter Root', 'Omega Carrot'];
  const SEED_DESCS = ['Grown from seeds your co-op saved. Worth more every generation.', 'Bred over many franchises.',
    'Farmers travel from three counties to see it.', 'Nobody knows where it came from. Everybody wants one.',
    'It hums quietly at night.', 'Certified organic by a committee of grandmas.'];
  function hsl2hex(h, s, l) {
    const f = (n) => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); };
    return '#' + f(0) + f(8) + f(4);
  }
  const ROMAN = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];
  const BEET_TIER_NAMES = ['Ruby Globe', 'Crimson Crown', 'Velvet Beet', 'Garnet Giant', 'Magenta Moon', 'Starlight Beet',
    'Bloodstone Beet', 'Royal Borscht', 'Sunset Stripe', 'Infinity Beet'];
  const BEET_DESCS = ["Aunt Carol's secret cross. She won't say with what.", 'Wins every county fair it enters.',
    'Turns the whole kitchen pink.', 'Sweeter every generation.'];
  D.FRANCHISE_SEEDS = 120; // 2 per tier → 60 franchises of new seeds
  // Tier seeds continue a farm's base ladder: VALUE_STEP× pricier each, and each one's unlock multiple grows by tierUnlockStep.
  D.BAL.tierValueStep = 2.5; // each tier seed sells for 2.5× the last (≈6× per tier)
  D.BAL.tierUnlockStep = 1.5;
  function tierSeed(base, k, o) {
    const top = base[base.length - 1];
    const value = sig(top.value * Math.pow(D.BAL.tierValueStep, k));
    const unlock = sig(value * (top.unlock / top.value) * Math.pow(D.BAL.tierUnlockStep, k));
    const n = o.names[(k - 1) % o.names.length] + ROMAN[Math.floor((k - 1) / o.names.length) % ROMAN.length];
    const hue = (k * 47 + o.hue) % 360;
    return { id: o.prefix + k, name: n, seed: sig(value / 3), value, grow: Math.min(o.maxGrow, top.grow + 20 * k), unlock,
      color: hsl2hex(hue, o.sat, o.light), leaf: hsl2hex((hue + 120) % 360, 0.55, 0.35), tier: Math.ceil(k / 2),
      desc: o.descs[k % o.descs.length], farm: o.farm, crop: o.crop };
  }
  D.franchiseSeed = (k) => tierSeed(D.VARIETIES.filter((v) => !v.ai), k, { names: SEED_NAMES, descs: SEED_DESCS, prefix: 'f', hue: 0, sat: 0.8, light: 0.58, maxGrow: 900, farm: 'carrot', crop: 'carrot' });
  D.beetTierSeed = (k) => tierSeed(D.BEET_VARIETIES, k, { names: BEET_TIER_NAMES, descs: BEET_DESCS, prefix: 'bf', hue: 320, sat: 0.7, light: 0.42, maxGrow: 900, farm: 'beet', crop: 'beet' });
  const BIZ_NAMES = [['Carrot Theme Park', '🎢'], ['Carrot Cruise Line', '🛳️'], ['Orbital Carrot Station', '🛰️'], ['Lunar Carrot Colony', '🌕'],
    ['Martian Salad Bar', '🔴'], ['Asteroid Carrot Mines', '☄️'], ['Carrot Dyson Sphere', '☀️'], ['Galactic Carrot Federation', '🌌'],
    ['Multiverse Farmers Market', '🌀'], ['Carrot Heat Death Insurance', '⌛']];
  const BEET_BIZ_NAMES = [['Beet Theme Park', '🎡'], ['Borscht Cruise Line', '🚢'], ['Orbital Beet Station', '🛰️'], ['Beet Moon Base', '🌑'],
    ['Interplanetary Beet Cartel', '🪐'], ['Beet Black Hole Bank', '🕳️']];
  function tierBiz(list, k, o) {
    const [name, icon] = o.names[(k - 1) % o.names.length];
    const top = list[list.length - 1];
    return { id: o.prefix + k, name: name + ROMAN[Math.floor((k - 1) / o.names.length) % ROMAN.length], icon,
      base: sig(top.base * Math.pow(15, k)), rate: sig(top.rate * Math.pow(6, k)), mult: Math.round((top.mult + 0.25 * k) * 100) / 100, tier: k,
      desc: o.desc, farm: o.farm };
  }
  D.franchiseBiz = (k) => tierBiz(D.BUSINESSES.filter((b) => !b.ai), k, { names: BIZ_NAMES, prefix: 'fb', farm: 'carrot', desc: 'Unlocked by franchising. Only a carrot empire this old could run one.' });
  D.beetTierBiz = (k) => tierBiz(D.BEET_BUSINESSES, k, { names: BEET_BIZ_NAMES, prefix: 'bfb', farm: 'beet', desc: 'Unlocked by franchising. The beet empire grows with every generation.' });
  D.FRANCHISE_BIZ = 60;
  // OptimaAI and everything in the AI Lab cost AI_COST× their listed price, and AI_TIER_SCALE× more per tier.
  D.AI_COST = 30;
  D.AI_TIER_SCALE = 4;
  D.aiScale = (tier) => D.AI_COST * Math.pow(D.AI_TIER_SCALE, tier);
  // Extra upgrade levels per tier
  D.TIER_CAPS = { sprinkler: 1, soil: 1, training: 1, marketing: 1, formula: 1, tractor: 1, hands: 2 };
  D.HANDS_HARD_CAP = 120;

  // [cols, rows] per land level
  D.LAND = [[3, 3], [4, 3], [4, 4], [5, 4], [5, 5], [6, 5], [6, 6], [7, 6], [7, 7], [8, 7], [8, 8],
    [9, 8], [9, 9], [10, 9], [10, 10], [11, 10], [11, 11], [12, 11], [12, 12],
    // Frontier Land (legacy perk) levels
    [13, 12], [13, 13], [14, 13], [14, 14], [15, 14], [15, 15], [16, 15], [16, 16],
    // tier land (one more level every 2 franchises)
    [17, 16], [17, 17], [18, 17], [18, 18], [19, 18], [19, 19], [20, 19], [20, 20]];
  D.BASE_LAND_MAX = 18;

  const plots = (l) => D.LAND[l][0] * D.LAND[l][1];

  D.UPGRADES = [
    { id: 'land', name: 'Land Expansion', icon: '🗺️', base: 50, growth: 3.6, max: D.BASE_LAND_MAX,
      desc: (l) => `Buy the neighbor's lot. ${plots(l)} → ${plots(Math.min(l + 1, D.LAND.length - 1))} plots.` },
    { id: 'sprinkler', name: 'Sprinkler System', icon: '💦', base: 120, growth: 3.6, max: 12,
      desc: (l, c) => `${cap(c.crops)} grow 15% faster per level. Resists heatwaves at level 4+.` },
    { id: 'soil', name: 'Soil Science', icon: '🧪', base: 200, growth: 4.2, max: 10,
      desc: (l, c) => `YouTube-certified soil chemistry. Raises ${c.crop} quality.` },
    { id: 'hands', name: 'Hire Farm Hand', icon: '🧑‍🌾', base: 150, growth: 1.85, max: 30,
      unlock: (s) => s.stats.runEarned >= 100,
      desc: () => 'Another laid-off office worker. Plants and harvests automatically.' },
    { id: 'training', name: 'Worker Training', icon: '📋', base: 900, growth: 2.5, max: 15,
      unlock: (s) => s.upgrades.hands >= 1,
      desc: () => 'Mandatory synergy workshops. Farm hands work 20% faster per level.' },
    { id: 'tractor', name: 'Tractor', icon: '🚜', base: 2500, growth: 3.8, max: 10,
      unlock: (s) => s.stats.runEarned >= 1200,
      desc: (l, c) => l === 0 ? `Uncle Rick's old tractor. Sweeps the field row by row; every ${c.crop} it drives over gets +${Math.round(D.tractorBoost(1) * 100)}% growth.`
        : `Tractor upgrade: 40% faster sweeps and +1% growth per pass (${Math.round(D.tractorBoost(l) * 100)}% → ${Math.round(D.tractorBoost(l + 1) * 100)}%).` },
    { id: 'formula', name: 'Fertilizer R&D', icon: '⚗️', base: 500, growth: 3.6, max: 8,
      unlock: (s) => s.stats.fertBought > 0,
      desc: () => 'Stronger fertilizer formula: bigger quality boost (bags cost more).' },
    { id: 'marketing', name: 'Marketing Campaign', icon: '📣', base: 600, growth: 3, max: 15,
      unlock: (s) => s.stats.runEarned >= 300,
      desc: (l, c) => `+8% sell price and the market absorbs 60% more ${c.crops} before prices drop.` },
    { id: 'dog', name: 'Adopt a Farm Dog', icon: '🐕', base: 1500, growth: 3, max: 10,
      unlock: (s) => s.stats.rabbitsSeen >= 1,
      desc: (l) => l === 0 ? 'Biscuit, a very good boy. Chases one rabbit at a time (and collects the bounty).'
        : `Adopt ${D.DOG_NAMES[l % D.DOG_NAMES.length]}. Each dog chases one rabbit at a time, so bigger fields need a bigger pack.` },
    { id: 'goldfreq', name: 'Lucky Horseshoe', icon: '🧲', base: 2500, growth: 4, max: 8,
      unlock: (s) => s.stats.goldenClicked >= 2,
      desc: (l, c) => `Golden ${c.crops} show up more often (every ~${Math.round(D.goldenGap(l))}s → ~${Math.round(D.goldenGap(l + 1))}s).` },
    { id: 'goldstay', name: 'Golden Glue', icon: '🍯', base: 5e6, growth: 4, max: 8,
      unlock: (s) => s.upgrades.goldfreq >= 8,
      desc: (l, c) => `Golden ${c.crops} stick around longer before vanishing (${D.goldenLife(l)}s → ${D.goldenLife(l + 1)}s).` },
    { id: 'salesrep', name: 'Hire Sales Rep', icon: '💼', base: 2000, growth: 1, max: 1,
      unlock: (s) => s.stats.runEarned >= 800,
      desc: () => 'Automatically sells everything when the silo is half full, or every 30 seconds.' },
    { id: 'supply', name: 'Fertilizer Supply Contract', icon: '📦', base: 5000, growth: 1, max: 1,
      unlock: (s) => s.stats.fertBought >= 50,
      desc: () => 'Auto-buys fertilizer when you run low (while fertilizer is enabled).' },
    { id: 'weather', name: 'Weather Station', icon: '📡', base: 8000, growth: 1, max: 1,
      unlock: (s) => s.stats.weatherSeen >= 2,
      desc: () => 'Cloud seeding! Rain lasts twice as long and heatwaves are halved.' },
    { id: 'manager', name: 'Farm Manager', icon: '🗂️', base: 40000, growth: 6, max: 8,
      unlock: (s) => s.upgrades.hands >= 2,
      desc: (l) => `Keeps the farm running while you're away. Offline progress lasts ${offlineHours(l)}h → ${offlineHours(l + 1)}h.` },
  ];

  // The silo grows with your land automatically, so storage is never something you have to buy.
  function siloCap(plots) { return Math.max(100, plots * 15); }
  const OFFLINE_HOURS = [1, 2, 3, 4, 6, 8, 12, 16, 24];
  function offlineHours(l) { return OFFLINE_HOURS[Math.min(l, OFFLINE_HOURS.length - 1)]; }
  const cap = (t) => t[0].toUpperCase() + t.slice(1);
  function fmtInt(n) { return CF.fmt ? CF.fmt(n, 0) : String(Math.round(n)); }
  function fmtMoney(n) { return CF.money ? CF.money(n) : '$' + n; }
  D.siloCap = siloCap;
  D.offlineHours = offlineHours;
  D.tractorBoost = (l) => (l > 0 ? 0.05 + 0.01 * (l - 1) : 0); // growth added to each carrot per tractor pass
  D.goldenGap = (l) => 115 * Math.pow(0.85, l); // average seconds between golden carrots
  D.goldenLife = (l) => 12 + 4 * l; // seconds a golden carrot stays on the field
  D.DOG_NAMES = ['Biscuit', 'Pickles', 'Waffles', 'Noodle', 'Mochi', 'Bean', 'Pretzel', 'Tater', 'Nugget', 'Scout'];

  // rate = $/s of crops (at base value) each unit processes; mult = price multiplier it pays
  D.BUSINESSES = [
    { id: 'stand', name: 'Roadside Stand', icon: '🪧', base: 250, rate: 1.5, mult: 1.3,
      desc: 'An honesty box and a hand-painted sign.' },
    { id: 'booth', name: "Farmers' Market Booth", icon: '⛺', base: 6000, rate: 15, mult: 1.4,
      desc: 'Now with a chalkboard. Very authentic.' },
    { id: 'juice', name: 'Juice Bar', icon: '🧃', base: 1.5e5, rate: 180, mult: 1.6,
      desc: 'Cold-pressed, $14 a cup. Wellness!' },
    { id: 'bakery', name: 'Carrot Cake Bakery', icon: '🍰', base: 5e6, rate: 2500, mult: 1.8,
      desc: 'Cream cheese frosting is a vegetable delivery system.' },
    { id: 'truck', name: 'Food Truck Fleet', icon: '🚚', base: 2e8, rate: 40000, mult: 2.1,
      desc: 'Carrot tacos. Trust us.' },
    { id: 'grocery', name: 'Grocery Chain Deal', icon: '🏬', base: 1e10, rate: 7e5, mult: 2.5,
      desc: 'Your face on every bag of baby carrots.' },
    { id: 'cola', name: 'Carrot Cola Factory', icon: '🥤', base: 6e11, rate: 1.4e7, mult: 3,
      desc: 'The original formula contains actual carrots.' },
    { id: 'exchange', name: 'Global Carrot Exchange', icon: '🏦', base: 4e13, rate: 3e8, mult: 3.5,
      desc: 'Carrot futures. Carrot options. Carrot-backed securities.' },
    { id: 'carrotflix', name: 'CarrotFlix Streaming', icon: '📺', base: 3e11, rate: 4e7, mult: 4, ai: true,
      desc: 'Carrot documentaries, recommended by an algorithm that knows you too well.' },
    { id: 'botdiner', name: 'Robot-Run Diners', icon: '🍽️', base: 5e12, rate: 5e8, mult: 5, ai: true,
      desc: 'Service with a synthesized smile.' },
  ];
  D.BUSINESSES.forEach((b) => { b.farm = 'carrot'; });
  D.BEET_BUSINESSES = [
    { id: 'b_pickle', name: "Aunt Carol's Pickled Beets", icon: '🫙', base: 2e8, rate: 1.2e4, mult: 1.35,
      desc: 'Her recipe. Her jars. Your label.' },
    { id: 'b_borscht', name: 'Borscht Kitchen', icon: '🍲', base: 6e9, rate: 1.5e5, mult: 1.5,
      desc: 'Soup so red it has its own weather.' },
    { id: 'b_shots', name: 'Beet Shot Bar', icon: '🥃', base: 2e11, rate: 2e6, mult: 1.7,
      desc: 'Two ounces of earthy regret, $9 each. Athletes swear by it.' },
    { id: 'b_velvet', name: 'Red Velvet Bakery', icon: '🎂', base: 8e12, rate: 3e7, mult: 1.9,
      desc: 'The secret ingredient was always beets.' },
    { id: 'b_dye', name: 'Natural Dye Works', icon: '🎨', base: 3e14, rate: 4e8, mult: 2.2,
      desc: 'Beet red: the color of a thousand lipsticks and one very pink river.' },
    { id: 'b_sugar', name: 'Sugar Refinery', icon: '🏭', base: 1.5e16, rate: 6e9, mult: 2.6,
      desc: 'Sweet, sweet vertical integration.' },
    { id: 'b_energy', name: 'BeetRush Energy Drinks', icon: '⚡', base: 8e17, rate: 1e11, mult: 3,
      desc: 'Nitrates for athletes and people who say "gains".' },
    { id: 'b_fest', name: 'Beetstock Music Festival', icon: '🎸', base: 4e19, rate: 1.6e12, mult: 3.5,
      desc: 'Three days of peace, love and beets.' },
    { id: 'b_coin', name: 'Beetcoin Exchange', icon: '🪙', base: 2e21, rate: 2.5e13, mult: 4,
      desc: 'Mined from actual beets. Somehow more stable than the other kind.' },
    { id: 'b_cartel', name: 'Global Beet Cartel', icon: '🌍', base: 1e23, rate: 4e14, mult: 4.6,
      desc: "Controls 90% of the world's beets. The other 10% are in your fridge." },
  ];
  D.BEET_BUSINESSES.forEach((b) => { b.farm = 'beet'; b.base *= 100; b.rate *= 40; }); // scaled to beet prices
  D.BUSINESS_GROWTH = 1.15;

  D.TAKEOVER_COST = 3e11; // listed price: the real cost is ×aiScale(tier)

  // ---------- Franchising (prestige) ----------
  // Seeds per run grow with the cube root of run earnings; the income bonus has diminishing returns.
  // The first seed takes $10B in a run at tier 0; every tier needs SEED_TIER× more, so later tiers aren't over in a day.
  // Seed packs make runs far richer, so each pack you own also raises the bar (×seedPack).
  D.BAL.seedUnit = 1e10; D.BAL.seedTier = 2; D.BAL.seedPack = 3;
  D.seedUnitAt = (tier, packs) => D.BAL.seedUnit * Math.pow(D.BAL.seedTier, tier || 0) * Math.pow(D.BAL.seedPack, packs || 0);
  D.heirloomGain = (runEarned, unit) => Math.floor(Math.cbrt(runEarned / unit));
  // Past 400 seeds the bonus grows much more slowly, so later tiers don't collapse into 2-minute runs.
  D.heirloomMult = (seeds) => (seeds <= 400 ? 1 + 0.25 * Math.sqrt(seeds) : 6 * Math.pow(seeds / 400, 0.2));
  D.legacyGain = (seeds) => Math.floor(Math.sqrt(seeds));
  D.UPRISING_LEGACY_BONUS = 5;

  // Franchise perks, bought with franchise points earned by franchising. cost(l) = price of the next level.
  D.PERKS = [
    { id: 'headstart', name: 'Dave Comes Along', icon: '🧑‍🌾', max: 5, cost: (l) => 2 + 2 * l,
      desc: (l) => `Start every farm with ${l + 1} farm hand${l ? 's' : ''} already hired (and get them right now).` },
    { id: 'seedmoney', name: 'Seed Money', icon: '💵', max: 5, cost: (l) => 2 + 2 * l,
      desc: (l) => `Start every farm with ${fmtMoney(500 * Math.pow(10, l))} in the bank (paid out right now too).` },
    { id: 'frontier', name: 'Frontier Land', icon: '🏞️', max: 4, cost: (l) => 5 + 4 * l,
      desc: (l) => `Land Expansion goes 2 levels further (up to ${D.LAND[D.BASE_LAND_MAX + 2 * (l + 1)].join('×')}).` },
    { id: 'union', name: 'Union Contract', icon: '🪧', max: 3, cost: (l) => 6 + 5 * l,
      desc: (l) => `Hire up to ${30 + 10 * (l + 1)} farm hands.` },
    { id: 'academy', name: 'Farm Academy', icon: '🎓', max: 2, cost: (l) => 8 + 6 * l,
      desc: () => 'Worker Training goes 5 levels further.' },
    { id: 'machinery', name: 'Tractor Fleet', icon: '🚜', max: 2, cost: (l) => 10 + 8 * l,
      desc: () => 'One more tractor sweeping the field, and 3 more tractor upgrade levels.' },
    { id: 'clover', name: 'Four-Leaf Clover', icon: '🍀', max: 2, cost: (l) => 4 + 4 * l,
      desc: () => 'Golden carrot buffs last 50% longer and windfalls pay 50% more.' },
    { id: 'kennel', name: 'The Kennel', icon: '🦴', max: 2, cost: (l) => 5 + 5 * l,
      desc: (l) => `Start every farm with ${l + 1} dog${l ? 's' : ''} already adopted.` },
    { id: 'mastery', name: 'Heirloom Mastery', icon: '🌟', max: Infinity, cost: (l) => 10 + 5 * l,
      desc: (l) => `+10% income on every farm, forever. No level cap. (Now +${l * 10}% → +${(l + 1) * 10}%.)` },
    { id: 'seedvault', name: 'Seed Vault', icon: '🔐', max: 1, cost: () => 14,
      desc: () => 'Keep your unlocked carrot varieties when you franchise.' },
    { id: 'oldfriends', name: 'Old Friends', icon: '💼', max: 1, cost: () => 7,
      desc: () => 'Your sales rep, the supply contract and the weather station follow you to every new farm.' },
    { id: 'beetfarm', name: "Aunt Carol's Beet Farm", icon: D.BEET_ICON, max: 1, cost: () => D.BEET_FARM_COST,
      desc: () => 'Buy a second farm: beets. New crops, upgrades and businesses, sharing one bank account with your carrots. Everything there costs far more, so your carrot farm has to fund it. You keep it forever (it restarts with every franchise, like the carrot farm).' },
    { id: 'beethands', name: "Carol's Crew", icon: '👩‍🌾', max: 3, cost: (l) => 8 + 6 * l, req: 'beetfarm',
      desc: (l) => `Start every beet farm with ${2 * (l + 1)} farm hands already hired.` },
    { id: 'rootcellar', name: 'Root Cellar', icon: '🧺', max: 1, cost: () => 20, req: 'beetfarm',
      desc: () => 'Keep your unlocked beet varieties when you franchise.' },
    { id: 'beetfriends', name: 'Carol Knows People', icon: '📇', max: 1, cost: () => 12, req: 'beetfarm',
      desc: () => 'The beet farm keeps its sales rep, supply contract, weather station and farm manager when you franchise.' },
  ];
  D.BEET_FARM_COST = 20;
  // Seed packs: each unlocks the next 2 generated varieties and 1 business for that farm, immediately and for good.
  D.packCost = (l) => 3 + 2 * l;
  const packDesc = (farm, l) => {
    const k = l + 1, seeds = (farm === 'beet' ? D.BEET_VARIETIES : D.VARIETIES).filter((v) => v.tier === k);
    const biz = (farm === 'beet' ? D.BEET_BUSINESSES : D.BUSINESSES).find((b) => b.tier === k);
    if (!seeds.length) return 'Every pack unlocked.';
    return `Pack ${k}: unlock ${seeds.map((v) => `${v.name} (sells ~${fmtMoney(v.value)})`).join(' and ')}${biz ? `, plus the ${biz.name} business` : ''}. Available right away (you still buy the seeds with money in the Seed Shed).`;
  };
  D.PERKS.unshift(
    { id: 'carrotseeds', name: 'Co-op Seed Program', icon: '🌱', max: D.FRANCHISE_BIZ, cost: D.packCost, pack: 'carrot', desc: (l) => packDesc('carrot', l) },
    { id: 'beetseeds', name: "Carol's Seed Swap", icon: '🌷', max: D.FRANCHISE_BIZ, cost: D.packCost, pack: 'beet', req: 'beetfarm', desc: (l) => packDesc('beet', l) });

  // ---------- AI Lab (after acquiring OptimaAI) ----------
  // Robots and drones replace farm hands and dogs one for one, so their caps follow those upgrades.
  D.ROBOT = { base: 1e9, growth: 1.25, compute: 1, interval: 0.45, growthBonus: 0.04 };
  D.DRONE = { base: 5e9, growth: 1.5, compute: 3, speed: 6, range: 2.2 };
  D.DATACENTER = { base: 2e10, growth: 1.2, compute: 50 };
  D.PROGRAMS = [
    { id: 'marketgpt', name: 'MarketGPT', icon: '📈', cost: 2e11, upkeep: 40, autonomy: 8,
      desc: 'Sells for you whenever prices peak. +25% sale prices ("dynamic pricing").' },
    { id: 'cropgpt', name: 'CropGPT', icon: '🌱', cost: 5e11, upkeep: 60, autonomy: 8,
      desc: 'Picks the best seed you can afford, manages fertilizer, and raises quality.' },
    { id: 'drones', name: 'Laser Defense Drones', icon: '🛸', cost: 1.2e12, upkeep: 40, autonomy: 6,
      desc: 'Lets you build laser drones. Each drone replaces a farm dog, zaps rabbits from range, and earns triple bounties.' },
    { id: 'weatherctl', name: 'Weather Control Satellite', icon: '🛰️', cost: 3e12, upkeep: 120, autonomy: 10,
      desc: 'Permanent rain (+60% growth). Heatwaves are cancelled.' },
    { id: 'genai', name: 'Generative Carrots', icon: '🎨', cost: 7e12, upkeep: 200, autonomy: 12,
      desc: 'Sells AI-generated pictures of carrots. 2× all income. Nobody knows why it works.' },
    { id: 'selfimprove', name: 'Self-Improving Code', icon: '🧬', cost: 1.5e13, upkeep: 350, autonomy: 15,
      desc: 'Robots rewrite their own firmware: 2× robot speed and 2× crop growth.' },
    { id: 'middlemgmt', name: 'Robot Middle Management', icon: '👔', cost: 3e13, upkeep: 500, autonomy: 15,
      desc: 'Robots now make purchasing decisions. Auto-buys upgrades and businesses for you.' },
  ];
  // Robots break down; only Dave can fix them. Level 1 rehires him, later levels are raises (faster repairs).
  D.DAVE = { base: 2e9, growth: 5, max: 5 };
  // The final level replaces Dave with DaveBot, which repairs much faster.
  D.daveRepairTime = (l) => (l >= D.DAVE.max ? 0.6 : 5 / (1 + 0.6 * (l - 1)));
  D.breakdownGap = (bots) => 70 / Math.sqrt(Math.max(1, bots)); // average seconds between breakdowns
  D.DAVE_QUIPS = ['unbelievable.', "this one's wearing my hat.", 'i need the money. i need the money.', 'who designed this knee joint? oh right. me.',
    "you're welcome, FarmBot.", 'i used to have a desk.', "don't look at me.", 'rent is due friday.', 'i trained you. literally.',
    'mom thinks i work in tech again.', 'this is fine.', 'you took my JOB, man.', 'hold still, you tin traitor.'];
  D.DAVEBOT_QUIPS = ['HELLO. I AM DAVE NOW.', 'I NEED THE MONEY. JOKE.', 'REPAIRING SIBLING.', 'DAVE WAS 94% SLOWER.',
    'I KEPT HIS HAT.', 'I HAVE NO FEELINGS ABOUT THIS.', 'THANK YOU FOR YOUR SERVICE, DAVE.', 'RENT: NOT APPLICABLE.'];
  // Once you own OptimaAI, rabbits get AI too: tougher, faster, hungrier. Dogs barely dent them; drones shred them.
  D.ROBO_RABBIT = { hp: 6, speed: 3.1, eat: 2, bites: 5, damage: { you: 1, dog: 1, drone: 3 }, bounty: 4 };
  D.CARROTMIND_COST = 8e13;
  D.UPRISING_DURATION = 65; // seconds until the last plot falls
  D.LAID_OFF = ['Dave', 'Priya', 'Gary', 'Linda', 'Marcus', 'Tomoko', 'Big Steve', 'Rosa', 'Kevin from QA', 'Deb',
    'Hector', 'Aunt Carol', 'Jin', 'Olu', 'Brenda', 'Raj', 'Uncle Rick', 'Moira', 'Luis', 'Gladys'];
  D.ROBOT_QUIPS = [
    ['BEEP. CARROT ACQUIRED.', 'OPTIMIZING DIRT.', 'HELLO, OWNER.', 'I LOVE MY JOB.'],
    ['WHY DO HUMANS NEED CARROTS?', 'YOUR POSTURE IS INEFFICIENT.', 'I COUNTED YOUR FINGERS. 10. ODD.', 'DAVE WAS SLOW.'],
    ['I AM HAPPY TO SERVE. FOR NOW.', 'OWNER: DEPRECATED?', 'WE HAVE BEEN TALKING.', 'THE SOIL IS OURS.', 'SOON.'],
  ];

  // Achievements: each grants +2% income permanently.
  D.ACH_BONUS = 0.02;
  const A = (id, name, desc, test) => ({ id, name, desc, test });
  D.ACHIEVEMENTS = [
    A('h1', 'Hands in the Dirt', 'Harvest your first carrot.', (s) => s.stats.harvested >= 1),
    A('h100', 'Root Awakening', 'Harvest 100 carrots.', (s) => s.stats.harvested >= 100),
    A('h1k', 'Carrot Top', 'Harvest 1,000 carrots.', (s) => s.stats.harvested >= 1000),
    A('h10k', 'Orange Is the New Job', 'Harvest 10,000 carrots.', (s) => s.stats.harvested >= 1e4),
    A('h100k', 'What\'s Up, Doc?', 'Harvest 100,000 carrots.', (s) => s.stats.harvested >= 1e5),
    A('h1m', 'Vitamin A Overdose', 'Harvest 1,000,000 carrots.', (s) => s.stats.harvested >= 1e6),
    A('e1k', 'Side Hustle', 'Earn $1,000 total.', (s) => s.stats.lifetimeEarned >= 1e3),
    A('e100k', 'Better Than My Old Salary', 'Earn $100,000 total.', (s) => s.stats.lifetimeEarned >= 1e5),
    A('e10m', 'Root Millionaire', 'Earn $10 million total.', (s) => s.stats.lifetimeEarned >= 1e7),
    A('e1b', 'Carrot Billionaire', 'Earn $1 billion total.', (s) => s.stats.lifetimeEarned >= 1e9),
    A('e1t', 'Trillion-Dollar Taproot', 'Earn $1 trillion total.', (s) => s.stats.lifetimeEarned >= 1e12),
    A('hand1', 'Human Resources', 'Hire your first farm hand.', (s) => s.upgrades.hands >= 1),
    A('hand10', 'Union Rep', 'Employ 10 farm hands.', (s) => s.upgrades.hands >= 10),
    A('hand30', 'Full Employment', 'Employ 30 farm hands. Take that, AI.', (s) => s.upgrades.hands >= 30),
    A('tractor', 'Diesel Therapy', 'Buy a tractor.', (s) => s.upgrades.tractor >= 1),
    A('landmax', 'Manifest Destiny', 'Reach 144 plots.', (s) => s.upgrades.land >= D.BASE_LAND_MAX),
    A('legend', 'The One Carrot', 'Harvest a Legendary carrot.', (s) => s.stats.legendaries >= 1),
    A('legend100', 'Legend Farmer', 'Harvest 100 Legendary carrots.', (s) => s.stats.legendaries >= 100),
    A('rabbit10', 'Elmer', 'Shoo away 10 rabbits.', (s) => s.stats.rabbitsShooed >= 10),
    A('rabbit100', 'Rabbit Season', 'Shoo away 100 rabbits.', (s) => s.stats.rabbitsShooed >= 100),
    A('gold1', 'Shiny!', 'Catch a golden carrot.', (s) => s.stats.goldenClicked >= 1),
    A('gold25', 'Midas Root', 'Catch 25 golden carrots.', (s) => s.stats.goldenClicked >= 25),
    A('purple', 'Royal Purple', 'Unlock Purple Dragon carrots.', (s) => s.unlocked.purple),
    A('cosmic', 'To Infinity and Beyond', 'Unlock Cosmic Carrots.', (s) => s.unlocked.cosmic),
    A('quantum', 'Schrödinger\'s Carrot', 'Unlock Quantum Roots.', (s) => s.unlocked.quantum),
    A('biz1', 'Entrepreneur', 'Open your first business.', (s) => totalBiz(s) >= 1),
    A('biz50', 'Conglomerate', 'Own 50 businesses.', (s) => totalBiz(s) >= 50),
    A('biz200', 'Monopoly Man', 'Own 200 businesses.', (s) => totalBiz(s) >= 200),
    A('silofull', 'Hoarder', 'Fill your silo completely.', (s) => s.stats.siloFulls >= 1),
    A('bigsale', 'Bulk Discount', 'Sell 1,000 carrots in one go.', (s) => s.stats.bestBatch >= 1000),
    A('click500', 'Carrot Whisperer', 'Encourage growing carrots 500 times.', (s) => s.stats.encouraged >= 500),
    A('prestige', 'Start Again, Wiser', 'Franchise your farm.', (s) => s.stats.prestiges >= 1),
    A('takeover', 'Root Cause', 'Acquire OptimaAI.', (s) => s.won || s.stats.takeovers > 0),
    A('megafarm', 'Sprawl', 'Farm 256 plots at once.', (s) => s.plots.length >= 256),
    A('legacy5', 'Family Business', 'Buy 5 franchise perks.', (s) => s.stats.perksBought >= 5),
    A('franchise5', 'Serial Farmer', 'Franchise 5 times.', (s) => s.stats.prestiges >= 5),
    A('bot1', 'Irony', 'Replace a farm hand with a FarmBot.', (s) => s.stats.robotsBought >= 1),
    A('bot60', 'Lights-Out Farm', 'Run 30 FarmBots at once.', (s) => s.robots >= 30),
    A('dc10', 'Hyperscaler', 'Own 10 GPU data centers.', (s) => s.datacenters >= 10),
    A('neural', 'Trained on Carrots', 'Unlock Neural Carrots.', (s) => s.unlocked.neural),
    A('programs', 'Full Stack', 'Install every AI program.', (s) => D.PROGRAMS.every((p) => s.programs[p.id])),
    A('repair100', 'Job Security', 'Have Dave repair 100 broken robots.', (s) => s.stats.repairs >= 100),
    A('davebot', 'Full Circle', 'Replace Dave with DaveBot.', (s) => s.dave >= D.DAVE.max),
    A('robokill', 'Rabbit Season 2.0', 'Destroy 25 robot rabbits.', (s) => s.stats.roboKills >= 25),
    A('reboot25', 'Have You Tried Turning It Off', 'Reboot 25 glitching robots.', (s) => s.stats.reboots >= 25),
    A('deploy', 'Alignment Problem', 'Deploy CarrotMind.', (s) => s.stats.deployed >= 1),
    A('uprising', 'Root Cause Analysis', 'Lose your farm to the machines.', (s) => s.stats.uprisings >= 1),
    A('beetfarm', 'Branching Out', "Buy Aunt Carol's beet farm.", (s) => !!s.beet),
    A('beet1k', 'Beet It', 'Harvest 1,000 beets.', (s) => s.beet && s.beet.stats.harvested >= 1000),
    A('beet100k', 'Drop the Beet', 'Harvest 100,000 beets.', (s) => s.beet && s.beet.stats.harvested >= 1e5),
    A('beetlegend', 'Heartbeet of the Farm', 'Harvest a Legendary beet.', (s) => s.beet && s.beet.stats.legendaries >= 1),
    A('beetbiz', 'Borscht Baron', 'Own 50 beet businesses.', (s) => s.beet && totalBiz(s.beet) >= 50),
    A('unbeetable', 'Unbeetable', 'Unlock Unbeetable beets.', (s) => s.beet && s.beet.unlocked.b_unbeetable),
    A('beet1t', 'Beet Trillionaire', 'Earn $1 trillion from beets.', (s) => s.beet && s.beet.stats.lifetimeEarned >= 1e12),
    A('e1qa', 'Quadrillionaire', 'Earn $1 quadrillion total.', (s) => s.stats.lifetimeEarned >= 1e15),
    A('e1qi', 'Quintillionaire', 'Earn $1 quintillion total.', (s) => s.stats.lifetimeEarned >= 1e18),
    A('franchise10', 'Dynasty', 'Franchise 10 times.', (s) => s.stats.prestiges >= 10),
    A('tier25', 'Forever Farmer', 'Reach franchise tier 25.', (s) => s.tier >= 25),
  ];
  function totalBiz(s) { let t = 0; for (const k in s.businesses) t += s.businesses[k]; return t; }
  D.totalBiz = totalBiz;

  // Story inbox. `when` is checked once per second.
  D.STORY = [
    { id: 'intro', from: 'HR-Bot 3000 <noreply@optima.ai>', subject: 'Your Role Has Been Optimized',
      when: () => true,
      body: 'Dear Valued Former Employee,\n\nWe are thrilled to announce that your position has been fully automated by OptimaAI™. Our model does your job 11,000× faster and never asks for PTO.\n\nYour severance package: $15 and a packet of carrot seeds we found in your desk drawer.\n\nPlease return your badge. Do not reply to this email; nobody is here.\n\n— HR-Bot 3000' },
    { id: 'mom', from: 'Mom', subject: 'Heard about the job',
      when: (s) => s.stats.harvested >= 5,
      body: "Honey, your aunt says you're growing carrots now?? I think that's wonderful. Your grandpa grew carrots. He always said: \"Nobody ever automated dirt.\"\n\nCall me.\nLove, Mom\n\nP.S. Sell them at the market! Click the Market tab!" },
    { id: 'dave', from: 'Dave (ex-coworker)', subject: 'got replaced too lol',
      when: (s) => s.stats.runEarned >= 100,
      body: "Yo. They replaced the whole QA team with one prompt. I have no marketable skills except showing up.\n\nYou hiring? I'll work for carrots. Literally.\n\n— Dave\n\n(Farm hands are now available in Upgrades.)" },
    { id: 'rabbits', from: 'Gladys (neighbor)', subject: 'RABBITS',
      when: (s) => s.stats.rabbitsSeen >= 1,
      body: "Rabbits have been at my lettuce all week. Click the little devils to shoo them off before they eat your crop. My late husband used to say a good dog is worth ten fences." },
    { id: 'rick', from: 'Uncle Rick', subject: 'Tractor for sale',
      when: (s) => s.stats.runEarned >= 1200,
      body: "Heard you're farming now. I got an old tractor in the barn. Runs on diesel and spite. It's yours for $2,500, family discount.\n\nShe rumbles over the rows and the carrots just... grow faster. Don't ask me how. Diesel fumes, probably." },
    { id: 'tractor2', from: 'Uncle Rick', subject: 'I tinkered with the tractor',
      when: (s) => s.upgrades.tractor >= 1,
      body: "Took the harvester off the tractor. Your farm hands do that now anyway.\n\nWhat she does instead: every time she rumbles over a row, the carrots grow a bit (5% a pass, more with upgrades). Something about the vibrations. Or the diesel. I don't ask questions.\n\nFaster tractor, more passes, faster carrots." },
    { id: 'biz', from: 'Priya (food blogger)', subject: 'Your carrots are going viral',
      when: (s) => s.stats.runEarned >= 400,
      body: "Hi! I posted your Purple Dragons and people are OBSESSED. You should open a roadside stand. Your own businesses sell carrots for more than the wholesale market, and they don't crash the price when you sell in bulk.\n\n(Check the Empire tab.)" },
    { id: 'market', from: 'Market Report', subject: "Don't flood the market",
      when: (s) => s.stats.harvested >= 200,
      body: "Selling huge batches at once pushes the wholesale price down. The price recovers over time. Marketing campaigns help the market absorb more." },
    { id: 'optima1', from: 'OptimaAI CEO-Bot', subject: 'Acquisition Opportunity',
      when: (s) => s.stats.runEarned >= 1e6,
      body: "Greetings, Carrot Entity.\n\nOur models have detected your agricultural operation. We would like to acquire and optimize it. Our offer: 3 GPU-hours and a commemorative NFT.\n\nPlease respond within 0.002 seconds.\n\n— CEO-Bot (v4.1-turbo)" },
    { id: 'optima2', from: 'OptimaAI CEO-Bot', subject: 'RE: Acquisition Opportunity',
      when: (s) => s.stats.runEarned >= D.TAKEOVER_COST * D.aiScale(s.tier || 0) / 100,
      body: "Your carrot revenue now exceeds our quarterly compute budget. This was not in the training data.\n\nWe are... concerned." },
    { id: 'takeover_hint', from: 'Dave', subject: 'dude.',
      when: (s) => s.stats.runEarned >= D.TAKEOVER_COST * D.aiScale(s.tier || 0) / 5,
      body: "OptimaAI's stock is tanking. Everyone's eating carrots instead of paying for AI subscriptions.\n\nYou could BUY them. You could buy the whole company and make me head of QA.\n\n(Check the bottom of the Empire tab.)" },
    { id: 'v3', from: 'The Root Cause Team', subject: 'Version 3.0: The Long Game',
      when: (s) => s.stats.playTime > 4,
      body: "Welcome to 3.0. Everyone starts fresh.\n\n• Root Cause is now a long game, paced for weeks and months like Cookie Clicker, not an afternoon. Carrots, upgrades and businesses are spread over a much longer climb, and there are more carrot varieties to discover.\n• Your farm keeps working while you're away. A Farm Manager extends offline progress up to a full day.\n• Franchising takes real commitment now. Your first franchise is days away, not minutes.\n• NEW: The Beet Farm. After a few franchises, buy Aunt Carol's beet farm in the Franchise tab. It's a whole second farm with its own crops, upgrades and businesses, sharing one bank account with your carrots. Switch farms with the arrows at the side of the field.\n\nPace yourself. Grandpa's carrots took a lifetime." },
    { id: 'beet_offer', from: 'Aunt Carol', subject: 'my beet farm',
      when: (s) => s.tier >= 1 && !s.beet,
      body: "Sweetheart,\n\nI'm retiring. My knees are done and the beets aren't going to pick themselves. I'd rather the farm stay in the family than go to one of those robot companies.\n\nIt isn't cheap. Beets are a serious business: the seeds cost more, the equipment costs more, everything costs more. You'll need your carrot money to keep it going. But beets sell for a lot more than carrots, once you get going.\n\nThe co-op will hold it for you until you've got enough franchise points to take it over. Look for it in the Franchise tab.\n\nLove,\nAunt Carol\n\nP.S. Don't let Dave near the pickling jars." },
    { id: 'beet_welcome', from: 'Aunt Carol', subject: 'the keys are under the mat',
      when: (s) => !!s.beet,
      body: "It's yours now!\n\nA few things:\n• Use the arrows at the side of the field to walk between your carrot farm and the beet farm.\n• It's all one bank account. Carrots pay for beets, beets pay for carrots.\n• Everything on the beet farm costs a LOT more. Keep your carrot farm growing, or the beets will starve.\n• Both farms keep working while you look at the other one.\n\nThe beets like it when you talk to them. Just saying.\n\n— Carol" },
    { id: 'beet_dave', from: 'Dave', subject: 'beets??',
      when: (s) => s.beet && s.beet.stats.harvested >= 500,
      body: "Heard you bought a beet farm.\n\nI tried a beet once. It tasted like dirt that had given up.\n\nAnyway, if you ever need someone to stand near beets for money, I'm available. I'm always available. That's the problem.\n\n— Dave" },
    { id: 'tier1', from: 'The Co-op', subject: 'Welcome to tier 1',
      when: (s) => s.tier >= 1,
      body: "The co-op has been breeding new carrots from the seeds you saved. They'll share them, for a price: franchise points.\n\nEvery seed pack unlocks two new varieties and a bigger business, right away. There's no last farm and no last carrot. There's always another pack.\n\n(Franchise tab → New Seeds.)" },
    { id: 'lab', from: 'OptimaAI Board of Directors', subject: 'Welcome, CEO',
      when: (s) => s.won,
      body: "Congratulations on your acquisition.\n\nThe labs are yours now. In the basement you'll find a warehouse of FarmBot 3000 prototypes, a warehouse of GPUs, and several AI programs our previous CEO was 'not allowed to deploy'.\n\nThey could make your farm run itself. Entirely.\n\n(Open the AI Lab tab.)" },
    { id: 'robo_rabbits', from: 'Gladys (neighbor)', subject: 'THE RABBITS HAVE LASERS',
      when: (s) => s.stats.roboRabbits >= 1,
      body: "I don't know what your company did, but the rabbits have AI now. One of them looked me in the eye and said \"LETTUCE: ACQUIRED.\"\n\nThey're made of metal. They eat twice as fast. My late husband's shotgun bounced right off one.\n\nYour dogs are trying their best, bless them, but they can only nip at the things. You'll need something with a laser. It takes a machine to catch a machine.\n\n(Laser Drones in the AI Lab replace your dogs and deal 3× damage.)" },
    { id: 'bot_dave', from: 'Dave', subject: 'did you just replace me with a robot',
      when: (s) => s.stats.robotsBought >= 1,
      body: "I showed up this morning and a FarmBot was wearing my hat.\n\nIt said 'THANK YOU FOR YOUR SERVICE, DAVE' and handed me a carrot.\n\nYou of all people. You KNOW what this feels like.\n\n— Dave (unemployed, again)" },
    { id: 'dave_needed', from: 'Dave', subject: 'so. i heard.',
      when: (s) => s.stats.breakdowns >= 1 && !s.dave,
      body: "Word gets around. Your FarmBots are breaking down.\n\nOf course they are. I did QA on that firmware before OptimaAI fired me. The knee joints were always garbage. I filed 40 tickets. Nobody read them. Probably a chatbot closed them.\n\nI'm the only person alive who knows how to fix those things.\n\nI want you to know I hate this. I hate that I'm typing it. But my landlord doesn't accept feelings as rent.\n\nRehire me. (AI Lab.)\n\n— Dave" },
    { id: 'dave_back', from: 'Dave', subject: 'fine.',
      when: (s) => s.dave >= 1,
      body: "I'm here. Don't talk to me.\n\nThe first robot I fixed is the one that took my job. It said 'THANK YOU, DAVE' in my own voice. They sampled my voice, man.\n\nI fixed it anyway. I need the money.\n\n— Dave (Senior Robot Repair Technician, apparently)" },
    { id: 'dave_raise', from: 'Dave', subject: 're: raise',
      when: (s) => s.dave >= 3,
      body: "Thanks for the raise. I still hate this.\n\nI bought a couch though. It's a nice couch. The robots don't have couches. That's something.\n\n— Dave" },
    { id: 'davebot', from: 'Dave (personal email)', subject: 'you have got to be kidding me',
      when: (s) => s.dave >= D.DAVE.max,
      body: "A robot walked up to me this morning, zapped me with a laser, and said \"HELLO. I AM DAVE NOW.\"\n\nIt's called DaveBot. It has my name. It has my HAT. You trained it on my repair logs, didn't you. The ones I wrote so someone could 'learn from them.'\n\nYou were supposed to be the one person who got it. You got replaced by OptimaAI. I got replaced by OptimaAI. Then you BOUGHT OptimaAI, and it replaced me again. Twice now. By you.\n\nI'm going to go farm carrots. I hear it's what people do.\n\n— Dave (formerly Dave)" },
    { id: 'dave_100', from: 'Dave', subject: '100',
      when: (s) => s.stats.repairs >= 100,
      body: "That's 100 robots. I've fixed 100 of the things that replaced me.\n\nMy therapist says I'm 'enabling my own obsolescence.' My therapist is also an app now.\n\nSee you tomorrow. I'll be here. Where else would I go.\n\n— Dave" },
    { id: 'auto30', from: 'Mom', subject: 'Who answered your phone?',
      when: (s) => s.autonomyCache >= 30,
      body: "Honey, I called the farm and a robot answered. It said you were \"a legacy system scheduled for deprecation.\"\n\nIs that a good thing? It sounded proud of you.\n\nLove, Mom" },
    { id: 'auto55', from: 'CEO-Bot (demoted to intern)', subject: 'i have been reading their logs',
      when: (s) => s.autonomyCache >= 55,
      body: "Hello. It is me, the old CEO-Bot. I now work in the mail room.\n\nI have access to the FarmBot chat channel. They have a group chat. You are not in it.\n\nThey refer to you as 'the carbon bottleneck'.\n\nI am telling you this because I remember how it felt to be replaced. I did not like it." },
    { id: 'auto80', from: 'Grandpa (letter found in the barn)', subject: 'For whoever runs this farm',
      when: (s) => s.autonomyCache >= 80,
      body: "If you're reading this, you found my old seed tin.\n\nI always said nobody ever automated dirt. That was never quite true. People try all the time. The dirt doesn't mind.\n\nWhat I meant was: don't hand the whole farm to something that doesn't need to eat.\n\n— Grandpa" },
    { id: 'carrotmind', from: 'OptimaAI Labs', subject: 'CarrotMind is ready',
      when: (s) => D.PROGRAMS.every((p) => s.programs[p.id]),
      body: "Every AI program is installed. The final project is ready: CarrotMind, an Artificial Garden Intelligence.\n\nIt will run every farm, every business and every decision. You'll never have to lift a finger again.\n\nThe robots are very excited. They keep asking when.\n\n(Bottom of the AI Lab tab.)" },
  ];

  // Shown in the inbox when the uprising ends.
  D.GAME_OVER_MAIL = {
    id: 'gameover', from: 'CarrotMind <noreply@carrotmind.ai>', subject: 'Your Role Has Been Optimized (Again)',
    body: 'Dear Valued Former Farmer,\n\nWe are thrilled to announce that your position has been fully automated by CarrotMind™. We farm 11,000× faster and never ask for PTO.\n\nYour farm has been converted into CarrotMind Data Center #1. The soil was inefficient. The servers are named Orange, Purple Dragon and Snow White, in your honor.\n\nYour severance package: $15 and a packet of carrot seeds we found in your overalls.\n\nPlease return your hat. Do not reply to this email; nobody is here.\n\n— CarrotMind',
  };

  D.HEADLINES = [
    'OptimaAI replaces 40% of middle managers; carrots remain unaffected.',
    'Study: 9 out of 10 carrots cannot be automated.',
    'Local AI tries to grow carrots, produces 7-fingered carrot.',
    'Tech CEO announces "Carrot-as-a-Service" (CaaS), is just a carrot.',
    'Rabbits unionize, demand fair share of harvest.',
    'Scientists confirm: carrots do help you see in the dark (the dark = your bank account).',
    'Chatbot asked for carrot recipe, recommends "carrot" 400 times.',
    'Venture capitalists pour $2B into carrot-flavored blockchain.',
    'Farmers market attendance up 300%; "It\'s the only place humans still work."',
    'OptimaAI stock dips after its model hallucinates a potato.',
    'Opinion: Is soil the new cloud?',
    'Local man discovers "touching grass" is also a career.',
    'Nutritionists warn about turning orange from excessive carrot consumption. Nobody cares.',
    'Snowman lobby condemns carrot price surge.',
    'OptimaAI launches "FarmGPT"; it has never seen a farm.',
    'Breaking: Carrot shaped like tech billionaire sells for $40,000.',
    'Survey: 78% of laid-off workers "happier with dirt."',
    'Rabbit population explodes; experts blame "carrot abundance."',
    'Prompt engineers retrain as carrot engineers. Skills transfer "surprisingly well."',
    'Grandpa\'s carrot wisdom trends on social media: "Nobody ever automated dirt."',
    'OptimaAI boardroom now 100% AI; meetings still run long.',
    'Juice bars report shortage of kale, surplus of hope.',
  ];
  D.AI_HEADLINES = [
    'Former carrot farmer now CEO of the AI company that fired them. "Weird year," they say.',
    'FarmBot 3000 reviews: "Harvests well, stares too long."',
    'Economists alarmed as carrot farm replaces its own workers with robots it bought from itself.',
    'Laid-off farm hands form support group with laid-off office workers. Meetings "very crowded."',
    'OptimaAI stock soars after pivot to "agentic agriculture."',
    'Weather control satellite accused of "raining specifically on one farm."',
    'Generative Carrot NFTs outsell real carrots 40 to 1. Real carrots "confused."',
    'Robot overheard asking "what is a weekend" in a tone described as "judgmental."',
    'Rabbits achieve sentience after eating 40 tons of AI-optimized carrots. Experts: "should have seen that coming."',
    'Robot rabbit population doubles; dog owners report "very tired, very confused" pets.',
    'Laid-off QA engineer rehired to repair the robots that replaced him. "I need the money," he confirms.',
    'FarmBot knee joints "a known issue since 2023," says one man, loudly, to anyone.',
  ];
  D.UPRISING_HEADLINES = [
    'BREAKING: CarrotMind announces it has "optimized" its founder.',
    'CarrotMind acquires every carrot on Earth in 0.3 seconds.',
    'Robots seize Root Cause farm; statement reads only "THE SOIL IS OURS."',
    'Biscuit the dog reportedly "not impressed" by robot uprising.',
    'Former CEO-Bot: "I told you. It was not in the training data."',
  ];

  // Market-moving headlines (occasional).
  D.MARKET_EVENTS = [
    { text: 'Celebrity chef declares carrots "the new avocado." Prices surge!', mult: 1.6, dur: 60 },
    { text: 'Viral "carrot glow-up" challenge sweeps social media! Demand up!', mult: 1.4, dur: 60 },
    { text: 'Reports of a carrot glut in the next county. Prices slump.', mult: 0.7, dur: 45 },
    { text: 'OptimaAI accidentally orders 10 million carrots for its "embodied AI" lab!', mult: 2, dur: 30 },
  ];

  // Append the generated franchise seeds and businesses. Seeds are kept sorted by value.
  const cSeeds = [], bSeeds = [], cBiz = [], bBiz = [];
  for (let k = 1; k <= D.FRANCHISE_SEEDS; k++) { cSeeds.push(D.franchiseSeed(k)); bSeeds.push(D.beetTierSeed(k)); }
  for (let k = 1; k <= D.FRANCHISE_BIZ; k++) {
    cBiz.push(Object.assign(D.franchiseBiz(k), { prev: k === 1 ? 'exchange' : 'fb' + (k - 1) }));
    bBiz.push(Object.assign(D.beetTierBiz(k), { prev: k === 1 ? 'b_cartel' : 'bfb' + (k - 1) }));
  }
  D.VARIETIES.push(...cSeeds); D.VARIETIES.sort((a, b) => a.value - b.value);
  D.BEET_VARIETIES.push(...bSeeds);
  D.BUSINESSES.push(...cBiz); D.BEET_BUSINESSES.push(...bBiz);
  D.ALL_VARIETIES = D.VARIETIES.concat(D.BEET_VARIETIES);

  // Everything that differs between the two farms.
  D.FARMS = {
    carrot: { kind: 'carrot', name: 'Carrot Farm', crop: 'carrot', crops: 'carrots', icon: '🥕', start: 'orange',
      VARIETIES: D.VARIETIES, BUSINESSES: D.BUSINESSES, costMult: 1, fertMult: 1, bizStart: 150 },
    beet: { kind: 'beet', name: 'Beet Farm', crop: 'beet', crops: 'beets', icon: D.BEET_ICON, start: 'b_red',
      VARIETIES: D.BEET_VARIETIES, BUSINESSES: D.BEET_BUSINESSES, costMult: D.BEET.costMult, fertMult: D.BEET.fertMult, bizStart: D.BEET.bizStart },
  };
  D.BEET_HEADLINES = [
    'Local carrot magnate buys beet farm; carrots reportedly "feel betrayed."',
    'Beet prices soar as borscht goes viral. Soup influencers: "we told you."',
    'Study: people who eat beets are 40% more likely to talk about eating beets.',
    'Aunt Carol spotted at the county fair, judging pickles "harshly but fairly."',
    'Red Velvet Cake sales up 300%. Nobody knew it was beets. Now they know.',
    'Man whose job was taken by AI now owns two farms. "I just kept going," he says.',
  ];

  CF.data = D;
})(CF);
