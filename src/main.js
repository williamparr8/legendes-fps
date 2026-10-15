import { Game } from './game.js';

window.game = new Game();

// Service worker (production seulement) : cache des textures, modèles et fichiers du jeu pour les visites suivantes.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {}));
}
