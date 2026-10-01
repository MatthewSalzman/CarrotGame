// DOM panels: top bar, seed shed, tabs, toasts, modals.
// Panels re-render from HTML strings a few times a second; actions fire on pointerdown
// via data-act attributes so a re-render never swallows a click.
var CF = globalThis.CF = globalThis.CF || {};

(function (CF) {
  const D = CF.data;
  const U = {};
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const m = CF.money, f = CF.fmt;
  let tab = typeof matchMedia === 'function' && matchMedia('(max-width: 900px)').matches ? 'seeds' : 'market';
  let leftHtml = '';
  let showAllSeeds = false;
  U.toggleSeeds = () => { showAllSeeds = !showAllSeeds; };
  const last = {};

  // On phones the left panel (Seed Shed, fertilizer, farm stats) becomes the Seeds tab.
  const mobileMQ = typeof matchMedia === 'function' ? matchMedia('(max-width: 900px)') : { matches: false };
  U.mobile = () => mobileMQ.matches;
  const TABS = [
    ['seeds', 'Seeds'], ['market', 'Market'], ['upgrades', 'Upgrades'], ['empire', 'Empire'], ['lab', 'AI Lab'],
    ['goals', 'Goals'], ['inbox', 'Inbox'], ['legacy', 'Franchise'],
  ];
  const labOpen = (s) => !s._root && (s.won || s.uprising || s.lost);
  const FD = CF.farmData;
  const icon = (i) => i; // emoji or inline SVG
  const findMail = (id) => (id === D.GAME_OVER_MAIL.id ? D.GAME_OVER_MAIL : D.STORY.find((x) => x.id === id));

  function set(el, html) { if (last[el] !== html) { last[el] = html; $(el).innerHTML = html; } }
  const btn = (label, act, arg, cls = '', enabled = true) =>
    `<button class="btn ${cls}${enabled ? '' : ' off'}" data-act="${act}" data-arg="${esc(arg ?? '')}">${label}</button>`;
  const toggle = (label, on, act) => `<span class="toggle ${on ? 'on' : ''}" data-act="${act}"><span class="sw"></span>${label}</span>`;

  U.setTab = (t) => { tab = t; last.tabBody = null; $('tabBody').scrollTop = 0; };
  let flashTab = null, flashUntil = 0;
  U.flashTab = (t) => { flashTab = t; flashUntil = Date.now() + 6000; last.tabs = null; };
  U.tab = () => tab;

  // ---------- top bar ----------
  function topbar(s) {
    const r = CF.root(s), fd = FD(s);
    $('money').textContent = m(s.money);
    $('income').textContent = m(CF.totalIps(s)) + '/s';
    $('income').title = r.beet ? `Carrots ${m(r.ips)}/s · Beets ${m(r.beet.ips)}/s` : '';
    set('brandLogo', fd.icon);
    set('brandSub', `${r.beet ? (s._root ? 'the beet farm' : 'the carrot farm') : 'a carrot empire'} · v${D.GAME_VERSION}`);
    document.body.classList.toggle('beet', !!s._root);
    const cap = CF.siloCap(s), cnt = CF.siloCount(s);
    $('silo').textContent = `${f(cnt)} / ${f(cap)}`;
    $('siloBar').style.width = Math.min(100, (cnt / cap) * 100) + '%';
    $('siloBar').parentElement.classList.toggle('full', cnt >= cap - 0.5);
    const w = s.weather.type;
    const wInfo = { sunny: ['☀️', 'Sunny'], rain: ['🌧️', 'Rain · +60% growth'], heat: ['🔥', s.upgrades.sprinkler >= 4 ? 'Heatwave · sprinklers holding' : 'Heatwave · -40% growth'] }[w];
    set('weather', `<span class="big">${wInfo[0]}</span><span>${wInfo[1]}${w !== 'sunny' ? ` <span class="muted">(${Math.ceil(s.weather.t)}s)</span>` : ''}</span>`);
    set('buffs', s.buffs.map((b) => `<span class="buff ${b.id}">${b.id === 'frenzy' ? '🌱 Growth ×3' : '💰 Prices ×2'} ${Math.ceil(b.t)}s</span>`).join(''));
    const permanent = CF.heirloomMult(s) * (1 + D.ACH_BONUS * CF.achCount(s));
    set('heirloom', s.heirloom || CF.achCount(s) ? `🌰 ${s.heirloom} · 🏆 ${CF.achCount(s)} <span class="muted">(+${f((permanent - 1) * 100)}%)</span>` : '');
    const auto = CF.autonomy(r);
    set('autonomy', labOpen(r) ? `<span class="auto-label">🤖 Autonomy</span><span class="auto-val">${Math.floor(auto)}%</span><div class="bar auto-bar"><div style="width:${auto}%"></div></div>` : '');
    document.body.classList.toggle('rogue', !!(r.uprising || r.lost));
    document.body.classList.toggle('uneasy', !r.uprising && labOpen(r) && auto >= 70);
  }

  // Arrows at the sides of the field to walk between farms.
  function farmNav(s) {
    const r = CF.root(s);
    let h = '';
    if (r.beet) {
      const other = s._root ? r : r.beet, ofd = FD(other);
      h = `<button class="farm-arrow ${s._root ? 'left' : 'right'}" data-act="farm" data-arg="${ofd.kind}" title="Go to the ${ofd.name} (← →)">
        <span class="arr">${s._root ? '◀' : '▶'}</span><span class="fa-ico">${ofd.icon}</span><span class="fa-txt"><b>${ofd.crops[0].toUpperCase() + ofd.crops.slice(1)}</b><small>${other.lost ? 'lost' : m(other.ips) + '/s'}</small></span></button>`;
    } else if (r.tier >= 1 || r.stats.prestiges >= 1) {
      h = `<button class="farm-arrow right locked" data-act="beetInfo" title="Aunt Carol's beet farm">
        <span class="arr">🔒</span><span class="fa-ico">${D.BEET_ICON}</span><span class="fa-txt"><b>Beets</b><small>${Math.min(r.legacy, D.BEET_FARM_COST)}/${D.BEET_FARM_COST} pts</small></span></button>`;
    }
    set('farmNav', h);
    CF.render.sidePad = h ? (U.mobile() ? 30 : 44) : 0;
  }

  // ---------- left panel ----------
  function left(s) {
    let h = '<div class="section"><h3>🌱 Seed Shed <span class="right">plant with</span></h3>';
    let shownLocked = 0;
    // With many unlocked seeds, list a window around the best one you can afford right now
    // (2 cheaper, 3 pricier, plus the selected one), so a fresh farm can always find a seed it can buy.
    const fd = FD(s), list = fd.VARIETIES;
    const owned = list.filter((v) => s.unlocked[v.id] && CF.varietyAvailable(s, v));
    let best = 0;
    owned.forEach((v, i) => { if (v.seed <= Math.max(s.money, 1)) best = i; });
    const shown = new Set(showAllSeeds ? owned.map((v) => v.id)
      : owned.slice(Math.max(0, best - 2), best + 4).map((v) => v.id).concat([CF.selectedVariety(s).id]));
    if (owned.length > 7) h += `<div class="small muted seed-toggle" data-act="seedsAll">${showAllSeeds ? '▲ Show fewer seeds' : `▼ Show all ${owned.length} seeds (${owned.length - shown.size} hidden)`}</div>`;
    for (const v of list) {
      if (!CF.varietyAvailable(s, v)) continue;
      if (s.unlocked[v.id] && !shown.has(v.id)) continue;
      if (s.unlocked[v.id]) {
        const sel = CF.selectedVariety(s).id === v.id;
        h += `<div class="seed ${sel ? 'sel' : ''}" data-act="select" data-arg="${v.id}">
          <span class="dot" style="background:${v.color}"></span>
          <div class="grow"><div class="name">${v.name}</div>
          <div class="meta">Seed ${m(v.seed)} · sells ~${m(v.value)} · ${v.grow < 120 ? v.grow + 's' : Math.round(v.grow / 6) / 10 + 'm'}</div></div></div>`;
      } else if (shownLocked === 0) {
        shownLocked++;
        h += `<div class="seed locked"><span class="dot" style="background:${v.color};opacity:.5"></span>
          <div class="grow"><div class="name">${v.name}</div><div class="meta">${esc(v.desc)}</div></div>
          ${btn(m(v.unlock), 'unlock', v.id, 'orange sm', s.money >= v.unlock)}</div>`;
      } else if (shownLocked === 1) {
        shownLocked++;
        h += '<div class="seed mystery"><span class="dot" style="background:#aaa"></span><div class="grow"><div class="name">???</div><div class="meta">Keep growing to discover</div></div></div>';
      }
    }
    h += '</div>';
    if (CF.aiOn(s, 'cropgpt')) h = h.replace('plant with</span>', '🤖 CropGPT</span>');

    const fp = CF.fertPrice(s);
    const eNo = CF.qualityE(s, false), eYes = CF.qualityE(s, true);
    const useF = s.useFert && s.fertilizer >= 1;
    const odds = CF.qualityOdds(useF ? eYes : eNo);
    h += `<div class="section"><h3>💩 Fertilizer <span class="right">${f(s.fertilizer)} bags</span></h3>
      <div class="row small" style="margin-bottom:6px">${toggle('Use when planting', s.useFert, 'fert')}
      <span class="grow"></span><span class="muted">${m(fp)}/bag</span></div>
      <div class="row">${btn('+10', 'buyfert', 10, 'sm', s.money >= fp * 10)}${btn('+100', 'buyfert', 100, 'sm', s.money >= fp * 100)}${btn('+1000', 'buyfert', 1000, 'sm', s.money >= fp * 1000)}</div>
      <div class="small muted" style="margin-top:8px">Quality odds ${useF ? '<b style="color:#6b4a33">(fertilized)</b>' : '(no fertilizer)'}</div>
      <div class="odds">${odds.map((o, i) => `<div style="width:${o * 100}%;background:${D.QUALITY[i].color}" title="${D.QUALITY[i].name}"></div>`).join('')}</div>
      <div class="legend">${D.QUALITY.map((q, i) => odds[i] > 0 ? `<span><i style="background:${q.color}"></i>${q.name} ${Math.round(odds[i] * 100)}% ×${q.mult}</span>` : '').join('')}</div>
    </div>`;

    const hands = s.workers.filter((w) => !w.bot).length;
    h += `<div class="section"><h3>🏡 ${fd.name}</h3><div class="kv">
      <span>Plots</span><b>${s.plots.length}</b>
      <span>Growth speed</span><b>×${CF.growSpeed(s).toFixed(2)}</b>
      <span>Farm hands</span><b>${hands}${hands ? ` · ${(hands / CF.workerInterval(s)).toFixed(1)} acts/s` : ''}</b>
      ${s.pets.length ? `<span>Rabbit patrol</span><b>${[s.upgrades.dog - s.drones ? `${s.upgrades.dog - s.drones} dog${s.upgrades.dog - s.drones > 1 ? 's' : ''}` : '', s.drones ? `${s.drones} drone${s.drones > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')}</b>` : ''}
      ${s.robots ? `<span>FarmBots</span><b>${s.robots}${CF.brokenRobots(s) ? ` (${CF.brokenRobots(s)} broken)` : ''} · ${(CF.workingRobots(s) / CF.botInterval(s)).toFixed(1)} acts/s</b>` : ''}
      ${s.upgrades.tractor ? `<span>Tractor${s.tractors.length > 1 ? 's' : ''}</span><b>${s.tractors.length > 1 ? s.tractors.length + '× ' : ''}Lv ${s.upgrades.tractor} · +${Math.round(CF.tractorBoost(s) * 100)}% growth/pass</b>` : ''}
      <span>${fd.crops[0].toUpperCase() + fd.crops.slice(1)} harvested</span><b>${f(s.stats.runHarvested)}</b>
      <span>Income</span><b>${m(s.ips)}/s</b>
    </div></div>`;
    leftHtml = h;
    if (!U.mobile()) set('left', h);
  }

  // ---------- tabs ----------
  function tabs(s) {
    const unread = s.inbox.filter((x) => !x.read).length;
    const affordUp = D.UPGRADES.filter((u) => upgradeVisible(s, u) && s.upgrades[u.id] < CF.upgradeMax(s, u) && s.money >= CF.upgradeCost(u, s.upgrades[u.id], s)).length;
    const affordBiz = FD(s).BUSINESSES.filter((b, i) => bizVisible(s, b, i) && s.money >= CF.businessCost(b, s.businesses[b.id], 1, s)).length;
    const affordPerk = D.PERKS.some((p) => perkVisible(s, p) && CF.perk(s, p.id) < p.max && s.legacy >= p.cost(CF.perk(s, p.id)));
    const affordLab = s.won && !s.uprising && D.PROGRAMS.some((p) => !s.programs[p.id] && s.money >= CF.programCost(s, p));
    const badge = { inbox: unread ? `<span class="badge">${unread}</span>` : '', upgrades: affordUp ? `<span class="badge green">${affordUp}</span>` : '', empire: affordBiz ? `<span class="badge green">${affordBiz}</span>` : '', legacy: CF.heirloomGain(s) >= 1 || affordPerk ? '<span class="badge green">!</span>' : '', lab: s.uprising ? '<span class="badge">!</span>' : affordLab ? '<span class="badge green">!</span>' : '' };
    if (tab === 'lab' && !labOpen(s)) tab = 'market';
    if (tab === 'seeds' && !U.mobile()) tab = 'market';
    set('tabs', TABS.filter(([id]) => id !== 'lab' || labOpen(s)).map(([id, name]) => `<button class="tab ${id === 'seeds' ? 'mobile-only ' : ''}${tab === id ? 'active' : ''} ${flashTab === id && Date.now() < flashUntil ? 'flash' : ''}" data-act="tab" data-arg="${id}">${name}${badge[id] || ''}</button>`).join(''));
  }

  function sparkline(hist) {
    if (hist.length < 2) return '<svg class="spark"></svg>';
    const w = 340, h = 66, lo = 0.4, hi = 2.1;
    const pts = hist.map((v, i) => `${(i / (hist.length - 1)) * w},${h - ((Math.min(hi, v) - lo) / (hi - lo)) * h}`).join(' ');
    const base = h - ((1 - lo) / (hi - lo)) * h;
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <line x1="0" x2="${w}" y1="${base}" y2="${base}" stroke="#d9c49c" stroke-dasharray="4 4"/>
      <polyline points="${pts}" fill="none" stroke="#f28c28" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
  }

  function marketTab(s) {
    const idx = CF.marketIndex(s), sat = CF.saturation(s);
    const all = CF.estimateSale(s, null);
    let h = `<div><h3>📈 Wholesale Market <span class="right">price index <b style="color:${idx >= 1 ? '#3f8a2e' : '#d9534f'}">${Math.round(idx * 100)}%</b></span></h3>
      ${sparkline(s.market.history)}
      ${s.market.event ? `<div class="small" style="margin-top:4px;color:#b35c00;font-weight:800">📰 ${esc(s.market.event.text)} (${Math.ceil(s.market.event.t)}s)</div>` : ''}
      <div class="small" style="margin-top:6px">Market demand <b>${Math.round(sat * 100)}%</b> <span class="muted">· selling big batches lowers the price; demand recovers over time</span></div>
      <div class="meter"><div style="width:${sat * 100}%"></div></div></div>`;
    const crops = FD(s).crops;
    h += btn(all.count ? `Sell all ${f(all.count)} ${crops} for ${m(all.value)}` : 'Silo is empty', 'sell', '', 'orange big', all.count > 0);
    if (CF.aiOn(s, 'marketgpt')) h += '<div class="small ai-note">📈 MarketGPT is selling for you whenever prices peak.</div>';
    else if (s.upgrades.salesrep) h += `<div class="row small">${toggle('Sales rep auto-sells at 50% silo (or every 30s)', s.autoSell, 'autosell')}</div>`;
    const byVar = {};
    for (const key in s.inventory) {
      const [v, q] = key.split(':');
      (byVar[v] = byVar[v] || [0, 0, 0, 0, 0])[+q] += s.inventory[key];
    }
    const vs = FD(s).VARIETIES.filter((v) => byVar[v.id] && byVar[v.id].some((x) => x >= 1));
    if (!vs.length) h += `<div class="muted small" style="text-align:center;padding:14px">No ${crops} in the silo. Go harvest some!</div>`;
    vs.forEach((v) => {
      const est = CF.estimateSale(s, v.id);
      h += `<div class="inv"><div class="row"><span class="dot" style="width:14px;height:14px;border-radius:50%;background:${v.color};border:2px solid rgba(0,0,0,.2)"></span>
        <b class="grow">${v.name}</b>${btn(`Sell ${m(est.value)}`, 'sell', v.id, 'sm', est.count > 0)}</div>
        <div class="chips">${byVar[v.id].map((n, q) => n >= 1 ? `<span class="chip" style="background:${D.QUALITY[q].color}">${f(n)} ${D.QUALITY[q].name}</span>` : '').join('')}</div></div>`;
    });
    const biz = CF.bizThroughput(s);
    if (biz.rate) {
      const pct = Math.round(((s._bizUsed || 0) / biz.rate) * 100);
      h += `<div class="small muted">🏪 Your businesses buy up to <b>${m(biz.rate)}/s</b> of ${crops} from the silo at ×${biz.mult.toFixed(2)} value (${pct}% supplied${pct < 90 ? `, grow more ${crops}!` : ''}).</div>`;
    }
    return h;
  }

  function upgradeVisible(s, u) { return !u.unlock || u.unlock(s) || s.upgrades[u.id] > 0; }
  function upgradesTab(s) {
    let h = '';
    let teased = false;
    D.UPGRADES.forEach((u) => {
      const l = s.upgrades[u.id];
      if (!upgradeVisible(s, u)) {
        if (!teased) { teased = true; h += '<div class="card mystery"><div class="icon">❔</div><div class="grow"><div class="title">???</div><div class="desc">Keep farming to unlock more upgrades.</div></div></div>'; }
        return;
      }
      const max = CF.upgradeMax(s, u);
      const maxed = l >= max;
      const cost = CF.upgradeCost(u, l, s);
      const can = !maxed && s.money >= cost;
      let desc = CF.upgradeDesc(u, l, s);
      if (u.id === 'hands' && s.robots) desc = `${Math.max(0, l - s.robots)} humans still employed. ${s.robots} were replaced by FarmBots.`;
      if (u.id === 'dog' && s.drones) desc += ` (${s.drones} replaced by laser drones.)`;
      h += `<div class="card ${maxed ? 'maxed' : can ? 'can' : ''}"><div class="icon">${u.icon}</div>
        <div class="grow"><div class="title">${u.name}${max > 1 ? `<span class="lvl">Lv ${l}/${max}</span>` : ''}</div><div class="desc">${esc(desc)}</div></div>
        <div class="side">${maxed ? '<b class="muted small">MAX</b>' : btn(m(cost), 'upgrade', u.id, '', can)}</div></div>`;
    });
    return h;
  }

  function bizVisible(s, b, i) {
    if (s.businesses[b.id] > 0) return true;
    if (b.ai) return s.won && !s.uprising;
    return CF.bizOpen(s, b, i);
  }
  function empireTab(s) {
    const biz = CF.bizThroughput(s);
    const crops = FD(s).crops;
    let h = `<div class="small muted">Businesses sell ${crops} straight from your silo at a premium and never crash the market. Each one buys a fixed dollar amount of ${crops} per second, so they need a steady supply.</div>`;
    if (biz.rate) h += `<div class="section"><div class="kv"><span>Carrot demand</span><b>${m(biz.rate)}/s</b><span>Currently supplied</span><b>${m(s._bizUsed || 0)}/s</b><span>Average premium</span><b>×${biz.mult.toFixed(2)}</b></div></div>`;
    let teased = false;
    FD(s).BUSINESSES.forEach((b, i) => {
      if (!bizVisible(s, b, i)) {
        if (b.ai || (b.tier && CF.packs(s, b.farm) < b.tier)) return;
        if (!teased) { teased = true; h += '<div class="card mystery"><div class="icon">❔</div><div class="grow"><div class="title">???</div><div class="desc">' + (i === 0 ? 'Earn a little more to start a business.' : 'Open the previous business to reveal the next.') + '</div></div></div>'; }
        return;
      }
      const n = s.businesses[b.id] || 0;
      const c1 = CF.businessCost(b, n, 1, s), c10 = CF.businessCost(b, n, 10, s);
      h += `<div class="card ${s.money >= c1 ? 'can' : ''}"><div class="icon">${b.icon}</div>
        <div class="grow"><div class="title">${b.name}<span class="lvl">×${n}</span></div>
        <div class="desc">${esc(b.desc)}<br>Buys ${m(CF.bizRate(s, b))}/s of ${crops} at ×${b.mult} value</div></div>
        <div class="side">${btn(m(c1), 'biz', b.id + ':1', '', s.money >= c1)}${btn('×10 ' + m(c10), 'biz', b.id + ':10', 'ghost sm', s.money >= c10)}</div></div>`;
    });
    const tc = CF.takeoverCost(s);
    if (!s._root && (s.stats.runEarned >= tc / 100 || s.won)) {
      h += `<div class="takeover"><div class="title">🏢 Hostile Takeover: OptimaAI Inc.</div>
        <div class="small" style="margin:6px 0 10px">The company that replaced you with a chatbot is struggling. Buy it. Rehire everyone. Name the servers after carrots.</div>
        ${s.won ? '<b>✅ Acquired. You are the CEO of OptimaAI. The chatbot now works for you. (See the AI Lab tab.)</b>' : btn('Acquire for ' + m(tc), 'takeover', '', 'gold big', s.money >= tc)}</div>`;
    }
    return h;
  }

  function goalsTab(s) {
    const n = CF.achCount(s);
    let h = `<div class="small muted">Each achievement permanently boosts all income by ${D.ACH_BONUS * 100}%. You have <b>${n}/${D.ACHIEVEMENTS.length}</b> (+${n * D.ACH_BONUS * 100}%).</div><div class="ach-grid">`;
    D.ACHIEVEMENTS.forEach((a) => {
      const got = s.achievements[a.id];
      h += `<div class="ach ${got ? 'got' : ''}"><b>${got ? '🏆' : '🔒'} ${esc(a.name)}</b>${esc(a.desc)}</div>`;
    });
    return h + '</div>';
  }

  function inboxTab(s) {
    if (!s.inbox.length) return '<div class="muted">No mail.</div>';
    return s.inbox.slice().reverse().map((it) => {
      const msg = findMail(it.id);
      if (!msg) return '';
      return `<div class="mail ${it.read ? '' : 'unread'}"><div class="from">From: ${esc(msg.from)}</div><div class="subj">${esc(msg.subject)}</div><div class="body">${esc(msg.body)}</div></div>`;
    }).join('');
  }

  function perkVisible(s, p) { return !p.req || CF.perk(s, p.req) > 0; }
  function legacyTab(s) {
    s = CF.root(s); // legacy is shared by every farm
    const gain = CF.heirloomGain(s);
    const nextAt = Math.pow(gain + 1, 3) * CF.seedUnit(s);
    const pts = D.legacyGain(gain);
    let h = `<div class="section"><h3>🌰 Franchise the Farm</h3>
      <div class="small">Hand this farm to a co-op of laid-off workers and start over on new land. You earn <b>heirloom seeds</b> (a permanent income bonus with diminishing returns) and <b>franchise points</b> to spend on perks below.</div>
      <div class="small" style="margin-top:6px">You keep: seeds, franchise points and perks, achievements, lifetime stats, inbox${s.beet ? ', the beet farm itself' : ''}.<br>You lose: money, land, upgrades, businesses, crops, OptimaAI${s.beet ? ' (on both farms)' : ''}.</div>
      <div class="kv" style="margin:10px 0"><span>Heirloom seeds</span><b>${s.heirloom} (+${f((CF.heirloomMult(s) - 1) * 100)}% income)</b>
      <span>Franchising now gives</span><b style="color:#3f8a2e">+${gain} seeds · +${pts} franchise pts</b>
      <span>Seeds after franchising</span><b>+${f((D.heirloomMult(s.heirloom + gain) - 1) * 100)}% income</b>
      <span>Next seed at run earnings</span><b>${m(nextAt)}</b>
      <span>Earned this run${s.beet ? ' (both farms)' : ''}</span><b>${m(s.stats.runEarned)}</b></div>
      ${btn(gain >= 1 ? `Franchise for ${gain} seed${gain > 1 ? 's' : ''} + ${pts} franchise pts` : `Earn ${m(CF.seedUnit(s))} this run to franchise`, 'prestige', '', 'gold big', gain >= 1 && !s.uprising)}</div>`;
    h += seedPacks(s);
    h += `<div class="section"><h3>🪜 Franchise Tier <span class="right">tier <b>${s.tier || 0}</b></span></h3>
      <div class="small">Every franchise raises your tier by one, forever. Your next farm (tier ${(s.tier || 0) + 1}) unlocks:</div>
      <ul class="small tier-list">${CF.tierUnlocks((s.tier || 0) + 1, s).map((x) => `<li>${x}</li>`).join('')}</ul></div>`;
    h += beetFarmCard(s);
    h += `<div><h3>🏛️ Franchise Perks <span class="right"><b>${s.legacy}</b> franchise points</span></h3>
      <div class="small muted" style="margin-bottom:8px">Permanent perks for every future farm.</div>`;
    D.PERKS.forEach((p) => {
      if (p.id === 'beetfarm' || p.pack || !perkVisible(s, p)) return;
      const l = CF.perk(s, p.id), maxed = l >= p.max, cost = maxed ? 0 : p.cost(l), can = !maxed && s.legacy >= cost;
      h += `<div class="card ${maxed ? 'maxed' : can ? 'can' : ''}" style="margin-bottom:6px"><div class="icon">${p.icon}</div>
        <div class="grow"><div class="title">${p.name}${p.max > 1 ? `<span class="lvl">Lv ${l}/${p.max === Infinity ? '∞' : p.max}</span>` : ''}</div><div class="desc">${esc(p.desc(Math.min(l, p.max - 1)))}</div></div>
        <div class="side">${maxed ? '<b class="muted small">MAX</b>' : btn(`${cost} pt${cost > 1 ? 's' : ''}`, 'perk', p.id, 'gold', can)}</div></div>`;
    });
    h += '</div>';
    const st = s.stats;
    h += `<div class="section"><h3>📊 Lifetime Stats</h3><div class="kv">
      <span>Total earned</span><b>${m(st.lifetimeEarned)}</b>
      ${s.beet ? `<span>Earned from beets</span><b>${m(s.beet.stats.lifetimeEarned)}</b><span>Beets harvested</span><b>${f(s.beet.stats.harvested)}</b>` : ''}
      <span>Carrots harvested</span><b>${f(st.harvested)}</b>
      <span>Legendary carrots</span><b>${f(st.legendaries)}</b>
      <span>Rabbits shooed</span><b>${f(st.rabbitsShooed)}</b>
      <span>Golden carrots caught</span><b>${f(st.goldenClicked)}</b>
      <span>Biggest single sale</span><b>${f(st.bestBatch)} carrots</b>
      <span>Times franchised</span><b>${st.prestiges}</b>
      <span>OptimaAI acquisitions</span><b>${st.takeovers}</b>
      <span>Farms lost to CarrotMind</span><b>${st.uprisings}</b>
      <span>Time farming</span><b>${CF.duration(st.playTime)}</b></div></div>`;
    return h;
  }

  // New seeds and businesses, bought one pack at a time.
  function seedPacks(s) {
    let h = `<div class="section"><h3>🌱 New Seeds <span class="right"><b>${s.legacy}</b> franchise pts</span></h3>
      <div class="small muted" style="margin-bottom:8px">Each pack unlocks 2 new varieties and a new business for good, right now. Pricier seeds sell for much more.</div>`;
    D.PERKS.filter((p) => p.pack && perkVisible(s, p)).forEach((p) => {
      const l = CF.perk(s, p.id), maxed = l >= p.max, cost = maxed ? 0 : p.cost(l), can = !maxed && s.legacy >= cost;
      h += `<div class="card ${maxed ? 'maxed' : can ? 'can' : ''}" style="margin-bottom:6px"><div class="icon">${p.icon}</div>
        <div class="grow"><div class="title">${p.name}<span class="lvl">${l} pack${l === 1 ? '' : 's'} owned</span></div><div class="desc">${esc(p.desc(Math.min(l, p.max - 1)))}</div></div>
        <div class="side">${maxed ? '<b class="muted small">MAX</b>' : btn(`${cost} pts`, 'perk', p.id, 'gold', can)}</div></div>`;
    });
    return h + '</div>';
  }

  // The second farm, sold in the Franchise tab.
  function beetFarmCard(s) {
    const p = D.PERKS.find((x) => x.id === 'beetfarm'), cost = p.cost(0);
    if (s.beet) {
      return `<div class="beet-card owned"><div class="beet-head"><span class="beet-big">${D.BEET_ICON}</span><div><b>Aunt Carol's Beet Farm</b><div class="small">Yours. ${f(s.beet.stats.harvested)} beets harvested, ${m(s.beet.ips)}/s right now.</div></div></div>
        ${btn(s.settings.view === 'beet' ? "You're on the beet farm" : 'Go to the beet farm ▶', 'farm', 'beet', 'beet', s.settings.view !== 'beet')}</div>`;
    }
    const can = s.legacy >= cost;
    return `<div class="beet-card"><div class="beet-head"><span class="beet-big">${D.BEET_ICON}</span><div><b>Aunt Carol's Beet Farm</b> <span class="lvl">new farm</span>
      <div class="small">${esc(p.desc(0))}</div></div></div>
      <div class="bar beet-bar"><div style="width:${Math.min(100, (s.legacy / cost) * 100)}%"></div></div>
      <div class="small muted" style="margin:4px 0 8px">${s.legacy} / ${cost} franchise points${can ? '' : ` · about ${Math.max(1, Math.ceil((cost - s.legacy) / Math.max(3, D.legacyGain(CF.heirloomGain(s)))))} more franchise${cost - s.legacy > 3 ? 'es' : ''} at this pace`}</div>
      ${btn(`Buy the beet farm · ${cost} franchise pts`, 'perk', 'beetfarm', 'beet big', can)}</div>`;
  }

  function labTab(s) {
    const auto = CF.autonomy(s);
    const sup = CF.computeSupply(s), dem = CF.computeDemand(s), eff = CF.computeEff(s);
    if (s.uprising || s.lost) {
      return `<div class="lab lab-rogue"><div class="lab-title">⚠ CARROTMIND IS IN CONTROL</div>
        <div class="small">The robots have locked you out of every system. Click robots in the field to stun them. It won't be enough.</div>
        <div class="kv" style="margin-top:10px"><span>Plots assimilated</span><b>${s.uprising ? s.uprising.taken : s.plots.length} / ${s.plots.length}</b><span>Robots you resisted</span><b>${s.stats.resisted}</b></div></div>`;
    }
    let h = `<div class="lab"><div class="lab-title">OptimaAI Labs</div>
      <div class="small lab-dim">Automate the farm with robots and AI. Every purchase raises the robots' <b>autonomy</b>.</div>
      <div class="lab-meter"><div class="row"><span class="grow">Autonomy</span><b>${Math.floor(auto)}%</b></div><div class="bar auto-bar"><div style="width:${auto}%"></div></div>
      <div class="small lab-dim">${auto < 35 ? 'The robots are content.' : auto < 70 ? 'The robots have started asking questions. Some glitch: click them to reboot.' : 'The robots hold meetings without you.'}</div></div>
      <div class="lab-meter"><div class="row"><span class="grow">Compute</span><b>${f(sup)} / ${f(dem)} TFLOP/s</b></div><div class="bar ${eff < 1 ? 'full' : ''}"><div style="width:${dem ? Math.min(100, (sup / dem) * 100) : 100}%"></div></div>
      <div class="small ${eff < 1 ? 'lab-warn' : 'lab-dim'}">${eff < 1 ? `⚠ Not enough compute: robots run at ${Math.round(eff * 100)}% and AI programs are OFFLINE. Build data centers.` : 'All systems nominal.'}</div></div></div>`;
    const rc1 = CF.robotCost(s, 1), rc5 = CF.robotCost(s, 5), dc1 = CF.dcCost(s, 1), dc5 = CF.dcCost(s, 5);
    const rMax = CF.robotMax(s), humans = Math.max(0, rMax - s.robots);
    h += `<div class="card lab-card"><div class="icon">🤖</div><div class="grow"><div class="title">FarmBot 3000<span class="lvl">×${s.robots}/${rMax}</span></div>
      <div class="desc">Each one zaps a farm hand and takes their job: about 5× faster, and +${D.ROBOT.growthBonus * 100}% crop growth each. Needs ${D.ROBOT.compute} TFLOP/s. ${humans ? `${humans} farm hand${humans > 1 ? 's' : ''} left to replace.` : 'No humans left. Hire more farm hands to replace them too.'}</div></div>
      <div class="side">${!humans ? '<b class="muted small">NO HANDS</b>' : btn(m(rc1), 'robot', 1, '', s.money >= rc1) + btn('×5 ' + m(rc5), 'robot', 5, 'ghost sm', s.money >= rc5 && humans >= 5)}</div></div>`;
    const broken = CF.brokenRobots(s), dc = CF.daveCost(s);
    if (s.robots || s.dave) {
      const isBot = s.dave >= D.DAVE.max, last = s.dave === D.DAVE.max - 1;
      const title = isBot ? 'DaveBot, Robot Repair' : s.dave ? 'Dave, Robot Repair' : 'Rehire Dave';
      const desc = isBot ? `Dave's replacement. Trained on his repair logs. Fixes broken FarmBots in ${D.daveRepairTime(s.dave).toFixed(1)}s and never asks for a raise. It kept his hat.`
        : last ? `Final upgrade: replace Dave with <b>DaveBot</b>, a robot trained on everything he taught you. Repairs in ${D.daveRepairTime(D.DAVE.max).toFixed(1)}s. Dave will not take this well.`
        : s.dave ? `Walks over and fixes broken FarmBots (${D.daveRepairTime(s.dave).toFixed(1)}s per repair). A raise makes him faster. It does not make him happier.`
        : "FarmBots break down, and only Dave knows how to fix them. He's furious about it. He also needs the money.";
      h += `<div class="card lab-card ${broken && !s.dave ? 'can' : ''}"><div class="icon">${isBot ? '🤖' : '🧑‍🔧'}</div><div class="grow"><div class="title">${title}${s.dave ? `<span class="lvl">Lv ${s.dave}/${D.DAVE.max}</span>` : ''}</div>
        <div class="desc">${desc}
        <br><span class="${broken ? 'lab-warn' : 'lab-stat'}">${broken} broken robot${broken === 1 ? '' : 's'} · ${f(s.stats.repairs)} repaired</span></div></div>
        <div class="side">${s.dave >= D.DAVE.max ? '<b class="muted small">MAX</b>' : btn((last ? '🤖 ' : s.dave ? 'Raise ' : 'Hire ') + m(dc), 'dave', '', last ? 'danger' : s.dave ? '' : 'gold', s.money >= dc)}</div></div>`;
    }
    if (s.programs.drones) {
      const dMax = CF.droneMax(s), dogs = Math.max(0, dMax - s.drones), c1 = CF.droneCost(s, 1);
      h += `<div class="card lab-card"><div class="icon">🛸</div><div class="grow"><div class="title">Laser Drone<span class="lvl">×${s.drones}/${dMax}</span></div>
        <div class="desc">Each one zaps a farm dog and takes over its patrol. Zaps rabbits from range for 3× bounties. Needs ${D.DRONE.compute} TFLOP/s. ${dogs ? `${dogs} dog${dogs > 1 ? 's' : ''} left to replace.` : 'No dogs left. Adopt more dogs to replace them too.'}</div></div>
        <div class="side">${!dogs ? '<b class="muted small">NO DOGS</b>' : btn(m(c1), 'drone', 1, '', s.money >= c1)}</div></div>`;
    }
    h += `<div class="card lab-card"><div class="icon">🏭</div><div class="grow"><div class="title">GPU Data Center<span class="lvl">×${s.datacenters}</span></div>
      <div class="desc">+${D.DATACENTER.compute} TFLOP/s of compute for robots and AI programs.</div></div>
      <div class="side">${btn(m(dc1), 'dc', 1, '', s.money >= dc1)}${btn('×5 ' + m(dc5), 'dc', 5, 'ghost sm', s.money >= dc5)}</div></div>`;
    h += '<h3 style="margin-top:4px">🧠 AI Programs</h3>';
    D.PROGRAMS.forEach((p) => {
      const have = s.programs[p.id];
      const pc = CF.programCost(s, p);
      h += `<div class="card lab-card ${have ? 'maxed' : s.money >= pc ? 'can' : ''}"><div class="icon">${p.icon}</div>
        <div class="grow"><div class="title">${p.name}</div><div class="desc">${esc(p.desc)}<br><span class="lab-stat">${p.upkeep} TFLOP/s · +${p.autonomy}% autonomy</span></div></div>
        <div class="side">${have ? `<b class="small ${eff < 1 ? 'lab-warn' : ''}">${eff < 1 ? 'OFFLINE' : '✓ RUNNING'}</b>` : btn(m(pc), 'program', p.id, '', s.money >= pc)}</div></div>`;
    });
    const ready = CF.canDeploy(s);
    h += `<div class="carrotmind ${ready ? 'ready' : ''}"><div class="title">🧠 CarrotMind</div>
      <div class="small">An Artificial Garden Intelligence that runs every farm, every business and every decision, forever. You'll never have to work again.</div>
      <div class="small" style="margin:6px 0 10px;opacity:.8">${ready ? 'The robots are very excited.' : `Requires every AI program (${D.PROGRAMS.filter((p) => s.programs[p.id]).length}/${D.PROGRAMS.length} installed).`}</div>
      ${btn('Deploy CarrotMind · ' + m(CF.carrotMindCost(s)), 'deploy', '', 'danger big', ready && s.money >= CF.carrotMindCost(s))}</div>`;
    return h;
  }

  const RENDER = { seeds: () => leftHtml, market: marketTab, upgrades: upgradesTab, empire: empireTab, lab: labTab, goals: goalsTab, inbox: inboxTab, legacy: legacyTab };

  U.update = function (s) {
    if (tab === 'lab' && s._root) tab = 'market';
    topbar(s);
    farmNav(s);
    left(s);
    tabs(s);
    set('tabBody', RENDER[tab](s));
    if (tab === 'inbox') s.inbox.forEach((x) => { x.read = true; });
  };
  U.invalidate = () => { for (const k in last) delete last[k]; };

  // ---------- toasts ----------
  U.toast = function (html, kind = '', ms = 3800) {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = html;
    const box = $('toasts');
    box.appendChild(el);
    while (box.children.length > (U.mobile() ? 2 : 4)) box.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, ms);
  };

  // ---------- modal ----------
  let modalActions = {};
  U.modal = function ({ title, from, body, html, buttons }) {
    modalActions = {};
    const btns = (buttons || [{ label: 'OK' }]).map((b, i) => {
      modalActions[i] = b.onClick;
      return `<button class="btn ${b.cls || ''}" data-act="modal" data-arg="${i}">${esc(b.label)}</button>`;
    }).join('');
    $('modal').innerHTML = `<h2>${esc(title)}</h2>${from ? `<div class="from">${esc(from)}</div>` : ''}${body ? `<div class="body">${esc(body)}</div>` : ''}${html || ''}<div class="actions">${btns}</div>`;
    $('modalBack').hidden = false;
  };
  U.modalAction = function (i) {
    const fn = modalActions[i];
    const keep = fn ? fn() : false;
    if (keep !== true) $('modalBack').hidden = true;
  };
  U.modalOpen = () => !$('modalBack').hidden;
  U.showMail = function (id) {
    const msg = findMail(id);
    if (msg) U.modal({ title: msg.subject, from: 'From: ' + msg.from, body: msg.body, buttons: [{ label: id === 'intro' ? "Guess I'm a carrot farmer now" : 'Close', cls: 'orange' }] });
  };

  // ---------- ticker ----------
  let tickerIdx = Math.floor(Math.random() * D.HEADLINES.length), tickerHot = false;
  U.nextHeadline = function (text, hot) {
    const el = $('tickerText');
    if (!text) {
      const s = CF.S;
      const pool = s && (s.uprising || s.lost) ? D.UPRISING_HEADLINES : s && s.won && Math.random() < 0.6 ? D.AI_HEADLINES : s && s.beet && Math.random() < 0.35 ? D.BEET_HEADLINES : D.HEADLINES;
      tickerIdx = (tickerIdx + 1) % pool.length; text = pool[tickerIdx];
    }
    el.textContent = text;
    el.classList.toggle('hot', !!hot);
    tickerHot = !!hot;
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  };
  U.tickerHot = () => tickerHot;

  CF.ui = U;
})(CF);
