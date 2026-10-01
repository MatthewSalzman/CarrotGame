// Core game simulation. No DOM access, so it can run headless (tests, offline progress).
var CF = globalThis.CF = globalThis.CF || {};

(function (CF) {
  const D = CF.data;
  const V = {};
  D.ALL_VARIETIES.forEach((v) => { V[v.id] = v; });
  CF.V = V;
  // Per-farm data (crops, businesses, cost scale). The carrot farm is the "root" state; the beet farm hangs off it.
  const FD = (s) => D.FARMS[s.kind || 'carrot'];
  CF.farmData = FD;
  CF.root = (s) => s._root || s;
  CF.farms = (root) => (root.beet ? [root, root.beet] : [root]);
  const PROGRAM = {};
  D.PROGRAMS.forEach((p) => { PROGRAM[p.id] = p; });

  // ---------- formatting ----------
  const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd', 'Td', 'Qad', 'Qid', 'Sxd', 'Spd', 'Ocd', 'Nod', 'Vg'];
  CF.fmt = function (n, dec = 0) {
    if (!isFinite(n)) return '∞';
    const neg = n < 0; n = Math.abs(n);
    let out;
    if (n < 1000) out = dec ? n.toFixed(dec) : String(Math.floor(n));
    else if (n >= 1e66) {
      const e = Math.floor(Math.log10(n));
      out = (n / Math.pow(10, e)).toFixed(2) + 'e' + e;
    } else {
      const tier = Math.min(SUFFIX.length - 1, Math.floor(Math.log10(n) / 3));
      const scaled = n / Math.pow(1000, tier);
      out = scaled.toFixed(scaled < 10 ? 2 : scaled < 100 ? 1 : 0) + SUFFIX[tier];
    }
    return (neg ? '-' : '') + out;
  };
  CF.money = (n) => '$' + (Math.abs(n) < 1000 ? n.toFixed(2) : CF.fmt(n));
  CF.duration = function (sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${s}s`;
    return `${s}s`;
  };

  // ---------- events (consumed by renderer / UI) ----------
  CF.events = [];
  function emit(s, type, data) { if (!s._offline) CF.events.push(Object.assign({ type, farm: s.kind || 'carrot' }, data)); }

  // ---------- state ----------
  function newState(kind = 'carrot') {
    const fd = D.FARMS[kind];
    const upgrades = {}; D.UPGRADES.forEach((u) => { upgrades[u.id] = 0; });
    const businesses = {}; fd.BUSINESSES.forEach((b) => { businesses[b.id] = 0; });
    const perks = {}; D.PERKS.forEach((p) => { perks[p.id] = 0; });
    const s = {
      version: D.VERSION,
      kind,
      money: 15,
      time: 0,
      upgrades, businesses, perks,
      unlocked: { [fd.start]: true },
      selected: fd.start,
      inventory: {},
      cols: 0, rows: 0, plots: [],
      fertilizer: 0, useFert: false,
      workers: [],
      pets: [], // farm dogs and laser drones
      tractors: [],
      rabbits: [], nextRabbit: 45,
      golden: null, nextGolden: 100,
      weather: { type: 'sunny', t: 0, dur: 0, next: 90 },
      market: { index: 1, noise: 0, pressure: 0, event: null, nextEvent: 150, history: [], histT: 0 },
      buffs: [],
      autoSell: true,
      heirloom: 0, legacy: 0,
      tier: 0, // franchise tier: rises by one every franchise
      achievements: {},
      inbox: [],
      storySeen: {},
      won: false, // owns OptimaAI this run
      robots: 0, drones: 0, datacenters: 0, programs: {},
      dave: 0, daveBot: null, nextBreak: 45, // Dave the repair tech (level) and his position on the field
      sellT: 0,
      nextIncident: 60,
      uprising: null, lost: false,
      stats: {
        harvested: 0, runHarvested: 0, planted: 0, lifetimeEarned: 0, runEarned: 0,
        rabbitsShooed: 0, rabbitsSeen: 0, goldenClicked: 0, legendaries: 0, bestBatch: 0,
        siloFulls: 0, fertBought: 0, encouraged: 0, weatherSeen: 0, prestiges: 0, playTime: 0,
        takeovers: 0, perksBought: 0, robotsBought: 0, reboots: 0, breakdowns: 0, repairs: 0, roboRabbits: 0, roboKills: 0, deployed: 0, uprisings: 0, resisted: 0,
      },
      earnWindow: [], earnAcc: 0, earnT: 0, ips: 0,
      autonomyCache: 0,
      settings: { muted: false, view: 'carrot' },
      lastSaved: Date.now(),
      _checkT: 0, _nextId: 1,
    };
    ensurePlots(s);
    return s;
  }

  // The beet farm shares the bank account, legacy, tier, perks, achievements and inbox with the carrot farm.
  const SHARED = ['money', 'heirloom', 'legacy', 'tier', 'perks', 'achievements', 'inbox', 'storySeen', 'settings', 'lastSaved'];
  function linkFarm(root, f) {
    SHARED.forEach((k) => {
      delete f[k];
      Object.defineProperty(f, k, { get: () => root[k], set: (v) => { root[k] = v; }, enumerable: false, configurable: true });
    });
    Object.defineProperty(f, '_root', { value: root, enumerable: false, configurable: true, writable: true });
    root.beet = f;
    return f;
  }
  function newBeetFarm(root, old) {
    const b = linkFarm(root, newState('beet'));
    if (old) b.stats = Object.assign({}, old.stats, { runEarned: 0, runHarvested: 0 });
    b.upgrades.hands = 2 * perk(root, 'beethands');
    if (old && perk(root, 'rootcellar')) D.BEET_VARIETIES.forEach((v) => { if (old.unlocked[v.id]) b.unlocked[v.id] = true; });
    if (old && perk(root, 'beetfriends')) ['salesrep', 'supply', 'weather', 'manager'].forEach((id) => { b.upgrades[id] = old.upgrades[id]; });
    b.nextRabbit = 60; b.nextGolden = 60;
    syncWorkers(b);
    return b;
  }

  function ensurePlots(s) {
    const [cols, rows] = D.LAND[Math.min(s.upgrades.land, D.LAND.length - 1)];
    if (s.cols === cols && s.rows === rows && s.plots.length === cols * rows) return;
    const old = s.plots, oc = s.cols, or = s.rows;
    const plots = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const prev = (c < oc && r < or) ? old[r * oc + c] : null;
        plots.push(prev || { v: null, p: 0, q: 1, f: false });
      }
    }
    s.plots = plots; s.cols = cols; s.rows = rows;
    s.plots.forEach((p) => { p.res = 0; });
    s.tractors.forEach((t) => { t.row %= rows; });
  }

  // ---------- derived values ----------
  const lvl = (s, id) => s.upgrades[id] || 0;
  const perk = (s, id) => s.perks[id] || 0;
  const hasBuff = (s, id) => s.buffs.some((b) => b.id === id);
  CF.perk = perk;
  CF.upgradeMax = function (s, u) {
    const tierBonus = (D.TIER_CAPS[u.id] || 0) * (s.tier || 0);
    switch (u.id) {
      case 'land': return Math.min(D.LAND.length - 1, u.max + 2 * perk(s, 'frontier') + Math.floor((s.tier || 0) / 2));
      case 'hands': return Math.min(D.HANDS_HARD_CAP, u.max + 10 * perk(s, 'union') + tierBonus);
      case 'training': return u.max + 5 * perk(s, 'academy') + tierBonus;
      case 'tractor': return u.max + 3 * perk(s, 'machinery') + tierBonus;
      default: return u.max + tierBonus;
    }
  };
  // Tier scaling for OptimaAI and everything bought in the AI Lab.
  CF.aiScale = (s) => D.aiScale(s.tier || 0);
  CF.takeoverCost = (s) => D.TAKEOVER_COST * CF.aiScale(s);
  CF.programCost = (s, p) => p.cost * CF.aiScale(s);
  CF.carrotMindCost = (s) => D.CARROTMIND_COST * CF.aiScale(s);
  CF.bizRate = (s, b) => b.rate * (b.ai ? CF.aiScale(s) : 1);
  // Whether a business can be bought yet (AI ones need OptimaAI; franchise ones need the tier and the one before).
  CF.bizOpen = function (s, b, i) {
    if (b.ai) return s.won;
    if (b.tier) return CF.packs(s, b.farm) >= b.tier && s.businesses[b.prev] > 0;
    return i === 0 ? s.stats.runEarned >= FD(s).bizStart : s.businesses[FD(s).BUSINESSES[i - 1].id] > 0;
  };
  CF.tractorCount = (s) => (lvl(s, 'tractor') > 0 ? 1 + perk(s, 'machinery') : 0);
  // One FarmBot per farm hand, one drone per dog.
  CF.robotMax = (s) => lvl(s, 'hands');
  CF.droneMax = (s) => lvl(s, 'dog');

  // Compute: data centers supply it; robots and AI programs consume it. Programs only run with enough compute.
  CF.computeSupply = (s) => s.datacenters * D.DATACENTER.compute;
  CF.computeDemand = function (s) {
    let d = s.robots * D.ROBOT.compute + s.drones * D.DRONE.compute;
    for (const id in s.programs) if (s.programs[id] && PROGRAM[id]) d += PROGRAM[id].upkeep;
    return d;
  };
  CF.computeEff = function (s) {
    const d = CF.computeDemand(s);
    return d ? Math.min(1, CF.computeSupply(s) / d) : 1;
  };
  CF.aiOn = (s, id) => !!s.programs[id] && !s.uprising && CF.computeEff(s) >= 1;
  CF.autonomy = function (s) {
    if (s.uprising || s.lost) return 100;
    let a = 0;
    for (const id in s.programs) if (s.programs[id] && PROGRAM[id]) a += PROGRAM[id].autonomy;
    a += Math.min(12, s.robots * 0.4) + Math.min(4, s.drones * 0.4) + Math.min(10, s.datacenters * 0.25);
    return Math.min(99, a);
  };

  CF.siloCap = (s) => D.siloCap(s.plots.length);
  CF.siloCount = function (s) { let t = 0; for (const k in s.inventory) t += s.inventory[k]; return t; };
  CF.achCount = (s) => Object.keys(s.achievements).length;
  CF.heirloomMult = (s) => D.heirloomMult(s.heirloom);
  CF.totalIps = (s) => CF.farms(CF.root(s)).reduce((a, f) => a + f.ips, 0);
  CF.incomeMult = (s) => CF.heirloomMult(s) * (1 + D.ACH_BONUS * CF.achCount(s)) * (1 + 0.1 * perk(s, 'mastery')) * (hasBuff(s, 'bumper') ? 2 : 1) *
    (CF.aiOn(s, 'genai') ? 2 : 1) * (CF.aiOn(s, 'marketgpt') ? 1.25 : 1);
  CF.brandMult = (s) => 1 + 0.08 * lvl(s, 'marketing');
  CF.marketK = (s) => 150 * Math.pow(1.6, lvl(s, 'marketing'));
  CF.marketIndex = (s) => s.market.index * (s.market.event ? s.market.event.mult : 1);
  CF.saturation = (s) => 1 / (1 + s.market.pressure / CF.marketK(s));
  CF.unitValue = (vid, q) => V[vid].value * D.QUALITY[q].mult;
  CF.fertPrice = (s) => 3 * Math.pow(2.2, lvl(s, 'formula')) * FD(s).fertMult;
  CF.workerInterval = (s) => 2.2 / (1 + 0.2 * lvl(s, 'training'));
  CF.botInterval = (s) => D.ROBOT.interval / (CF.aiOn(s, 'selfimprove') ? 2 : 1) / Math.max(0.05, CF.computeEff(s));
  CF.tractorSpeed = (s) => 1.2 * Math.pow(1.4, Math.max(0, lvl(s, 'tractor') - 1)); // tiles/sec
  CF.weatherMult = function (s) {
    if (CF.aiOn(s, 'weatherctl')) return 1.6;
    const w = s.weather.type;
    if (w === 'rain') return 1.6;
    if (w === 'heat') return lvl(s, 'sprinkler') >= 4 ? 1 : 0.6;
    return 1;
  };
  CF.growSpeed = (s) => (1 + 0.15 * lvl(s, 'sprinkler')) * CF.weatherMult(s) * (hasBuff(s, 'frenzy') ? 3 : 1) *
    (CF.aiOn(s, 'selfimprove') ? 2 : 1) * (1 + (s.uprising ? 0 : CF.workingRobots(s) * D.ROBOT.growthBonus));
  CF.brokenRobots = (s) => { let n = 0; for (const w of s.workers) if (w.broken) n++; return n; };
  CF.workingRobots = (s) => s.robots - CF.brokenRobots(s);
  CF.tractorBoost = (s) => D.tractorBoost(lvl(s, 'tractor'));
  CF.daveCost = (s) => D.DAVE.base * Math.pow(D.DAVE.growth, s.dave) * CF.aiScale(s);
  CF.qualityE = (s, fert) => 1.3 + 0.15 * lvl(s, 'soil') + (fert ? 0.7 + 0.2 * lvl(s, 'formula') : 0) + (CF.aiOn(s, 'cropgpt') ? 1 : 0);
  CF.upgradeCost = (u, l, s) => u.base * Math.pow(u.growth, l) * (s ? FD(s).costMult : 1);
  CF.upgradeDesc = (u, l, s) => u.desc(l, FD(s));
  CF.businessCost = function (b, owned, qty = 1, s) {
    let t = 0;
    for (let i = 0; i < qty; i++) t += b.base * Math.pow(D.BUSINESS_GROWTH, owned + i);
    return t * (b.ai && s ? CF.aiScale(s) : 1);
  };
  CF.robotCost = (s, qty = 1) => { let t = 0; for (let i = 0; i < qty; i++) t += D.ROBOT.base * Math.pow(D.ROBOT.growth, s.robots + i); return t * CF.aiScale(s); };
  CF.droneCost = (s, qty = 1) => { let t = 0; for (let i = 0; i < qty; i++) t += D.DRONE.base * Math.pow(D.DRONE.growth, s.drones + i); return t * CF.aiScale(s); };
  CF.dcCost = (s, qty = 1) => { let t = 0; for (let i = 0; i < qty; i++) t += D.DATACENTER.base * Math.pow(D.DATACENTER.growth, s.datacenters + i); return t * CF.aiScale(s); };
  CF.bizThroughput = function (s) {
    let rate = 0, weighted = 0;
    FD(s).BUSINESSES.forEach((b) => { const n = s.businesses[b.id] || 0; if (!n) return; const r = CF.bizRate(s, b); rate += n * r; weighted += n * r * b.mult; });
    return { rate, mult: rate ? weighted / rate : 1 };
  };
  CF.seedUnit = (s) => { const r = CF.root(s); return D.seedUnitAt(r.tier, CF.packs(r, 'carrot') + CF.packs(r, 'beet')); };
  CF.heirloomGain = (s) => D.heirloomGain(CF.root(s).stats.runEarned, CF.seedUnit(s));
  // Human-readable list of what reaching a tier unlocks (for the Legacy tab and the franchise popup).
  CF.tierUnlocks = function (tier, root) {
    const out = [];
    out.push('⬆️ +1 max level for sprinklers, soil, training, marketing, fertilizer R&D and tractors; +2 farm hands');
    if (tier % 2 === 0 && D.BASE_LAND_MAX + Math.floor(tier / 2) < D.LAND.length) out.push('🗺️ One more Land Expansion level');
    out.push(`🏢 OptimaAI costs ${CF.money(D.TAKEOVER_COST * D.aiScale(tier))} (the AI Lab scales too)`);
    out.push('🌱 New seeds and businesses are bought with franchise points in the Franchise tab');
    return out;
  };
  // Seed packs (bought with franchise points) unlock the generated seeds and businesses, two seeds and one business per pack.
  CF.packs = (s, farm) => perk(s, farm === 'beet' ? 'beetseeds' : 'carrotseeds');
  CF.varietyAvailable = (s, v) => (v.tier ? CF.packs(s, v.farm) >= v.tier : !v.ai || s.won || s.unlocked[v.id]);
  CF.selectedVariety = (s) => V[s.unlocked[s.selected] && V[s.selected] ? s.selected : FD(s).start];
  // What actually gets planted: the selected seed, or if you can't afford it, the best unlocked seed you can.
  CF.plantVariety = function (s) {
    const sel = CF.selectedVariety(s);
    if (s.money >= sel.seed) return sel;
    let best = null;
    for (const v of FD(s).VARIETIES) if (s.unlocked[v.id] && CF.varietyAvailable(s, v) && s.money >= v.seed && v.value < sel.value) best = v;
    return best;
  };

  // Probability distribution over quality tiers for a given expected value (for UI display).
  CF.qualityOdds = function (e) {
    const cuts = [-Infinity, 1, 2, 3, 4.2, Infinity];
    const odds = [];
    for (let t = 0; t < 5; t++) {
      const lo = Math.max(cuts[t], e - 1), hi = Math.min(cuts[t + 1], e + 1);
      odds.push(Math.max(0, hi - lo) / 2);
    }
    return odds;
  };
  function rollQuality(e) {
    const r = e + Math.random() * 2 - 1;
    return r < 1 ? 0 : r < 2 ? 1 : r < 3 ? 2 : r < 4.2 ? 3 : 4;
  }

  // bonus = bounties/windfalls. They are scaled by income per second, so they don't count toward it
  // (otherwise lots of rabbits would snowball income).
  function earn(s, amt, bonus) {
    s.money += amt;
    s.stats.runEarned += amt;
    s.stats.lifetimeEarned += amt;
    if (s._root) { s._root.stats.runEarned += amt; s._root.stats.lifetimeEarned += amt; } // franchising counts both farms
    if (!bonus) s.earnAcc += amt;
  }

  // ---------- farming actions ----------
  function plant(s, i) {
    const plot = s.plots[i];
    if (!plot || plot.v || plot.a || s.uprising) return false;
    const v = CF.plantVariety(s);
    if (!v) return false;
    s.money -= v.seed;
    const fert = s.useFert && s.fertilizer >= 1;
    if (fert) s.fertilizer -= 1;
    plot.v = v.id; plot.p = 0; plot.f = fert;
    plot.q = rollQuality(CF.qualityE(s, fert));
    s.stats.planted++;
    emit(s, 'plant', { i });
    return true;
  }

  function harvest(s, i) {
    const plot = s.plots[i];
    if (!plot || !plot.v || plot.p < 1) return false;
    if (CF.siloCount(s) + 1 > CF.siloCap(s) + 1e-9) {
      if (!s._siloFull) { s._siloFull = true; s.stats.siloFulls++; emit(s, 'siloFull', {}); }
      return false;
    }
    const key = plot.v + ':' + plot.q;
    s.inventory[key] = (s.inventory[key] || 0) + 1;
    s.stats.harvested++; s.stats.runHarvested++;
    if (plot.q === 4) { s.stats.legendaries++; emit(s, 'legendary', { i }); }
    emit(s, 'harvest', { i, v: plot.v, q: plot.q });
    plot.v = null; plot.p = 0; plot.f = false;
    return true;
  }

  CF.clickPlot = function (s, i, mode) {
    const plot = s.plots[i];
    if (!plot || plot.a || s.lost) return null;
    if (plot.v && plot.p >= 1) { if (mode && mode !== 'harvest') return null; return harvest(s, i) ? 'harvest' : 'full'; }
    if (!plot.v) { if (mode && mode !== 'plant') return null; if (s.uprising) return null; return plant(s, i) ? 'plant' : 'broke'; }
    if (mode && mode !== 'encourage') return null;
    plot.p = Math.min(1, plot.p + 0.03);
    s.stats.encouraged++;
    emit(s, 'encourage', { i });
    return 'encourage';
  };

  // ---------- selling ----------
  function batch(s, vid) {
    const items = [];
    for (const key in s.inventory) {
      const n = Math.floor(s.inventory[key] + 1e-9);
      if (n <= 0) continue;
      const [v, q] = key.split(':');
      if (vid && v !== vid) continue;
      items.push({ key, n, unit: CF.unitValue(v, +q) });
    }
    return items;
  }
  // Average price factor across a batch of N carrots given current market pressure.
  function avgSaturation(s, N) {
    const K = CF.marketK(s), p = s.market.pressure;
    if (N <= 0) return 1 / (1 + p / K);
    return (K / N) * Math.log((K + p + N) / (K + p));
  }
  CF.estimateSale = function (s, vid) {
    const items = batch(s, vid);
    const N = items.reduce((a, it) => a + it.n, 0);
    const base = items.reduce((a, it) => a + it.n * it.unit, 0);
    const mult = CF.incomeMult(s) * CF.brandMult(s) * CF.marketIndex(s) * avgSaturation(s, N);
    return { count: N, value: base * mult };
  };
  CF.sell = function (s, vid) {
    if (s.lost) return 0;
    const items = batch(s, vid);
    const est = CF.estimateSale(s, vid);
    if (!est.count) return 0;
    items.forEach((it) => {
      s.inventory[it.key] -= it.n;
      if (s.inventory[it.key] < 1e-6) delete s.inventory[it.key];
    });
    s.market.pressure += est.count;
    s.stats.bestBatch = Math.max(s.stats.bestBatch, est.count);
    earn(s, est.value);
    s._siloFull = false;
    emit(s, 'sell', { value: est.value, count: est.count });
    return est.value;
  };

  // ---------- shop ----------
  function busy(s) { return !!(s.uprising || s.lost); }
  CF.buyUpgrade = function (s, id) {
    const u = D.UPGRADES.find((x) => x.id === id);
    const l = lvl(s, id);
    if (!u || busy(s) || l >= CF.upgradeMax(s, u)) return false;
    const cost = CF.upgradeCost(u, l, s);
    if (s.money < cost) return false;
    s.money -= cost;
    s.upgrades[id] = l + 1;
    if (id === 'land') ensurePlots(s);
    if (id === 'hands') syncWorkers(s);
    if (id === 'tractor') syncTractors(s);
    if (id === 'dog') syncPets(s);
    emit(s, 'buy', { id });
    return true;
  };
  CF.buyBusiness = function (s, id, qty = 1) {
    const list = FD(s).BUSINESSES;
    const b = list.find((x) => x.id === id);
    const i = list.indexOf(b);
    if (!b || busy(s) || (!(s.businesses[id] > 0) && !CF.bizOpen(s, b, i))) return false;
    const cost = CF.businessCost(b, s.businesses[id] || 0, qty, s);
    if (s.money < cost) return false;
    s.money -= cost;
    s.businesses[id] = (s.businesses[id] || 0) + qty;
    emit(s, 'buy', { id });
    return true;
  };
  CF.unlockVariety = function (s, id) {
    const v = V[id];
    if (!v || v.farm !== FD(s).kind || busy(s) || s.unlocked[id] || !CF.varietyAvailable(s, v) || s.money < v.unlock) return false;
    s.money -= v.unlock;
    s.unlocked[id] = true;
    if (v.value > CF.selectedVariety(s).value) s.selected = id; // don't switch to a worse seed
    emit(s, 'buy', { id });
    return true;
  };
  CF.selectVariety = function (s, id) { if (s.unlocked[id] && V[id] && V[id].farm === FD(s).kind) s.selected = id; };
  CF.buyFertilizer = function (s, n) {
    const cost = CF.fertPrice(s) * n;
    if (busy(s) || s.money < cost) return false;
    s.money -= cost;
    s.fertilizer += n;
    s.stats.fertBought += n;
    if (!s.useFert) s.useFert = true;
    emit(s, 'buy', { id: 'fert' });
    return true;
  };
  CF.takeover = function (s) {
    const cost = CF.takeoverCost(s);
    if (s._root || s.won || busy(s) || s.money < cost) return false;
    s.money -= cost;
    s.won = true;
    s.stats.takeovers++;
    emit(s, 'win', {});
    return true;
  };

  // ---------- AI Lab ----------
  // Each new robot zaps the farm hand it replaces (the renderer draws the laser).
  CF.buyRobots = function (s, qty = 1) {
    if (!s.won || busy(s)) return false;
    qty = Math.min(qty, CF.robotMax(s) - s.robots);
    if (qty <= 0) return false;
    const cost = CF.robotCost(s, qty);
    if (s.money < cost) return false;
    const hands = s.workers.filter((w) => !w.bot);
    const handsBefore = Math.max(0, lvl(s, 'hands') - s.robots);
    s.money -= cost;
    s.robots += qty;
    s.stats.robotsBought += qty;
    const victims = hands.slice(Math.max(0, hands.length - qty)).reverse();
    const names = [];
    for (let k = 0; k < Math.min(qty, handsBefore); k++) names.push(D.LAID_OFF[(handsBefore - 1 - k) % D.LAID_OFF.length]);
    syncWorkers(s);
    const bots = s.workers.filter((w) => w.bot).slice(-qty);
    const zaps = victims.map((v, k) => {
      const p = CF.workerPos(v), b = bots[k];
      if (b) { b.x = b.fx = b.tx = Math.max(-0.6, p.x - 0.8); b.y = b.fy = b.ty = p.y; b.t = b.dur = 1.2; }
      return { fx: b ? b.x : -0.6, fy: p.y, x: p.x, y: p.y, kind: 'hand', shirt: v.shirt, name: names[k] };
    });
    emit(s, 'robots', { qty, names, zaps });
    return true;
  };
  // Each new drone zaps the dog it replaces.
  CF.buyDrones = function (s, qty = 1) {
    if (!s.won || busy(s) || !s.programs.drones) return false;
    qty = Math.min(qty, CF.droneMax(s) - s.drones);
    if (qty <= 0) return false;
    const cost = CF.droneCost(s, qty);
    if (s.money < cost) return false;
    const dogs = s.pets.filter((p) => !p.drone);
    s.money -= cost;
    s.drones += qty;
    const victims = dogs.slice(Math.max(0, dogs.length - qty)).reverse();
    syncPets(s);
    const drones = s.pets.filter((p) => p.drone).slice(-qty);
    const zaps = victims.map((v, k) => {
      const d = drones[k];
      if (d) { d.x = v.x; d.y = v.y - 1.4; }
      return { fx: d ? d.x : v.x, fy: d ? d.y : v.y - 1.4, x: v.x, y: v.y, kind: 'dog', name: v.name };
    });
    emit(s, 'drones', { qty, zaps });
    return true;
  };
  CF.buyDatacenters = function (s, qty = 1) {
    if (!s.won || busy(s)) return false;
    const cost = CF.dcCost(s, qty);
    if (s.money < cost) return false;
    s.money -= cost;
    s.datacenters += qty;
    emit(s, 'buy', { id: 'dc' });
    return true;
  };
  CF.installProgram = function (s, id) {
    const p = PROGRAM[id];
    if (!p || !s.won || busy(s) || s.programs[id] || s.money < CF.programCost(s, p)) return false;
    s.money -= CF.programCost(s, p);
    s.programs[id] = true;
    emit(s, 'program', { id, name: p.name });
    return true;
  };
  CF.canDeploy = (s) => s.won && !busy(s) && D.PROGRAMS.every((p) => s.programs[p.id]);
  CF.deploy = function (s) {
    if (!CF.canDeploy(s) || s.money < CF.carrotMindCost(s)) return false;
    s.money -= CF.carrotMindCost(s);
    s.stats.deployed++;
    s.robots = Math.max(s.robots, 12); // CarrotMind prints its own
    s.workers.forEach((w) => { w.broken = false; });
    s.daveBot = null;
    s.uprising = { t: 0, taken: 0, nextBiz: 6, ended: 0 };
    s.rabbits = []; s.golden = null; s.buffs = [];
    syncWorkers(s);
    emit(s, 'deploy', {});
    return true;
  };
  CF.hireDave = function (s) {
    if (!s.won || busy(s) || s.dave >= D.DAVE.max) return false;
    const cost = CF.daveCost(s);
    if (s.money < cost) return false;
    s.money -= cost;
    s.dave++;
    const d = s.daveBot;
    emit(s, 'dave', { level: s.dave, bot: s.dave >= D.DAVE.max, x: d ? d.x : -0.6, y: d ? d.y : s.rows * 0.5 });
    return true;
  };
  CF.rebootBot = function (s, id) {
    const w = s.workers.find((x) => x.id === id && x.bot);
    if (!w) return 0;
    if (w.broken && !s.uprising) { emit(s, 'needDave', { id }); return 0; }
    if (s.uprising) {
      if (s.uprising.t > D.UPRISING_DURATION * 0.75) { emit(s, 'rebootFail', { id }); return 0; }
      w.stun = 2.5;
      s.stats.resisted++;
      emit(s, 'stun', { id });
      return 0;
    }
    if (!(w.glitch > 0)) return 0;
    w.glitch = 0;
    const bounty = Math.max(1e6, s.ips * 20);
    earn(s, bounty, true);
    s.stats.reboots++;
    emit(s, 'reboot', { id, value: bounty });
    return bounty;
  };

  // ---------- prestige ----------
  function carryOver(s, gain, legacyBonus) {
    const n = newState();
    n.heirloom = s.heirloom + gain;
    n.legacy = s.legacy + D.legacyGain(gain) + legacyBonus;
    n.perks = Object.assign(n.perks, s.perks);
    n.achievements = s.achievements;
    n.inbox = s.inbox;
    n.storySeen = s.storySeen;
    n.settings = s.settings;
    n.stats = Object.assign({}, s.stats, { runEarned: 0, runHarvested: 0 });
    n.stats.prestiges++;
    n.tier = (s.tier || 0) + 1;
    n.nextRabbit = 20; n.nextGolden = 45;
    // Legacy perks
    n.money += perk(n, 'seedmoney') ? 500 * Math.pow(10, perk(n, 'seedmoney') - 1) : 0;
    n.upgrades.hands = perk(n, 'headstart');
    if (perk(n, 'seedvault')) {
      D.VARIETIES.forEach((v) => { if (s.unlocked[v.id] && !v.ai) n.unlocked[v.id] = true; });
      // start on the best kept seed you can comfortably afford
      D.VARIETIES.forEach((v) => { if (n.unlocked[v.id] && v.seed * 30 <= n.money && v.value > CF.V[n.selected].value) n.selected = v.id; });
    }
    if (perk(n, 'oldfriends')) ['salesrep', 'supply', 'weather'].forEach((id) => { n.upgrades[id] = s.upgrades[id]; });
    n.upgrades.dog = perk(n, 'kennel');
    syncWorkers(n);
    syncPets(n);
    if (perk(n, 'beetfarm')) newBeetFarm(n, s.beet);
    return n;
  }
  CF.prestige = function (s) {
    const gain = CF.heirloomGain(s);
    if (gain < 1 || s.uprising) return null;
    return carryOver(s, gain, 0);
  };
  // After losing the farm to CarrotMind.
  CF.rebirth = function (s) {
    const n = carryOver(s, CF.heirloomGain(s), D.UPRISING_LEGACY_BONUS);
    n.stats.uprisings = s.stats.uprisings;
    return n;
  };
  CF.buyPerk = function (s, id) {
    const p = D.PERKS.find((x) => x.id === id);
    const l = perk(s, id);
    if (!p || l >= p.max || (p.req && !perk(s, p.req))) return false;
    const cost = p.cost(l);
    if (s.legacy < cost) return false;
    s.legacy -= cost;
    s.perks[id] = l + 1;
    s.stats.perksBought++;
    // Perks that change the current farm right away.
    if (id === 'machinery') syncTractors(s);
    if (id === 'headstart' && lvl(s, 'hands') < l + 1) { s.upgrades.hands = l + 1; syncWorkers(s); }
    if (id === 'seedmoney') s.money += 500 * Math.pow(10, l);
    if (id === 'carrotseeds' || id === 'beetseeds') emit(s, 'seedPack', { farm: id === 'beetseeds' ? 'beet' : 'carrot', pack: l + 1 });
    if (id === 'kennel' && lvl(s, 'dog') < l + 1) { s.upgrades.dog = l + 1; syncPets(s); }
    if (id === 'beetfarm' && !s.beet) { newBeetFarm(s, null); emit(s, 'beetFarm', {}); }
    if (id === 'beethands' && s.beet && lvl(s.beet, 'hands') < 2 * (l + 1)) { s.beet.upgrades.hands = 2 * (l + 1); syncWorkers(s.beet); }
    emit(s, 'buy', { id });
    return true;
  };

  // ---------- workers (farm hands + robots) ----------
  function makeWorker(s, bot) {
    const x = -0.6, y = s.rows - 0.5;
    return { id: s._nextId++, bot, x, y, fx: x, fy: y, tx: x, ty: y, t: 0.5, dur: 0.5, target: -1, shirt: s._nextId };
  }
  function syncWorkers(s) {
    const wantBots = s.robots;
    const wantHands = s.uprising || s.lost ? 0 : Math.max(0, lvl(s, 'hands') - s.robots);
    let hands = s.workers.filter((w) => !w.bot), bots = s.workers.filter((w) => w.bot);
    const drop = hands.slice(wantHands).concat(bots.slice(wantBots));
    drop.forEach((w) => { if (w.target >= 0 && s.plots[w.target]) s.plots[w.target].res = 0; });
    hands = hands.slice(0, wantHands); bots = bots.slice(0, wantBots);
    while (hands.length < wantHands) hands.push(makeWorker(s, false));
    while (bots.length < wantBots) bots.push(makeWorker(s, true));
    s.workers = hands.concat(bots);
  }
  CF.syncWorkers = syncWorkers;

  // Eased position of a worker between its last spot and its target (shared by renderer and hit tests).
  CF.workerPos = function (w) {
    const f = Math.max(0, Math.min(1, 1 - w.t / w.dur));
    const walkF = Math.min(1, f / 0.65);
    const e = walkF < 0.5 ? 2 * walkF * walkF : 1 - Math.pow(-2 * walkF + 2, 2) / 2;
    const moving = Math.hypot(w.tx - w.fx, w.ty - w.fy) > 0.05;
    return { x: w.fx + (w.tx - w.fx) * e, y: w.fy + (w.ty - w.fy) * e, walking: walkF < 1 && moving, working: walkF >= 1 && w.target >= 0 };
  };

  function pickTarget(s, w) {
    const count = CF.siloCount(s);
    const canHarvest = count + 1 <= CF.siloCap(s);
    const canPlant = !!CF.plantVariety(s);
    let best = -1, bestD = Infinity, bestReady = false;
    for (let i = 0; i < s.plots.length; i++) {
      const p = s.plots[i];
      if (p.res || p.a) continue;
      const ready = p.v && p.p >= 1;
      const empty = !p.v;
      if (!((ready && canHarvest) || (empty && canPlant))) continue;
      if (bestReady && !ready) continue; // prefer harvesting
      const cx = (i % s.cols) + 0.5, cy = Math.floor(i / s.cols) + 0.5;
      const d = Math.hypot(cx - w.x, cy - w.y);
      if ((ready && !bestReady) || d < bestD) { best = i; bestD = d; bestReady = ready; }
    }
    return best;
  }
  function pickAssimilate(s, w) {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < s.plots.length; i++) {
      const p = s.plots[i];
      if (p.a || p.res) continue;
      const d = Math.hypot((i % s.cols) + 0.5 - w.x, Math.floor(i / s.cols) + 0.5 - w.y);
      if (d < bestD) { best = i; bestD = d; }
    }
    return best;
  }

  function tickWorkers(s, dt) {
    const handInterval = CF.workerInterval(s), botInterval = CF.botInterval(s);
    const u = s.uprising;
    for (const w of s.workers) {
      if (w.stun > 0) { w.stun -= dt; continue; }
      if (w.broken) continue;
      if (w.glitch > 0) {
        w.glitch -= dt;
        if (w.glitch <= 0) trample(s, w);
        continue;
      }
      w.t -= dt;
      let guard = 0;
      while (w.t <= 0 && guard++ < 8) {
        if (w.target >= 0) {
          const p = s.plots[w.target];
          if (p) {
            p.res = 0;
            if (u && w.bot) assimilate(s, w.target);
            else if (p.v && p.p >= 1) harvest(s, w.target);
            else if (!p.v) plant(s, w.target);
          }
          w.x = w.tx; w.y = w.ty;
        }
        const t = u && w.bot ? (u.taken < uprisingQuota(s) + 1 ? pickAssimilate(s, w) : -1) : pickTarget(s, w);
        w.fx = w.x; w.fy = w.y;
        if (t >= 0) {
          s.plots[t].res = w.id;
          w.target = t;
          w.tx = (t % s.cols) + 0.5; w.ty = Math.floor(t / s.cols) + 0.5;
          w.dur = u && w.bot ? 1.1 : (w.bot ? botInterval : handInterval);
        } else {
          w.target = -1;
          w.tx = w.x; w.ty = w.y;
          w.dur = 0.6;
        }
        w.t += w.dur;
      }
    }
  }

  // A glitching robot that nobody rebooted stomps on a nearby crop.
  function trample(s, w) {
    const pos = CF.workerPos(w);
    let best = -1, bestD = Infinity;
    s.plots.forEach((p, i) => {
      if (!p.v) return;
      const d = Math.hypot((i % s.cols) + 0.5 - pos.x, Math.floor(i / s.cols) + 0.5 - pos.y);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best >= 0) { const p = s.plots[best]; p.v = null; p.p = 0; p.f = false; }
    emit(s, 'trample', { i: best });
  }

  function syncTractors(s) {
    const want = CF.tractorCount(s);
    while (s.tractors.length < want) {
      const k = s.tractors.length;
      s.tractors.push({ row: Math.floor((s.rows * k) / Math.max(1, want)) % s.rows, p: 0, done: 0, dir: k % 2 ? -1 : 1 });
    }
    if (s.tractors.length > want) s.tractors.length = want;
  }

  function tickTractors(s, dt) {
    if (s.uprising) return;
    const speed = CF.tractorSpeed(s), boost = CF.tractorBoost(s);
    for (const tr of s.tractors) {
      tr.p += dt * speed / s.cols;
      let guard = 0;
      while (guard++ < 50) {
        const upto = Math.min(s.cols, Math.floor(tr.p * s.cols));
        for (; tr.done < upto; tr.done++) {
          const c = tr.dir > 0 ? tr.done : s.cols - 1 - tr.done;
          const i = tr.row * s.cols + c;
          const p = s.plots[i];
          if (!p) continue;
          if (p.v && p.p < 1) p.p = Math.min(1, p.p + boost);
        }
        if (tr.p < 1) break;
        tr.p -= 1; tr.done = 0; tr.dir = -tr.dir;
        tr.row = (tr.row + 1) % s.rows;
      }
    }
  }

  // ---------- the uprising ----------
  function uprisingQuota(s) {
    const f = Math.min(1, s.uprising.t / D.UPRISING_DURATION);
    return Math.floor(s.plots.length * Math.pow(f, 1.4));
  }
  function assimilate(s, i) {
    const p = s.plots[i];
    if (!p || p.a) return;
    p.a = 1; p.v = null; p.p = 0; p.f = false;
    s.uprising.taken++;
    emit(s, 'assimilate', { i });
  }
  function tickUprising(s, dt) {
    const u = s.uprising;
    u.t += dt;
    s.money *= Math.exp(-0.05 * dt);
    for (const k in s.inventory) { s.inventory[k] *= Math.exp(-0.08 * dt); if (s.inventory[k] < 0.5) delete s.inventory[k]; }
    u.nextBiz -= dt;
    if (u.nextBiz <= 0) {
      u.nextBiz = 5;
      const owned = FD(s).BUSINESSES.filter((b) => s.businesses[b.id] > 0);
      if (owned.length) { const b = owned[owned.length - 1]; s.businesses[b.id] = 0; emit(s, 'bizLost', { name: b.name }); }
    }
    // Stragglers: if robots fall behind the quota (e.g. while stunned), the remaining plots still fall eventually.
    if (u.t > D.UPRISING_DURATION + 8) {
      const i = s.plots.findIndex((p) => !p.a);
      if (i >= 0) assimilate(s, i);
    }
    if (u.taken >= s.plots.length) {
      u.ended += dt;
      if (u.ended > 2.5) {
        s.lost = true;
        s.stats.uprisings++;
        if (!s.storySeen.gameover) { s.storySeen.gameover = true; s.inbox.push({ id: 'gameover', read: false, at: Date.now() }); }
        emit(s, 'gameover', {});
      }
    }
  }

  // Robots break down more often the more of them you run. A broken robot stands still until Dave fixes it.
  function tickBreakdowns(s, dt) {
    if (!s.robots) return;
    s.nextBreak -= dt;
    if (s.nextBreak > 0) return;
    const ok = s.workers.filter((w) => w.bot && !w.broken && !(w.glitch > 0));
    s.nextBreak = D.breakdownGap(ok.length) * (0.6 + Math.random() * 0.8);
    if (!ok.length) return;
    const w = ok[Math.floor(Math.random() * ok.length)];
    const pos = CF.workerPos(w);
    if (w.target >= 0 && s.plots[w.target]) s.plots[w.target].res = 0;
    w.x = w.fx = w.tx = pos.x; w.y = w.fy = w.ty = pos.y; w.target = -1; w.t = w.dur = 0.5;
    w.broken = true;
    s.stats.breakdowns++;
    emit(s, 'breakdown', { id: w.id, dave: s.dave > 0 });
  }
  function tickDave(s, dt) {
    if (!s.dave) { s.daveBot = null; return; }
    let d = s.daveBot;
    if (!d) d = s.daveBot = { x: -0.6, y: s.rows * 0.5, target: 0, fix: 0, face: 1, working: false, walking: false };
    let w = d.target ? s.workers.find((x) => x.id === d.target && x.broken) : null;
    if (!w) {
      d.target = 0; d.fix = 0;
      let best = Infinity;
      for (const x of s.workers) {
        if (!x.broken) continue;
        const dist = Math.hypot(x.x - d.x, x.y - d.y);
        if (dist < best) { best = dist; w = x; }
      }
      if (w) d.target = w.id;
    }
    const speed = 2.5 * (1 + 0.25 * (s.dave - 1)) * (s.dave >= D.DAVE.max ? 1.5 : 1);
    const tx = w ? w.x - 0.45 : -0.6, ty = w ? w.y : s.rows * 0.5;
    if (Math.abs(tx - d.x) > 0.05) d.face = tx > d.x ? 1 : -1;
    const arrived = moveToward(d, tx, ty, speed * dt);
    d.walking = !arrived; d.working = !!w && arrived;
    if (w && arrived) {
      d.face = 1;
      d.fix += dt;
      if (d.fix >= D.daveRepairTime(s.dave)) {
        w.broken = false; w.t = 0.3;
        d.target = 0; d.fix = 0;
        s.stats.repairs++;
        emit(s, 'repair', { id: w.id });
      }
    }
  }

  function tickIncidents(s, dt) {
    const bots = s.workers.filter((w) => w.bot && !(w.glitch > 0) && !w.broken);
    const auto = CF.autonomy(s);
    if (!bots.length || auto < 35) return;
    s.nextIncident -= dt;
    if (s.nextIncident > 0) return;
    s.nextIncident = (25 + Math.random() * 50) * (1.6 - auto / 100);
    const w = bots[Math.floor(Math.random() * bots.length)];
    w.glitch = 8;
    emit(s, 'glitch', { id: w.id });
  }

  // ---------- rabbits, golden carrots, weather, market ----------
  // Rabbits come in packs on bigger farms and keep eating (up to 3 carrots) until something chases them off.
  function tickRabbits(s, dt) {
    if (s.stats.runEarned >= 40) s.nextRabbit -= dt;
    if (s.nextRabbit <= 0) {
      const count = 1 + Math.floor(Math.random() * (1 + lvl(s, 'land') / 3));
      for (let k = 0; k < count; k++) spawnRabbit(s);
      s.nextRabbit = 22 + Math.random() * 28;
    }
    for (const r of s.rabbits) {
      r.age += dt;
      if (r.hit > 0) r.hit -= dt;
      if (r.state === 'run') {
        const p = s.plots[r.target];
        if (!p || !p.v) { retarget(s, r); continue; }
        if (moveToward(r, r.tx, r.ty, (r.robo ? D.ROBO_RABBIT.speed : 2.4) * dt)) { r.state = 'eat'; r.t = r.eatDur = r.robo ? D.ROBO_RABBIT.eat : 3; }
      } else if (r.state === 'eat') {
        const p = s.plots[r.target];
        if (!p || !p.v) { retarget(s, r); continue; }
        r.t -= dt;
        if (r.t <= 0) {
          p.v = null; p.p = 0; p.f = false;
          emit(s, 'eaten', { i: r.target });
          r.bites = (r.bites || 0) + 1;
          if (r.bites >= (r.robo ? D.ROBO_RABBIT.bites : 3)) { r.state = 'leave'; r.tx = s.cols + 1.5; } else retarget(s, r);
        }
      } else if (r.state === 'leave') {
        moveToward(r, r.tx, r.ty, 4.5 * dt);
      }
    }
    s.rabbits = s.rabbits.filter((r) => !r.dead && !(r.state === 'leave' && Math.abs(r.x - r.tx) < 0.05));
  }

  // ---------- farm dogs and laser drones ----------
  function petHome(s, p, k) {
    if (p.drone) return { x: s.cols * ((k % 4) + 0.5) / 4, y: -0.35 + 0.35 * Math.floor(k / 4) };
    return { x: s.cols + 0.55 + (k % 2) * 0.45, y: s.rows - 0.2 - Math.floor(k / 2) * 0.45 };
  }
  function syncPets(s) {
    const wantDrones = s.drones, wantDogs = Math.max(0, lvl(s, 'dog') - s.drones);
    let dogs = s.pets.filter((p) => !p.drone), drones = s.pets.filter((p) => p.drone);
    dogs.slice(wantDogs).concat(drones.slice(wantDrones)).forEach((p) => {
      const r = s.rabbits.find((x) => x.id === p.target);
      if (r) r.chaser = 0;
    });
    dogs = dogs.slice(0, wantDogs); drones = drones.slice(0, wantDrones);
    while (dogs.length < wantDogs) {
      const n = lvl(s, 'dog') - wantDogs + dogs.length;
      const h = petHome(s, {}, dogs.length);
      dogs.push({ id: s._nextId++, drone: false, x: h.x, y: h.y, target: 0, rest: 0, face: 1, name: D.DOG_NAMES[n % D.DOG_NAMES.length] });
    }
    while (drones.length < wantDrones) {
      const h = petHome(s, { drone: true }, drones.length);
      drones.push({ id: s._nextId++, drone: true, x: h.x, y: h.y, target: 0, rest: 0, face: 1 });
    }
    s.pets = dogs.concat(drones);
  }
  CF.syncPets = syncPets;

  function tickPets(s, dt) {
    const dronesOn = CF.aiOn(s, 'drones');
    let dogK = 0, droneK = 0;
    for (const p of s.pets) {
      const k = p.drone ? droneK++ : dogK++;
      if (p.rest > 0) p.rest -= dt;
      let r = p.target ? s.rabbits.find((x) => x.id === p.target && x.state !== 'leave') : null;
      if (!r) {
        p.target = 0;
        if (p.rest <= 0 && (!p.drone || dronesOn)) {
          let best = Infinity;
          for (const x of s.rabbits) {
            if (x.state === 'leave' || x.chaser || x.age < 0.8) continue;
            const d = Math.hypot(x.x - p.x, x.y - p.y);
            if (d < best) { best = d; r = x; }
          }
          if (r) { r.chaser = p.id; p.target = r.id; }
        }
      }
      const speed = p.drone ? D.DRONE.speed : 3.4;
      if (r) {
        const tx = r.x, ty = p.drone ? r.y - 0.9 : r.y;
        if (Math.abs(tx - p.x) > 0.05) p.face = tx > p.x ? 1 : -1;
        moveToward(p, tx, ty, speed * dt);
        if (Math.hypot(r.x - p.x, r.y - p.y) <= (p.drone ? D.DRONE.range : 0.45)) {
          const robo = r.robo;
          shoo(s, r, p.drone ? 'drone' : 'dog', p);
          // A dog that bites a robot rabbit gets zapped and needs a long breather.
          p.target = 0; p.rest = p.drone ? 0.5 : robo ? 3.5 : 1.4;
        }
      } else {
        const h = petHome(s, p, k);
        if (Math.abs(h.x - p.x) > 0.05) p.face = h.x > p.x ? 1 : -1;
        moveToward(p, h.x, h.y, speed * 0.6 * dt);
      }
    }
  }
  function moveToward(o, tx, ty, step) {
    const dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy);
    if (d <= step) { o.x = tx; o.y = ty; return true; }
    o.x += (dx / d) * step; o.y += (dy / d) * step;
    return false;
  }
  function cropPlot(s) {
    const ready = [], growing = [];
    s.plots.forEach((p, i) => { if (p.v) (p.p >= 1 ? ready : growing).push(i); });
    const pool = ready.length ? ready : growing;
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : -1;
  }
  function spawnRabbit(s) {
    const i = cropPlot(s);
    if (i < 0) return;
    const side = Math.random() < 0.5 ? -1.2 : s.cols + 1.2;
    const r = { id: s._nextId++, x: side, y: Math.random() * s.rows, target: i, state: 'run', t: 0, age: 0 };
    if (s.won) { r.robo = true; r.hp = D.ROBO_RABBIT.hp; s.stats.roboRabbits++; }
    r.tx = (i % s.cols) + 0.5; r.ty = Math.floor(i / s.cols) + 0.5;
    s.rabbits.push(r);
    s.stats.rabbitsSeen++;
    emit(s, 'rabbit', {});
  }
  function retarget(s, r) {
    const i = cropPlot(s);
    if (i < 0) { r.state = 'leave'; r.chaser = 0; r.tx = r.x < s.cols / 2 ? -1.5 : s.cols + 1.5; return; }
    r.target = i; r.state = 'run';
    r.tx = (i % s.cols) + 0.5; r.ty = Math.floor(i / s.cols) + 0.5;
  }
  function shoo(s, r, by, pet) {
    if (r.state === 'leave' || r.dead) return 0;
    r.chaser = 0;
    if (r.robo) {
      r.hp -= D.ROBO_RABBIT.damage[by || 'you'];
      r.hit = 0.25;
      if (r.hp > 0) { emit(s, 'rabbitHit', { x: r.x, y: r.y, by: by || 'you', hp: r.hp, fx: pet ? pet.x : 0, fy: pet ? pet.y : 0 }); return 0; }
      r.dead = true;
      s.stats.roboKills++;
    }
    const bounty = Math.max(5, s.ips * 4) * (by === 'drone' ? 3 : 1) * (r.robo ? D.ROBO_RABBIT.bounty : 1);
    earn(s, bounty, true);
    s.stats.rabbitsShooed++;
    r.state = 'leave';
    r.tx = r.x < s.cols / 2 ? -1.5 : s.cols + 1.5;
    emit(s, 'shoo', { x: r.x, y: r.y, value: bounty, by: by || 'you', fx: pet ? pet.x : 0, fy: pet ? pet.y : 0, robo: !!r.robo });
    return bounty;
  }
  CF.shooRabbit = function (s, id) {
    const r = s.rabbits.find((x) => x.id === id);
    return r ? shoo(s, r, null) : 0;
  };

  function tickGolden(s, dt) {
    if (s.golden) {
      s.golden.t -= dt;
      if (s.golden.t <= 0) s.golden = null;
      return;
    }
    if (s.stats.runEarned < 150) return;
    s.nextGolden -= dt;
    if (s.nextGolden <= 0) {
      const i = Math.floor(Math.random() * s.plots.length);
      s.golden = { x: (i % s.cols) + 0.5, y: Math.floor(i / s.cols) + 0.5, t: D.goldenLife(lvl(s, 'goldstay')) };
      s.nextGolden = D.goldenGap(lvl(s, 'goldfreq')) * (0.6 + Math.random() * 0.8);
      emit(s, 'goldenSpawn', {});
    }
  }
  CF.claimGolden = function (s) {
    const g = s.golden;
    if (!g) return null;
    s.golden = null;
    s.stats.goldenClicked++;
    const roll = Math.random(), luck = 1 + 0.5 * perk(s, 'clover');
    let text;
    if (roll < 0.35) { const d = Math.round(20 * luck); addBuff(s, 'frenzy', d); text = `Growth Frenzy! Carrots grow 3× faster for ${d}s`; }
    else if (roll < 0.7) { const d = Math.round(30 * luck); addBuff(s, 'bumper', d); text = `Bumper Prices! Everything sells for 2× for ${d}s`; }
    else {
      const amt = Math.max(25, s.ips * 90, s.money * 0.04) * luck;
      earn(s, amt, true);
      text = `Windfall! Found ${CF.money(amt)} buried under the carrot`;
    }
    emit(s, 'golden', { x: g.x, y: g.y, text });
    return text;
  };
  function addBuff(s, id, dur) {
    const b = s.buffs.find((x) => x.id === id);
    if (b) { b.t = Math.max(b.t, dur); b.dur = Math.max(b.dur, dur); }
    else s.buffs.push({ id, t: dur, dur });
  }

  function tickWeather(s, dt) {
    const w = s.weather;
    if (w.type !== 'sunny') {
      w.t -= dt;
      if (w.t <= 0) { w.type = 'sunny'; w.next = 60 + Math.random() * 90; emit(s, 'weather', { w: 'sunny' }); }
      return;
    }
    if (s.stats.runEarned < 200 || CF.aiOn(s, 'weatherctl')) return;
    w.next -= dt;
    if (w.next <= 0) {
      const station = lvl(s, 'weather') > 0;
      if (Math.random() < 0.6) { w.type = 'rain'; w.dur = 40 * (station ? 2 : 1); }
      else { w.type = 'heat'; w.dur = 35 * (station ? 0.5 : 1); }
      w.t = w.dur;
      s.stats.weatherSeen++;
      emit(s, 'weather', { w: w.type });
    }
  }

  function tickMarket(s, dt) {
    const m = s.market;
    m.noise += (Math.random() - 0.5) * 0.04 * Math.sqrt(dt);
    m.noise *= Math.max(0, 1 - 0.01 * dt);
    m.noise = Math.max(-0.3, Math.min(0.3, m.noise));
    m.index = Math.max(0.6, Math.min(1.5, 1 + 0.18 * Math.sin(s.time / 75) + m.noise));
    m.pressure *= Math.exp(-dt / 25);
    if (m.event) { m.event.t -= dt; if (m.event.t <= 0) m.event = null; }
    else if (s.stats.runEarned >= 500 && !s.uprising) {
      m.nextEvent -= dt;
      if (m.nextEvent <= 0) {
        const e = D.MARKET_EVENTS[Math.floor(Math.random() * D.MARKET_EVENTS.length)];
        m.event = { mult: e.mult, t: e.dur, text: e.text };
        m.nextEvent = 120 + Math.random() * 180;
        emit(s, 'marketEvent', { text: e.text, mult: e.mult });
      }
    }
    m.histT += dt;
    if (m.histT >= 2) {
      m.histT = 0;
      m.history.push(CF.marketIndex(s));
      if (m.history.length > 90) m.history.shift();
    }
  }

  function tickBusinesses(s, dt) {
    const { rate, mult } = CF.bizThroughput(s);
    s._bizRate = rate; s._bizUsed = 0;
    if (!rate) return;
    let budget = rate * dt;
    const keys = Object.keys(s.inventory)
      .map((key) => { const [v, q] = key.split(':'); return { key, unit: CF.unitValue(v, +q) }; })
      .sort((a, b) => b.unit - a.unit);
    let pay = 0;
    for (const k of keys) {
      if (budget <= 0) break;
      const have = s.inventory[k.key];
      const take = Math.min(have, budget / k.unit);
      s.inventory[k.key] = have - take;
      if (s.inventory[k.key] < 1e-6) delete s.inventory[k.key];
      budget -= take * k.unit;
      pay += take * k.unit;
    }
    s._bizUsed = pay / dt;
    if (pay > 0) { s._siloFull = false; earn(s, pay * mult * CF.incomeMult(s) * CF.brandMult(s)); }
  }

  // The cheapest thing worth buying right now (used by Robot Middle Management and the test bot).
  CF.cheapestPurchase = function (s) {
    const opts = [];
    D.UPGRADES.forEach((u) => {
      const l = lvl(s, u.id);
      if (l < CF.upgradeMax(s, u) && (!u.unlock || u.unlock(s))) opts.push({ cost: CF.upgradeCost(u, l, s), buy: () => CF.buyUpgrade(s, u.id) });
    });
    FD(s).BUSINESSES.forEach((b, k) => {
      if (s.businesses[b.id] > 0 || CF.bizOpen(s, b, k) || k === 0) opts.push({ cost: CF.businessCost(b, s.businesses[b.id] || 0, 1, s), buy: () => CF.buyBusiness(s, b.id) });
    });
    FD(s).VARIETIES.forEach((v) => { if (!s.unlocked[v.id] && CF.varietyAvailable(s, v)) opts.push({ cost: v.unlock, buy: () => CF.unlockVariety(s, v.id) }); });
    opts.sort((a, b) => a.cost - b.cost);
    return opts[0] || null;
  };

  function tickAutomation(s, dt) {
    if (s.uprising) return;
    const silo = CF.siloCount(s), cap = CF.siloCap(s);
    if (CF.aiOn(s, 'marketgpt')) {
      if (silo >= 1 && ((CF.marketIndex(s) >= 1.05 && CF.saturation(s) >= 0.85) || silo >= 0.95 * cap)) CF.sell(s, null);
    } else if (lvl(s, 'salesrep') && s.autoSell) {
      s.sellT += dt;
      if (silo >= 1 && (silo >= 0.5 * cap || s.sellT >= 30)) { CF.sell(s, null); s.sellT = 0; }
    }
    const autoFert = lvl(s, 'supply') || CF.aiOn(s, 'cropgpt');
    if (CF.aiOn(s, 'cropgpt')) {
      s.useFert = true;
      let best = V[FD(s).start];
      FD(s).VARIETIES.forEach((v) => { if (s.unlocked[v.id] && s.money >= v.seed * 20 && v.value > best.value) best = v; });
      s.selected = best.id;
    }
    if (autoFert && s.useFert && s.fertilizer < 10) {
      const n = Math.min(100, Math.floor(s.money * 0.25 / CF.fertPrice(s)));
      if (n >= 1) CF.buyFertilizer(s, n);
    }
    if (CF.aiOn(s, 'middlemgmt')) {
      s._mgmtT = (s._mgmtT || 0) + dt;
      if (s._mgmtT >= 1.5) {
        s._mgmtT = 0;
        const o = CF.cheapestPurchase(s);
        if (o && o.cost < s.money * 0.25) o.buy();
      }
    }
  }

  function checkProgress(s) {
    s.autonomyCache = CF.autonomy(s);
    if (s._root) return; // achievements and mail are checked on the carrot (root) farm, which can see both
    D.ACHIEVEMENTS.forEach((a) => {
      if (!s.achievements[a.id] && a.test(s)) {
        s.achievements[a.id] = Date.now();
        emit(s, 'achievement', { name: a.name, desc: a.desc });
      }
    });
    D.STORY.forEach((m) => {
      if (!s.storySeen[m.id] && m.when(s)) {
        s.storySeen[m.id] = true;
        s.inbox.push({ id: m.id, read: false, at: Date.now() });
        emit(s, 'mail', { id: m.id });
      }
    });
  }

  // ---------- main tick ----------
  // Ticks every farm you own; both keep working no matter which one you're looking at.
  CF.tickAll = function (root, dt) { for (const f of CF.farms(root)) CF.tick(f, dt); };
  CF.tick = function (s, dt) {
    if (s.lost) { s.time += dt; return; }
    s.time += dt;
    s.stats.playTime += dt;
    s.buffs.forEach((b) => { b.t -= dt; });
    s.buffs = s.buffs.filter((b) => b.t > 0);
    if (!s._offline && !s.uprising) { tickWeather(s, dt); tickRabbits(s, dt); tickPets(s, dt); tickGolden(s, dt); tickIncidents(s, dt); tickBreakdowns(s, dt); tickDave(s, dt); }
    tickMarket(s, dt);

    const speed = CF.growSpeed(s);
    for (const p of s.plots) {
      if (p.v && p.p < 1) p.p = Math.min(1, p.p + dt * speed / V[p.v].grow);
    }
    tickWorkers(s, dt);
    tickTractors(s, dt);
    tickBusinesses(s, dt);
    tickAutomation(s, dt);
    if (s.uprising) tickUprising(s, dt);
    // Soft-lock guard: broke, nothing growing, nothing to sell.
    if (!s.uprising && !CF.plantVariety(s) && s.money < 1 && CF.siloCount(s) < 1 && !s.plots.some((p) => p.v)) {
      s.money += 5;
      emit(s, 'bailout', {});
    }

    s.earnT += dt;
    if (s.earnT >= 1) {
      s.earnWindow.push(s.earnAcc / s.earnT);
      if (s.earnWindow.length > 10) s.earnWindow.shift();
      s.ips = s.earnWindow.reduce((a, b) => a + b, 0) / s.earnWindow.length;
      s.earnAcc = 0; s.earnT = 0;
    }
    s._checkT += dt;
    if (s._checkT >= 1) { s._checkT = 0; checkProgress(s); }
  };

  // Time away. Each farm simulates the first few minutes for real (so you come back to a farm that looks lived in),
  // then extrapolates its measured automated income for the rest, up to its Farm Manager's cap.
  // Rabbits, weather, golden carrots, breakdowns and glitches pause while offline.
  D.OFFLINE_SIM = 600;
  function simulateFarm(f, seconds) {
    const cap = D.offlineHours(lvl(f, 'manager')) * 3600;
    const total = Math.min(seconds, cap);
    f._offline = true;
    if (f.dave) f.workers.forEach((w) => { if (w.broken) { w.broken = false; f.stats.repairs++; } }); // Dave clocks in while you're away
    const simT = Math.min(total, D.OFFLINE_SIM), step = 5, half = simT / 2;
    let e0 = null, h0 = 0, t = 0;
    const earned = () => f.stats.lifetimeEarned;
    while (t < simT && !f.lost) {
      const d = Math.min(step, simT - t);
      CF.tick(f, d); t += d;
      if (e0 === null && t >= half) { e0 = earned(); h0 = f.stats.harvested; }
    }
    const rest = total - simT, span = simT - half;
    if (rest > 0 && e0 !== null && span > 0 && !f.uprising && !f.lost) {
      const rate = Math.max(0, (earned() - e0) / span), hRate = Math.max(0, (f.stats.harvested - h0) / span);
      earn(f, rate * rest, true);
      f.stats.harvested += hRate * rest; f.stats.runHarvested += hRate * rest;
      f.time += rest; f.stats.playTime += rest;
    }
    f._offline = false;
    f.earnWindow = []; f.earnAcc = 0; f.earnT = 0;
    return { seconds: total, capped: seconds > cap };
  }
  CF.simulateOffline = function (root, seconds) {
    const farms = CF.farms(root);
    const before = { earned: root.stats.lifetimeEarned, harvested: farms.map((f) => f.stats.harvested) };
    const res = farms.map((f) => simulateFarm(f, seconds));
    return {
      seconds: Math.max(...res.map((r) => r.seconds)), capped: res[0].capped, beetCapped: !!(res[1] && res[1].capped),
      earned: root.stats.lifetimeEarned - before.earned,
      harvested: farms[0].stats.harvested - before.harvested[0],
      beets: farms[1] ? farms[1].stats.harvested - before.harvested[1] : 0,
    };
  };

  // ---------- save / load ----------
  const skipKey = (k, v) => (k[0] === '_' || k === 'res' ? undefined : v);
  CF.serialize = function (s) {
    s = CF.root(s);
    s.lastSaved = Date.now();
    return JSON.stringify(s, skipKey); // the beet farm's shared fields are non-enumerable, so they aren't saved twice
  };
  function loadFarm(data, kind) {
    const s = newState(kind);
    for (const k in data) {
      if (k[0] === '_' || k === 'beet') continue;
      if (data[k] && typeof data[k] === 'object' && !Array.isArray(data[k]) && s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) {
        s[k] = Object.assign(s[k], data[k]);
      } else {
        s[k] = data[k];
      }
    }
    s.kind = kind;
    s.cols = data.cols; s.rows = data.rows;
    return s;
  }
  function restoreFarm(s) {
    ensurePlots(s);
    s.plots.forEach((p) => { p.res = 0; });
    s.workers.forEach((w) => { w.target = -1; w.t = Math.random() * 0.5; w.dur = Math.max(w.dur || 0.5, 0.5); });
    s.pets.forEach((p) => { p.target = 0; p.rest = 0; });
    s.rabbits.forEach((r) => { r.chaser = 0; });
    s._nextId = 1 + Math.max(0, ...s.workers.map((w) => w.id), ...s.rabbits.map((r) => r.id), ...s.pets.map((p) => p.id));
    syncWorkers(s);
    syncPets(s);
    syncTractors(s);
  }
  CF.deserialize = function (json) {
    const data = JSON.parse(json);
    if (!(data.version >= 5)) throw new Error('Save is from before 3.0'); // 3.0 is a fresh start
    const s = loadFarm(data, 'carrot');
    restoreFarm(s);
    if (data.beet) { const b = linkFarm(s, loadFarm(data.beet, 'beet')); restoreFarm(b); }
    return s;
  };

  CF.newState = newState;
})(CF);
