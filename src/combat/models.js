import * as THREE from 'three';

// Modèles d'armes procéduraux (boîtes + cylindres). Repère : canon vers -z, culasse à l'origine.
// userData : muzzle = z de la bouche du canon, sightY = hauteur de la ligne de visée (alignement en ADS).
const phong = (color, shininess = 40, specular = 0x555555) => new THREE.MeshPhongMaterial({ color, shininess, specular });
const MAT = {
  metal: phong(0x4a515b, 70, 0x888888), dark: phong(0x2b2e34, 30, 0x333333), steel: phong(0xaab0b9, 90, 0xdddddd),
  wood: new THREE.MeshLambertMaterial({ color: 0x6e4b2f }), skin: new THREE.MeshLambertMaterial({ color: 0xd7a47c }),
  sleeve: new THREE.MeshLambertMaterial({ color: 0x2f4b70 }), glass: new THREE.MeshBasicMaterial({ color: 0xff3030 }),
  lens: new THREE.MeshPhongMaterial({ color: 0x5aa0ff, shininess: 120, specular: 0xffffff, transparent: true, opacity: 0.75 }),
  olive: phong(0x4d5a3a, 30, 0x222222), orange: phong(0xd9792b, 60, 0x555555),
};
const ACCENT = { rifle: 0x4f8fc0, smg: 0x9b6fd0, shotgun: 0xd05a3a, sniper: 0x4fb070, launcher: 0xe09030 };
const GEO = {};
const boxGeo = (w, h, d) => GEO[`b${w},${h},${d}`] || (GEO[`b${w},${h},${d}`] = new THREE.BoxGeometry(w, h, d));
const cylGeo = (r1, r2, len, seg) => GEO[`c${r1},${r2},${len},${seg}`] || (GEO[`c${r1},${r2},${len},${seg}`] = new THREE.CylinderGeometry(r1, r2, len, seg));

function box(g, w, h, d, x, y, z, mat, rx = 0) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.x = rx;
  g.add(m);
  return m;
}
// Cylindre le long de z : rayons (arrière → avant), longueur, centre.
function cyl(g, r1, r2, len, x, y, z, mat, seg = 10) {
  const m = new THREE.Mesh(cylGeo(r1, r2, len, seg), mat);
  m.rotation.x = Math.PI / 2; m.position.set(x, y, z);
  g.add(m);
  return m;
}

const BUILD = {
  rifle(g, a) {
    box(g, 0.07, 0.1, 0.34, 0, 0, 0, MAT.metal); box(g, 0.045, 0.02, 0.4, 0, 0.06, -0.02, MAT.dark);
    box(g, 0.076, 0.082, 0.3, 0, 0, -0.32, MAT.metal);
    for (const z of [-0.25, -0.33, -0.41]) box(g, 0.08, 0.02, 0.04, 0, 0.02, z, MAT.dark);
    cyl(g, 0.012, 0.012, 0.23, 0, 0.01, -0.585, MAT.steel); cyl(g, 0.02, 0.02, 0.06, 0, 0.01, -0.67, MAT.dark);
    box(g, 0.01, 0.04, 0.01, 0, 0.078, -0.6, MAT.dark); box(g, 0.035, 0.025, 0.02, 0, 0.078, 0.14, MAT.dark);
    box(g, 0.045, 0.16, 0.07, 0, -0.12, -0.05, MAT.dark, -0.12); box(g, 0.047, 0.03, 0.072, 0, -0.07, -0.05, a);
    box(g, 0.05, 0.11, 0.06, 0, -0.1, 0.14, MAT.dark, 0.3);
    box(g, 0.055, 0.09, 0.2, 0, -0.01, 0.27, MAT.metal); box(g, 0.06, 0.11, 0.03, 0, -0.01, 0.38, MAT.dark);
    box(g, 0.04, 0.05, 0.07, 0, 0.095, 0, MAT.dark); box(g, 0.034, 0.034, 0.004, 0, 0.1, -0.037, MAT.glass);
    g.userData = { muzzle: -0.7, sightY: 0.1, grip: [-0.12, 0.14], fore: [-0.07, -0.32] };
  },
  smg(g, a) {
    box(g, 0.07, 0.11, 0.28, 0, 0, 0, MAT.metal); box(g, 0.05, 0.02, 0.32, 0, 0.065, -0.02, MAT.dark);
    cyl(g, 0.028, 0.028, 0.24, 0, 0.01, -0.43, MAT.dark, 12); cyl(g, 0.03, 0.03, 0.02, 0, 0.01, -0.54, a, 12);
    box(g, 0.045, 0.2, 0.055, 0, -0.15, 0.01, MAT.dark); box(g, 0.047, 0.03, 0.057, 0, -0.075, 0.01, a);
    box(g, 0.045, 0.08, 0.05, 0, -0.08, -0.27, MAT.metal);
    box(g, 0.05, 0.1, 0.06, 0, -0.1, 0.13, MAT.dark, 0.3);
    box(g, 0.025, 0.045, 0.2, 0, 0.0, 0.22, MAT.steel); box(g, 0.05, 0.07, 0.02, 0, 0.0, 0.33, MAT.dark);
    box(g, 0.04, 0.045, 0.06, 0, 0.09, -0.02, MAT.dark); box(g, 0.034, 0.03, 0.004, 0, 0.093, -0.052, MAT.glass);
    g.userData = { muzzle: -0.55, sightY: 0.092, grip: [-0.1, 0.13], fore: [-0.08, -0.27] };
  },
  shotgun(g, a) {
    box(g, 0.075, 0.1, 0.3, 0, 0, 0, MAT.metal); box(g, 0.04, 0.012, 0.3, 0, 0.056, -0.02, MAT.dark);
    cyl(g, 0.02, 0.02, 0.6, 0, 0.02, -0.45, MAT.steel); cyl(g, 0.018, 0.018, 0.5, 0, -0.03, -0.4, MAT.dark);
    cyl(g, 0.024, 0.024, 0.03, 0, -0.03, -0.66, a);
    box(g, 0.07, 0.06, 0.2, 0, -0.045, -0.34, MAT.wood); box(g, 0.012, 0.03, 0.012, 0, 0.065, -0.7, MAT.orange);
    box(g, 0.05, 0.11, 0.06, 0, -0.1, 0.13, MAT.wood, 0.3);
    box(g, 0.06, 0.1, 0.3, 0, -0.02, 0.3, MAT.wood); box(g, 0.065, 0.11, 0.03, 0, -0.02, 0.46, MAT.dark);
    g.userData = { muzzle: -0.75, sightY: 0.068, grip: [-0.1, 0.13], fore: [-0.045, -0.34] };
  },
  sniper(g, a) {
    box(g, 0.065, 0.1, 0.42, 0, 0, 0.02, MAT.metal); box(g, 0.05, 0.03, 0.34, 0, -0.02, -0.4, MAT.dark);
    cyl(g, 0.014, 0.014, 0.8, 0, 0.012, -0.6, MAT.steel); cyl(g, 0.022, 0.022, 0.07, 0, 0.012, -0.97, MAT.dark);
    cyl(g, 0.032, 0.032, 0.34, 0, 0.105, -0.04, MAT.dark, 14); cyl(g, 0.04, 0.034, 0.07, 0, 0.105, -0.24, MAT.metal, 14);
    cyl(g, 0.034, 0.045, 0.07, 0, 0.105, 0.17, MAT.metal, 14); cyl(g, 0.034, 0.034, 0.006, 0, 0.105, -0.277, MAT.lens, 14);
    box(g, 0.02, 0.045, 0.03, 0, 0.065, -0.1, MAT.dark); box(g, 0.02, 0.045, 0.03, 0, 0.065, 0.08, MAT.dark);
    cyl(g, 0.008, 0.008, 0.06, 0.05, 0.03, 0.18, MAT.steel, 6).rotation.set(0, 0, Math.PI / 2);
    box(g, 0.05, 0.1, 0.06, 0, -0.1, 0.16, MAT.dark, 0.3); box(g, 0.045, 0.1, 0.045, 0, -0.1, -0.02, a, -0.1);
    box(g, 0.06, 0.11, 0.3, 0, -0.012, 0.37, MAT.dark); box(g, 0.062, 0.035, 0.18, 0, 0.065, 0.36, MAT.metal); box(g, 0.065, 0.12, 0.03, 0, -0.01, 0.53, MAT.dark);
    g.userData = { muzzle: -1.0, sightY: 0.105, grip: [-0.1, 0.16], fore: [-0.03, -0.32] };
  },
  launcher(g, a) {
    cyl(g, 0.075, 0.075, 0.85, 0, 0, -0.42, MAT.olive, 16); cyl(g, 0.098, 0.088, 0.14, 0, 0, -0.8, MAT.dark, 16); cyl(g, 0.1, 0.12, 0.12, 0, 0, 0.06, MAT.metal, 16);
    cyl(g, 0.078, 0.078, 0.05, 0, 0, -0.55, a, 16); cyl(g, 0.078, 0.078, 0.05, 0, 0, -0.25, a, 16);
    box(g, 0.05, 0.14, 0.06, 0, -0.13, -0.05, MAT.dark, 0.2); box(g, 0.04, 0.12, 0.05, 0, -0.14, -0.4, MAT.dark);
    box(g, 0.035, 0.07, 0.1, 0.07, 0.1, -0.2, MAT.metal); box(g, 0.02, 0.03, 0.004, 0.07, 0.115, -0.252, MAT.glass);
    box(g, 0.1, 0.15, 0.05, 0, -0.01, 0.2, MAT.dark);
    g.userData = { muzzle: -0.85, sightY: 0.11, grip: [-0.13, -0.05], fore: [-0.14, -0.4] };
  },
};

// Mains et avant-bras (vue subjective uniquement).
function addHands(g) {
  const u = g.userData, hand = (y, z, side) => {
    box(g, 0.07, 0.085, 0.1, 0, y, z, MAT.skin);
    const arm = box(g, 0.085, 0.09, 0.5, side * 0.07, y - 0.06, z + 0.28, MAT.sleeve);
    arm.rotation.set(-0.25, side * -0.18, 0);
  };
  hand(u.grip[0] - 0.02, u.grip[1] + 0.02, 0.4);
  hand(u.fore[0] - 0.03, u.fore[1], -0.7);
}

// Retourne un Group (ombre désactivée pour la vue subjective, activée pour les armes posées au sol).
export function buildWeaponModel(id, hands = false) {
  const g = new THREE.Group();
  const accent = new THREE.MeshPhongMaterial({ color: ACCENT[id] || 0x888888, shininess: 50 });
  (BUILD[id] || BUILD.rifle)(g, accent);
  if (hands) addHands(g);
  return g;
}
