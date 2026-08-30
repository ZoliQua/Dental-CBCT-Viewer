import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3340,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  worker: {
    format: 'es',
    rollupOptions: {
      // Optional Cornerstone Tools peer dep (polymorphic segmentation) — not
      // installed and not used by this app, but its polySeg worker imports it
      external: ['@icr/polyseg-wasm'],
    },
  },
  build: {
    // The demo/dev app builds here; the npm library build (vite.lib.config.ts)
    // owns dist/ exclusively so the published package never includes the demo
    // sample or index.html.
    outDir: 'demo-dist',
    rollupOptions: {
      external: ['@icr/polyseg-wasm'],
    },
  },
  optimizeDeps: {
    include: [
      '@cornerstonejs/core',
      '@cornerstonejs/tools',
      '@cornerstonejs/dicom-image-loader',
      'dicom-parser',
    ],
  },
});
