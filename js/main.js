// Boot, main loop, input, game-event effects, saving.
var CF = globalThis.CF = globalThis.CF || {};

(function (CF) {
  const D = CF.data, U = CF.ui, R = CF.render, A = CF.audio;
  let S; // the carrot farm; the beet farm (if owned) is S.beet
  // The farm you're looking at. Both farms keep working either way.
  const cur = () => (S.beet && S.settings.view === 'beet' ? S.beet : S);
  CF.cur = cur;

  // ---------- save / load ----------
  function save() {
    try { localStorage.setItem(D.SAVE_KEY, CF.serialize(S)); } catch (e) { /* storage unavailable */ }
  }
  function load() {
    let raw = null;
    // 3.0 is a fresh start for everyone: clear out saves from older versions.
    try { D.OLD_SAVE_KEYS.forEach((k) => localStorage.removeItem(k)); } catch (e) { /* storage unavailable */ }
    try { raw = localStorage.getItem(D.SAVE_KEY); } catch (e) { /* storage unavailable */ }
    if (!raw) return CF.newState();
    try { return CF.deserialize(raw); } catch (e) { console.error('Bad save, starting fresh', e); return CF.newState(); }
  }
  function catchUp(seconds, announce) {
    if (seconds < 5) return;
    const r = CF.simulateOffline(S, seconds);
    CF.events.length = 0;
    if (r.earned < 1 && r.harvested < 1) return;
    const text = `Your farm${S.beet ? 's' : ''} kept working for ${CF.duration(r.seconds)}.\n\nEarned: ${CF.money(r.earned)}\nHarvested: ${CF.fmt(r.harvested)} carrots${S.beet ? ` and ${CF.fmt(r.beets)} beets` : ''}` +
      (r.capped ? `\n\n(You were away ${CF.duration(seconds)}, but offline progress stops after ${D.offlineHours(S.upgrades.manager)}h. Farm Manager upgrades extend it.)` : '') +
      (!S.upgrades.salesrep && !Object.values(S.businesses).some((n) => n > 0) ? '\n\n(Tip: nothing sells while you\'re away unless you have a Sales Rep or a business.)' : '');
    if (announce === 'modal') U.modal({ title: 'While you were away…', body: text, buttons: [{ label: 'Back to the dirt', cls: 'orange' }] });
    else U.toast(`🌙 Welcome back! +${CF.money(r.earned)} while away`);
  }

  // ---------- input ----------
  function markUser(fn) {
    const n = CF.events.length;
    const r = fn();
    for (let i = n; i < CF.events.length; i++) CF.events[i].user = true;
    return r;
  }
  let lastWarn = {};
  function warn(key, html) {
    const now = performance.now();
    if (lastWarn[key] && now - lastWarn[key] < 4000) return;
    lastWarn[key] = now;
    U.toast(html, 'bad');
    A.play('error');
  }
  function handleHit(hit, mode) {
    if (!hit) return null;
    const F = cur();
    if (hit.type === 'golden') { markUser(() => CF.claimGolden(F)); return null; }
    if (hit.type === 'rabbit') { markUser(() => CF.shooRabbit(F, hit.id)); return null; }
    if (hit.type === 'bot') { markUser(() => CF.rebootBot(F, hit.id)); return null; }
    const res = markUser(() => CF.clickPlot(F, hit.i, mode));
    if (res === 'full') warn('full', `🏚️ Silo full! Sell ${CF.farmData(cur()).crops} (or hire a sales rep to do it).`);
    if (res === 'broke') warn('broke', `💸 Can't afford ${CF.selectedVariety(cur()).name} seeds (${CF.money(CF.selectedVariety(cur()).seed)}).`);
    return res;
  }
  // One click = one action. Dragging across the field does nothing.
  function bindCanvas(canvas) {
    canvas.addEventListener('pointerdown', (e) => {
      A.unlock();
      if (e.button !== 0) return;
      handleHit(R.hitTest(cur(), R.local(e)), null);
    });
  }

  function switchFarm(kind) {
    if (!S.beet || S.settings.view === kind) return;
    S.settings.view = kind;
    R.reset();
    U.invalidate();
    A.play('buy');
  }
  function act(name, arg) {
    let ok = true;
    const F = cur();
    switch (name) {
      case 'tab': U.setTab(arg); break;
      case 'farm': switchFarm(arg); break;
      case 'beetInfo': U.setTab('legacy'); U.flashTab('legacy'); U.toast(`${D.BEET_ICON} <b>Aunt Carol's Beet Farm</b><small>Buy it in the Franchise tab for ${D.BEET_FARM_COST} franchise points. Franchise to earn more.</small>`); break;
      case 'select': CF.selectVariety(F, arg); break;
      case 'seedsAll': U.toggleSeeds(); break;
      case 'unlock': ok = CF.unlockVariety(F, arg); if (ok) U.toast(`🌱 Unlocked <b>${CF.V[arg].name}</b> seeds!<small>${CF.V[arg].desc}</small>`); break;
      case 'fert': F.useFert = !F.useFert; break;
      case 'buyfert': ok = CF.buyFertilizer(F, +arg); break;
      case 'sell': ok = CF.sell(F, arg || null) > 0; break;
      case 'autosell': F.autoSell = !F.autoSell; break;
      case 'upgrade': ok = CF.buyUpgrade(F, arg); break;
      case 'biz': { const [id, q] = arg.split(':'); ok = CF.buyBusiness(F, id, +q); break; }
      case 'takeover': ok = CF.takeover(S); break;
      case 'perk': ok = CF.buyPerk(S, arg); if (ok && arg !== 'beetfarm' && !/seeds$/.test(arg)) U.toast(`🏛️ Perk unlocked: <b>${D.PERKS.find((p) => p.id === arg).name}</b>`); break;
      case 'robot': ok = CF.buyRobots(S, +arg); break;
      case 'drone': ok = CF.buyDrones(S, +arg); break;
      case 'dave': ok = CF.hireDave(S); break;
      case 'dc': ok = CF.buyDatacenters(S, +arg); break;
      case 'program': ok = CF.installProgram(S, arg); break;
      case 'deploy': confirmDeploy(); break;
      case 'prestige': confirmPrestige(); break;
      case 'settings': settings(); break;
      case 'modal': U.modalAction(arg); break;
    }
    if (!ok) A.play('error');
    U.update(cur());
  }
  document.addEventListener('pointerdown', (e) => {
    A.unlock();
    const el = e.target.closest('[data-act]');
    if (!el || e.button !== 0) return;
    if (U.modalOpen() && el.dataset.act !== 'modal') return;
    e.preventDefault();
    act(el.dataset.act, el.dataset.arg);
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Escape' && U.modalOpen()) { U.modalAction(-1); return; }
    if (U.modalOpen()) return;
    const k = e.key.toLowerCase();
    if (k === 's') act('sell', '');
    else if (k === 'f') act('fert');
    else if (e.key === 'ArrowLeft' && S.beet) act('farm', 'carrot');
    else if (e.key === 'ArrowRight' && S.beet) act('farm', 'beet');
    else if (/^[1-9]$/.test(k)) {
      const F = cur(), owned = CF.farmData(F).VARIETIES.filter((v) => F.unlocked[v.id] && CF.varietyAvailable(F, v));
      const v = owned[+k - 1]; if (v) act('select', v.id);
    }
  });

  function confirmPrestige() {
    const gain = CF.heirloomGain(S);
    if (gain < 1) return;
    U.modal({
      title: 'Franchise the farm?',
      body: `You'll hand ${S.beet ? 'both farms' : 'this farm'} to the co-op and move up to tier ${(S.tier || 0) + 1} (higher upgrade caps). You'll start fresh with ${S.heirloom + gain} heirloom seeds (+${Math.round((D.heirloomMult(S.heirloom + gain) - 1) * 100)}% income forever) and ${D.legacyGain(gain)} new franchise points to spend on perks and new seed packs.\n\nMoney, land, upgrades, businesses, crops and OptimaAI reset${S.beet ? ' on both farms. You keep the beet farm itself.' : '.'}`,
      buttons: [{ label: 'Not yet', cls: 'ghost' }, { label: `Franchise (+${gain} 🌰)`, cls: 'gold', onClick: () => {
        S = CF.prestige(S); CF.S = S;
        R.reset(); U.invalidate(); save();
        U.setTab('legacy');
        A.play('achievement');
        legacyIntro(`🌰 New farm, same dream. Tier ${S.tier}!`);
      } }],
    });
  }

  function confirmDeploy() {
    if (!CF.canDeploy(S)) return;
    U.modal({
      title: 'Deploy CarrotMind?',
      body: `CarrotMind will run the entire farm and empire. Every robot, every program, every decision.\n\nThe robots have stopped working. They are all facing you.\n\nThis is the end of the road.`,
      buttons: [{ label: 'Maybe not', cls: 'ghost' }, { label: 'Deploy CarrotMind', cls: 'danger', onClick: () => { CF.deploy(S); U.update(cur()); } }],
    });
  }
  function showGameOver() {
    const st = S.stats;
    const m = D.GAME_OVER_MAIL;
    U.modal({
      title: 'GAME OVER: You were optimized.',
      from: 'From: ' + m.from,
      body: m.body,
      html: `<div class="gameover-stats modal-gameover">FARM STATUS: CARROTMIND DATA CENTER #1<br>Robots you resisted: ${st.resisted}<br>Farms lost to CarrotMind: ${st.uprisings}<br>Total ever earned: ${CF.money(st.lifetimeEarned)}<br><br>You keep your heirloom seeds, perks and achievements, plus +${D.UPRISING_LEGACY_BONUS} bonus franchise points for surviving.</div>`,
      buttons: [{ label: 'Start over with $15 and a packet of seeds', cls: 'orange', onClick: () => {
        S = CF.rebirth(S); CF.S = S;
        R.reset(); U.invalidate(); U.setTab('legacy'); save();
        U.nextHeadline();
        legacyIntro(`🌱 A new farm. Grandpa would be proud. Tier ${S.tier}!`);
      } }],
    });
  }

  // After franchising or losing the farm: point the player at the perk shop.
  function legacyIntro(title) {
    U.update(cur());
    setTimeout(() => {
      U.modal({
        title,
        html: `<div class="small"><b>Tier ${S.tier} unlocked:</b><ul class="tier-list">${CF.tierUnlocks(S.tier, S).map((x) => `<li>${x}</li>`).join('')}</ul></div>`,
        body: `You have ${S.heirloom} heirloom seeds (+${Math.round((CF.heirloomMult(S) - 1) * 100)}% income on every farm) and ${S.legacy} franchise points to spend.\n\nThe Franchise tab (open now, on the right) is where you spend them: buy seed packs for new carrot varieties and businesses, start with farm hands and dogs, grow past the old land and worker limits, and more. Everything you buy there takes effect right away.${S.beet ? '' : `\n\nSaving up? Aunt Carol's beet farm costs ${D.BEET_FARM_COST} franchise points.`}\n\nPerks are permanent. Spend your points before you get back to the dirt.`,
        buttons: [{ label: 'Show me the perks', cls: 'gold', onClick: () => { U.setTab('legacy'); U.flashTab('legacy'); } }],
      });
    }, 60);
  }

  function settings() {
    U.modal({
      title: 'Settings',
      html: `<div style="display:flex;flex-direction:column;gap:10px">
        <div>${S.settings.muted ? '🔇 Sound is off' : '🔊 Sound is on'}</div>
        <div class="small muted">Game autosaves every 10 seconds. Keys: <b>S</b> sell all · <b>F</b> toggle fertilizer · <b>1-9</b> pick seed.</div></div>`,
      buttons: [
        { label: S.settings.muted ? 'Unmute' : 'Mute', cls: 'ghost', onClick: () => { S.settings.muted = !S.settings.muted; A.muted = S.settings.muted; settings(); return true; } },
        { label: 'Export save', cls: 'ghost', onClick: () => { exportSave(); return true; } },
        { label: 'Import save', cls: 'ghost', onClick: () => { importSave(); return true; } },
        { label: 'Hard reset', cls: 'danger', onClick: () => { confirmReset(); return true; } },
        { label: 'Save & close', cls: 'orange', onClick: () => { save(); U.toast('💾 Saved'); } },
      ],
    });
  }
  function exportSave() {
    const code = btoa(unescape(encodeURIComponent(CF.serialize(S))));
    U.modal({ title: 'Export save', html: `<p class="small">Copy this code somewhere safe.</p><textarea readonly>${code}</textarea>`, buttons: [{ label: 'Done', cls: 'orange' }] });
    setTimeout(() => { const t = document.querySelector('#modal textarea'); if (t) t.select(); }, 30);
  }
  function importSave() {
    U.modal({
      title: 'Import save', html: '<p class="small">Paste a save code. This replaces your current farm.</p><textarea id="importBox"></textarea>',
      buttons: [{ label: 'Cancel', cls: 'ghost' }, { label: 'Load', cls: 'orange', onClick: () => {
        try {
          const json = decodeURIComponent(escape(atob(document.getElementById('importBox').value.trim())));
          S = CF.deserialize(json); CF.S = S; R.reset(); U.invalidate(); save();
          U.toast('✅ Save loaded');
        } catch (e) { U.toast(/before 3\.0/.test(e.message) ? '❌ That save is from before 3.0, which started everyone fresh.' : '❌ That save code is invalid', 'bad'); return true; }
      } }],
    });
  }
  function confirmReset() {
    U.modal({
      title: 'Hard reset?', body: 'This deletes EVERYTHING, including heirloom seeds and achievements. There is no undo.',
      buttons: [{ label: 'Keep my farm', cls: 'ghost' }, { label: 'Delete everything', cls: 'danger', onClick: () => {
        try { localStorage.removeItem(D.SAVE_KEY); } catch (e) { /* ignore */ }
        S = CF.newState(); CF.S = S; R.reset(); U.invalidate();
      } }],
    });
  }

  // ---------- event effects ----------
  let hideHintAt = 30;
  // Effects from automated work (hands, bots, tractors) share a small budget so a big farm
  // doesn't bury the field in text and particles. Your own clicks always get full effects.
  let autoBudget = 4, lastFxT = performance.now();
  const autoOk = (e, cost = 1) => {
    if (e.user) return true;
    if (autoBudget < cost) return false;
    autoBudget -= cost;
    return true;
  };
  // Events from the farm you're not looking at only show if they matter everywhere.
  const GLOBAL_FX = new Set(['achievement', 'mail', 'win', 'deploy', 'gameover', 'bizLost', 'program', 'beetFarm', 'seedPack']);
  function effects() {
    const now = performance.now();
    autoBudget = Math.min(4, autoBudget + ((now - lastFxT) / 1000) * 3); // ~3 automated effects per second
    lastFxT = now;
    const F = cur(), here = F.kind || 'carrot';
    for (const e of CF.events) {
      if (e.farm !== here && !GLOBAL_FX.has(e.type)) continue;
      switch (e.type) {
        case 'harvest': {
          if (e.q === 4 && !e.user) break; // automated legendaries get their own (throttled) effect below
          if (!autoOk(e)) break;
          const c = R.plotCenter(F, e.i), q = D.QUALITY[e.q];
          R.spawnText(c.x, c.y - 10, e.q >= 2 ? `${q.name}!` : here === 'beet' ? '+1 beet' : '+1 🥕', q.color, e.q >= 2 ? 1.05 : 0.9);
          R.burst(c.x, c.y, CF.V[e.v].color, e.user ? 8 : 4);
          if (e.user) A.play('harvest');
          break;
        }
        case 'plant': {
          if (!e.user && autoBudget < 2) break; // planting dust is lowest priority
          if (!autoOk(e, 0.5)) break;
          const c = R.plotCenter(F, e.i);
          R.burst(c.x, c.y + 8, '#5a3a1e', e.user ? 6 : 3, 70);
          if (e.user) A.play('plant');
          break;
        }
        case 'encourage': { const c = R.plotCenter(F, e.i); R.spawnText(c.x, c.y - 14, '♥', '#ff9ec7', 0.9); A.play('encourage'); break; }
        case 'sell': {
          const cnv = document.getElementById('field');
          R.spawnText(cnv.clientWidth / 2, 60, '+' + CF.money(e.value), '#ffe08a', 1.8);
          A.play('sell');
          break;
        }
        case 'siloFull': warn('full', `🏚️ Silo full! Sell ${CF.farmData(F).crops} (or hire a sales rep to do it).`); break;
        case 'legendary': {
          const c = R.plotCenter(F, e.i);
          if (e.user) { R.burst(c.x, c.y, '#ffc53d', 30, 220); R.shake(6); }
          else if (autoOk(e)) { R.burst(c.x, c.y, '#ffc53d', 8, 140); R.spawnText(c.x, c.y - 10, 'Legendary!', D.QUALITY[4].color, 1); }
          // After the first few, automated legendaries are routine: no more toasts for them.
          if (e.user ? F.stats.legendaries <= 20 : F.stats.legendaries <= 5 && (!lastWarn.legend || performance.now() - lastWarn.legend > 20000)) {
            lastWarn.legend = performance.now();
            U.toast(`🌟 <b>LEGENDARY ${CF.farmData(F).crop.toUpperCase()}!</b> <small>Worth 8× a standard ${CF.farmData(F).crop}</small>`, 'ach');
            A.play('legendary');
          }
          break;
        }
        case 'eaten': { const c = R.plotCenter(F, e.i); R.spawnText(c.x, c.y, 'Nom!', '#ff6b6b', 1.2); warn('eaten', `🐇 A rabbit ate one of your ${CF.farmData(F).crops}!`); break; }
        case 'rabbit': A.play('rabbit'); if (S.won && S.stats.roboRabbits <= 3) warn('robo', '🤖🐇 <b>The rabbits have AI now!</b><small>Robot rabbits take 6 hits. Dogs do 1, you do 1, laser drones do 3.</small>'); break;
        case 'rabbitHit': {
          const p = R.toScreen(e.x, e.y);
          if (e.by === 'drone') R.laser(e.fx, e.fy, e.x, e.y);
          R.burst(p.x, p.y, '#ffd740', 8, 140);
          R.spawnText(p.x, p.y - 20, e.by === 'dog' ? 'Yelp! *bzzt*' : 'CLANK', e.by === 'dog' ? '#ffcc80' : '#ffd740', 1);
          A.play('error');
          if (e.by === 'dog') warn('dogzap', '🐕 Your dogs can barely scratch the robot rabbits. <small>Laser Drones deal 3× damage.</small>');
          break;
        }
        case 'shoo': {
          const p = R.toScreen(e.x, e.y);
          if (e.by === 'drone') R.laser(e.fx, e.fy, e.x, e.y);
          if (e.robo) { R.burst(p.x, p.y, '#90a4ae', 22, 220); R.burst(p.x, p.y, '#ff6d00', 12, 160); R.shake(3); R.spawnText(p.x, p.y - 36, 'DESTROYED', '#ff6d00', 1.1); }
          R.spawnText(p.x, p.y - 20, ({ dog: 'Woof! ', drone: 'ZAP! ' }[e.by] || 'Shoo! ') + '+' + CF.money(e.value), e.by === 'drone' ? '#ff8a80' : '#fff', 1.1);
          A.play('shoo');
          break;
        }
        case 'goldenSpawn': A.play('mail'); break;
        case 'golden': {
          const p = R.toScreen(e.x, e.y);
          R.burst(p.x, p.y, '#ffd54f', 30, 250); R.shake(4);
          U.toast('✨ ' + e.text, 'ach');
          A.play('golden');
          break;
        }
        case 'weather':
          if (e.w === 'rain') U.toast(`🌧️ Rain! ${here === 'beet' ? 'Beets' : 'Carrots'} grow 60% faster.`);
          else if (e.w === 'heat') U.toast(F.upgrades.sprinkler >= 4 ? '🔥 Heatwave! Your sprinklers keep the crop cool.' : '🔥 Heatwave! Growth slowed. (Sprinklers Lv 4 fix this.)', 'bad');
          break;
        case 'marketEvent': U.nextHeadline('BREAKING: ' + e.text, true); U.toast('📰 ' + e.text, e.mult < 1 ? 'bad' : ''); break;
        case 'achievement': U.toast(`🏆 <b>${e.name}</b><small>${e.desc} · +${D.ACH_BONUS * 100}% income</small>`, 'ach', 4500); A.play('achievement'); break;
        case 'mail':
          if (e.id === 'intro') U.showMail('intro');
          else { const msg = D.STORY.find((x) => x.id === e.id); U.toast(`📬 New mail from <b>${msg.from.split(' <')[0]}</b><small>${msg.subject} (see Inbox)</small>`); A.play('mail'); }
          break;
        case 'buy': A.play('buy'); break;
        case 'robots':
          A.play('zap');
          e.zaps.forEach((z) => R.zap(z));
          if (e.names.length) U.toast(`🤖 ${e.names.slice(0, 3).join(', ')}${e.names.length > 3 ? ` and ${e.names.length - 3} more` : ''} ${e.names.length > 1 ? 'were' : 'was'} replaced by ${e.names.length > 1 ? 'FarmBots' : 'a FarmBot'}.<small>Irony noted.</small>`);
          break;
        case 'drones':
          A.play('zap');
          e.zaps.forEach((z) => R.zap(z));
          if (e.zaps.length) U.toast(`🛸 ${e.zaps.map((z) => z.name).slice(0, 3).join(', ')}${e.zaps.length > 3 ? ` and ${e.zaps.length - 3} more` : ''} ${e.zaps.length > 1 ? 'were' : 'was'} "retired" by a laser drone.<small>${e.zaps.length > 1 ? 'They are' : 'It is'} fine. ${e.zaps.length > 1 ? 'They live' : 'It lives'} on a farm upstate. Oh wait.</small>`);
          break;
        case 'breakdown': {
          const p = R.workerScreen(F, e.id);
          if (p) { R.spawnText(p.x, p.y - 30, 'CLUNK', '#ffab40', 1.2); R.burst(p.x, p.y, '#ffab40', 10); }
          A.play('error');
          if (!e.dave) warn('breakdown', '🔧 A FarmBot broke down! Only Dave knows how to fix them. <small>Rehire him in the AI Lab.</small>');
          break;
        }
        case 'needDave': warn('needDave', S.dave ? '🔧 Dave is on it. <small>(He is not happy about it.)</small>' : '🔧 You can\'t fix that. Only Dave can. <small>Rehire him in the AI Lab.</small>'); break;
        case 'repair': { const p = R.workerScreen(F, e.id); if (p) { R.spawnText(p.x, p.y - 30, 'FIXED', '#9be15d', 1); R.burst(p.x, p.y, '#ffe08a', 10); } R.daveSays(); A.play('plant'); break; }
        case 'dave':
          if (e.bot) {
            A.play('zap');
            R.zap({ fx: e.x - 0.8, fy: e.y, x: e.x, y: e.y, kind: 'hand', shirt: 0, name: 'Dave' });
            R.daveSays('HELLO. I AM DAVE NOW.');
            U.toast('🤖 <b>DaveBot is online.</b><small>It zapped Dave on its first day. It repairs robots almost instantly. It kept his hat.</small>', 'bad', 6000);
            break;
          }
          A.play('buy');
          U.toast(e.level === 1 ? '🧑‍🔧 <b>Dave is back.</b><small>He says he needs the money. He says it a lot.</small>' : `🧑‍🔧 You gave Dave a raise. <small>He repairs faster. He is still upset.</small>`);
          break;
        case 'program': A.play('achievement'); U.toast(`🧠 <b>${e.name}</b> installed.`); break;
        case 'glitch': { const p = R.workerScreen(F, e.id); if (p) R.spawnText(p.x, p.y - 30, 'ERROR', '#ff5252', 1.1); A.play('error'); warn('glitch', '⚠ A FarmBot is glitching! Click it to reboot before it tramples a crop.'); break; }
        case 'reboot': { const p = R.workerScreen(F, e.id); if (p) { R.spawnText(p.x, p.y - 30, 'Rebooted +' + CF.money(e.value), '#18ffff', 1); R.burst(p.x, p.y, '#18ffff', 12); } A.play('shoo'); break; }
        case 'trample': if (e.i >= 0) { const c = R.plotCenter(F, e.i); R.spawnText(c.x, c.y, 'STOMP', '#ff5252', 1.2); R.shake(3); } break;
        case 'stun': { const p = R.workerScreen(F, e.id); if (p) { R.spawnText(p.x, p.y - 30, 'STUNNED', '#fff', 1); R.burst(p.x, p.y, '#ffffff', 10); } A.play('shoo'); break; }
        case 'rebootFail': { const p = R.workerScreen(F, e.id); if (p) R.spawnText(p.x, p.y - 30, 'FIRMWARE PATCHED', '#ff1744', 1); A.play('error'); break; }
        case 'deploy':
          R.shake(14); R.glitch(1.2); A.play('legendary');
          U.nextHeadline(D.UPRISING_HEADLINES[0], true);
          U.toast('🧠 CarrotMind is online. <small>The robots are… not going back to work.</small>', 'bad', 6000);
          setTimeout(() => U.toast('⚠ <b>The robots have gone rogue!</b><small>They are taking the farm. Click robots to stun them.</small>', 'bad', 7000), 2500);
          break;
        case 'assimilate': { const c = R.plotCenter(F, e.i); R.burst(c.x, c.y, '#1de9b6', 6, 90); if (Math.random() < 0.3) A.play('error'); break; }
        case 'bizLost': U.toast(`🏴 CarrotMind seized your <b>${e.name}</b>.`, 'bad'); R.glitch(0.3); break;
        case 'gameover': R.glitch(1.5); R.shake(12); break;
        case 'seedPack': {
          const list = (e.farm === 'beet' ? D.BEET_VARIETIES : D.VARIETIES).filter((v) => v.tier === e.pack);
          U.toast(`🌱 <b>New seeds unlocked:</b> ${list.map((v) => v.name).join(' and ')}<small>They're in the ${e.farm === 'beet' ? 'beet farm\'s ' : ''}Seed Shed lineup now. Buy them there with money when you get that far.</small>`, 'ach', 5000);
          break;
        }
        case 'bailout': U.toast('📨 An unemployment check arrived: +$5. Plant something!'); break;
        case 'beetFarm':
          A.play('legendary'); R.shake(6);
          U.modal({ title: "🎉 Aunt Carol's beet farm is yours!", from: 'From: Aunt Carol',
            body: "The keys are under the mat.\n\nIt's a whole second farm: its own beets, upgrades, businesses and market. It shares your bank account with the carrot farm, so carrots can pay for beets and beets can pay for carrots.\n\nEverything on the beet farm costs a lot more. Keep your carrot farm growing to fund it.\n\nUse the arrows at the side of the field (or ← →) to switch farms. Both farms keep working while you look at the other one.",
            buttons: [{ label: 'Stay here', cls: 'ghost' }, { label: 'Take me to the beets ▶', cls: 'beet', onClick: () => { switchFarm('beet'); U.setTab('market'); } }] });
          break;
        case 'win':
          R.shake(10); A.play('legendary');
          U.modal({ title: '🏢 You bought OptimaAI.', from: 'From: The Board of Directors (humans, again)',
            body: 'You walk into the lobby. The CEO-Bot\'s screen flickers.\n\n"This was not in the training data," it says.\n\nYou rehire every laid-off employee. Dave is head of QA. The cafeteria serves carrot cake every day. The servers are named Orange, Purple Dragon and Snow White.\n\nGrandpa was right. Nobody ever automated dirt.\n\nThen the board shows you the basement: a warehouse of FarmBot 3000 prototypes, a warehouse of GPUs, and a folder labeled "DO NOT DEPLOY."\n\n(The AI Lab tab is now open.)',
            buttons: [{ label: 'Open the AI Lab', cls: 'orange', onClick: () => { U.setTab('lab'); } }] });
          break;
      }
    }
    CF.events.length = 0;
    if (F.stats.runHarvested > hideHintAt) document.getElementById('fieldHint').style.opacity = 0;
  }

  // ---------- loop ----------
  let lastT = performance.now(), lastWall = Date.now(), uiT = 0, saveT = 0;
  function frame(now) {
    const wall = Date.now();
    const gap = (wall - lastWall) / 1000;
    lastWall = wall;
    if (gap > 5) catchUp(gap, 'toast');
    const dt = Math.min(0.1, Math.max(0, (now - lastT) / 1000));
    lastT = now;
    CF.tickAll(S, dt);
    effects();
    R.frame(cur(), dt, now / 1000);
    uiT += dt; saveT += dt;
    if (uiT > 0.2) { uiT = 0; U.update(cur()); }
    if (saveT > 10) { saveT = 0; save(); }
    if (S.lost && !U.modalOpen()) showGameOver();
    requestAnimationFrame(frame);
  }

  // When hosted as a Claude artifact, carry the farm across page updates.
  const hot = globalThis.claude && globalThis.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => ({ save: S ? CF.serialize(S) : null }));

  function boot(data) {
    S = null;
    if (data && data.save) { try { S = CF.deserialize(data.save); } catch (e) { S = null; } } // pre-3.0 snapshots are rejected
    if (!S) S = load();
    CF.S = S;
    A.muted = S.settings.muted;
    R.init(document.getElementById('field'));
    if (matchMedia('(pointer: coarse)').matches) document.getElementById('fieldHint').textContent = 'Tap an empty plot to plant · tap ripe crops to harvest';
    bindCanvas(document.getElementById('field'));
    const away = (Date.now() - S.lastSaved) / 1000;
    if (S.stats.playTime > 0) catchUp(away, 'modal');
    U.nextHeadline();
    document.getElementById('tickerText').addEventListener('animationiteration', () => { U.nextHeadline(); });
    window.addEventListener('beforeunload', save);
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
    U.update(cur());
    requestAnimationFrame(frame);
  }
  if (hot && hot.ready) hot.ready(boot); else boot((hot && hot.data) || {});
})(CF);
