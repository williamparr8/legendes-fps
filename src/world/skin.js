import * as THREE from 'three';

// Matériaux « peau » procéduraux : motif + relief (bump) calculés dans le shader à partir de la position monde
// (pas de texture, pas d'étirement quelle que soit la taille de la boîte). Le relief perturbe la normale (dérivées d'écran),
// atténué avec la distance ; les boîtes reçoivent aussi un assombrissement d'arête (occlusion factice).
// Types : 0 béton / mur, 1 caisse en bois, 2 roche (boîtes), 3 tôle (toit), 4 feuillage, 5 écorce, 6 rocher instancié, 7 terrain
const NOISE = `
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1,0)), f.x), mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), f.x), f.y); }
float bumpH = 0.0;
vec3 perturbN(vec3 sp, vec3 sn, vec2 dh, float fd){
  vec3 sx = normalize(dFdx(sp)), sy = normalize(dFdy(sp));
  vec3 r1 = cross(sy, sn), r2 = cross(sn, sx);
  float det = dot(sx, r1) * fd;
  return normalize(abs(det) * sn - sign(det) * (dh.x * r1 + dh.y * r2));
}
`;

const PATTERN = `
{
  vec3 p = vWP; vec3 an = vLN;
  vec2 uv = an.y > 0.7 ? p.xz : (an.x > an.z ? p.zy : p.xy);
  float k = 1.0, bk = 2.0;
  float fl = 1.0 - smoothstep(25.0, 50.0, length(vViewPosition)); // détail fin : fondu puis supprimé avec la distance
  #if SKIN == 0
    float n = vnoise(uv * 2.5) * 0.5 + vnoise(uv * 11.0) * 0.3 + (fl > 0.0 ? mix(0.1, vnoise(uv * 40.0) * 0.2, fl) : 0.1);
    k = 0.82 + 0.3 * n;
    k *= 0.93 + 0.14 * vnoise(uv * 0.35 + 7.0);                      // grandes taches
    if (an.y < 0.7) {
      float row = abs(fract(p.y / 1.2) - 0.5);
      k *= 1.0 - 0.22 * smoothstep(0.47, 0.5, row);                 // joints de panneaux
      float col = abs(fract((an.x > an.z ? p.z : p.x) / 2.4) - 0.5);
      k *= 1.0 - 0.15 * smoothstep(0.485, 0.5, col);
      k *= 0.78 + 0.22 * smoothstep(0.0, 1.6, p.y);                 // salissure en bas
      k *= 1.0 - 0.25 * smoothstep(0.55, 0.9, vnoise(vec2(uv.x * 1.3, p.y * 0.35))) * (1.0 - smoothstep(0.0, 6.0, p.y)); // coulures
    }
    bk = 2.2;
  #elif SKIN == 1
    float pl = abs(fract(uv.y / 0.28) - 0.5);
    float grain = (fl > 0.0 ? mix(0.5, vnoise(vec2(uv.x * 6.0, uv.y * 60.0)), fl) : 0.5) * 0.6 + vnoise(vec2(uv.x * 1.5, uv.y * 14.0)) * 0.4;
    k = 0.74 + 0.36 * grain;
    k *= 1.0 - 0.38 * smoothstep(0.46, 0.5, pl);                    // jointures de planches
    float band = min(abs(fract(uv.x / 1.0) - 0.5), 0.5);
    k *= 1.0 - 0.18 * smoothstep(0.4, 0.5, band);
    bk = 3.0;
  #elif SKIN == 2 || SKIN == 6
    float n = vnoise(uv * 1.6) * 0.55 + vnoise(uv * 6.0) * 0.3 + (fl > 0.0 ? mix(0.5, vnoise(uv * 22.0), fl) : 0.5) * 0.15;
    k = 0.65 + 0.5 * n;
    k *= 0.88 + 0.12 * sin(p.y * 7.0 + vnoise(uv * 3.0) * 5.0);      // strates
    bk = 3.5;
  #elif SKIN == 3
    k = 0.88 + 0.12 * sin(uv.x * 14.0) + 0.1 * vnoise(uv * 8.0);
    k *= 1.0 - 0.3 * smoothstep(0.62, 0.85, vnoise(uv * 3.0)) * 0.5; // rouille
    bk = 1.6;
  #elif SKIN == 4
    float n = vnoise(p.xz * 3.0 + p.y * 1.7) * 0.5 + vnoise(p.xz * 13.0 + p.y * 9.0) * 0.5;
    k = 0.62 + 0.7 * n;
    k *= 0.88 + 0.12 * sin(p.y * 9.0);
    bk = 2.5;
  #elif SKIN == 5
    float n = vnoise(vec2((p.x + p.z) * 14.0, p.y * 1.6)) * 0.6 + vnoise(vec2((p.x - p.z) * 30.0, p.y * 4.0)) * 0.4;
    k = 0.5 + 0.7 * n;
    bk = 3.0;
  #else
    float n = vnoise(p.xz * 0.18) * 0.5 + vnoise(p.xz * 0.9) * 0.3 + (fl > 0.0 ? mix(0.5, vnoise(p.xz * 4.5), fl) : 0.5) * 0.2;
    k = 0.8 + 0.4 * n;
    if (fl > 0.0) {
      k *= 0.9 + 0.2 * mix(0.5, vnoise(p.xz * vec2(30.0, 7.0)), fl); // brins d'herbe
      bumpH = (vnoise(p.xz * 14.0) * 0.6 + vnoise(p.xz * 50.0) * 0.4) * 0.5;
    }
    bk = 0.0;
  #endif
  #if SKIN < 4
    vec3 e = vED; float ed = an.y > 0.7 ? min(e.x, e.z) : (an.x > an.z ? min(e.z, e.y) : min(e.x, e.y));
    k *= 0.84 + 0.16 * smoothstep(0.0, 0.3, ed);                    // arêtes plus sombres
  #endif
  if (bk > 0.0) bumpH = k * bk;
  diffuseColor.rgb *= k;
}
`;

const BUMP = `
#include <normal_fragment_maps>
{
  float fade = clamp(1.0 - length(vViewPosition) / 40.0, 0.0, 1.0);
  normal = perturbN(-vViewPosition, normal, vec2(dFdx(bumpH), dFdy(bumpH)) * fade * 0.9, faceDirection);
}
`;

const cache = {};

function patch(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vLN; varying vec3 vED;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec4 wp = vec4(transformed, 1.0); vec3 sc = vec3(1.0);
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
            sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          #endif
          vWP = (modelMatrix * wp).xyz; vLN = abs(normal); vED = (0.5 - abs(position)) * sc; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vLN; varying vec3 vED;\n' + NOISE)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + PATTERN)
      .replace('#include <normal_fragment_maps>', BUMP);
  };
  return mat;
}

export function skinMaterial(kind, flat = false) {
  const key = kind + (flat ? 'f' : '');
  if (cache[key]) return cache[key];
  const mat = new THREE.MeshLambertMaterial({ flatShading: flat });
  mat.defines = { SKIN: kind };
  return (cache[key] = patch(mat));
}

// Terrain : couleurs par sommet (altitude/pente) × taches et brins d'herbe procéduraux + relief fin.
export function terrainMaterial(map) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map });
  mat.defines = { SKIN: 7 };
  return patch(mat);
}
