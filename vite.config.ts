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
      output: {
        // Split the heavy imaging/render/report vendors into their own chunks so
        // they load in parallel and stay cached across app-code changes, instead
        // of one ~2.8 MB monolith. (The npm library build externalises these, so
        // this only shapes the demo/deployed app bundle.)
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@cornerstonejs') || id.includes('dicom-parser')) return 'cornerstone';
          if (id.includes('@kitware') || id.includes('/vtk.js/')) return 'vtk';
          if (id.includes('jspdf') || id.includes('html2canvas')) return 'pdf';
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react';
          return undefined;
        },
      },
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
