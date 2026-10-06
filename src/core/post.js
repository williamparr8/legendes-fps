import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Post-traitement (options > qualité graphique) : monde → arme (profondeur effacée) → bloom (HDR) → tone mapping ACES + sRGB →
// étalonnage (saturation, contraste, vignette). Qualité 0 : rendu direct (tone mapping ACES seul). Le composer n'est construit
// qu'à la première activation. Rendu multi-échantillonné (MSAA 4×) en demi-flottants.
export const QUALITY = ['Bas (sans effets)', 'Moyen', 'Haut'];
const PIXEL_CAP = [2, 1.25, 2]; // plafond du ratio de pixels par qualité

const GRADE = {
  uniforms: { tDiffuse: { value: null }, vig: { value: 0.3 }, sat: { value: 1.06 }, con: { value: 1.06 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vig, sat, con; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, sat);
      c = (c - 0.5) * con + 0.5;
      c *= 1.0 - vig * smoothstep(0.42, 0.95, length(vUv - 0.5) * 1.35);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class Post {
  constructor(renderer) {
    this.r = renderer; this.q = 0; this.on = false; this.c = null;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
  }

  setQuality(q) {
    const r = this.r;
    this.q = q; this.on = q > 0;
    r.setPixelRatio(Math.min(devicePixelRatio, PIXEL_CAP[q]));
    r.setSize(innerWidth, innerHeight);
    if (!this.on) return;
    if (!this.c) this.build();
    this.bloom.strength = q === 2 ? 0.45 : 0.3;
    this.bloom.radius = q === 2 ? 0.7 : 0.5;
    this.resize();
  }

  build() {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    const c = this.c = new EffectComposer(this.r, rt);
    this.world = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.vm = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.vm.clear = false; this.vm.clearDepth = true;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.5, 0.95);
    c.addPass(this.world); c.addPass(this.vm); c.addPass(this.bloom); c.addPass(new OutputPass()); c.addPass(new ShaderPass(GRADE));
  }

  resize() {
    if (!this.c) return;
    this.c.setPixelRatio(this.r.getPixelRatio());
    this.c.setSize(innerWidth, innerHeight);
  }

  // vm : Viewmodel (ou null : arme masquée, 3e personne)
  render(scene, camera, vm, dt) {
    this.world.scene = scene; this.world.camera = camera;
    this.vm.enabled = !!vm;
    if (vm) { this.vm.scene = vm.scene; this.vm.camera = vm.cam; }
    this.c.render(dt);
  }
}
