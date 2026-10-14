// Génère la paire de clés qui signe les codes du Pass (ECDSA P-256).
// La clé PRIVÉE reste dans tools/.pass-private.jwk (ignorée par git : ne la publie jamais, sauvegarde-la ailleurs) ;
// la clé PUBLIQUE est écrite dans src/shop/passkey.json (publiée avec le jeu, sert uniquement à vérifier les codes).
// Régénérer des clés invalide tous les codes déjà émis.
import { writeFileSync, existsSync } from 'node:fs';
const priv = new URL('./.pass-private.jwk', import.meta.url), pub = new URL('../src/shop/passkey.json', import.meta.url);
if (existsSync(priv) && !process.argv.includes('--force')) { console.log('Clés déjà présentes (utilise --force pour les remplacer ; les anciens codes cesseront de fonctionner).'); process.exit(0); }
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
writeFileSync(priv, JSON.stringify(await crypto.subtle.exportKey('jwk', kp.privateKey)));
writeFileSync(pub, JSON.stringify(await crypto.subtle.exportKey('jwk', kp.publicKey), null, 2) + '\n');
console.log('Clés générées : tools/.pass-private.jwk (privée, à garder secrète) et src/shop/passkey.json (publique).');
