import * as THREE from 'three';

// Styles de skin (motifs réels sur le modèle, pas seulement une teinte) : 1 camouflage, 2 rayures, 3 flammes, 4 circuit néon,
// 5 or / chrome à paillettes, 6 galaxie, 7 fibre de carbone hexagonale, 8 camouflage numérique ; exclusifs du Pass (animés) :
// 9 aurore boréale, 10 magma, 11 prisme, 12 hologramme, 13 éveil (veines d'énergie).
// Le motif est calculé dans le fragment shader à partir de la position de repos (avant déformation du squelette) en mètres.
export const STYLE_NAMES = ['Uni', 'Camouflage', 'Rayures', 'Flammes', 'Circuit néon', 'Or à paillettes', 'Galaxie', 'Carbone', 'Pixels', 'Aurore', 'Magma', 'Prisme', 'Hologramme', 'Éveil'];

// Temps partagé par tous les matériaux animés (secondes).
const SKT = { value: 0 };
if (typeof requestAnimationFrame === 'function') { const tk = () => { SKT.value = performance.now() / 1000 % 4096; requestAnimationFrame(tk); }; tk(); }

const GLSL_FN = `
varying vec3 vSkP;
uniform float uSkStyle, uSkGlowI, uSkT; uniform vec3 uSk1, uSk2, uSk3, uSkGl;
vec3 skGlow;
float skH(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float skN(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(skH(i), skH(i + vec3(1,0,0)), f.x), mix(skH(i + vec3(0,1,0)), skH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(skH(i + vec3(0,0,1)), skH(i + vec3(1,0,1)), f.x), mix(skH(i + vec3(0,1,1)), skH(i + vec3(1,1,1)), f.x), f.y), f.z); }
float skF(vec3 p){ return skN(p) * 0.55 + skN(p * 2.1) * 0.3 + skN(p * 4.3) * 0.15; }
`;

const GLSL_COLOR = `
  skGlow = vec3(0.0);
  if (uSkStyle > 0.5) {
    vec3 q = vSkP;
    float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    vec3 col = uSk1; float gl = 0.0;
    if (uSkStyle < 1.5) {                         // camouflage
      col = mix(uSk1, uSk2, step(0.46, skF(q * 3.2))); col = mix(col, uSk3, step(0.6, skF(q * 2.4 + 9.0)));
    } else if (uSkStyle < 2.5) {                  // rayures de tigre
      float s = sin(q.y * 20.0 + skF(q * 3.0) * 7.0 + q.x * 5.0);
      col = mix(uSk1, uSk3, smoothstep(-0.15, 0.15, s)); gl = smoothstep(0.88, 1.0, s) * 0.8;
    } else if (uSkStyle < 3.5) {                  // flammes montant des jambes
      float fl = skF(vec3(q.x * 4.0, q.y * 2.6, q.z * 4.0));
      float heat = smoothstep(0.1, 0.9, fl * 1.7 - q.y * 0.75 + 0.3);
      col = mix(uSk3, mix(uSk1, vec3(1.0, 0.85, 0.3), smoothstep(0.55, 1.0, heat)), heat); gl = heat * 1.3;
    } else if (uSkStyle < 4.5) {                  // circuit néon
      vec3 g = abs(fract(q * 6.0) - 0.5);
      float line = max(smoothstep(0.4, 0.48, g.x), smoothstep(0.4, 0.48, g.y));
      col = mix(uSk3, mix(uSkGl, uSk2, step(0.5, fract(q.y * 3.0))), line); gl = line * 1.6;
    } else if (uSkStyle < 5.5) {                  // or : paillettes
      col = uSk1 * (0.75 + 0.6 * skN(q * 70.0)) ; col = mix(col, uSk2, step(0.93, skH(floor(q * 90.0))) );
    } else if (uSkStyle < 6.5) {                  // galaxie
      col = mix(uSk3, uSk1, skF(q * 2.2)); gl = smoothstep(0.55, 0.95, skF(q * 3.5 + 3.0)) * 0.55 + step(0.975, skH(floor(q * 70.0))) * 2.2;
    } else if (uSkStyle < 7.5) {                  // carbone hexagonal
      vec2 w = vec2(q.x * 36.0 + q.z * 36.0, q.y * 36.0);
      float ch = mod(floor(w.x) + floor(w.y), 2.0);
      col = mix(uSk3, uSk2, ch * 0.7); gl = step(0.92, fract(w.y * 0.25)) * 0.6;
    } else if (uSkStyle < 8.5) {                  // camouflage numérique (pixels)
      vec3 pq = floor(q * 14.0) / 14.0;
      col = mix(uSk1, uSk2, step(0.46, skF(pq * 3.2))); col = mix(col, uSk3, step(0.58, skF(pq * 2.4 + 9.0)));
    } else if (uSkStyle < 9.5) {                  // aurore boréale : rideaux ondulants
      float w = sin(q.y * 7.0 + skF(q * 2.0 + vec3(0.0, uSkT * 0.15, 0.0)) * 6.0 + uSkT * 0.9);
      float w2 = sin(q.y * 4.0 - q.x * 3.0 + uSkT * 0.6);
      col = mix(uSk3, mix(uSk1, uSk2, 0.5 + 0.5 * w2), smoothstep(-0.4, 0.8, w));
      gl = smoothstep(0.0, 1.0, w) * 0.9;
    } else if (uSkStyle < 10.5) {                 // magma : roche noire, fissures incandescentes qui pulsent
      float f = skF(q * 4.0 + 2.0);
      float crack = 1.0 - smoothstep(0.0, 0.07, abs(f - 0.5));
      col = mix(uSk3, uSk2 * (0.4 + skF(q * 9.0)), 0.8);
      col = mix(col, mix(uSk1, vec3(1.0, 0.9, 0.4), crack), crack);
      gl = crack * (1.3 + 0.5 * sin(uSkT * 2.0 + q.y * 5.0));
    } else if (uSkStyle < 11.5) {                 // prisme : facettes irisées
      vec3 fq = floor(q * 9.0);
      float h = skH(fq) + uSkT * 0.05 + q.y * 0.3;
      vec3 rb = 0.5 + 0.5 * cos(6.2832 * (h + vec3(0.0, 0.33, 0.67)));
      col = mix(uSk3, rb, 0.75); gl = step(0.9, skH(fq + 3.0)) * 1.4;
    } else if (uSkStyle < 12.5) {                 // hologramme : lignes de balayage + scintillement
      float sc = fract(q.y * 28.0 - uSkT * 0.7);
      float band = smoothstep(0.0, 0.1, sc) * (1.0 - smoothstep(0.55, 0.6, sc));
      float flick = 0.85 + 0.15 * sin(uSkT * 31.0);
      col = mix(uSk3, uSk1, band) * flick; gl = band * 1.1 * flick + step(0.985, skH(floor(q * 40.0 + uSkT))) * 1.5;
    } else {                                      // éveil : veines d'énergie dorées / violettes
      float v = sin(q.x * 9.0 + skF(q * 2.5) * 8.0 + uSkT * 1.2) * sin(q.y * 7.0 + skF(q * 3.0 + 5.0) * 6.0 - uSkT * 0.8);
      float vein = 1.0 - smoothstep(0.0, 0.18, abs(v));
      col = mix(uSk3, uSk2, 0.3 + 0.7 * skF(q * 5.0));
      col = mix(col, mix(uSk1, vec3(1.0, 0.95, 0.7), vein), vein);
      gl = vein * 1.7 + 0.15 * skF(q * 6.0 + uSkT);
    }
    diffuseColor.rgb = mix(diffuseColor.rgb, col * (0.5 + 0.95 * lum), 0.92);
    skGlow = uSkGl * gl;
  }`;

export function makeSkinUniforms() {
  return { uSkStyle: { value: 0 }, uSkGlowI: { value: 1 }, uSk1: { value: new THREE.Color() }, uSk2: { value: new THREE.Color() }, uSk3: { value: new THREE.Color() }, uSkGl: { value: new THREE.Color() } };
}

// Injecte le motif dans un matériau standard (en chaînant un éventuel onBeforeCompile existant). posVar : attribut de position à utiliser,
// pre : transformation à appliquer (échelle en mètres + origine) via les uniformes de position.
export function skinFx(mat, uni, scaleU) {
  if (mat.userData.skinFx) return mat;
  mat.userData.skinFx = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, uni, { uSkScale: scaleU.k, uSkOff: scaleU.o, uSkT: SKT });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSkP; uniform float uSkScale; uniform vec3 uSkOff;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkP = (position - uSkOff) * uSkScale;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_FN)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + GLSL_COLOR)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += skGlow * uSkGlowI;');
  };
  mat.customProgramCacheKey = () => 'skinfx' + (prev ? 'D' : '');
  mat.needsUpdate = true;
  return mat;
}

// Renseigne les uniformes depuis une entrée de skins.json ; kind 'p' (personnage : p[]) ou 'w' (arme : w[]).
export function setSkinStyle(uni, def, kind) {
  if (!def || !def.s) { uni.uSkStyle.value = 0; return 0; }
  const a = def[kind];
  uni.uSkStyle.value = def.s;
  if (kind === 'p') { uni.uSk1.value.set(a[2]); uni.uSk2.value.set(a[0]); uni.uSk3.value.set(a[1]); uni.uSkGl.value.set(a[5]); }
  else { uni.uSk1.value.set(a[0]); uni.uSk2.value.set(a[2]); uni.uSk3.value.set(a[1]); uni.uSkGl.value.set(a[5]); }
  if (def.s === 4 || def.s === 6) uni.uSk2.value.set(a[7] || a[5]);
  if (def.s === 5) uni.uSk2.value.set(a[5]);
  uni.uSkGlowI.value = 0.6 + Math.min(def.r, 3) * 0.5;
  return def.s;
}
