import * as THREE from 'three';

// Chargement visible : suivi de toutes les ressources chargées par les chargeurs three (textures, modèles) via le gestionnaire par
// défaut, fenêtre de progression plein écran (Loader) pour les actions qui attendent (ouverture de la boutique, lancement de partie)
// et pastille discrète (Loader.chip) pendant le téléchargement de fond au démarrage.
export const assets = { loaded: 0, total: 0, active: false };
const subs = new Set();
const emit = () => { for (const f of subs) f(assets); };
const M = THREE.DefaultLoadingManager;
M.onStart = (url, l, t) => { assets.loaded = l; assets.total = t; assets.active = true; emit(); };
M.onProgress = (url, l, t) => { assets.loaded = l; assets.total = t; emit(); };
M.onLoad = () => { assets.active = false; emit(); };

// Résout quand plus aucune ressource n'est en cours de chargement (ou après `timeout` ms).
export function whenIdle(onProgress = null, timeout = 25000) {
  return new Promise((res) => {
    if (!assets.active) { res(); return; }
    let done = false;
    const fin = () => { if (done) return; done = true; subs.delete(f); clearTimeout(t); res(); };
    const f = (a) => { if (onProgress) onProgress(a.total ? a.loaded / a.total : 1, a.loaded, a.total); if (!a.active) fin(); };
    const t = setTimeout(fin, timeout);
    subs.add(f);
  });
}

let el = null, fill = null, pct = null, title = null, detail = null, chip = null;
function build() {
  if (el) return;
  el = document.createElement('div'); el.id = 'loader';
  el.innerHTML = '<div class="ld-box"><b class="ld-title"></b><div class="ld-bar"><i></i></div><span class="ld-pct">0 %</span><small class="ld-detail"></small></div>';
  document.body.appendChild(el);
  fill = el.querySelector('.ld-bar i'); pct = el.querySelector('.ld-pct'); title = el.querySelector('.ld-title'); detail = el.querySelector('.ld-detail');
  chip = document.createElement('div'); chip.id = 'ld-chip'; chip.innerHTML = '<span></span><div class="ld-bar"><i></i></div>';
  document.body.appendChild(chip);
}

export const Loader = {
  get visible() { return !!el && el.classList.contains('on'); },
  show(t) { build(); title.textContent = t; this.set(0, ''); el.classList.add('on'); },
  // p : 0..1 ; d : détail (ex. « Textures 12 / 38 »)
  set(p, d = null) {
    if (!el) return;
    const v = Math.max(0, Math.min(1, p || 0));
    fill.style.width = (v * 100).toFixed(0) + '%'; pct.textContent = Math.round(v * 100) + ' %';
    if (d !== null) detail.textContent = d;
  },
  hide() { if (el) el.classList.remove('on'); },
  // Pastille de fond (non bloquante) : p ∈ [0,1), null pour la cacher.
  chip(p, text = '') {
    build();
    if (p === null || p >= 1) { chip.classList.remove('on'); return; }
    chip.classList.add('on');
    chip.firstChild.textContent = text + ' ' + Math.round(p * 100) + ' %';
    chip.querySelector('i').style.width = (p * 100).toFixed(0) + '%';
  },
};

// Attend le prochain affichage (laisse le temps au navigateur de dessiner la progression avant un long calcul synchrone) ; ne reste pas bloqué
// si l'onglet est masqué (requestAnimationFrame y est suspendu).
export const nextFrame = () => new Promise((r) => { let d = false; const f = () => { if (!d) { d = true; r(); } }; requestAnimationFrame(() => setTimeout(f, 0)); setTimeout(f, 120); });
