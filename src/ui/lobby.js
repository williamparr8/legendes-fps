import * as THREE from 'three';
import { makeRig, WIDS } from '../combat/humanoid.js';
import legends from '../legends/legends.json';
import { profile } from '../shop/profile.js';

// Décor 3D du hall (menu principal) : fond dessiné en canvas (dégradé, alvéoles, grand titre, sol en perspective), opérateur
// équipé (tenue + arme du profil) sur un socle lumineux au centre ; le DOM (ui.js) est superposé et transparent.
function backdrop(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  let gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#0a0d2e'); gr.addColorStop(0.55, '#2b1a78'); gr.addColorStop(1, '#6b2c8c');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  gr = g.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, h * 0.75);
  gr.addColorStop(0, 'rgba(90,150,255,.55)'); gr.addColorStop(1, 'rgba(90,150,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  // alvéoles (hexagones)
  const R = h / 11, hx = R * 1.5, hy = R * Math.sqrt(3);
  g.strokeStyle = 'rgba(180,200,255,.12)'; g.lineWidth = Math.max(1, h / 540);
  for (let i = -1; i * hx < w + R; i++) for (let j = -1; j * hy < h + hy; j++) {
    const x = i * hx, y = j * hy + (i & 1 ? hy / 2 : 0);
    g.beginPath();
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.lineTo(x + R * Math.cos(a), y + R * Math.sin(a)); }
    g.closePath(); g.stroke();
  }
  // grand hexagone derrière l'opérateur
  g.save(); g.translate(w / 2, h * 0.47);
  g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(h * 0.5 * Math.cos(a), h * 0.5 * Math.sin(a)); }
  g.closePath(); g.fillStyle = 'rgba(20,10,60,.45)'; g.fill(); g.strokeStyle = 'rgba(255,120,80,.55)'; g.lineWidth = h / 120; g.stroke();
  g.restore();
  // titre géant
  g.save(); g.translate(w / 2, h * 0.4); g.transform(1, 0, -0.12, 1, 0, 0);
  g.font = `900 ${Math.round(h * 0.25)}px Impact, "Arial Black", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(255,90,40,.9)'; g.shadowBlur = h / 18;
  g.fillStyle = 'rgba(240,244,255,.93)'; g.fillText('LÉGENDES', 0, 0);
  g.restore();
  // sol : lueur orange, lignes de fuite, étincelles
  gr = g.createLinearGradient(0, h * 0.72, 0, h);
  gr.addColorStop(0, 'rgba(255,120,60,0)'); gr.addColorStop(0.5, 'rgba(255,110,60,.45)'); gr.addColorStop(1, 'rgba(120,30,110,.85)');
  g.fillStyle = gr; g.fillRect(0, h * 0.72, w, h * 0.28);
  g.strokeStyle = 'rgba(255,170,120,.25)'; g.lineWidth = h / 700;
  for (let i = -12; i <= 12; i++) { g.beginPath(); g.moveTo(w / 2 + i * w * 0.012, h * 0.74); g.lineTo(w / 2 + i * w * 0.12, h); g.stroke(); }
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * w, y = h * (0.35 + Math.random() * 0.6), r = h / 400 * (0.6 + Math.random() * 1.6);
    g.fillStyle = `rgba(255,${150 + (Math.random() * 90 | 0)},70,${0.4 + Math.random() * 0.5})`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class LobbyView {
  constructor() {
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
    this.cam.position.set(0, 1.2, 5.1); this.cam.lookAt(0, 0.88, 0);
    this.scene.add(new THREE.HemisphereLight(0xb8c8ff, 0x402060, 1.1));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.4); key.position.set(-2, 3, 4); this.scene.add(key);
    const r1 = new THREE.DirectionalLight(0xff4fd8, 2.2); r1.position.set(3, 2, -3); this.scene.add(r1);
    const r2 = new THREE.DirectionalLight(0x4fa8ff, 2.2); r2.position.set(-3, 2, -3); this.scene.add(r2);
    this.g = new THREE.Group(); this.scene.add(this.g);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.9, 0.07, 40).translate(0, -0.035, 0), new THREE.MeshStandardMaterial({ color: 0x1a1d3a, roughness: 0.35, metalness: 0.6 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.02, 8, 48).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff7a3a }));
    this.g.add(pad, ring);
    const m = new THREE.Group(); this.g.add(m);
    this.rig = makeRig(m, true);
    this.a = { health: { downed: false }, stance: 0, wid: WIDS[0], shots: 0, reloading: false, pitch: 0 };
    this.t = 0; this.legend = ''; this.asp = 0;
  }

  frame(dt, legend) {
    this.t += dt;
    const asp = innerWidth / innerHeight;
    if (Math.abs(asp - this.asp) > 0.02) {
      this.asp = asp;
      this.cam.aspect = asp; this.cam.updateProjectionMatrix();
      if (this.scene.background) this.scene.background.dispose();
      this.scene.background = backdrop(Math.min(1600, Math.round(innerHeight * Math.min(asp, 2.4) * 1.0) || 1280), Math.min(900, innerHeight || 720));
    }
    if (legend !== this.legend && legends[legend]) { this.legend = legend; this.rig.setAccent(legends[legend].color, legend); }
    this.a.wid = 'rifle';
    this.rig.setSkins(profile.eq.perso, profile.eq.arme);
    this.rig.animate(dt, 0, 0, this.a);
    this.g.rotation.y = LobbyView.FACE - 0.6 + Math.sin(this.t * 0.4) * 0.18;
  }
}
LobbyView.FACE = Math.PI; // orientation de face (à ajuster : dépend du modèle)

let view = null;
export function lobbyFrame(game, dt) {
  if (!view) view = new LobbyView();
  view.frame(dt, game.ui.legend);
  game.renderer.render(view.scene, view.cam);
}
