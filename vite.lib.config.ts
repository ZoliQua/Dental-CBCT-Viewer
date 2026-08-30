/**
 * Library build for the npm package `dental-cbct-viewer`.
 *
 * Two ESM entries — `.` (the React component) and `./core` (React-free
 * functions/types). React/React-DOM and the heavy imaging libs (Cornerstone,
 * vtk.js, jsPDF, dicom-parser) stay EXTERNAL — the consumer installs them
 * (peer/deps) so there is a single Cornerstone instance and a small bundle.
 * The DICOM decode worker and its WASM codecs are bundled into self-contained
 * worker/asset chunks so the published package needs no extra wiring.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import path from 'path';

// Bare imports that must NOT be bundled (resolved from the consumer's deps).
const externalRe: RegExp[] = [
  /^react($|\/)/,
  /^react-dom($|\/)/,
  /^@cornerstonejs\//,
  /^@kitware\/vtk\.js($|\/)/,
  /^jspdf($|\/)/,
  /^dicom-parser($|\/)/,
];

export default defineConfig({
  plugins: [
    react(),
    dts({ entryRoot: 'src', include: ['src'], outDir: 'dist', insertTypesEntry: true }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  worker: {
    format: 'es',
    rollupOptions: { external: ['@icr/polyseg-wasm'] },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Do not copy public/ (the ~16 MB demo sample + hero icon) into the package.
    copyPublicDir: false,
    target: 'es2020',
    sourcemap: true,
    lib: {
      entry: {
        index: path.resolve(__dirname, 'src/index.ts'),
        core: path.resolve(__dirname, 'src/core.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: (id) => externalRe.some((re) => re.test(id)),
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (info) =>
          (info.name ?? '').endsWith('.css') ? 'style.css' : 'assets/[name]-[hash][extname]',
      },
    },
  },
});
