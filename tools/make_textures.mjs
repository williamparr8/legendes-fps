// Prépare les textures PBR libres de droits (ambientCG, CC0) pour le jeu : pour chaque matière, deux JPG en 1024 px :
//  <nom>_c.jpg : couleur (occlusion ambiante cuite à 50 %)
//  <nom>_n.jpg : R = normale x (OpenGL), G = normale y, B = rugosité (la normale z est reconstruite dans le shader)
// Sources brutes dans assets-src/tex/src/<Id>/ (non versionnées). Usage : node tools/make_textures.mjs
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'assets-src/tex/src', OUT = 'public/tex';
const LIST = {
  brick: 'Bricks059', concrete: 'Concrete034', plaster: 'PaintedPlaster017', siding: 'WoodSiding008', tiles: 'RoofingTiles014A',
  tole: 'CorrugatedSteel005', wood: 'Wood051', rock: 'Rock030', metal: 'Metal032', rust: 'Rust003',
  asphalt: 'Asphalt031', grass: 'Grass004', dirt: 'Ground054', gravel: 'Gravel023',
};
const SIZE = 1024;
fs.mkdirSync(OUT, { recursive: true });
const file = (id, kind) => path.join(SRC, id, `${id}_1K-JPG_${kind}.jpg`);

for (const [name, id] of Object.entries(LIST)) {
  const color = sharp(file(id, 'Color')).resize(SIZE, SIZE).removeAlpha();
  let ao = null;
  if (fs.existsSync(file(id, 'AmbientOcclusion'))) ao = await sharp(file(id, 'AmbientOcclusion')).resize(SIZE, SIZE).greyscale().raw().toBuffer();
  const c = await color.raw().toBuffer();
  if (ao) for (let i = 0; i < SIZE * SIZE; i++) { const k = 0.5 + 0.5 * (ao[i] / 255); c[i * 3] *= k; c[i * 3 + 1] *= k; c[i * 3 + 2] *= k; }
  await sharp(c, { raw: { width: SIZE, height: SIZE, channels: 3 } }).jpeg({ quality: 82, chromaSubsampling: '4:2:0' }).toFile(path.join(OUT, `${name}_c.jpg`));
  const n = await sharp(file(id, 'NormalGL')).resize(SIZE, SIZE).removeAlpha().raw().toBuffer();
  const r = await sharp(file(id, 'Roughness')).resize(SIZE, SIZE).greyscale().raw().toBuffer();
  const p = Buffer.alloc(SIZE * SIZE * 3);
  for (let i = 0; i < SIZE * SIZE; i++) { p[i * 3] = n[i * 3]; p[i * 3 + 1] = n[i * 3 + 1]; p[i * 3 + 2] = r[i]; }
  await sharp(p, { raw: { width: SIZE, height: SIZE, channels: 3 } }).jpeg({ quality: 88, chromaSubsampling: '4:4:4' }).toFile(path.join(OUT, `${name}_n.jpg`));
  console.log(name, 'ok');
}
let total = 0;
for (const f of fs.readdirSync(OUT)) total += fs.statSync(path.join(OUT, f)).size;
console.log('total', Math.round(total / 1024), 'Ko');
