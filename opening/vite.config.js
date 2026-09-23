import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The greensborobot opening: a plain three.js page, built into the site root.
// Nagimals builds first into dist/app, so this build must not empty dist.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  publicDir: 'public',
  build: {
    outDir: '../dist',
    emptyOutDir: false,
    assetsDir: 'o',           // hashed bundles; kept apart from /app/assets and /media
    chunkSizeWarningLimit: 900,
  },
  server: { port: 5174 },
  preview: { port: 4174 },
});
