// Allège les modèles .glb : réduit les textures JPEG intégrées (par défaut 768 px ; 512 px pour gasmask) et réécrit le fichier.
// Nécessite : npm i --no-save sharp. Usage : node tools/slim_glb.mjs [dossier=public/models]
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] || 'public/models';
const MAX = { gasmask: 512 };
const pad = (n) => (4 - (n % 4)) % 4;
let tb = 0, ta = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.glb'))) {
  const file = path.join(dir, f), buf = fs.readFileSync(file);
  const jl = buf.readUInt32LE(12), json = JSON.parse(buf.slice(20, 20 + jl).toString('utf8'));
  const binStart = 20 + jl + 8, bin = buf.slice(binStart);
  const limit = MAX[f.replace('.glb', '')] || 768;
  const imgViews = new Set((json.images || []).map((im) => im.bufferView));
  const pieces = [];
  let off = 0;
  for (let i = 0; i < json.bufferViews.length; i++) {
    const v = json.bufferViews[i], src = bin.slice(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
    let data = src;
    if (imgViews.has(i)) {
      const meta = await sharp(src).metadata();
      if (Math.max(meta.width, meta.height) > limit) data = await sharp(src).resize(limit, limit, { fit: 'inside' }).jpeg({ quality: 82, chromaSubsampling: '4:2:0', mozjpeg: true }).toBuffer();
    }
    v.byteOffset = off; v.byteLength = data.length;
    pieces.push(data); off += data.length;
    const p = pad(off); if (p) { pieces.push(Buffer.alloc(p)); off += p; }
  }
  json.buffers[0].byteLength = off;
  let js = Buffer.from(JSON.stringify(json), 'utf8');
  js = Buffer.concat([js, Buffer.alloc(pad(js.length), 0x20)]);
  const binOut = Buffer.concat(pieces);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + binOut.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4E4F534A, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(binOut.length, 0); bh.writeUInt32LE(0x004E4942, 4);
  const out = Buffer.concat([head, jh, js, bh, binOut]);
  tb += buf.length; ta += out.length;
  fs.writeFileSync(file, out);
  console.log(f, Math.round(buf.length / 1024), 'Ko ->', Math.round(out.length / 1024), 'Ko');
}
console.log('total', Math.round(tb / 1024), 'Ko ->', Math.round(ta / 1024), 'Ko');
