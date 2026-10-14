// Émet un code de paquet d'Éclats : node tools/make_eclats_code.mjs "<acheteur>" [montant=1000]
// À lancer après avoir reçu le paiement PayPal (1,99 $ = 1000 Éclats) ; envoie le code à l'acheteur (jeu → ✦ Éclats → Utiliser un code).
// Le code ne crédite qu'une fois par appareil. La clé privée (tools/.pass-private.jwk) ne doit jamais être publiée.
import { readFileSync } from 'node:fs';
const buyer = (process.argv[2] || '').replace(/[|\n\r]/g, ' ').trim().slice(0, 24);
const gems = Math.floor(Number(process.argv[3]) || 1000);
if (!buyer || gems < 1 || gems > 100000) { console.log('Usage : node tools/make_eclats_code.mjs "<pseudo ou courriel de l\'acheteur>" [montant=1000]'); process.exit(1); }
const jwk = JSON.parse(readFileSync(new URL('./.pass-private.jwk', import.meta.url), 'utf8'));
const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
const nonce = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
const payload = `LE1|${gems}|${buyer}|${nonce}`;
const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(payload)));
const b64 = (u8) => Buffer.from(u8).toString('base64url');
console.log(`${gems} Éclats pour « ${buyer} » (réf. ${nonce}) :\n\nLE.${b64(new TextEncoder().encode(payload))}.${b64(sig)}\n`);
