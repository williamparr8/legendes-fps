import * as THREE from 'three';

// Matériaux PBR à textures photo (ambientCG, CC0 ; préparées par tools/make_textures.mjs : <nom>_c.jpg couleur, <nom>_n.jpg normale xy + rugosité).
// Projection « boîte » par la position monde (aucune UV nécessaire, pas d'étirement quelle que soit la taille de la boîte), normale
// par dérivées d'écran. La couleur d'instance sert de teinte relative (la photo garde sa luminosité propre).
const base = () => `${import.meta.env.BASE_URL}tex/`;
const cache = new Map();
function tex(name, srgb) {
  const key = name + srgb;
  if (cache.has(key)) return cache.get(key);
  const t = new THREE.TextureLoader().load(base() + name + (srgb ? '_c.jpg' : '_n.jpg'));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

// kind → { tex, scale (m par motif), ns (force du relief), tint (part de la teinte d'instance), metal }
export const PBR_KINDS = {
  0: { tex: 'concrete', scale: 3.0, ns: 1.0, tint: 0.7, metal: 0, br: 0.85 },
  1: { tex: 'wood', scale: 1.6, ns: 1.0, tint: 0.6, metal: 0, br: 0.9 },
  2: { tex: 'rock', scale: 3.0, ns: 1.2, tint: 0.5, metal: 0, br: 0.88 },
  3: { tex: 'tole', scale: 2.2, ns: 1.0, tint: 0.5, metal: 0.25, br: 1.0 },
  6: { tex: 'rock', scale: 2.4, ns: 1.2, tint: 0.4, metal: 0, br: 0.88 },
  9: { tex: 'brick', scale: 1.6, ns: 1.0, tint: 0.35, metal: 0, br: 0.95 },
  10: { tex: 'siding', scale: 1.8, ns: 1.0, tint: 0.6, metal: 0, br: 0.88 },
  11: { tex: 'tiles', scale: 2.0, ns: 1.0, tint: 0.55, metal: 0, br: 0.92 },
  12: { tex: 'plaster', scale: 2.5, ns: 0.8, tint: 0.75, metal: 0, br: 0.85 },
  13: { tex: 'metal', scale: 2.0, ns: 0.8, tint: 0.85, metal: 0.45, br: 0.8 },
  5: { tex: 'bark', scale: 1.1, ns: 1.3, tint: 0.55, metal: 0, br: 0.95 },
  14: { tex: 'rust', scale: 2.0, ns: 1.0, tint: 0.5, metal: 0.2, br: 0.9 },
};

const VERT_COMMON = '#include <common>\nvarying vec3 vWP2; varying vec3 vLN2; varying vec3 vED2;';
const VERT_BEGIN = `#include <begin_vertex>
  { vec4 wp = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      wp = instanceMatrix * wp;
    #endif
    vec3 sc = vec3(1.0);
    #ifdef USE_INSTANCING
      sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    #endif
    vWP2 = (modelMatrix * wp).xyz; vLN2 = abs(normal); vED2 = (0.5 - abs(position)) * sc; }`;

// Normale par dérivées d'écran (même formule que perturbNormal2Arb de three) à partir d'une normale tangente décodée.
const NORMAL_FN = `
vec3 tbnNormal(vec3 N, vec3 viewPos, vec2 uv, vec3 nm) {
  vec3 q0 = dFdx(-viewPos), q1 = dFdy(-viewPos);
  vec2 st0 = dFdx(uv), st1 = dFdy(uv);
  vec3 q1p = cross(q1, N), q0p = cross(N, q0);
  vec3 T = q1p * st0.x + q0p * st1.x, B = q1p * st0.y + q0p * st1.y;
  float det = max(dot(T, T), dot(B, B));
  float sc = det == 0.0 ? 0.0 : inversesqrt(det);
  return normalize(mat3(T * sc, B * sc, N) * nm);
}
vec3 unpackNM(vec3 t, float k) {
  vec2 xy = (t.xy * 2.0 - 1.0) * k;
  return normalize(vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy)))));
}`;

const cacheMat = new Map();
export function pbrMaterial(kind, flat = false) {
  const key = kind + (flat ? 'f' : '');
  if (cacheMat.has(key)) return cacheMat.get(key);
  const p = PBR_KINDS[kind];
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: p.metal, flatShading: flat });
  const uni = { uC: { value: tex(p.tex, true) }, uN: { value: tex(p.tex, false) }, uScale: { value: p.scale }, uNS: { value: p.ns }, uTint: { value: p.tint }, uBr: { value: p.br } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', VERT_COMMON).replace('#include <begin_vertex>', VERT_BEGIN);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uC, uN; uniform float uScale, uNS, uTint, uBr;
        varying vec3 vWP2; varying vec3 vLN2; varying vec3 vED2;
        vec2 tuv;` + NORMAL_FN)
      .replace('#include <color_fragment>', `
        {
          vec3 an = vLN2;
          tuv = (an.y > 0.7 ? vWP2.xz : (an.x > an.z ? vWP2.zy : vWP2.xy)) / uScale;
          vec3 t = texture2D(uC, tuv).rgb;
          vec3 tint = vec3(1.0);
          #ifdef USE_COLOR
            float mx = max(max(vColor.r, vColor.g), max(vColor.b, 0.001));
            tint = mix(vec3(1.0), vColor / mx, uTint) * mix(1.0, mx * 1.1, uTint * 0.5);
          #endif
          diffuseColor.rgb *= t * tint * uBr;
          // occlusion fictive : pied des murs (salissure, ombre de contact) et arêtes de la boîte
          float foot = an.y > 0.7 ? 1.0 : mix(0.62, 1.0, smoothstep(0.0, 1.4, vWP2.y));
          vec3 e = vED2; float ed = an.y > 0.7 ? min(e.x, e.z) : (an.x > an.z ? min(e.z, e.y) : min(e.x, e.y));
          diffuseColor.rgb *= foot * (0.86 + 0.14 * smoothstep(0.0, 0.22, ed));
        }`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(roughness * texture2D(uN, tuv).b, 0.05, 1.0);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = tbnNormal(normal, -vViewPosition, tuv, unpackNM(texture2D(uN, tuv).rgb, uNS));`);
  };
  cacheMat.set(key, mat);
  return mat;
}

// Terrain : herbe / terre (routes, abords des bâtiments) / sable / roche mélangés par un poids par sommet (attribut splat), teinté par
// la couleur de sommet (altitude, pente) ; relief de l'herbe par normale.
export function terrainPbr() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const uni = {
    uG: { value: tex('grass', true) }, uGN: { value: tex('grass', false) }, uD: { value: tex('soil', true) }, uM: { value: tex('moss', true) },
    uS: { value: tex('gravel', true) }, uR: { value: tex('rock', true) },
    uDN: { value: tex('soil', false) }, uSN: { value: tex('gravel', false) }, uRN: { value: tex('rock', false) },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP2; attribute vec4 splat; varying vec4 vSplat;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP2 = (modelMatrix * vec4(transformed, 1.0)).xyz; vSplat = splat;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uG, uGN, uD, uS, uR, uDN, uSN, uRN, uM;
        vec2 tuv2;
        varying vec3 vWP2; varying vec4 vSplat;
        vec2 tuv;` + NORMAL_FN)
      .replace('#include <color_fragment>', `
        {
          tuv = vWP2.xz / 3.2;
          vec4 w = vSplat; w /= max(w.x + w.y + w.z + w.w, 1e-3);
          // deux échelles tournées l'une par rapport à l'autre : plus de répétition visible ; détail fin proche
          tuv2 = mat2(0.8, -0.6, 0.6, 0.8) * vWP2.xz / 7.3;
          vec3 g = mix(texture2D(uG, tuv).rgb, texture2D(uG, tuv2).rgb, 0.5), d = mix(texture2D(uD, tuv * 0.7).rgb, texture2D(uD, tuv2 * 0.8).rgb, 0.5);
          vec3 s = mix(texture2D(uS, tuv * 0.8).rgb, texture2D(uS, tuv2 * 0.9).rgb, 0.5), r = mix(texture2D(uR, tuv * 0.5).rgb, texture2D(uR, tuv2 * 0.6).rgb, 0.5);
          g *= 0.8 + 0.4 * texture2D(uG, vWP2.xz * 0.9).g;
          // plaques de mousse / sol riche : rompt l'uniformité de l'herbe
          g = mix(g, texture2D(uM, tuv * 0.8).rgb * 1.1, smoothstep(0.5, 0.72, texture2D(uG, vWP2.xz / 29.0 + 0.37).r));
          // variation à grande échelle : casse la répétition
          float big = 0.85 + 0.3 * texture2D(uG, vWP2.xz / 41.0).g;
          vec3 t = (g * w.x + d * w.y + s * w.z + r * w.w) * big;
          float L = dot(vColor, vec3(0.3, 0.59, 0.11));
          vec3 tint = mix(vec3(1.0), vColor / max(L, 0.05), 0.55 + 0.35 * vSplat.z) * (0.7 + 0.6 * L);
          diffuseColor.rgb *= t * tint;
        }`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = 0.95;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec4 w = vSplat; w /= max(w.x + w.y + w.z + w.w, 1e-3);
          vec3 nm = unpackNM(texture2D(uGN, tuv).rgb, 0.9) * w.x + unpackNM(texture2D(uDN, tuv * 0.7).rgb, 0.8) * w.y
                  + unpackNM(texture2D(uSN, tuv * 0.8).rgb, 0.9) * w.z + unpackNM(texture2D(uRN, tuv * 0.5).rgb, 1.0) * w.w;
          normal = tbnNormal(normal, -vViewPosition, tuv, normalize(nm));
        }`);
  };
  return mat;
}

// Détail photo pour les armes : micro-relief et rugosité (métal brossé / polymère) projetés en espace objet (l'arme bouge, le grain la suit),
// grain sombre sur la couleur. kind : 'gunmetal' | 'rubber'. Le matériau garde sa couleur et son métal.
export function weaponDetail(mat, kind = 'gunmetal', scale = 0.16, ns = 0.9) {
  const uni = { uWN: { value: tex(kind, false) }, uWC: { value: tex(kind, true) }, uWS: { value: scale }, uWNS: { value: ns } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWL; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWL = position; vWN = abs(normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uWN, uWC; uniform float uWS, uWNS;
        varying vec3 vWL; varying vec3 vWN;
        vec2 wuv;` + NORMAL_FN)
      .replace('#include <color_fragment>', `#include <color_fragment>
        wuv = (vWN.y > max(vWN.x, vWN.z) ? vWL.xz : (vWN.x > vWN.z ? vWL.zy : vWL.xy)) / uWS;
        diffuseColor.rgb *= 0.55 + 0.9 * dot(texture2D(uWC, wuv).rgb, vec3(0.33));`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(roughness * (0.5 + texture2D(uWN, wuv).b), 0.08, 1.0);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = tbnNormal(normal, -vViewPosition, wuv, unpackNM(texture2D(uWN, wuv).rgb, uWNS));`);
  };
  mat.needsUpdate = true;
  return mat;
}
