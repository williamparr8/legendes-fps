import * as THREE from 'three';

// Matériaux « peau » procéduraux pour les boîtes du monde : motif calculé dans le shader à partir de la position
// monde (pas de texture, pas d'étirement quelle que soit la taille de la boîte).
// Types : 0 béton / mur, 1 caisse en bois, 2 roche, 3 tôle (toit)
const NOISE = `
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1,0)), f.x), mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), f.x), f.y); }
`;

const PATTERN = `
{
  vec3 p = vWP; vec3 an = vLN;
  vec2 uv = an.y > 0.7 ? p.xz : (an.x > an.z ? p.zy : p.xy);
  float k = 1.0;
  #if SKIN == 0
    float n = vnoise(uv * 2.5) * 0.5 + vnoise(uv * 11.0) * 0.3 + vnoise(uv * 40.0) * 0.2;
    k = 0.82 + 0.3 * n;
    if (an.y < 0.7) {
      float row = abs(fract(p.y / 1.2) - 0.5);
      k *= 1.0 - 0.18 * smoothstep(0.47, 0.5, row);                 // joints de panneaux
      float col = abs(fract((an.x > an.z ? p.z : p.x) / 2.4) - 0.5);
      k *= 1.0 - 0.12 * smoothstep(0.485, 0.5, col);
      k *= 0.78 + 0.22 * smoothstep(0.0, 1.6, p.y);                 // salissure en bas
    }
  #elif SKIN == 1
    float pl = abs(fract(uv.y / 0.28) - 0.5);
    float grain = vnoise(vec2(uv.x * 6.0, uv.y * 60.0));
    k = 0.78 + 0.3 * grain;
    k *= 1.0 - 0.35 * smoothstep(0.46, 0.5, pl);                    // jointures de planches
    float band = min(abs(fract(uv.x / 1.0) - 0.5), 0.5);
    k *= 1.0 - 0.15 * smoothstep(0.4, 0.5, band);
  #elif SKIN == 2
    float n = vnoise(uv * 1.6) * 0.55 + vnoise(uv * 6.0) * 0.3 + vnoise(uv * 22.0) * 0.15;
    k = 0.65 + 0.5 * n;
  #else
    k = 0.88 + 0.12 * sin(uv.x * 14.0) + 0.1 * vnoise(uv * 8.0);
  #endif
  diffuseColor.rgb *= k;
}
`;

const cache = {};

export function skinMaterial(kind) {
  if (cache[kind]) return cache[kind];
  const mat = new THREE.MeshLambertMaterial();
  mat.defines = { SKIN: kind };
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vLN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec4 wp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
          #endif
          vWP = (modelMatrix * wp).xyz; vLN = abs(normal); }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vLN;\n' + NOISE)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + PATTERN);
  };
  cache[kind] = mat;
  return mat;
}
