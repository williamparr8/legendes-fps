// Émet un code d'activation du Pass : node tools/make_pass_code.mjs "<acheteur>" [saison]
// À lancer après avoir reçu le paiement PayPal ; envoie le code à l'acheteur (il le colle dans Pass → Activer).
import { readFileSync } from 'node:fs';
const buyer = (process.argv[2] || '').replace(/[|\n\r]/g, ' ').trim().slice(0, 24);
if (!buyer) { console.log('Usage : node tools/make_pass_code.mjs "<pseudo ou courriel de l\'acheteur>" [saison]'); process.exit(1); }
const start = Date.UTC(2026, 9, 1) / 864e5, cur = Math.max(0, Math.floor((Date.now() / 864e5 - start) / 84)) + 1; // même calcul que le jeu
const season = Number(process.argv[3]) || cur;
const jwk = JSON.parse(readFileSync(new URL('./.pass-private.jwk', import.meta.url), 'utf8'));
const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
const nonce = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
const payload = `LP1|${season}|${buyer}|${nonce}`;
const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(payload)));
const b64 = (u8) => Buffer.from(u8).toString('base64url');
console.log(`Pass saison ${season} pour « ${buyer} » :\n\nLP.${b64(new TextEncoder().encode(payload))}.${b64(sig)}\n`);
