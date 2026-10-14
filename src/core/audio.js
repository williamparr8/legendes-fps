// SFX procéduraux WebAudio (aucun asset). Contexte créé au premier clic.
let ctx = null, master = null, vol = 0.7;
export function setVolume(v) { vol = v; if (master) master.gain.value = v; }
function ac() {
  if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination); }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
addEventListener('pointerdown', () => ac(), { once: true });

function tone(freq, endFreq, dur, type = 'sine', vol = 0.15) {
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur);
}

export const sfx = {
  jump: () => tone(220, 340, 0.12, 'triangle', 0.1),
  land: (power) => tone(120, 50, 0.15, 'sine', Math.min(0.3, 0.05 + power * 0.01)),
  pad: () => tone(200, 900, 0.3, 'square', 0.08),
  zip: () => tone(500, 300, 0.12, 'sawtooth', 0.05),
  slide: () => tone(300, 90, 0.4, 'sawtooth', 0.04),
  mantle: () => tone(160, 260, 0.2, 'triangle', 0.1),
};

// ---- sons spatialisés à base de bruit filtré (tirs, impacts, explosions, rechargement) ----
// Atténuation par la distance à l'auditeur (le joueur) ; limitation par source pour ne pas saturer (fusil à pompe = 8 rayons).
let lx = 0, ly = 0, lz = 0, noise = null;
const seen = new Float64Array(64);
export function setListener(x, y, z) { lx = x; ly = y; lz = z; }
function nbuf(c) {
  if (!noise) { noise = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  return noise;
}
function gainAt(x, y, z, ref) {
  const d = Math.hypot(x - lx, y - ly, z - lz);
  return d > 220 ? 0 : ref / (1 + d / 14);
}
function gate(key, gap) {
  const c = ctx ? ctx.currentTime : 0, i = key & 63;
  if (c - seen[i] < gap) return false;
  seen[i] = c; return true;
}
// Rafale de bruit : filtre balayé f0→f1 (Hz), enveloppe exponentielle, + « coup » grave optionnel.
function burst(g, f0, f1, dur, type = 'lowpass', q = 0.8, thump = 0) {
  if (g < 0.003) return;
  const c = ac(), t = c.currentTime;
  const s = c.createBufferSource(); s.buffer = nbuf(c); s.loop = true;
  const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const e = c.createGain();
  e.gain.setValueAtTime(g, t); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(e).connect(master);
  s.start(t, Math.random() * 0.8); s.stop(t + dur + 0.02);
  if (thump) tone(thump, thump * 0.4, Math.min(dur, 0.18), 'sine', g * 0.9);
}
const SHOT = { // [niveau, f0, f1, durée, coup grave]
  rifle: [0.5, 5200, 500, 0.16, 140], smg: [0.38, 6500, 800, 0.1, 170], shotgun: [0.8, 4200, 260, 0.28, 90], sniper: [0.9, 3600, 200, 0.5, 70],
  pistol: [0.34, 4600, 700, 0.1, 190], lmg: [0.58, 4300, 380, 0.22, 100],
};
export function shotKind(d) { return d.pellets > 1 ? 'shotgun' : d.dmg >= 40 ? 'sniper' : d.rpm >= 900 ? 'smg' : d.mag <= 16 && !d.auto ? 'pistol' : d.mag >= 50 ? 'lmg' : 'rifle'; }
Object.assign(sfx, {
  shot(x, y, z, kind) {
    if (!gate((kind.length * 31 + Math.round(x) * 7 + Math.round(z) * 13) | 0, kind === 'shotgun' ? 0.06 : 0.025)) return;
    const s = SHOT[kind] || SHOT.rifle, g = gainAt(x, y, z, s[0]);
    burst(g, s[1], s[2], s[3], 'lowpass', 0.9, s[4]);
    if (g > 0.05) burst(g * 0.5, 1200, 300, s[3] * 1.8, 'bandpass', 0.6); // écho / queue
  },
  boom(x, y, z) { const g = gainAt(x, y, z, 1.1); burst(g, 1800, 60, 1.1, 'lowpass', 0.7, 60); },
  hit(kind) { tone(kind === 1 ? 1700 : kind === 2 ? 900 : 1200, kind === 2 ? 400 : 900, kind === 2 ? 0.2 : 0.06, 'square', kind === 2 ? 0.12 : 0.07); },
  hurt() { burst(0.45, 700, 120, 0.18, 'lowpass', 1, 90); },
  reload() { burst(0.2, 3000, 1500, 0.04, 'bandpass', 4); setTimeout(() => burst(0.25, 2400, 1200, 0.06, 'bandpass', 4, 220), 420); },
  // Pas : bruit court et sourd ; ceux des autres acteurs ne s'entendent que dans un rayon de 38 m.
  step(x, y, z, v = 0.3) {
    if (Math.hypot(x - lx, y - ly, z - lz) > 38) return;
    burst(gainAt(x, y, z, v), 650 + Math.random() * 350, 200, 0.07, 'lowpass', 0.9, 0);
  },
  kill() { tone(520, 1040, 0.12, 'square', 0.09); setTimeout(() => tone(780, 1560, 0.14, 'square', 0.08), 70); },
  heart() { tone(70, 45, 0.12, 'sine', 0.22); setTimeout(() => tone(60, 40, 0.14, 'sine', 0.18), 160); },
  ping() { tone(880, 1320, 0.09, 'triangle', 0.08); setTimeout(() => tone(1320, 1320, 0.08, 'triangle', 0.06), 90); },
  pickup() { tone(620, 940, 0.07, 'sine', 0.05); },
  heal() { tone(520, 780, 0.25, 'sine', 0.1); setTimeout(() => tone(780, 1040, 0.2, 'sine', 0.08), 130); },
});
