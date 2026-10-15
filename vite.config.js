import { defineConfig } from 'vite';

// base './' : fonctionne sur GitHub Pages quel que soit le nom du dépôt.
// Bibliothèques dans des fichiers séparés : le navigateur (et le service worker) les garde d'une version à l'autre, seul le code du jeu est retéléchargé.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/peerjs') || id.includes('node_modules/webrtc-adapter') || id.includes('node_modules/sdp') || id.includes('node_modules/@msgpack') || id.includes('node_modules/eventemitter3')) return 'net';
        },
      },
    },
  },
});
