# PROGRESS — Légendes FPS (hero shooter web, Three.js)

**Date** : 2026-10-02 — **Progression globale** : ~88 % (A–H écrites ; I optimisation à faire)

| Étape | État |
|---|---|
| A Fondations | ✅ Terminé |
| B Joueur | ✅ Logique vérifiée par simulation |
| C Combat | ✅ Logique vérifiée par simulation |
| D Personnages (6 légendes) | ✅ Logique vérifiée par simulation |
| E Monde, butin, zone, match | ✅ Écrit, vérifié par simulation de matchs complets |
| F Bots | ✅ Écrit, vérifié par simulation (4 difficultés non comparées en détail) |
| G Interface | ✅ Menus et HUD chargés dans le navigateur ; pointer lock / ressenti non testés |
| H Multijoueur et salons | ✅ Testé : 2 onglets (BroadcastChannel) + vrai WebRTC/PeerJS (salon créé, rejoint, tirs, dégâts, butin, mort, résultats, retour au salon). Pas testé à plusieurs machines/NAT, ni à 3+ joueurs |
| I Optimisation et finition | ⏳ |

## Réalisé (fichiers)
- **A** : `package.json`, `vite.config.js`, `.github/workflows/deploy.yml`, `start.bat`, `src/core/{loop,input,audio,hud}.js`.
- **B** : `src/player/{player,config}.js` (marche, sprint, saut, accroupi, glissade, mantle, tyrolienne, jump pad, à terre).
- **C** : `src/combat/*` — `weapons.json` (5 armes + type de munitions), `combat.js` (trace, dégâts par zone, explosions, réanimation), `weapon.js` (2 emplacements, réserve), `projectiles`, `fx`, `target` (mannequin/hitboxes), `playerProxy`, `viewmodel`.
- **D** : `src/legends/{legends.json,abilities.js,handlers.js}` — passive/tactique (F)/ultime (G) pilotés par JSON ; une instance partagée sert joueur et bots (`castFor`).
- **E** : `src/world/island.js` (carte 240 m : bâtiments à portes, tours, tyroliennes, caisses, pads), `src/loot/{items.json,loot.js,inventory.js}` (butin au sol, E pour ramasser, soins 3/4/5), `src/match/{zone,match}.js` (zone en 5 phases, escouades, éliminations, classement, limites temps/éliminations).
- **F** : `src/bots/{nav,bot,difficulty.json}` — grille de navigation + A* (1 recherche par tick), perception (vue/ligne de vue), états engage/rotate/revive/heal/search/follow/roam, couverture, tir avec erreur de visée, habiletés, comportement d'escouade.
- **G** : `src/ui/{ui.js,ui.css,settings.js}`, `src/core/hud.js`, `src/game.js` — menu principal, préparation (légende + options), pause, options (sensibilité/FOV/volume sauvegardés), résultats ; HUD : vivants, zone, éliminations, fil d'éliminations, escouade, munitions, soins.
- Modes : Solo contre bots, Équipe contre bots, Personnalisée (taille d'équipe, nombre de bots, difficulté, zone, limites, armes/personnages autorisés), Entraînement (mannequins, armes au sol ; `L` change de légende, `Y` ultime prêt, `T` s'infliger des dégâts, `P` respawn).

- **H** : `src/net/` — `transport.js` (PeerJS ou BroadcastChannel si l'URL contient `?local`), `session.js` (HostSession / ClientSession : salon, chat, snapshots 20 Hz, dégâts, butin, événements), `actors.js` (RemotePlayer côté hôte, ProxyActor côté client, NetHealth), `clientMatch.js`. `Match` accepte `cfg.humans` (humains répartis en escouades, places libres = bots) ; `game.js` : `start(cfg, net)` / `startClient` ; UI : écrans `online` et `lobby`, chat en jeu (Entrée).

## À venir (priorité)
1. **I** : profilage, équilibrage (voir ci-dessous), effets/sons, finition (lunette sniper, minimap, parachutage).

## Problèmes connus / non testé
- **Non testé à la main** : verrouillage souris, sensations de tir/mouvement, rendu des effets, sons. Les menus se chargent, une partie démarre, le HUD se met à jour, aucune erreur hormis le pointer lock (refusé par le navigateur de test).
- **Équilibrage** : parties de bots trop rapides (≈ 10 bots sur 11 éliminés en ~1 min) ; à ralentir en I.
- Les bots **ne ramassent pas de butin** (ils naissent équipés, 1–2 soins) ; leur butin tombe à leur mort.
- Bots limités au sol (pas de tours/toits) ; les murs de bouclier ne sont pas dans la grille de navigation (blocage détecté → nouveau chemin).
- Pas de parachutage : apparition au sol, points répartis (échantillonnage du plus éloigné).
- Collisions : liste linéaire d'AABB (≈ 300 boîtes, 0,1 ms/tick mesuré avec 17 bots) ; grille spatiale si la carte grossit.
- Mantle : hauteur max relative aux pieds (≈ 3,4 m depuis un saut). Sons = bips WebAudio, formes procédurales.

## Multijoueur (H) — fonctionnement
- **Hôte** : simule tout (monde, bots, zone, butin, escouades). Il garde la simulation active même onglet masqué (Worker dans `core/loop.js`). Si l'hôte quitte, le salon ferme pour tous (pas de migration d'hôte).
- **Clients** : reconstruisent la même carte (graine) ; gèrent eux-mêmes leur déplacement, leur santé, leurs tirs et leurs habiletés. Les touches sont rapportées à l'hôte (`hit`) qui les applique (le tireur a raison, comme sur son écran). Les autres acteurs sont des `ProxyActor` interpolés (retard 100 ms).
- **Santé** : propriétaire = le joueur lui-même. L'hôte garde un miroir (`NetHealth`) et lui transmet les dégâts (file `pending`) ; soins/réanimations faits sur un miroir sont renvoyés au propriétaire (hooks `onHeal`/`onRevive`).
- **Butin** : l'hôte est l'autorité (`LootField.dirty` → diff dans les snapshots ; ramassage = demande `pick`/`pk` puis `pk2`). **Effets** (traçantes, impacts, explosions, murs, gaz) relayés par événements ; mines et gaz restent gérés par leur propriétaire.
- **Limites connues** : triche possible (le client est cru sur ses touches et sa position) ; pas de TURN (NAT strict = échec de connexion, PeerJS cloud public sans garantie) ; max 8 joueurs ; mines adverses invisibles ; pas de recul d'explosion sur les autres joueurs ; pas de spectateur (un joueur éliminé voit l'écran de résultats) ; pas de reconnexion en cours de partie ; une partie en cours refuse les nouveaux arrivants.
- Test local sans Internet : ouvrir deux onglets sur `http://localhost:5173/?local`.

## Décisions techniques
- Vite + three 0.170, ES modules, aucun framework. Sim à pas fixe 60 Hz, rendu interpolé ; pas d'allocation dans les boucles.
- Un acteur = objet avec `x,y,z,team,health,hs,ray()` ; `Combat.all` = bots + `PlayerProxy` ; mêmes règles de dégâts pour tous.
- Partie = scène neuve (`Game.start`), pools (loot 260, mines 24, murs 8, gaz 4, effets 64).
- Réseau : WebRTC P2P via PeerJS (courtier public gratuit) ; alternative si instable : Trystero ou relais Supabase/Firebase (free tier).

## Lancer / déployer
- Local : double-clic sur `start.bat` (ou `npm install` puis `npm run dev`, http://localhost:5173 ; le serveur doit tourner).
- GitHub Pages : pousser sur `main` ; Settings → Pages → Source = **GitHub Actions** (workflow `deploy.yml`).

## REPRISE
- Projet : `C:\Users\willi\projets\legendes-fps`. `src/game.js` orchestre menus↔partie ; `src/combat` (Combat/Weapons), `src/legends`, `src/loot`, `src/match` (Match/Zone), `src/bots` (Bot/NavGrid), `src/world` (island/testScene/collision), `src/ui`.
- Conventions : mètres/secondes ; `tick(dt)` sans allocation ; données en JSON (`weapons`, `legends`, `items`, `difficulty`) ; un acteur expose `team/health/hs/ray`.
- Touches : ZQSD, Maj, Espace, C, E, clics, R, 1/2 armes, 3/4/5 soins, F/G habiletés, Échap pause ; debug (entraînement) : L, Y, T, P.
- Flux partie : `UI.readConfig()` → `Game.start(cfg)` → `Match` (zone, bots, butin) ; fin → `Game.endMatch(res)` → écran résultats.
- Prochaine tâche : **mise en ligne** (GitHub Pages, voir plus haut) puis test à plusieurs amis ; ensuite **étape I** (équilibrage, bots plus lents, effets/sons, minimap, lunette, parachutage). Bugs signalés par l'utilisateur : à recueillir.
- Si le build échoue dans un dossier sous `AppData`, déplacer le projet (chemin virtualisé).
