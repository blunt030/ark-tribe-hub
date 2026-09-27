/**
 * Töne im Geist der Original-Piepser – aber weicher. Alles wird live mit
 * WebAudio erzeugt, es werden keine Audiodateien geladen. Die Einstellung gilt
 * pro Gerät (localStorage) und steuert auch die Vibration auf Mobilgeräten.
 */
const KEY = 'ath_tama_sound';
let ctx = null;
let master = null;

export function soundOn() {
  try { return localStorage.getItem(KEY) !== '0'; } catch { return true; }
}

export function setSoundOn(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* privater Modus */ }
}

function audio() {
  if (!ctx) {
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.11;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(c, { f, t = 0, d = 0.08, type = 'square', v = 1, to = null }) {
  const start = c.currentTime + t;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, start);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, start + d);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(v, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + d);
  osc.connect(gain).connect(master);
  osc.start(start);
  osc.stop(start + d + 0.02);
}

function noise(c, { t = 0, d = 0.08, v = 0.6, freq = 1200 }) {
  const start = c.currentTime + t;
  const buffer = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * d)), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  const gain = c.createGain();
  gain.gain.value = v;
  src.connect(filter).connect(gain).connect(master);
  src.start(start);
}

const seq = (notes, type = 'square', d = 0.08, gap = 0.09) => notes.map((f, i) => ({ f, t: i * gap, d, type }));

const SFX = {
  tick: [{ f: 1900, d: 0.03, v: 0.5 }],
  select: seq([1320, 1760], 'square', 0.05, 0.05),
  back: seq([1100, 820], 'square', 0.05, 0.05),
  call: seq([2350, 2350, 2350], 'square', 0.07, 0.14),
  happy: seq([784, 988, 1175, 1568], 'triangle', 0.09, 0.08),
  sad: [{ f: 520, to: 300, d: 0.35, type: 'triangle' }],
  refuse: seq([420, 360], 'square', 0.07, 0.1),
  hatch: seq([523, 659, 784, 1046, 1318, 1568], 'triangle', 0.1, 0.07),
  evolve: seq([523, 523, 784, 1046, 988, 1046], 'square', 0.1, 0.11),
  secret: seq([1046, 1318, 1568, 2093, 1568, 2093], 'triangle', 0.1, 0.08),
  cure: [{ f: 600, to: 1400, d: 0.25, type: 'sine' }, { f: 1600, t: 0.22, d: 0.12, type: 'triangle' }],
  scold: [{ f: 180, d: 0.18, type: 'sawtooth', v: 0.7 }, { f: 150, t: 0.2, d: 0.2, type: 'sawtooth', v: 0.7 }],
  win: seq([659, 784, 1046, 1318], 'square', 0.08, 0.08),
  lose: seq([659, 587, 523], 'triangle', 0.1, 0.11),
  cryo: [{ f: 1800, to: 500, d: 0.6, type: 'sine', v: 0.8 }],
  thaw: [{ f: 400, to: 1600, d: 0.6, type: 'sine', v: 0.8 }],
  end: seq([659, 587, 523, 440, 392], 'triangle', 0.18, 0.2),
  poop: [{ f: 300, to: 180, d: 0.12, type: 'square', v: 0.6 }],
  cuddle: seq([880, 1175], 'sine', 0.12, 0.1),
};

export function sfx(name) {
  if (!soundOn()) return;
  const c = audio();
  if (!c) return;
  if (name === 'eat') {
    for (let i = 0; i < 3; i++) noise(c, { t: i * 0.16, d: 0.07, freq: 900 + i * 200 });
    return;
  }
  if (name === 'clean') {
    noise(c, { d: 0.5, v: 0.35, freq: 2400 });
    return;
  }
  for (const n of SFX[name] || SFX.tick) tone(c, n);
}

export function buzz(pattern = 12) {
  if (!soundOn()) return;
  try { globalThis.navigator?.vibrate?.(pattern); } catch { /* nicht unterstützt */ }
}
