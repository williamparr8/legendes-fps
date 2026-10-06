import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// Post-traitement léger (options > qualité graphique) : monde + arme (profondeur effacée) dans une cible HDR multi-échantillonnée (MSAA 4×),
// bloom à petite résolution (¼, ⅛, 1/16, 1/32 : seuil → flou gaussien séparable), puis UNE seule passe plein écran qui additionne le bloom,
// applique le tone mapping ACES, la conversion sRGB, l'étalonnage (saturation, contraste) et la vignette.
// Qualité 0 : rendu direct (tone mapping ACES des matériaux seul). Les cibles ne sont créées qu'à la première activation.
export const QUALITY = ['Bas (sans effets)', 'Moyen', 'Haut'];
const PIXEL_CAP = [2, 1.25, 2]; // plafond du ratio de pixels par qualité
const BLOOM = [0, 0.3, 0.45];   // intensité du bloom

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const mat = (uniforms, frag) => new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: frag, depthTest: false, depthWrite: false });

// Seuil (4 prises bilinéaires = ¼ de résolution) puis réduction ×2 : même noyau, le seuil est optionnel.
const DOWN = `uniform sampler2D t; uniform vec2 px; uniform float thr; varying vec2 vUv;
  vec3 br(vec3 c){ float l = max(c.r, max(c.g, c.b)); return c * (max(l - thr, 0.0) / max(l, 1e-4)); }
  void main(){
    vec3 a = texture2D(t, vUv + px * vec2(-1.0, -1.0)).rgb, b = texture2D(t, vUv + px * vec2(1.0, -1.0)).rgb;
    vec3 c = texture2D(t, vUv + px * vec2(-1.0, 1.0)).rgb, d = texture2D(t, vUv + px * vec2(1.0, 1.0)).rgb;
    gl_FragColor = vec4(thr > 0.0 ? (br(a) + br(b) + br(c) + br(d)) * 0.25 : (a + b + c + d) * 0.25, 1.0);
  }`;
// Gaussienne 9 prises (5 prises bilinéaires).
const BLUR = `uniform sampler2D t; uniform vec2 dir; varying vec2 vUv;
  void main(){
    vec3 s = texture2D(t, vUv).rgb * 0.2270270270;
    s += (texture2D(t, vUv + dir * 1.3846153846).rgb + texture2D(t, vUv - dir * 1.3846153846).rgb) * 0.3162162162;
    s += (texture2D(t, vUv + dir * 3.2307692308).rgb + texture2D(t, vUv - dir * 3.2307692308).rgb) * 0.0702702703;
    gl_FragColor = vec4(s, 1.0);
  }`;
const FINAL = `uniform sampler2D tS, tB1, tB2, tB3; uniform float bloom, vig, sat, con; varying vec2 vUv;
  void main(){
    vec3 c = texture2D(tS, vUv).rgb;
    c += (texture2D(tB1, vUv).rgb * 0.5 + texture2D(tB2, vUv).rgb * 0.35 + texture2D(tB3, vUv).rgb * 0.25) * bloom;
    c = toneMapping(c);
    c = linearToOutputTexel(vec4(c, 1.0)).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, sat);
    c = (c - 0.5) * con + 0.5;
    c *= 1.0 - vig * smoothstep(0.42, 0.95, length(vUv - 0.5) * 1.35);
    gl_FragColor = vec4(c, 1.0);
  }`;

export class Post {
  constructor(renderer) {
    this.r = renderer; this.q = 0; this.on = false; this.built = false;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
  }

  setQuality(q) {
    const r = this.r;
    this.q = q; this.on = q > 0;
    r.setPixelRatio(Math.min(devicePixelRatio, PIXEL_CAP[q]));
    r.setSize(innerWidth, innerHeight);
    if (!this.on) return;
    if (!this.built) this.build();
    this.u.bloom.value = BLOOM[q];
    this.resize();
  }

  build() {
    this.built = true;
    const opt = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    // niveaux de bloom : ¼ (a), ⅛ (b0, b1), 1/16 (c0, c1), 1/32 (d)
    const mk = () => new THREE.WebGLRenderTarget(1, 1, opt);
    this.a = mk(); this.b = [mk(), mk()]; this.c = [mk(), mk()]; this.d = mk();
    this.fsq = new FullScreenQuad();
    this.mDown = mat({ t: { value: null }, px: { value: new THREE.Vector2() }, thr: { value: 0.95 } }, DOWN);
    this.mBlur = mat({ t: { value: null }, dir: { value: new THREE.Vector2() } }, BLUR);
    this.u = { bloom: { value: 0.3 }, vig: { value: 0.3 }, sat: { value: 1.06 }, con: { value: 1.06 } };
    this.mFinal = mat({ tS: { value: null }, tB1: { value: null }, tB2: { value: null }, tB3: { value: null }, ...this.u }, FINAL);
  }

  resize() {
    if (!this.built) return;
    const pr = this.r.getPixelRatio(), w = Math.max(4, Math.floor(innerWidth * pr)), h = Math.max(4, Math.floor(innerHeight * pr));
    this.rt.setSize(w, h);
    this.a.setSize(w >> 2, h >> 2);
    for (const t of this.b) t.setSize(w >> 3, h >> 3);
    for (const t of this.c) t.setSize(w >> 4, h >> 4);
    this.d.setSize(w >> 5, h >> 5);
    this.w = w; this.h = h;
  }

  pass(m, target) { this.fsq.material = m; this.r.setRenderTarget(target); this.fsq.render(this.r); }

  down(src, dst, thr) {
    const m = this.mDown, u = m.uniforms;
    u.t.value = src.texture; u.px.value.set(1 / src.width, 1 / src.height); u.thr.value = thr;
    this.pass(m, dst);
  }

  blur(src, dst, x, y) {
    const u = this.mBlur.uniforms;
    u.t.value = src.texture; u.dir.value.set(x / src.width, y / src.height);
    this.pass(this.mBlur, dst);
  }

  // vm : Viewmodel (ou null : arme masquée, 3e personne)
  render(scene, camera, vm) {
    const r = this.r;
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    r.autoClear = false;
    if (vm) { r.clearDepth(); r.render(vm.scene, vm.cam); }
    this.down(this.rt, this.a, 0.95);
    this.down(this.a, this.b[0], 0);
    this.blur(this.b[0], this.b[1], 1, 0); this.blur(this.b[1], this.b[0], 0, 1);
    this.down(this.b[0], this.c[0], 0);
    this.blur(this.c[0], this.c[1], 1, 0); this.blur(this.c[1], this.c[0], 0, 1);
    this.down(this.c[0], this.d, 0);
    const u = this.mFinal.uniforms;
    u.tS.value = this.rt.texture; u.tB1.value = this.b[0].texture; u.tB2.value = this.c[0].texture; u.tB3.value = this.d.texture;
    this.pass(this.mFinal, null);
    r.autoClear = true;
  }
}
