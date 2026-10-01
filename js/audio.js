// Tiny WebAudio synth for game sounds. No audio files needed.
var CF = globalThis.CF = globalThis.CF || {};

(function (CF) {
  let ac = null, master = null;
  const last = {};
  const A = { muted: false };

  function ensure() {
    if (ac) return true;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    ac = new Ctx();
    master = ac.createGain();
    master.gain.value = 0.25;
    master.connect(ac.destination);
    return true;
  }
  A.unlock = function () { if (ensure() && ac.state === 'suspended') ac.resume(); };

  function tone(freq, dur, type = 'sine', vol = 1, slide = 0, delay = 0) {
    const t0 = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  const SOUNDS = {
    plant: () => tone(180 + Math.random() * 30, 0.08, 'triangle', 0.5, -60),
    harvest: () => tone(520 + Math.random() * 120, 0.09, 'square', 0.18, 300),
    encourage: () => tone(700 + Math.random() * 200, 0.05, 'sine', 0.2, 200),
    sell: () => { tone(880, 0.1, 'square', 0.2); tone(1320, 0.18, 'square', 0.2, 0, 0.07); },
    buy: () => { [523, 659, 784].forEach((f, i) => tone(f, 0.12, 'triangle', 0.35, 0, i * 0.05)); },
    rabbit: () => tone(1400, 0.12, 'sine', 0.25, 800),
    shoo: () => { tone(300, 0.15, 'sawtooth', 0.2, -150); tone(1600, 0.08, 'sine', 0.2, 0, 0.05); },
    golden: () => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.2, 'triangle', 0.35, 0, i * 0.07)); },
    achievement: () => { [659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'sine', 0.4, 0, i * 0.1)); },
    legendary: () => { [1046, 1318, 1568, 2093].forEach((f, i) => tone(f, 0.25, 'triangle', 0.3, 0, i * 0.06)); },
    mail: () => { tone(988, 0.1, 'sine', 0.3); tone(1318, 0.15, 'sine', 0.3, 0, 0.1); },
    zap: () => { tone(2400, 0.25, 'sawtooth', 0.2, -2200); tone(90, 0.3, 'square', 0.2, -40, 0.05); },
    error: () => tone(140, 0.12, 'square', 0.15, -40),
  };
  const MIN_GAP = { harvest: 0.04, plant: 0.04, encourage: 0.03, sell: 0.1 };

  A.play = function (name) {
    if (A.muted || !ac || ac.state !== 'running' || !SOUNDS[name]) return;
    const now = ac.currentTime;
    if (last[name] && now - last[name] < (MIN_GAP[name] || 0.05)) return;
    last[name] = now;
    SOUNDS[name]();
  };

  CF.audio = A;
})(CF);
