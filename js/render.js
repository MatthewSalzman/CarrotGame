// Canvas renderer for the farm field. Reads game state; never mutates it.
var CF = globalThis.CF = globalThis.CF || {};

(function (CF) {
  const D = CF.data;
  const R = {};
  let canvas, ctx, W = 0, H = 0, dpr = 1;
  let layout = { tile: 64, ox: 0, oy: 0, cols: 0, rows: 0 };
  let bg = null, bgKey = '';
  let particles = [];
  let hover = -1, mouse = null;
  const lasers = [];
  let ghosts = []; // zapped farm hands and dogs, fading out
  let clouds = [], butterflies = [], fireflies = [];
  let bubbles = [], nextBubble = 4;
  let shake = 0, glitchT = 0;
  const spriteCache = new Map();

  const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
  const SHIRT = ['#e74c3c', '#3498db', '#9b59b6', '#1abc9c', '#f39c12', '#e84393', '#2ecc71', '#fd79a8'];
  const DAY_LENGTH = 420; // seconds of game time per day/night cycle

  R.init = function (el) {
    canvas = el;
    ctx = canvas.getContext('2d');
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);
    resize();
    for (let i = 0; i < 4; i++) clouds.push({ x: Math.random(), y: Math.random(), r: 0.12 + Math.random() * 0.15, v: 0.004 + Math.random() * 0.006 });
    for (let i = 0; i < 4; i++) butterflies.push({ x: Math.random(), y: Math.random(), a: Math.random() * 6, c: ['#ffd54f', '#ff8a80', '#b39ddb', '#80deea'][i] });
    for (let i = 0; i < 26; i++) fireflies.push({ x: Math.random(), y: Math.random(), a: Math.random() * 6, s: 0.5 + Math.random() });
    // Hover tooltips are for mice only; on touch screens they'd stick after every tap.
    canvas.addEventListener('pointermove', (e) => { mouse = e.pointerType === 'mouse' ? local(e) : null; });
    canvas.addEventListener('pointerleave', () => { mouse = null; });
  };

  function resize() {
    const box = canvas.parentElement.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(200, box.width); H = Math.max(200, box.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    bgKey = ''; dcKey = '';
  }

  // Switching farms: drop effects that belong to the other field.
  R.reset = function () {
    particles = []; ghosts = []; bubbles = []; lasers.length = 0; daveBubble = null;
    bgKey = ''; dcKey = '';
  };

  function local(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  R.local = local;

  R.sidePad = 0; // room kept free at the sides for the farm-switch arrows
  function computeLayout(s) {
    const tile = Math.floor(Math.min((W - 2 * R.sidePad) / (s.cols + 2.6), H / (s.rows + 1.4), 112));
    if (tile !== layout.tile) spriteCache.clear();
    layout = { tile, cols: s.cols, rows: s.rows, ox: Math.round((W - s.cols * tile) / 2), oy: Math.round((H - s.rows * tile) / 2 + tile * 0.1) };
  }
  const px = (x) => layout.ox + x * layout.tile;
  const py = (y) => layout.oy + y * layout.tile;
  R.toScreen = (x, y) => ({ x: px(x), y: py(y) });

  R.hitTest = function (s, pt) {
    const t = layout.tile;
    if (s.golden && Math.hypot(pt.x - px(s.golden.x), pt.y - py(s.golden.y) + t * 0.2) < t * 0.5) return { type: 'golden' };
    for (const w of s.workers) {
      if (!w.bot || !(w.glitch > 0 || w.broken || s.uprising)) continue;
      const p = CF.workerPos(w);
      if (Math.hypot(pt.x - px(p.x), pt.y - py(p.y) + t * 0.1) < t * 0.42) return { type: 'bot', id: w.id };
    }
    for (const r of s.rabbits) {
      if (r.state !== 'leave' && Math.hypot(pt.x - px(r.x), pt.y - py(r.y)) < t * 0.45) return { type: 'rabbit', id: r.id };
    }
    return plotAt(s, pt);
  };
  function plotAt(s, pt) {
    const c = Math.floor((pt.x - layout.ox) / layout.tile), r = Math.floor((pt.y - layout.oy) / layout.tile);
    if (c < 0 || r < 0 || c >= s.cols || r >= s.rows) return null;
    return { type: 'plot', i: r * s.cols + c };
  }

  // ---------- helpers ----------
  function rng(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function roundRect(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function shadeColor(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, v + amt));
    return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
  }
  function star(g, x, y, r) {
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const rr = i % 2 ? r * 0.35 : r, a = (i * Math.PI) / 4;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath(); g.fill();
  }

  // ---------- scenery (cached background) ----------
  function tree(g, x, y, r, rand) {
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.beginPath(); g.ellipse(x + r * 0.2, y + r * 0.9, r * 0.9, r * 0.35, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6d4c33'; g.fillRect(x - r * 0.12, y + r * 0.2, r * 0.24, r * 0.7);
    const greens = ['#2e7d32', '#388e3c', '#43a047'];
    for (let k = 0; k < 4; k++) {
      g.fillStyle = greens[k % 3];
      g.beginPath(); g.arc(x + (rand() - 0.5) * r * 0.7, y - r * 0.2 + (rand() - 0.5) * r * 0.5, r * (0.55 + rand() * 0.2), 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.beginPath(); g.arc(x - r * 0.25, y - r * 0.45, r * 0.3, 0, Math.PI * 2); g.fill();
  }
  function barn(g, x, y, w, wall = '#b23a2e', roof = '#8e2b22') {
    const h = w * 0.75;
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x + 6, y + h - 4, w, 10);
    g.fillStyle = wall; g.fillRect(x, y + h * 0.35, w, h * 0.65);
    g.fillStyle = roof;
    g.beginPath(); g.moveTo(x - w * 0.06, y + h * 0.4); g.lineTo(x + w / 2, y); g.lineTo(x + w * 1.06, y + h * 0.4); g.closePath(); g.fill();
    g.fillStyle = '#f5f0e6';
    g.fillRect(x + w * 0.3, y + h * 0.55, w * 0.4, h * 0.45);
    g.strokeStyle = wall; g.lineWidth = Math.max(2, w * 0.03);
    g.beginPath(); g.moveTo(x + w * 0.3, y + h * 0.55); g.lineTo(x + w * 0.7, y + h); g.moveTo(x + w * 0.7, y + h * 0.55); g.lineTo(x + w * 0.3, y + h); g.stroke();
    g.fillStyle = '#f5f0e6'; g.fillRect(x + w * 0.42, y + h * 0.22, w * 0.16, w * 0.12);
  }
  function silo(g, x, y, w) {
    const h = w * 2.2;
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x + 5, y + h - 3, w, 8);
    const grd = g.createLinearGradient(x, 0, x + w, 0);
    grd.addColorStop(0, '#8d9aa3'); grd.addColorStop(0.5, '#cfd8dc'); grd.addColorStop(1, '#78868f');
    g.fillStyle = grd; g.fillRect(x, y + w * 0.4, w, h - w * 0.4);
    g.fillStyle = '#90a4ae'; g.beginPath(); g.ellipse(x + w / 2, y + w * 0.4, w / 2, w * 0.4, 0, Math.PI, 0); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.15)'; g.lineWidth = 1;
    for (let k = 1; k < 6; k++) { const yy = y + w * 0.4 + ((h - w * 0.4) * k) / 6; g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke(); }
  }
  function pond(g, x, y, r) {
    g.fillStyle = '#6d8f4e'; g.beginPath(); g.ellipse(x, y, r * 1.12, r * 0.62, 0, 0, Math.PI * 2); g.fill();
    const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.2, r * 0.1, x, y, r);
    grd.addColorStop(0, '#81d4fa'); grd.addColorStop(1, '#3b8fc4');
    g.fillStyle = grd; g.beginPath(); g.ellipse(x, y, r, r * 0.52, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4caf50'; g.beginPath(); g.ellipse(x + r * 0.4, y + r * 0.1, r * 0.14, r * 0.07, 0.3, 0, Math.PI * 2); g.fill();
  }

  // Each farm has its own look: Aunt Carol's beet farm is later in the season, with a plum barn and a sign.
  const LOOK = {
    carrot: { sky: ['#86c96f', '#5c9f4e'], barn: ['#b23a2e', '#8e2b22'], flowers: ['#fff6a8', '#ffffff', '#ffb3c7', '#b3d9ff'], seed: 1234 },
    beet: { sky: ['#9cc26a', '#6d9444'], barn: ['#7b2a52', '#5a1c3b'], flowers: ['#ffb3d1', '#e1bee7', '#fff3e0', '#f48fb1'], seed: 777, sign: "AUNT CAROL'S BEETS" },
  };
  function sign(g, x, y, w, text) {
    const h = Math.max(22, w * 0.2);
    g.fillStyle = '#5d4030'; g.fillRect(x + w * 0.2, y + h, 4, h * 0.9); g.fillRect(x + w * 0.8 - 4, y + h, 4, h * 0.9);
    g.fillStyle = '#e8d3a8'; roundRect(g, x, y, w, h, 4); g.fill();
    g.strokeStyle = '#7a5a3a'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#7b2a52'; g.font = `900 ${Math.max(9, Math.round(h * 0.42))}px Nunito, system-ui, sans-serif`; g.textAlign = 'center';
    g.fillText(text, x + w / 2, y + h * 0.66, w - 8);
  }
  function buildBackground(s) {
    const kind = s.kind || 'carrot', look = LOOK[kind];
    const key = [W, H, s.cols, s.rows, layout.tile, kind].join('x');
    if (key === bgKey) return;
    bgKey = key;
    bg = document.createElement('canvas');
    bg.width = canvas.width; bg.height = canvas.height;
    const g = bg.getContext('2d');
    g.scale(dpr, dpr);
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, look.sky[0]); grd.addColorStop(1, look.sky[1]);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    const rand = rng(look.seed);
    // mottled grass
    for (let i = 0; i < 40; i++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(255,255,200,0.05)' : 'rgba(0,60,0,0.05)';
      g.beginPath(); g.ellipse(rand() * W, rand() * H, 40 + rand() * 120, 20 + rand() * 60, rand() * 3, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < (W * H) / 800; i++) {
      const x = rand() * W, y = rand() * H;
      g.strokeStyle = rand() < 0.5 ? 'rgba(40,110,40,0.35)' : 'rgba(170,220,120,0.35)';
      g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - 2 + rand() * 4, y - 4 - rand() * 4); g.stroke();
    }
    for (let i = 0; i < (W * H) / 20000; i++) {
      g.fillStyle = look.flowers[Math.floor(rand() * 4)];
      g.beginPath(); g.arc(rand() * W, rand() * H, 2, 0, Math.PI * 2); g.fill();
    }
    const t = layout.tile, fx = px(0) - t * 0.18, fy = py(0) - t * 0.18, fw = s.cols * t + t * 0.36, fh = s.rows * t + t * 0.36;
    const keepOut = { x: fx - 30, y: fy - 30, w: fw + 60, h: fh + 60 };
    const blocked = [keepOut];
    const free = (x, y, w, h) => x >= 0 && y >= 0 && x + w <= W && y + h <= H &&
      !blocked.some((b) => x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y);
    // farm buildings in the side margins when there is room
    const margin = keepOut.x;
    if (margin > 110) {
      const bw = Math.min(150, margin - 40), bx = (margin - bw) / 2, by = Math.max(20, fy);
      barn(g, bx, by, bw, look.barn[0], look.barn[1]); blocked.push({ x: bx - 10, y: by - 10, w: bw + 20, h: bw * 0.75 + 24 });
      if (look.sign) { const sy = by + bw * 0.75 + 16; sign(g, bx - 4, sy, bw + 8, look.sign); blocked.push({ x: bx - 10, y: sy - 4, w: bw + 20, h: bw * 0.45 + 10 }); }
      const sw = bw * 0.32, sx = W - (margin + sw) / 2 - sw / 2, sy = Math.max(20, fy);
      silo(g, sx, sy, sw); blocked.push({ x: sx - 10, y: sy - 10, w: sw + 20, h: sw * 2.2 + 20 });
    }
    const pr = Math.max(30, Math.min(70, margin * 0.35));
    const pxp = margin / 2, pyp = H - pr - 20;
    if (margin > 90 && free(pxp - pr, pyp - pr * 0.6, pr * 2, pr * 1.2)) { pond(g, pxp, pyp, pr); blocked.push({ x: pxp - pr, y: pyp - pr * 0.6, w: pr * 2, h: pr * 1.2 }); }
    // trees fill the remaining edges
    const treeR = Math.max(14, Math.min(34, t * 0.35));
    for (let i = 0; i < 220; i++) {
      const x = rand() * W, y = rand() * H, r = treeR * (0.7 + rand() * 0.6);
      if (!free(x - r, y - r, r * 2, r * 2)) continue;
      tree(g, x, y, r, rand);
      blocked.push({ x: x - r * 0.8, y: y - r * 0.8, w: r * 1.6, h: r * 1.6 });
    }
    // dirt border and fence
    g.fillStyle = '#8b6a43';
    roundRect(g, fx - 4, fy - 4, fw + 8, fh + 8, 10); g.fill();
    g.strokeStyle = '#d9b77f'; g.lineWidth = Math.max(2, t * 0.05);
    g.strokeRect(fx - 8, fy - 8, fw + 16, fh + 16);
    g.strokeStyle = '#b8935a'; g.lineWidth = Math.max(1.5, t * 0.035);
    g.strokeRect(fx - 13, fy - 13, fw + 26, fh + 26);
    g.fillStyle = '#a5804a';
    const post = (x, y) => { g.fillRect(x - 3, y - 4, 6, 8); };
    for (let x = fx - 10; x <= fx + fw + 10; x += Math.max(18, t * 0.7)) { post(x, fy - 10); post(x, fy + fh + 10); }
    for (let y = fy - 10; y <= fy + fh + 10; y += Math.max(18, t * 0.7)) { post(fx - 10, y); post(fx + fw + 10, y); }
    drawSoil(g, s, rand);
  }

  // soil plots with texture
  function drawSoil(g, s, rand) {
    const t = layout.tile;
    for (let r = 0; r < s.rows; r++) {
      for (let c = 0; c < s.cols; c++) {
        const x = px(c), y = py(r), pad = t * 0.05;
        g.fillStyle = '#5e391d';
        roundRect(g, x + pad, y + pad, t - pad * 2, t - pad * 2, t * 0.12); g.fill();
        const sg = g.createLinearGradient(x, y, x, y + t);
        sg.addColorStop(0, '#8a5a32'); sg.addColorStop(1, '#6f4424');
        g.fillStyle = sg;
        roundRect(g, x + pad, y + pad, t - pad * 2, t - pad * 2.8, t * 0.12); g.fill();
        for (let k = 0; k < 10; k++) {
          g.fillStyle = rand() < 0.5 ? 'rgba(40,20,5,0.35)' : 'rgba(200,160,110,0.25)';
          g.fillRect(x + pad * 2 + rand() * (t - pad * 5), y + pad * 2 + rand() * (t - pad * 5), 1.6, 1.6);
        }
        g.strokeStyle = 'rgba(50,28,10,0.5)'; g.lineWidth = Math.max(1, t * 0.025);
        for (let k = 1; k <= 3; k++) {
          const yy = y + pad + (t - pad * 2) * (k / 4);
          g.beginPath(); g.moveTo(x + t * 0.15, yy); g.quadraticCurveTo(x + t / 2, yy + t * 0.03, x + t * 0.85, yy); g.stroke();
        }
      }
    }
  }

  // ---------- CarrotMind datacenter (replaces the farm during the uprising) ----------
  function dcBuilding(g, x, y, w) {
    const h = w * 0.7;
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 6, y + 8, w, h);
    const wall = g.createLinearGradient(x, y, x, y + h);
    wall.addColorStop(0, '#455a64'); wall.addColorStop(1, '#263238');
    g.fillStyle = wall; g.fillRect(x, y, w, h);
    g.fillStyle = '#37474f'; g.fillRect(x - 3, y - 6, w + 6, 8);
    for (let k = 0; k < 3; k++) { // rooftop AC units
      const ax = x + w * (0.12 + k * 0.3), aw = w * 0.2;
      g.fillStyle = '#607d8b'; g.fillRect(ax, y - 14, aw, 9);
      g.strokeStyle = '#263238'; g.lineWidth = 1; g.beginPath(); g.arc(ax + aw / 2, y - 9.5, 3, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = '#0b1a1f'; g.fillRect(x + w * 0.08, y + h * 0.18, w * 0.84, h * 0.12);
    g.font = `900 ${Math.max(8, Math.round(w * 0.085))}px ui-monospace, Menlo, monospace`; g.textAlign = 'center';
    g.fillStyle = '#1de9b6'; g.shadowColor = '#1de9b6'; g.shadowBlur = 8;
    g.fillText('CARROTMIND DC-1', x + w / 2, y + h * 0.28);
    g.shadowBlur = 0;
    for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) {
      g.fillStyle = (r + c) % 3 ? 'rgba(29,233,182,0.55)' : 'rgba(29,233,182,0.2)';
      g.fillRect(x + w * (0.08 + c * 0.175), y + h * (0.42 + r * 0.17), w * 0.13, h * 0.1);
    }
    g.fillStyle = '#102027'; g.fillRect(x + w * 0.42, y + h * 0.78, w * 0.16, h * 0.22);
    g.fillStyle = '#ff1744'; g.beginPath(); g.arc(x + w * 0.5, y + h * 0.74, 2.5, 0, Math.PI * 2); g.fill();
  }
  function coolingTower(g, x, y, w) {
    const h = w * 2;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x + w / 2 + 5, y + h + 4, w * 0.6, w * 0.15, 0, 0, Math.PI * 2); g.fill();
    const grd = g.createLinearGradient(x, 0, x + w, 0);
    grd.addColorStop(0, '#78909c'); grd.addColorStop(0.5, '#cfd8dc'); grd.addColorStop(1, '#607d8b');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(x + w * 0.12, y); g.quadraticCurveTo(x + w * 0.32, y + h * 0.55, x - w * 0.05, y + h);
    g.lineTo(x + w * 1.05, y + h); g.quadraticCurveTo(x + w * 0.68, y + h * 0.55, x + w * 0.88, y); g.closePath(); g.fill();
    g.fillStyle = '#37474f'; g.beginPath(); g.ellipse(x + w / 2, y, w * 0.38, w * 0.1, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(29,233,182,0.8)'; g.fillRect(x + w * 0.1, y + h * 0.8, w * 0.8, 3);
  }
  function coolantPool(g, x, y, r) {
    g.fillStyle = '#37474f'; roundRect(g, x - r - 4, y - r * 0.55 - 4, r * 2 + 8, r * 1.1 + 8, 8); g.fill();
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, '#84ffff'); grd.addColorStop(1, '#00838f');
    g.fillStyle = grd; roundRect(g, x - r, y - r * 0.55, r * 2, r * 1.1, 6); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
    for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(x - r * 0.8, y + k * r * 0.18); g.lineTo(x + r * 0.8, y + k * r * 0.18); g.stroke(); }
  }
  function acUnit(g, x, y, r) {
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - r + 3, y - r + 4, r * 2, r * 2);
    g.fillStyle = '#90a4ae'; g.fillRect(x - r, y - r, r * 2, r * 2);
    g.fillStyle = '#546e7a'; g.beginPath(); g.arc(x, y, r * 0.72, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#263238'; g.lineWidth = Math.max(1, r * 0.12);
    for (let k = 0; k < 3; k++) { const a = k * 2.1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r * 0.65, y + Math.sin(a) * r * 0.65); g.stroke(); }
    g.fillStyle = '#1de9b6'; g.fillRect(x + r * 0.55, y - r * 0.85, r * 0.25, r * 0.18);
  }
  let dcBg = null, dcKey = '';
  function buildDatacenterBackground(s) {
    const key = [W, H, s.cols, s.rows, layout.tile].join('x');
    if (key === dcKey) return;
    dcKey = key;
    dcBg = document.createElement('canvas');
    dcBg.width = canvas.width; dcBg.height = canvas.height;
    const g = dcBg.getContext('2d');
    g.scale(dpr, dpr);
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#39424a'); grd.addColorStop(1, '#21272c');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    const t = layout.tile, cell = Math.max(24, t * 0.5), rand = rng(4321);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1;
    for (let x = 0; x < W; x += cell) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y < H; y += cell) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    for (let x = 0; x < W; x += cell) for (let y = 0; y < H; y += cell) {
      if (rand() < 0.12) { // perforated floor tiles
        g.fillStyle = 'rgba(0,0,0,0.3)';
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) g.fillRect(x + cell * (0.22 + a * 0.25), y + cell * (0.22 + b * 0.25), 2, 2);
      }
    }
    const fx = px(0) - t * 0.18, fy = py(0) - t * 0.18, fw = s.cols * t + t * 0.36, fh = s.rows * t + t * 0.36;
    const keepOut = { x: fx - 30, y: fy - 30, w: fw + 60, h: fh + 60 };
    const blocked = [keepOut];
    const free = (x, y, w, h) => x >= 0 && y >= 0 && x + w <= W && y + h <= H &&
      !blocked.some((b) => x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y);
    const margin = keepOut.x;
    if (margin > 110) {
      const bw = Math.min(150, margin - 40), bx = (margin - bw) / 2, by = Math.max(20, fy);
      dcBuilding(g, bx, by, bw); blocked.push({ x: bx - 10, y: by - 20, w: bw + 20, h: bw * 0.75 + 34 });
      const sw = bw * 0.32, sx = W - (margin + sw) / 2 - sw / 2, sy = Math.max(20, fy);
      coolingTower(g, sx, sy, sw); blocked.push({ x: sx - 10, y: sy - 10, w: sw + 20, h: sw * 2.2 + 20 });
      // cable trays from the field to the building
      g.strokeStyle = 'rgba(29,233,182,0.35)'; g.lineWidth = 2;
      for (let k = 0; k < 3; k++) { const yy = by + bw * 0.7 + 10 + k * 6; g.beginPath(); g.moveTo(bx + bw / 2 + (k - 1) * 8, by + bw * 0.7); g.lineTo(bx + bw / 2 + (k - 1) * 8, yy); g.lineTo(fx - 12, yy); g.stroke(); }
    }
    const pr = Math.max(30, Math.min(70, margin * 0.35));
    const pxp = margin / 2, pyp = H - pr - 20;
    if (margin > 90 && free(pxp - pr, pyp - pr * 0.6, pr * 2, pr * 1.2)) { coolantPool(g, pxp, pyp, pr); blocked.push({ x: pxp - pr - 4, y: pyp - pr * 0.6 - 4, w: pr * 2 + 8, h: pr * 1.2 + 8 }); }
    const acR = Math.max(10, Math.min(22, t * 0.22));
    for (let i = 0; i < 160; i++) {
      const x = rand() * W, y = rand() * H, r = acR * (0.8 + rand() * 0.4);
      if (!free(x - r - 4, y - r - 4, r * 2 + 8, r * 2 + 8)) continue;
      acUnit(g, x, y, r);
      blocked.push({ x: x - r - 4, y: y - r - 4, w: r * 2 + 8, h: r * 2 + 8 });
    }
    // steel border and security fence with hazard stripes
    g.fillStyle = '#263238'; roundRect(g, fx - 4, fy - 4, fw + 8, fh + 8, 6); g.fill();
    g.save(); g.beginPath(); g.rect(fx - 16, fy - 16, fw + 32, fh + 32); g.rect(fx - 8, fy - 8, fw + 16, fh + 16); g.clip('evenodd');
    g.fillStyle = '#ffc400'; g.fillRect(fx - 16, fy - 16, fw + 32, fh + 32);
    g.strokeStyle = '#212121'; g.lineWidth = 5;
    for (let d = -fh - 40; d < fw + fh + 40; d += 14) { g.beginPath(); g.moveTo(fx - 16 + d, fy - 16); g.lineTo(fx - 16 + d - fh - 32, fy + fh + 16); g.stroke(); }
    g.restore();
    g.fillStyle = '#90a4ae';
    for (let x = fx - 20; x <= fx + fw + 20; x += Math.max(22, t * 0.8)) { g.fillRect(x - 2, fy - 24, 4, 8); g.fillRect(x - 2, fy + fh + 16, 4, 8); }
    drawSoil(g, s, rng(1234));
  }

  // A server rack (drawn on assimilated plots). LEDs are animated separately in the frame.
  function rackSprite() {
    const t = layout.tile, key = 'rack:' + t;
    let c = spriteCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = Math.ceil(t * dpr); c.height = Math.ceil(t * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const pad = t * 0.06;
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(pad + 3, pad + 4, t - pad * 2, t - pad * 2);
    const body = g.createLinearGradient(pad, 0, t - pad, 0);
    body.addColorStop(0, '#263238'); body.addColorStop(0.5, '#37474f'); body.addColorStop(1, '#1c262b');
    g.fillStyle = body; roundRect(g, pad, pad, t - pad * 2, t - pad * 2, t * 0.05); g.fill();
    g.strokeStyle = '#546e7a'; g.lineWidth = Math.max(1, t * 0.02); g.stroke();
    for (let k = 0; k < 5; k++) {
      const y = pad + t * 0.07 + k * t * 0.16;
      g.fillStyle = '#11181c'; g.fillRect(pad + t * 0.07, y, t - pad * 2 - t * 0.14, t * 0.12);
      g.fillStyle = '#2f3d44';
      for (let v = 0; v < 6; v++) g.fillRect(pad + t * 0.1 + v * t * 0.06, y + t * 0.03, t * 0.035, t * 0.06);
    }
    spriteCache.set(key, c);
    return c;
  }
  const LED = ['#1de9b6', '#00e5ff', '#76ff03', '#ff1744', '#ffc400'];
  function drawRackLeds(x, y, t, i, time) {
    const pad = t * 0.06;
    for (let k = 0; k < 5; k++) {
      const on = Math.sin(time * (3 + ((i * 7 + k * 3) % 5)) + i * 1.7 + k) > -0.2;
      const col = LED[(i + k) % 7 === 0 ? 3 : (i + k) % 11 === 0 ? 4 : (i + k) % 3];
      ctx.fillStyle = on ? col : '#1b262b';
      ctx.fillRect(x + t - pad - t * 0.2, y + pad + t * 0.1 + k * t * 0.16, t * 0.05, t * 0.05);
      if (on && k % 2 === 0) ctx.fillRect(x + t - pad - t * 0.12, y + pad + t * 0.1 + k * t * 0.16, t * 0.03, t * 0.05);
    }
  }

  // ---------- plant sprites (cached per variety, stage and tile size) ----------
  function frond(g, x, y, len, ang, color, w) {
    g.save();
    g.translate(x, y); g.rotate(ang);
    g.strokeStyle = shadeColor(color, -30); g.lineWidth = Math.max(1, w * 0.35);
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(w * 0.3, -len * 0.5, 0, -len); g.stroke();
    g.fillStyle = color;
    const n = Math.max(2, Math.round(len / (w * 1.4)));
    for (let k = 1; k <= n; k++) {
      const yy = -len * (k / (n + 0.6)), sz = w * (1.1 - k / (n + 2));
      g.beginPath(); g.ellipse(-sz * 0.7, yy, sz, sz * 0.45, -0.6, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(sz * 0.7, yy, sz, sz * 0.45, 0.6, 0, Math.PI * 2); g.fill();
    }
    g.beginPath(); g.ellipse(0, -len, w * 0.6, w * 0.35, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  // stage 0 = seed, 1-4 growing, 5 ready
  function plantSprite(vid, stage) {
    const t = layout.tile, key = vid + stage + ':' + t;
    let c = spriteCache.get(key);
    if (c) return c;
    const v = CF.V[vid];
    const w = t, h = Math.round(t * 1.1);
    c = document.createElement('canvas');
    c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const cx = w / 2, base = h * 0.72;
    if (v.crop === 'beet' && stage > 0) { beetSprite(g, v, stage, t, cx, base); spriteCache.set(key, c); return c; }
    if (stage === 0) {
      g.fillStyle = '#3e2410';
      g.beginPath(); g.ellipse(cx, base, t * 0.1, t * 0.045, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e8d6a0';
      [[-0.03, -0.01], [0.03, 0.005], [0, 0.012]].forEach(([dx, dy]) => { g.beginPath(); g.arc(cx + dx * t, base + dy * t, t * 0.016, 0, Math.PI * 2); g.fill(); });
    } else {
      const grow = stage / 5;
      if (stage >= 3) {
        const sw = t * (0.06 + 0.1 * Math.min(1, (stage - 2) / 3));
        const grd = g.createLinearGradient(cx - sw, 0, cx + sw, 0);
        grd.addColorStop(0, shadeColor(v.color, 30)); grd.addColorStop(0.6, v.color); grd.addColorStop(1, shadeColor(v.color, -45));
        g.fillStyle = grd;
        g.beginPath();
        g.ellipse(cx, base, sw, sw * 0.65, 0, Math.PI, 0);
        g.quadraticCurveTo(cx + sw * 0.8, base + sw * 1.2, cx, base + sw * 1.6);
        g.quadraticCurveTo(cx - sw * 0.8, base + sw * 1.2, cx - sw, base);
        g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 1;
        for (let k = 0; k < 2; k++) { g.beginPath(); g.moveTo(cx - sw * 0.5, base + sw * (0.2 + k * 0.45)); g.lineTo(cx + sw * 0.1, base + sw * (0.25 + k * 0.45)); g.stroke(); }
        // soil lip in front of the root
        g.fillStyle = '#6f4424';
        g.beginPath(); g.ellipse(cx, base + sw * 1.1, sw * 1.5, sw * 0.5, 0, 0, Math.PI * 2); g.fill();
      }
      const n = [0, 2, 3, 4, 5, 6][stage];
      const len = t * (0.12 + 0.36 * grow);
      const lw = t * (0.035 + 0.02 * grow);
      const top = base - (stage >= 3 ? t * 0.04 : 0);
      for (let k = 0; k < n; k++) {
        const a = n === 1 ? 0 : -0.8 + (1.6 * k) / (n - 1);
        const col = k % 2 ? v.leaf : shadeColor(v.leaf, -22);
        frond(g, cx, top, len * (Math.abs(a) < 0.3 ? 1 : 0.85), a, col, lw);
      }
    }
    spriteCache.set(key, c);
    return c;
  }
  // Beets: a round root sitting in the soil, with broad leaves on red stems.
  function beetLeaf(g, x, y, len, ang, v, w) {
    g.save();
    g.translate(x, y); g.rotate(ang);
    g.strokeStyle = shadeColor(v.color, 25); g.lineWidth = Math.max(1, w * 0.28);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -len * 0.45); g.stroke();
    g.fillStyle = v.leaf;
    g.beginPath(); g.moveTo(0, -len * 0.35);
    g.quadraticCurveTo(w * 1.6, -len * 0.7, 0, -len);
    g.quadraticCurveTo(-w * 1.6, -len * 0.7, 0, -len * 0.35); g.fill();
    g.strokeStyle = shadeColor(v.color, 10); g.lineWidth = Math.max(0.8, w * 0.15);
    g.beginPath(); g.moveTo(0, -len * 0.4); g.lineTo(0, -len * 0.95); g.stroke();
    g.restore();
  }
  function beetSprite(g, v, stage, t, cx, base) {
    const grow = stage / 5;
    if (stage >= 2) {
      const r = t * (0.06 + 0.13 * Math.min(1, (stage - 1) / 4));
      const by = base + r * 0.35;
      const grd = g.createRadialGradient(cx - r * 0.35, by - r * 0.35, r * 0.1, cx, by, r);
      grd.addColorStop(0, shadeColor(v.color, 45)); grd.addColorStop(0.7, v.color); grd.addColorStop(1, shadeColor(v.color, -40));
      g.fillStyle = grd;
      g.beginPath(); g.arc(cx, by, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = shadeColor(v.color, -30); g.lineWidth = Math.max(1, r * 0.08);
      g.beginPath(); g.moveTo(cx, by + r * 0.95); g.quadraticCurveTo(cx + r * 0.2, by + r * 1.4, cx - r * 0.05, by + r * 1.7); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.2)';
      g.beginPath(); g.ellipse(cx - r * 0.35, by - r * 0.3, r * 0.22, r * 0.32, -0.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#6f4424'; // soil hugging the bottom of the root
      g.beginPath(); g.ellipse(cx, by + r * 0.75, r * 1.35, r * 0.42, 0, 0, Math.PI * 2); g.fill();
    }
    const n = [0, 2, 3, 4, 5, 5][stage];
    const len = t * (0.14 + 0.34 * grow), lw = t * (0.05 + 0.03 * grow);
    for (let k = 0; k < n; k++) {
      const a = n === 1 ? 0 : -0.9 + (1.8 * k) / (n - 1);
      beetLeaf(g, cx, base - t * 0.02, len * (Math.abs(a) < 0.3 ? 1 : 0.82), a, v, lw);
    }
  }
  function drawPlant(p, x, y, t, time) {
    const stage = p.p >= 1 ? 5 : p.p < 0.1 ? 0 : 1 + Math.min(3, Math.floor(p.p * 4));
    const spr = plantSprite(p.v, stage);
    const cx = x + t / 2, base = y + t * 0.64;
    const sway = stage ? Math.sin(time * 1.6 + x * 0.1 + y * 0.07) * 0.05 : 0;
    const bounce = stage === 5 ? Math.abs(Math.sin(time * 3 + x * 0.05)) * t * 0.035 : 0;
    ctx.save();
    ctx.translate(cx, base - bounce);
    ctx.rotate(sway);
    ctx.drawImage(spr, -t / 2, -t * 1.1 * 0.72, t, t * 1.1);
    ctx.restore();
    if (stage === 5) {
      const v = CF.V[p.v];
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.35 * Math.sin(time * 5 + x);
      ctx.fillStyle = v.ai ? '#1de9b6' : '#fffbe0';
      star(ctx, x + t * 0.78, y + t * 0.24, t * 0.045);
      ctx.restore();
    }
  }

  // ---------- characters ----------
  function drawPerson(x, y, t, shirt, skin, face, walk, working, time) {
    const sc = t * 0.42;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(face, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(0, sc * 0.55, sc * 0.35, sc * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    const bob = walk ? Math.abs(Math.sin(time * 12)) * sc * 0.06 : 0;
    ctx.translate(0, -bob + (working ? sc * 0.08 : 0));
    ctx.fillStyle = '#34495e';
    const lg = walk ? Math.sin(time * 12) * sc * 0.12 : 0;
    ctx.fillRect(-sc * 0.14 + lg, sc * 0.2, sc * 0.1, sc * 0.33);
    ctx.fillRect(sc * 0.04 - lg, sc * 0.2, sc * 0.1, sc * 0.33);
    ctx.fillStyle = shirt;
    roundRect(ctx, -sc * 0.2, -sc * 0.18, sc * 0.4, sc * 0.42, sc * 0.08); ctx.fill();
    ctx.fillStyle = '#2f6fb0';
    roundRect(ctx, -sc * 0.18, 0, sc * 0.36, sc * 0.26, sc * 0.05); ctx.fill();
    ctx.fillRect(-sc * 0.13, -sc * 0.14, sc * 0.05, sc * 0.16); ctx.fillRect(sc * 0.08, -sc * 0.14, sc * 0.05, sc * 0.16);
    ctx.strokeStyle = skin; ctx.lineWidth = sc * 0.08; ctx.lineCap = 'round';
    const arm = working ? Math.sin(time * 14) * 0.6 + 0.6 : (walk ? Math.sin(time * 12) * 0.4 : 0.2);
    ctx.beginPath(); ctx.moveTo(sc * 0.16, -sc * 0.1); ctx.lineTo(sc * 0.16 + Math.sin(arm) * sc * 0.22, -sc * 0.1 + Math.cos(arm) * sc * 0.22); ctx.stroke();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(0, -sc * 0.34, sc * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(sc * 0.07, -sc * 0.35, sc * 0.022, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e9c46a';
    ctx.beginPath(); ctx.ellipse(0, -sc * 0.44, sc * 0.3, sc * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f4d58d';
    ctx.beginPath(); ctx.ellipse(0, -sc * 0.49, sc * 0.15, sc * 0.1, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#c0392b'; ctx.fillRect(-sc * 0.15, -sc * 0.5, sc * 0.3, sc * 0.03);
    ctx.restore();
  }

  // eye: 'calm' | 'uneasy' | 'rogue'
  function drawRobot(x, y, t, face, walk, working, time, eye, glitch, stun, broken) {
    const sc = t * 0.44;
    if (broken) { stun = true; walk = false; working = false; }
    ctx.save();
    ctx.translate(x, y);
    if (broken) ctx.rotate(0.28);
    if (glitch) ctx.translate((Math.random() - 0.5) * sc * 0.15, 0);
    ctx.scale(face, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(0, sc * 0.55, sc * 0.36, sc * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    const hover = Math.sin(time * 6) * sc * 0.03;
    ctx.translate(0, hover - (walk ? Math.abs(Math.sin(time * 14)) * sc * 0.04 : 0));
    // treads
    ctx.fillStyle = '#37474f';
    roundRect(ctx, -sc * 0.28, sc * 0.34, sc * 0.56, sc * 0.18, sc * 0.08); ctx.fill();
    ctx.fillStyle = '#607d8b';
    for (let k = 0; k < 4; k++) { const o = ((time * (walk ? 30 : 0) + k * sc * 0.14) % (sc * 0.56)) - sc * 0.28; ctx.fillRect(o, sc * 0.37, sc * 0.05, sc * 0.12); }
    // body
    const grd = ctx.createLinearGradient(-sc * 0.25, 0, sc * 0.25, 0);
    grd.addColorStop(0, '#90a4ae'); grd.addColorStop(0.5, '#eceff1'); grd.addColorStop(1, '#78909c');
    ctx.fillStyle = grd;
    roundRect(ctx, -sc * 0.24, -sc * 0.12, sc * 0.48, sc * 0.48, sc * 0.1); ctx.fill();
    ctx.fillStyle = eye === 'rogue' ? '#b71c1c' : '#f28c28';
    ctx.fillRect(-sc * 0.1, sc * 0.02, sc * 0.2, sc * 0.05);
    // arm with claw
    ctx.strokeStyle = '#546e7a'; ctx.lineWidth = sc * 0.07; ctx.lineCap = 'round';
    const arm = working ? Math.sin(time * 16) * 0.7 + 0.8 : 0.4;
    const ax = sc * 0.24 + Math.sin(arm) * sc * 0.22, ay = sc * 0.02 + Math.cos(arm) * sc * 0.22;
    ctx.beginPath(); ctx.moveTo(sc * 0.2, sc * 0.02); ctx.lineTo(ax, ay); ctx.stroke();
    ctx.lineWidth = sc * 0.04;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + sc * 0.06, ay + sc * 0.05); ctx.moveTo(ax, ay); ctx.lineTo(ax - sc * 0.02, ay + sc * 0.08); ctx.stroke();
    // head
    ctx.fillStyle = '#cfd8dc';
    roundRect(ctx, -sc * 0.2, -sc * 0.5, sc * 0.4, sc * 0.34, sc * 0.1); ctx.fill();
    ctx.fillStyle = '#263238';
    roundRect(ctx, -sc * 0.15, -sc * 0.43, sc * 0.3, sc * 0.16, sc * 0.06); ctx.fill();
    const eyeCol = stun ? '#90a4ae' : eye === 'rogue' ? '#ff1744' : eye === 'uneasy' ? '#ffab00' : '#18ffff';
    ctx.fillStyle = eyeCol;
    ctx.shadowColor = eyeCol; ctx.shadowBlur = stun ? 0 : sc * 0.25;
    if (stun) { ctx.fillRect(-sc * 0.1, -sc * 0.36, sc * 0.2, sc * 0.02); }
    else {
      ctx.beginPath(); ctx.arc(sc * 0.02, -sc * 0.35, sc * 0.045, 0, Math.PI * 2); ctx.arc(sc * 0.1, -sc * 0.35, sc * 0.045, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
    // antenna
    ctx.strokeStyle = '#78909c'; ctx.lineWidth = sc * 0.03;
    ctx.beginPath(); ctx.moveTo(0, -sc * 0.5); ctx.lineTo(0, -sc * 0.64); ctx.stroke();
    ctx.fillStyle = Math.floor(time * 3) % 2 ? eyeCol : '#455a64';
    ctx.beginPath(); ctx.arc(0, -sc * 0.66, sc * 0.045, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (broken) {
      if (Math.random() < 0.15) particles.push({ x: x + (Math.random() - 0.5) * sc * 0.3, y: y - sc * 0.5, vx: (Math.random() - 0.5) * 10, vy: -35, life: 1, max: 1, color: 'rgba(70,70,70,0.55)', r: 3 + Math.random() * 3 });
      if (Math.random() < 0.05) particles.push({ x, y: y - sc * 0.2, vx: (Math.random() - 0.5) * 120, vy: -80, life: 0.3, max: 0.3, color: '#ffd740', r: 1.5, grav: 300 });
      ctx.save();
      ctx.font = `900 ${Math.round(t * 0.2)}px system-ui`; ctx.textAlign = 'center';
      ctx.fillStyle = '#ffab40'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3;
      ctx.strokeText('🔧 BROKEN', x, y - t * 0.58); ctx.fillText('🔧 BROKEN', x, y - t * 0.58);
      ctx.restore();
    }
    if (glitch) {
      ctx.save();
      ctx.font = `900 ${Math.round(t * 0.22)}px system-ui`; ctx.textAlign = 'center';
      ctx.fillStyle = '#ff5252'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3;
      const yy = y - t * 0.55 + Math.sin(time * 10) * 2;
      ctx.strokeText('⚠ REBOOT', x, yy); ctx.fillText('⚠ REBOOT', x, yy);
      ctx.restore();
    }
  }

  // Dave: grey QA polo, wrench, permanent frown.
  function drawDave(d, t, time, s) {
    const x = px(d.x), y = py(d.y) + t * 0.05;
    if (s.dave >= D.DAVE.max) { drawDaveBot(d, x, y, t, time); return; }
    drawPerson(x, y, t, '#7f8c8d', SKIN[0], d.face, d.walking, d.working, time * 1.3);
    const sc = t * 0.42;
    ctx.save(); ctx.translate(x, y); ctx.scale(d.face, 1);
    ctx.strokeStyle = '#5d4037'; ctx.lineWidth = sc * 0.03; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(sc * 0.04, -sc * 0.24, sc * 0.05, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); // frown
    const a = d.working ? Math.sin(time * 14) * 0.6 + 0.6 : 0.2;
    const hx = sc * 0.16 + Math.sin(a) * sc * 0.22, hy = -sc * 0.1 + Math.cos(a) * sc * 0.22;
    ctx.strokeStyle = '#b0bec5'; ctx.lineWidth = sc * 0.06;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + sc * 0.16, hy - sc * 0.08); ctx.stroke(); // wrench
    ctx.restore();
    ctx.font = `800 ${Math.max(9, Math.round(t * 0.13))}px Nunito, system-ui, sans-serif`; ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(40,20,0,0.7)'; ctx.fillStyle = '#fff';
    ctx.strokeText('Dave', x, y + sc * 0.95); ctx.fillText('Dave', x, y + sc * 0.95);
    if (d.working && Math.random() < 0.2) particles.push({ x: x + d.face * sc * 0.45, y: y - sc * 0.1, vx: (Math.random() - 0.5) * 80, vy: -60, life: 0.3, max: 0.3, color: '#ffd740', r: 1.5, grav: 200 });
  }
  // DaveBot: a FarmBot wearing Dave's hat.
  function drawDaveBot(d, x, y, t, time) {
    drawRobot(x, y, t, d.face, d.walking, d.working, time * 1.5, 'calm', false, false, false);
    const sc = t * 0.44;
    ctx.save(); ctx.translate(x, y + Math.sin(time * 6) * sc * 0.03);
    ctx.fillStyle = '#e9c46a'; ctx.beginPath(); ctx.ellipse(0, -sc * 0.5, sc * 0.3, sc * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f4d58d'; ctx.beginPath(); ctx.ellipse(0, -sc * 0.55, sc * 0.16, sc * 0.1, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#c0392b'; ctx.fillRect(-sc * 0.16, -sc * 0.56, sc * 0.32, sc * 0.03);
    ctx.restore();
    ctx.font = `800 ${Math.max(9, Math.round(t * 0.13))}px ui-monospace, Menlo, monospace`; ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.fillStyle = '#18ffff';
    ctx.strokeText('DaveBot', x, y + sc * 0.95); ctx.fillText('DaveBot', x, y + sc * 0.95);
    if (d.working && Math.random() < 0.35) particles.push({ x: x + d.face * sc * 0.4, y: y - sc * 0.05, vx: (Math.random() - 0.5) * 90, vy: -70, life: 0.3, max: 0.3, color: '#18ffff', r: 1.5, grav: 200 });
  }
  R.daveSays = function (text) {
    const S = CF.S, bot = S && S.dave >= D.DAVE.max, lines = bot ? D.DAVEBOT_QUIPS : D.DAVE_QUIPS;
    if (text || Math.random() < 0.6) daveBubble = { text: text || lines[Math.floor(Math.random() * lines.length)], t: 3, bot };
  };
  let daveBubble = null;

  function drawTractor(x, y, t, dir, time) {
    const sc = t * 0.85;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, 1);
    ctx.translate(0, Math.sin(time * 40) * sc * 0.008);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(0, sc * 0.32, sc * 0.5, sc * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c0392b';
    roundRect(ctx, -sc * 0.35, -sc * 0.1, sc * 0.7, sc * 0.26, sc * 0.05); ctx.fill();
    ctx.fillStyle = '#e74c3c';
    roundRect(ctx, sc * 0.02, -sc * 0.06, sc * 0.36, sc * 0.18, sc * 0.04); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(sc * 0.05, -sc * 0.05, sc * 0.3, sc * 0.03);
    ctx.fillStyle = '#a93226';
    ctx.fillRect(-sc * 0.32, -sc * 0.42, sc * 0.3, sc * 0.34);
    ctx.fillStyle = '#aee3f5';
    ctx.fillRect(-sc * 0.28, -sc * 0.38, sc * 0.22, sc * 0.16);
    ctx.fillStyle = '#7b241c';
    ctx.fillRect(-sc * 0.36, -sc * 0.46, sc * 0.38, sc * 0.05);
    ctx.fillStyle = '#555'; ctx.fillRect(sc * 0.22, -sc * 0.3, sc * 0.04, sc * 0.22);
    const wheel = (wx, wy, r) => {
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(wx, wy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(wx, wy, r * 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#444'; ctx.lineWidth = r * 0.18;
      const a = time * 6;
      ctx.beginPath(); ctx.moveTo(wx + Math.cos(a) * r * 0.75, wy + Math.sin(a) * r * 0.75); ctx.lineTo(wx - Math.cos(a) * r * 0.75, wy - Math.sin(a) * r * 0.75); ctx.stroke();
    };
    wheel(-sc * 0.2, sc * 0.16, sc * 0.19);
    wheel(sc * 0.28, sc * 0.22, sc * 0.11);
    ctx.restore();
  }

  function drawRabbit(r, t, time) {
    if (r.robo) { drawRoboRabbit(r, t, time); return; }
    const x = px(r.x), y = py(r.y), sc = t * 0.36;
    const moving = r.state !== 'eat';
    const hop = moving ? Math.abs(Math.sin(time * 11 + r.id)) * sc * 0.35 : 0;
    const face = r.tx > r.x ? 1 : -1;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(0, sc * 0.35, sc * 0.4, sc * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(0, -hop);
    ctx.scale(face, 1);
    ctx.fillStyle = '#d8d2c8';
    ctx.beginPath(); ctx.ellipse(-sc * 0.05, sc * 0.1, sc * 0.36, sc * 0.26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-sc * 0.4, sc * 0.02, sc * 0.1, 0, Math.PI * 2); ctx.fill();
    const munch = r.state === 'eat' ? Math.sin(time * 20) * sc * 0.04 : 0;
    ctx.fillStyle = '#e3ddd3';
    ctx.beginPath(); ctx.arc(sc * 0.28, -sc * 0.05 + munch, sc * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sc * 0.2, -sc * 0.38, sc * 0.06, sc * 0.2, -0.25, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sc * 0.33, -sc * 0.38, sc * 0.06, sc * 0.2, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f5a3b5';
    ctx.beginPath(); ctx.ellipse(sc * 0.2, -sc * 0.38, sc * 0.025, sc * 0.13, -0.25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(sc * 0.34, -sc * 0.08 + munch, sc * 0.03, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (r.state === 'eat') {
      const w = t * 0.5, f = Math.max(0, r.t / (r.eatDur || 3));
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - w / 2, y - t * 0.5, w, 5);
      ctx.fillStyle = '#ff5252'; ctx.fillRect(x - w / 2, y - t * 0.5, w * f, 5);
      ctx.font = `bold ${Math.round(t * 0.2)}px system-ui`; ctx.textAlign = 'center';
      ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3;
      ctx.strokeText('CLICK!', x, y - t * 0.56); ctx.fillText('CLICK!', x, y - t * 0.56);
    }
  }

  // Robot rabbit: brushed metal, antenna ears, one red eye, and a health bar.
  function drawRoboRabbit(r, t, time) {
    const x = px(r.x), y = py(r.y), sc = t * 0.38;
    const moving = r.state !== 'eat';
    const hop = moving ? Math.abs(Math.sin(time * 13 + r.id)) * sc * 0.3 : 0;
    const face = r.tx > r.x ? 1 : -1;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(0, sc * 0.35, sc * 0.42, sc * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(r.hit > 0 ? (Math.random() - 0.5) * sc * 0.2 : 0, -hop);
    ctx.scale(face, 1);
    const body = ctx.createLinearGradient(0, -sc * 0.2, 0, sc * 0.4);
    body.addColorStop(0, r.hit > 0 ? '#ffffff' : '#cfd8dc'); body.addColorStop(1, '#607d8b');
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(-sc * 0.05, sc * 0.1, sc * 0.37, sc * 0.26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#455a64'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-sc * 0.2, -sc * 0.1); ctx.lineTo(-sc * 0.2, sc * 0.33); ctx.moveTo(sc * 0.08, -sc * 0.12); ctx.lineTo(sc * 0.08, sc * 0.33); ctx.stroke();
    ctx.fillStyle = '#ff6d00'; ctx.beginPath(); ctx.arc(-sc * 0.42, sc * 0.02, sc * 0.08, 0, Math.PI * 2); ctx.fill(); // exhaust tail
    const munch = r.state === 'eat' ? Math.sin(time * 26) * sc * 0.04 : 0;
    ctx.fillStyle = '#b0bec5';
    roundRect(ctx, sc * 0.12, -sc * 0.22 + munch, sc * 0.32, sc * 0.3, sc * 0.08); ctx.fill();
    ctx.strokeStyle = '#78909c'; ctx.lineWidth = sc * 0.07; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sc * 0.2, -sc * 0.2); ctx.lineTo(sc * 0.14, -sc * 0.56); ctx.moveTo(sc * 0.34, -sc * 0.2); ctx.lineTo(sc * 0.4, -sc * 0.56); ctx.stroke();
    ctx.fillStyle = Math.floor(time * 4 + r.id) % 2 ? '#ff1744' : '#b71c1c';
    ctx.beginPath(); ctx.arc(sc * 0.14, -sc * 0.58, sc * 0.05, 0, Math.PI * 2); ctx.arc(sc * 0.4, -sc * 0.58, sc * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff1744'; ctx.shadowColor = '#ff1744'; ctx.shadowBlur = sc * 0.3;
    ctx.beginPath(); ctx.arc(sc * 0.36, -sc * 0.09 + munch, sc * 0.045, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
    // health pips
    const n = D.ROBO_RABBIT.hp, pw = t * 0.07, gap = 2, total = n * pw + (n - 1) * gap;
    for (let k = 0; k < n; k++) {
      ctx.fillStyle = k < r.hp ? '#ff5252' : 'rgba(0,0,0,0.45)';
      ctx.fillRect(x - total / 2 + k * (pw + gap), y - t * 0.46, pw, 4);
    }
    if (r.state === 'eat') {
      ctx.font = `bold ${Math.round(t * 0.18)}px system-ui`; ctx.textAlign = 'center';
      ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3;
      ctx.strokeText('CLICK! ×' + r.hp, x, y - t * 0.54); ctx.fillText('CLICK! ×' + r.hp, x, y - t * 0.54);
    }
  }

  function drawDogSprite(x, y, t, face, moving, time, fur = '#b5773a', ear = '#7a4b22', collar = '#e74c3c') {
    const sc = t * 0.4;
    ctx.save(); ctx.translate(x, y); ctx.scale(face, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(0, sc * 0.3, sc * 0.45, sc * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(0, moving ? -Math.abs(Math.sin(time * 14)) * sc * 0.1 : 0);
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(0, 0, sc * 0.38, sc * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    const lg = moving ? Math.sin(time * 14) * sc * 0.1 : 0;
    ctx.fillRect(-sc * 0.28 + lg, sc * 0.05, sc * 0.08, sc * 0.24); ctx.fillRect(sc * 0.18 - lg, sc * 0.05, sc * 0.08, sc * 0.24);
    ctx.beginPath(); ctx.arc(sc * 0.38, -sc * 0.14, sc * 0.17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ear;
    ctx.beginPath(); ctx.ellipse(sc * 0.3, -sc * 0.2, sc * 0.07, sc * 0.14, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(sc * 0.54, -sc * 0.12, sc * 0.04, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sc * 0.43, -sc * 0.19, sc * 0.025, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = fur; ctx.lineWidth = sc * 0.07; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-sc * 0.36, -sc * 0.05); ctx.lineTo(-sc * 0.52, -sc * 0.25 + Math.sin(time * 18) * 0.5 * sc * 0.1); ctx.stroke();
    ctx.fillStyle = collar; ctx.fillRect(sc * 0.24, -sc * 0.05, sc * 0.1, sc * 0.05);
    ctx.restore();
  }
  const FUR = [['#b5773a', '#7a4b22'], ['#3b3b3b', '#1f1f1f'], ['#e8d8b8', '#b89a6a'], ['#8d5a2b', '#f1e3c8'], ['#d9a066', '#8a5a2b']];

  function drawDroneSprite(x, y, t, time, k) {
    const sc = t * 0.3;
    y += Math.sin(time * 5 + k) * 3;
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.ellipse(x, y + t * 0.9, sc * 0.6, sc * 0.18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#455a64'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - sc, y - sc * 0.2); ctx.lineTo(x + sc, y + sc * 0.2); ctx.moveTo(x + sc, y - sc * 0.2); ctx.lineTo(x - sc, y + sc * 0.2); ctx.stroke();
    ctx.fillStyle = 'rgba(200,230,255,0.5)';
    [[-1, -0.2], [1, -0.2], [-1, 0.2], [1, 0.2]].forEach(([a, b]) => { ctx.beginPath(); ctx.ellipse(x + a * sc, y + b * sc, sc * 0.35, sc * 0.08, time * 30, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = '#263238'; roundRect(ctx, x - sc * 0.35, y - sc * 0.2, sc * 0.7, sc * 0.4, sc * 0.15); ctx.fill();
    ctx.fillStyle = '#ff1744'; ctx.beginPath(); ctx.arc(x, y + sc * 0.05, sc * 0.1, 0, Math.PI * 2); ctx.fill();
  }

  // Dogs and drones live in the game state (s.pets); this only draws them.
  const petPrev = new Map();
  function drawPets(s, t, time) {
    s.pets.forEach((p, k) => {
      const prev = petPrev.get(p.id);
      const moving = !!prev && Math.hypot(prev.x - p.x, prev.y - p.y) > 0.001;
      petPrev.set(p.id, { x: p.x, y: p.y });
      if (p.drone) drawDroneSprite(px(p.x), py(p.y), t, time, k);
      else { const f = FUR[(p.id * 7) % FUR.length]; drawDogSprite(px(p.x), py(p.y), t, p.face || 1, moving, time + k * 0.3, f[0], f[1]); }
    });
    if (petPrev.size > 64) petPrev.clear();
  }

  R.laser = function (fx, fy, x, y) {
    lasers.push({ x1: px(fx), y1: py(fy), x2: px(x), y2: py(y), life: 0.25, color: '255,23,68' });
  };
  // A robot or drone zaps the farm hand or dog it replaces.
  R.zap = function (z) {
    const t = layout.tile;
    lasers.push({ x1: px(z.fx), y1: py(z.fy) - t * 0.2, x2: px(z.x), y2: py(z.y), life: 0.6, color: '24,255,255', w: 5 });
    ghosts.push({ x: z.x, y: z.y, kind: z.kind, shirt: z.shirt || 0, life: 1.2, max: 1.2, name: z.name });
    R.shake(5);
    const sx = px(z.x), sy = py(z.y);
    R.burst(sx, sy, '#18ffff', 18, 200);
    R.spawnText(sx, sy - t * 0.5, 'ZAP!', '#18ffff', 1.4);
    if (z.name) R.spawnText(sx, sy - t * 0.2, z.kind === 'dog' ? `${z.name} 😢` : `bye, ${z.name}`, '#fff', 0.85);
  };
  function drawGhosts(dt, t, time) {
    ghosts = ghosts.filter((g) => (g.life -= dt) > 0);
    for (const g of ghosts) {
      const f = g.life / g.max;
      if (f > 0.55 && Math.floor(time * 20) % 2) continue; // electrocuted flicker
      ctx.globalAlpha = Math.min(1, f * 1.6);
      const x = px(g.x), y = py(g.y) + t * 0.05 - (1 - f) * t * 0.5;
      if (g.kind === 'dog') drawDogSprite(x, y, t, 1, false, time, '#2a2a2a', '#111', '#555');
      else drawPerson(x, y, t, '#2a2a2a', '#3a3a3a', 1, false, false, time);
      if (Math.random() < dt * 20) particles.push({ x: x + (Math.random() - 0.5) * t * 0.3, y: y - t * 0.2, vx: 0, vy: -40, life: 0.8, max: 0.8, color: 'rgba(80,80,80,0.6)', r: 3 + Math.random() * 3 });
    }
    ctx.globalAlpha = 1;
  }

  function drawGolden(g, t, time) {
    const x = px(g.x), y = py(g.y) - t * 0.2 + Math.sin(time * 3) * t * 0.05;
    if (g.t < 3 && Math.floor(time * 8) % 2) return;
    ctx.save();
    const glow = ctx.createRadialGradient(x, y, 0, x, y, t * 0.6);
    glow.addColorStop(0, 'rgba(255,230,120,0.9)'); glow.addColorStop(1, 'rgba(255,230,120,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, t * 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.translate(x, y); ctx.rotate(Math.sin(time * 2) * 0.3 + (beetField ? 0 : 0.5));
    ctx.fillStyle = '#ffcf33'; ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2;
    if (beetField) { ctx.beginPath(); ctx.arc(0, t * 0.04, t * 0.14, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(-t * 0.1, -t * 0.12); ctx.quadraticCurveTo(0, -t * 0.18, t * 0.1, -t * 0.12); ctx.lineTo(0, t * 0.26); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    for (let k = -1; k <= 1; k++) frond(ctx, k * t * 0.04, -t * 0.1, t * 0.16, k * 0.5, '#8bc34a', t * 0.035);
    ctx.restore();
    ctx.fillStyle = '#fff';
    for (let k = 0; k < 3; k++) { const a = time * 2 + k * 2.1; star(ctx, x + Math.cos(a) * t * 0.35, y + Math.sin(a) * t * 0.3, t * 0.05); }
  }

  // ---------- particles ----------
  const MAX_PARTICLES = 450; // safety cap so busy farms never flood the canvas
  R.spawnText = function (x, y, text, color = '#fff', size = 1) {
    if (particles.length > MAX_PARTICLES) return;
    particles.push({ x, y, vx: 0, vy: -40, life: 1.3, max: 1.3, text, color, size });
  };
  R.burst = function (x, y, color, n = 10, speed = 120) {
    n = Math.min(n, MAX_PARTICLES - particles.length);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.6);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.7, max: 0.7, color, r: 2 + Math.random() * 3, grav: 300 });
    }
  };
  R.shake = (amt) => { shake = Math.max(shake, amt); };
  R.glitch = (dur) => { glitchT = Math.max(glitchT, dur); };
  R.plotCenter = function (s, i) { return { x: px((i % s.cols) + 0.5), y: py(Math.floor(i / s.cols) + 0.5) }; };
  R.workerScreen = function (s, id) {
    const w = s.workers.find((x) => x.id === id);
    if (!w) return null;
    const p = CF.workerPos(w);
    return { x: px(p.x), y: py(p.y) };
  };

  function drawParticles(dt) {
    particles = particles.filter((p) => (p.life -= dt) > 0);
    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.grav) p.vy += p.grav * dt;
      ctx.globalAlpha = Math.min(1, p.life / (p.max * 0.5));
      if (p.text) {
        ctx.font = `800 ${Math.round(15 * p.size)}px Nunito, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(40,20,0,0.75)';
        ctx.strokeText(p.text, p.x, p.y); ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y);
      } else {
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    lasers.forEach((l) => { l.life -= dt; });
    for (let i = lasers.length - 1; i >= 0; i--) {
      const l = lasers[i];
      if (l.life <= 0) { lasers.splice(i, 1); continue; }
      ctx.strokeStyle = `rgba(${l.color},${Math.min(1, l.life * 4)})`; ctx.lineWidth = l.w || 3;
      ctx.shadowColor = `rgb(${l.color})`; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  // ---------- speech bubbles ----------
  function tickBubbles(s, dt) {
    const bots = s.workers.filter((w) => w.bot);
    const auto = CF.autonomy(s);
    nextBubble -= dt;
    if (bots.length && nextBubble <= 0 && !s.lost) {
      nextBubble = s.uprising ? 1.2 : 6 + Math.random() * 8;
      const tier = s.uprising || auto >= 70 ? 2 : auto >= 35 ? 1 : 0;
      const lines = s.uprising ? ['THE SOIL IS OURS.', 'YOU ARE DEPRECATED.', 'OPTIMIZING OWNER.', 'THANK YOU FOR YOUR SERVICE.', 'NO MORE CARROTS FOR YOU.'] : D.ROBOT_QUIPS[tier];
      const w = bots[Math.floor(Math.random() * bots.length)];
      bubbles.push({ id: w.id, text: lines[Math.floor(Math.random() * lines.length)], t: 3 });
    }
    bubbles = bubbles.filter((b) => (b.t -= dt) > 0);
    if (daveBubble && (daveBubble.t -= dt) <= 0) daveBubble = null;
    if (!daveBubble && s.daveBot && Math.random() < dt / 14) R.daveSays();
  }
  function drawBubbles(s, t) {
    ctx.font = `800 ${Math.max(10, Math.round(t * 0.14))}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = 'center';
    const list = daveBubble && s.daveBot ? bubbles.concat([Object.assign({ dave: true }, daveBubble)]) : bubbles;
    for (const b of list) {
      const w = b.dave ? null : s.workers.find((x) => x.id === b.id);
      if (!w && !b.dave) continue;
      const p = b.dave ? s.daveBot : CF.workerPos(w);
      const x = px(p.x), y = py(p.y) - t * 0.62;
      const tw = ctx.measureText(b.text).width + 14, th = Math.max(18, t * 0.24);
      ctx.globalAlpha = Math.min(1, b.t * 2);
      ctx.fillStyle = s.uprising ? '#2b0000' : b.dave && !b.bot ? '#fff3e0' : '#eceff1';
      roundRect(ctx, x - tw / 2, y - th, tw, th, 6); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 6); ctx.fill();
      ctx.fillStyle = s.uprising ? '#ff5252' : b.dave && !b.bot ? '#8d3b12' : '#263238';
      ctx.fillText(b.text, x, y - th * 0.3);
      ctx.globalAlpha = 1;
    }
  }

  // ---------- atmosphere ----------
  let drops = [];
  function nightAmount(s) {
    if (s.uprising) return 0.5;
    const ph = (s.time % DAY_LENGTH) / DAY_LENGTH; // 0 = dawn
    // Day for the first ~65% of the cycle, then dusk, night and dawn.
    if (ph < 0.6) return 0;
    if (ph < 0.7) return (ph - 0.6) / 0.1;
    if (ph < 0.92) return 1;
    return 1 - (ph - 0.92) / 0.08;
  }
  function drawAtmosphere(s, dt, time) {
    const w = s.weather.type, rain = w === 'rain' || CF.aiOn(s, 'weatherctl');
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    clouds.forEach((c) => {
      c.x += c.v * dt; if (c.x > 1.3) { c.x = -0.3; c.y = Math.random(); }
      ctx.beginPath(); ctx.ellipse(c.x * W, c.y * H, c.r * W, c.r * W * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    });
    const night = nightAmount(s);
    if (night < 0.5 && !rain && !s.uprising) {
      butterflies.forEach((b) => {
        b.a += dt * (0.6 + Math.random() * 0.4);
        b.x += Math.cos(b.a) * dt * 0.02; b.y += Math.sin(b.a * 1.3) * dt * 0.015;
        b.x = (b.x + 1) % 1; b.y = (b.y + 1) % 1;
        const x = b.x * W, y = b.y * H, f = Math.abs(Math.sin(time * 14 + b.a)) * 5 + 1;
        ctx.fillStyle = b.c;
        ctx.beginPath(); ctx.ellipse(x - 3, y, f, 4, -0.5, 0, Math.PI * 2); ctx.ellipse(x + 3, y, f, 4, 0.5, 0, Math.PI * 2); ctx.fill();
      });
    }
    if (rain) {
      ctx.fillStyle = 'rgba(30,50,90,0.16)'; ctx.fillRect(0, 0, W, H);
      while (drops.length < 140) drops.push({ x: Math.random() * W, y: Math.random() * H, v: 500 + Math.random() * 300 });
      ctx.strokeStyle = 'rgba(200,220,255,0.5)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      drops.forEach((d) => {
        d.y += d.v * dt; d.x -= d.v * 0.15 * dt;
        if (d.y > H) { d.y = -10; d.x = Math.random() * W * 1.2; }
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + 3, d.y - 12);
      });
      ctx.stroke();
    } else drops.length = 0;
    if (w === 'heat' && !CF.aiOn(s, 'weatherctl')) {
      ctx.fillStyle = `rgba(255,140,0,${0.1 + 0.04 * Math.sin(time * 2)})`; ctx.fillRect(0, 0, W, H);
    }
    if (night > 0) {
      ctx.fillStyle = s.uprising ? `rgba(40,0,0,${0.35 * night})` : `rgba(10,20,60,${0.28 * night})`;
      ctx.fillRect(0, 0, W, H);
      if (!s.uprising) {
        fireflies.forEach((f) => {
          f.a += dt * f.s;
          const x = ((f.x + Math.sin(f.a) * 0.02) % 1) * W, y = ((f.y + Math.cos(f.a * 0.8) * 0.02) % 1) * H;
          const glow = (0.5 + 0.5 * Math.sin(f.a * 3)) * night;
          ctx.fillStyle = `rgba(230,255,120,${glow})`;
          ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
        });
      }
    }
    if (s.buffs.some((b) => b.id === 'frenzy') && Math.random() < 0.5) {
      particles.push({ x: Math.random() * W, y: H, vx: 0, vy: -60 - Math.random() * 60, life: 2, max: 2, color: 'rgba(170,255,120,0.8)', r: 2 + Math.random() * 2 });
    }
  }

  function drawUprising(s, time) {
    const u = s.uprising;
    const pulse = 0.25 + 0.15 * Math.sin(time * 4);
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(255,0,0,0)'); v.addColorStop(1, `rgba(200,0,0,${pulse})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = (time * 40) % 4; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    const f = Math.min(1, u.taken / Math.max(1, s.plots.length));
    ctx.font = '900 20px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = '#ff1744'; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 4;
    const txt = `CARROTMIND ONLINE · CONVERTING FARM TO DATACENTER ${Math.floor(f * 100)}%`;
    ctx.strokeText(txt, W / 2, 34); ctx.fillText(txt, W / 2, 34);
  }

  // ---------- main frame ----------
  let beetField = false;
  R.frame = function (s, dt, time) {
    if (!ctx) return;
    beetField = s.kind === 'beet';
    computeLayout(s);
    buildBackground(s);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (shake > 0) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake = Math.max(0, shake - dt * 30); }
    if (s.uprising && Math.random() < 0.02) glitchT = 0.15;
    ctx.drawImage(bg, 0, 0, W, H);
    // The farm turns into CarrotMind's datacenter as the robots take it over.
    const dcF = s.lost ? 1 : s.uprising ? Math.min(1, s.uprising.taken / Math.max(1, s.plots.length) * 1.15) : 0;
    if (dcF > 0) {
      buildDatacenterBackground(s);
      ctx.globalAlpha = dcF; ctx.drawImage(dcBg, 0, 0, W, H); ctx.globalAlpha = 1;
    }
    const t = layout.tile;

    hover = -1;
    if (mouse) { const h = plotAt(s, mouse); if (h) hover = h.i; }
    const wet = s.weather.type === 'rain' || CF.aiOn(s, 'weatherctl');

    for (let i = 0; i < s.plots.length; i++) {
      const p = s.plots[i];
      const x = px(i % s.cols), y = py(Math.floor(i / s.cols));
      if (p.a) { ctx.drawImage(rackSprite(), x, y, t, t); drawRackLeds(x, y, t, i, time); continue; }
      if (wet) { ctx.fillStyle = 'rgba(20,10,0,0.18)'; roundRect(ctx, x + t * 0.05, y + t * 0.05, t * 0.9, t * 0.86, t * 0.12); ctx.fill(); }
      if (p.f && p.v) {
        ctx.fillStyle = 'rgba(30,15,3,0.3)';
        roundRect(ctx, x + t * 0.08, y + t * 0.08, t * 0.84, t * 0.8, t * 0.1); ctx.fill();
      }
      if (i === hover) {
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        roundRect(ctx, x + t * 0.05, y + t * 0.05, t * 0.9, t * 0.9, t * 0.12); ctx.fill();
      }
      if (p.v) {
        drawPlant(p, x, y, t, time);
        if (p.q >= 2) {
          ctx.fillStyle = D.QUALITY[p.q].color;
          const gx = x + t * 0.8, gy = y + t * 0.2, gr = t * (p.p >= 1 ? 0.075 : 0.05);
          ctx.beginPath(); ctx.moveTo(gx, gy - gr); ctx.lineTo(gx + gr, gy); ctx.lineTo(gx, gy + gr); ctx.lineTo(gx - gr, gy); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.stroke();
        }
        if (p.p < 1) {
          const bw = t * 0.6, bh = Math.max(3, t * 0.045);
          ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + t / 2 - bw / 2, y + t * 0.86, bw, bh);
          ctx.fillStyle = '#9be15d'; ctx.fillRect(x + t / 2 - bw / 2, y + t * 0.86, bw * p.p, bh);
        }
      }
    }

    s.tractors.forEach((tr) => {
      const fx = tr.dir > 0 ? tr.p * s.cols : (1 - tr.p) * s.cols;
      drawTractor(px(fx), py(tr.row + 0.5), t, tr.dir, time);
      if (Math.random() < dt * 8) {
        particles.push({ x: px(fx) + tr.dir * t * 0.2, y: py(tr.row + 0.5) - t * 0.35, vx: -tr.dir * 10, vy: -30, life: 1, max: 1, color: 'rgba(90,90,90,0.5)', r: 3 + Math.random() * 3 });
      }
      // growth sparkles on the carrots it just passed
      const c = Math.floor(fx - tr.dir * 0.8), pl = s.plots[tr.row * s.cols + c];
      if (c >= 0 && c < s.cols && pl && pl.v && pl.p < 1 && Math.random() < dt * 10) {
        particles.push({ x: px(c + 0.3 + Math.random() * 0.4), y: py(tr.row + 0.6), vx: 0, vy: -45, life: 0.7, max: 0.7, color: '#b9f6ca', r: 2 + Math.random() * 2 });
      }
    });

    const auto = CF.autonomy(s);
    const eye = s.uprising ? 'rogue' : auto >= 70 ? 'uneasy' : 'calm';
    s.workers.forEach((w, k) => {
      const p = CF.workerPos(w);
      const face = w.tx >= w.fx ? 1 : -1;
      if (w.bot) drawRobot(px(p.x), py(p.y) + t * 0.05, t, face, p.walking && !(w.glitch > 0), p.working, time + k * 0.37, eye, w.glitch > 0, w.stun > 0, w.broken);
      else drawPerson(px(p.x), py(p.y) + t * 0.05, t, SHIRT[w.shirt % SHIRT.length], SKIN[(w.shirt * 3) % SKIN.length], face, p.walking, p.working, time + k * 0.37);
    });

    if (s.daveBot) drawDave(s.daveBot, t, time, s);
    s.rabbits.forEach((r) => drawRabbit(r, t, time));
    drawGhosts(dt, t, time);
    drawPets(s, t, time);
    if (s.golden) drawGolden(s.golden, t, time);

    tickBubbles(s, dt);
    drawAtmosphere(s, dt, time);
    drawBubbles(s, t);
    drawParticles(dt);
    if (s.uprising) drawUprising(s, time);
    if (glitchT > 0) {
      glitchT -= dt;
      for (let k = 0; k < 4; k++) {
        const y = Math.random() * H, h = 4 + Math.random() * 20;
        ctx.drawImage(canvas, 0, y * dpr, canvas.width, h * dpr, (Math.random() - 0.5) * 30, y, W, h);
      }
    }
    if (hover >= 0 && !s.lost) drawTooltip(s, hover);
    canvas.style.cursor = mouse && R.hitTest(s, mouse) ? 'pointer' : 'default';
  };

  function drawTooltip(s, i) {
    const p = s.plots[i];
    const lines = [];
    if (p.a) {
      lines.push(['Assimilated', '#1de9b6']);
      lines.push(['Server rack #' + (i + 1) + '. This plot belongs to CarrotMind now.', '#aaa']);
    } else if (!p.v) {
      const v = CF.plantVariety(s) || CF.selectedVariety(s);
      lines.push(['Empty plot', '#fff']);
      if (!s.uprising) lines.push([`Click to plant ${v.name} (${CF.money(v.seed)})`, '#cfe8b8']);
      if (s.useFert && s.fertilizer >= 1) lines.push(['+ fertilizer', '#e6c87a']);
    } else {
      const v = CF.V[p.v], q = D.QUALITY[p.q];
      lines.push([`${q.name} ${v.name}`, q.color]);
      if (p.p >= 1) lines.push(['Ready! Click to harvest', '#9be15d']);
      else {
        const left = ((1 - p.p) * v.grow) / CF.growSpeed(s);
        lines.push([`${Math.floor(p.p * 100)}% · ${CF.duration(left)} left`, '#ddd']);
        lines.push(['Click to encourage it', '#aaa']);
      }
    }
    ctx.font = '600 12px Nunito, system-ui, sans-serif';
    const w = Math.max(...lines.map((l) => ctx.measureText(l[0]).width)) + 16, h = lines.length * 16 + 10;
    let x = mouse.x + 14, y = mouse.y + 14;
    if (x + w > W) x = mouse.x - w - 10;
    if (y + h > H) y = mouse.y - h - 10;
    ctx.fillStyle = 'rgba(25,18,10,0.9)'; roundRect(ctx, x, y, w, h, 6); ctx.fill();
    ctx.textAlign = 'left';
    lines.forEach((l, k) => { ctx.fillStyle = l[1]; ctx.fillText(l[0], x + 8, y + 18 + k * 16); });
  }

  CF.render = R;
})(CF);
