// Compresse les modèles .glb du jeu : textures utiles seulement (couleur + normale) en WebP 512 px, géométrie et animations en meshopt,
// clips inutilisés retirés. Le résultat est publié en « .glb.json » pour que le serveur le compresse (gzip) : le JSON des animations est volumineux.
// Usage (dans un dossier avec : npm i @gltf-transform/cli) : node tools/pack_glb.mjs entree.glb sortie.glb 512 ; puis renommer en <nom>.glb.json.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, textureCompress, meshopt, weld, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';

await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const [, , inp, outp, sizeArg] = process.argv;
const size = +sizeArg || 512;
const doc = await io.read(inp);
const root = doc.getRoot();
for (const m of root.listMaterials()) {
  m.setMetallicRoughnessTexture(null); m.setOcclusionTexture(null); m.setEmissiveTexture(null);
  const sp = m.getExtension('KHR_materials_specular'); if (sp) sp.dispose();
}
const USED = ['Backwards_Rifle_Run','Crouch_Idle','Falling_Idle','Reloading','Rifle_Aiming_Idle','Rifle_Crouch_Walk','Rifle_Death','Rifle_Idle','Rifle_Run','Rifle_Walk','Run_Left','Run_Right','Running_Slide'];
for (const a of root.listAnimations()) if (!USED.includes(a.getName())) a.dispose();
await doc.transform(
  prune(),
  dedup(),
  resample(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 80 }),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
);
for (const e of root.listExtensionsUsed()) if (e.extensionName === 'EXT_meshopt_compression') e.setRequired(true);
await io.write(outp, doc);
const kb = (f) => Math.round(fs.statSync(f).size / 1024);
console.log(inp, kb(inp), 'Ko ->', outp, kb(outp), 'Ko', 'ext:', doc.getRoot().listExtensionsUsed().map((e) => e.extensionName).join(','));
