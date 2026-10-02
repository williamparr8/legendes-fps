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
