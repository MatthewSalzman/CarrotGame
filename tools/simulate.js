// Headless balance check: a greedy bot plays the game like a real person over many days.
// Each day has a few short play sessions; between them the game runs offline (capped by the Farm Manager).
// Usage: node tools/simulate.js [days] [sessionsPerDay] [minutesPerSession] [clicksPerSec]
const fs = require('fs'), path = require('path'), vm = require('vm');
for (const f of ['data.js', 'game.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'));
const CF = globalThis.CF, D = CF.data;
const days = +(process.argv[2] || 30), sessions = +(process.argv[3] || 3), minutes = +(process.argv[4] || 20), cps = +(process.argv[5] || 2);
const quiet = process.env.QUIET;

let S = CF.newState();
let clock = 0; // real seconds since install
const marks = [];
const mark = (k) => { if (!marks.some((m) => m.k === k)) { marks.push({ k, t: clock }); if (!quiet) console.log(when(clock).padEnd(12), k); } };
function when(t) { const d = Math.floor(t / 86400), h = Math.floor((t % 86400) / 3600); return `day ${d + 1} ${String(h).padStart(2, '0')}h`; }

function buyPerks(s) {
  for (let guard = 0; guard < 50; guard++) {
    if (!s.beet && s.legacy >= D.BEET_FARM_COST && CF.buyPerk(s, 'beetfarm')) { mark('BEET FARM bought (tier ' + s.tier + ')'); continue; }
    const saving = !s.beet && s.tier >= 1; // save up for the beet farm after a couple of franchises
    const opts = D.PERKS.filter((p) => p.id !== 'beetfarm' && CF.perk(s, p.id) < p.max && (!p.req || CF.perk(s, p.req)))
      .map((p) => ({ p, c: p.cost(CF.perk(s, p.id)) })).sort((a, b) => a.c - b.c);
    const o = opts[0];
    if (!o || s.legacy < o.c || (saving && s.legacy - o.c < D.BEET_FARM_COST)) break;
    CF.buyPerk(s, o.p.id);
  }
}

function bestSeed(f) {
  CF.farmData(f).VARIETIES.forEach((v) => { if (f.unlocked[v.id] && CF.varietyAvailable(f, v) && f.money >= v.seed * 50 && v.value > CF.selectedVariety(f).value) f.selected = v.id; });
}

function playFarm(f, dt, clicks) {
  for (let c = 0; c < clicks; c++) {
    const i = f.plots.findIndex((p) => !p.a && (!p.v || p.p >= 1));
    if (i >= 0) CF.clickPlot(f, i); else CF.clickPlot(f, Math.floor(Math.random() * f.plots.length));
    if (f.golden && Math.random() < 0.05) CF.claimGolden(f);
    f.rabbits.forEach((r) => { if (Math.random() < 0.05) CF.shooRabbit(f, r.id); });
    f.workers.forEach((w) => { if (w.glitch > 0 && Math.random() < 0.1) CF.rebootBot(f, w.id); });
  }
  if (!CF.aiOn(f, 'marketgpt') && ((CF.siloCount(f) > CF.siloCap(f) * 0.6 && CF.saturation(f) > 0.5) || f.money < 3)) CF.sell(f, null);
}

function aiPurchases(s) {
  const eff = CF.computeEff(s);
  const prog = D.PROGRAMS.find((p) => !s.programs[p.id]);
  if (s.dave < D.DAVE.max && CF.brokenRobots(s) && s.money > CF.daveCost(s) * 3) CF.hireDave(s);
  if (eff < 1 && s.money > CF.dcCost(s) * 1.2) CF.buyDatacenters(s, 1);
  else if (prog && s.money > CF.programCost(s, prog) && CF.computeSupply(s) >= CF.computeDemand(s) + prog.upkeep) CF.installProgram(s, prog.id);
  else if (prog && CF.computeSupply(s) < CF.computeDemand(s) + prog.upkeep && s.money > CF.dcCost(s) * 2) CF.buyDatacenters(s, 1);
  else if (s.robots < CF.robotMax(s) && s.money > CF.robotCost(s) * 4 && CF.computeSupply(s) > CF.computeDemand(s)) CF.buyRobots(s, 1);
  else if (s.drones < CF.droneMax(s) && s.money > CF.droneCost(s) * 4 && CF.computeSupply(s) > CF.computeDemand(s) + 3) CF.buyDrones(s, 1);
  if (CF.canDeploy(s) && s.money >= CF.carrotMindCost(s)) { CF.deploy(s); mark('DEPLOY CarrotMind (tier ' + s.tier + ')'); }
}

function shop(s) {
  if (s.won) aiPurchases(s);
  // Buy the cheapest thing across both farms, while it's under 60% of the bank.
  for (let k = 0; k < 4; k++) {
    const opts = CF.farms(s).map((f) => CF.cheapestPurchase(f)).filter(Boolean).sort((a, b) => a.cost - b.cost);
    if (opts[0] && opts[0].cost < s.money * (s.won ? 0.2 : 0.6)) opts[0].buy(); else break;
  }
  for (const f of CF.farms(s)) if (f.fertilizer < 5 && f.money > CF.fertPrice(f) * 60) CF.buyFertilizer(f, 20);
  if (!s.won && s.money >= CF.takeoverCost(s)) { CF.takeover(s); mark('TAKEOVER OptimaAI (tier ' + s.tier + ')'); }
}

function milestones(s) {
  for (let e = 3; e <= 45; e += 3) if (s.stats.lifetimeEarned >= Math.pow(10, e)) mark('lifetime ' + CF.money(Math.pow(10, e)));
  if (s.beet && s.beet.ips > s.ips && s.beet.ips > 0) mark('beets out-earn carrots (tier ' + s.tier + ')');
  for (const f of CF.farms(s)) CF.farmData(f).VARIETIES.forEach((v) => { if (f.unlocked[v.id] && !v.tier) mark(`unlock ${v.name} (tier ${s.tier})`); });
}

// Franchise like a sensible player: once seeds-per-hour for this run has peaked and started to fall.
let runStart = 0, bestRate = 0;
function maybeFranchise(s) {
  if (process.env.NOFRANCHISE) return;
  if (s.lost) { S = CF.rebirth(s); mark('rebirth after uprising → tier ' + S.tier); buyPerks(S); runStart = clock; bestRate = 0; return; }
  const gain = CF.heirloomGain(s), rate = gain / Math.max(1, clock - runStart);
  bestRate = Math.max(bestRate, rate);
  if (gain >= 3 && rate < bestRate * 0.8 && !s.uprising) {
    const t = s.tier;
    S = CF.prestige(s);
    mark(`franchise #${S.stats.prestiges} (${gain} seeds after ${((clock - runStart) / 86400).toFixed(1)}d, tier ${t}→${S.tier}, legacy ${S.legacy})`);
    buyPerks(S);
    runStart = clock; bestRate = 0;
  }
}

function session(sec) {
  const dt = 0.5;
  let clickAcc = 0;
  for (let t = 0; t < sec; t += dt) {
    CF.tickAll(S, dt); CF.events.length = 0;
    clickAcc += dt * cps;
    const clicks = Math.floor(clickAcc); clickAcc -= clicks;
    const f = S.beet && Math.random() < 0.5 ? S.beet : S; // split attention between farms
    playFarm(f, dt, clicks);
    if (S.beet) { if (f === S) playFarm(S.beet, dt, 0); else playFarm(S, dt, 0); }
    if (Math.round(t / dt) % 10 === 0) { CF.farms(S).forEach(bestSeed); shop(S); milestones(S); }
    if (S.lost) break;
  }
  clock += sec;
  maybeFranchise(S);
}

const t0 = Date.now();
const gap = 86400 / sessions, active = minutes * 60;
for (let d = 0; d < days; d++) {
  for (let k = 0; k < sessions; k++) {
    session(d === 0 && k === 0 ? active * 3 : active); // people binge a bit on day one
    const away = gap - active;
    CF.simulateOffline(S, away); CF.events.length = 0;
    clock += away;
    milestones(S);
  }
  if (!quiet || d % 10 === 9) console.log(`-- ${when(clock)}: tier ${S.tier}, heirloom ${S.heirloom}, legacy ${S.legacy}, money ${CF.money(S.money)}, carrots ${CF.money(S.ips)}/s` +
    (S.beet ? `, beets ${CF.money(S.beet.ips)}/s` : '') + `, run ${CF.money(S.stats.runEarned)}, next seeds ${CF.heirloomGain(S)}, land ${S.upgrades.land} hands ${S.upgrades.hands} best ${CF.selectedVariety(S).name}` + (S.won ? ' [AI]' : ''));
}
console.log(`\nsimulated ${days} days in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
