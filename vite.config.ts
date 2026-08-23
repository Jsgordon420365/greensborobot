import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Nagimals ships as a static SPA. Everything server-side lives in Supabase
// Edge Functions, so the build output is plain files behind any HTTPS host.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
    // The only chunk over the default limit is the Three.js vendor bundle,
    // which is lazily loaded by the shelter and the viewer and never enters
    // the dashboard's critical path.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Three.js and Supabase are large and rarely change; splitting them
        // keeps the app chunk small enough to cache aggressively.
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('@react-three')) return 'r3f';
          if (id.includes('@supabase')) return 'supabase';
          return undefined;
        },
      },
    },
  },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});
