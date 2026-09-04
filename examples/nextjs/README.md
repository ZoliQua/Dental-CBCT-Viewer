# DenCT × Next.js (App Router) example

A minimal [Next.js](https://nextjs.org/) App Router app that embeds the
[`dental-cbct-viewer`](https://www.npmjs.com/package/dental-cbct-viewer) (DenCT)
component.

## Run it

```bash
# from this folder, against the published package:
npm install
npm run dev        # http://localhost:3000
```

To try it against your local checkout instead of the npm release, build the
library once at the repo root and point the dependency at it:

```bash
# repo root
npm run build:lib
# then in this folder, install the local build
npm install ../../   # or: npm link ../..
```

## What it shows

- **Client-only mount.** The viewer touches the DOM (canvas, Web Workers) on
  mount, so `app/Viewer.tsx` is a `"use client"` component and loads the
  component with `next/dynamic` and `ssr: false`.
- **Required headers.** `next.config.js` sets
  `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp` — the DICOM decode workers use
  `SharedArrayBuffer`, which needs cross-origin isolation. Without them image
  decoding will not run.
- **Sized container.** The viewer fills its parent, so it is rendered inside a
  `height: 100vh` flex column.
- **Stylesheet.** `import 'dental-cbct-viewer/style.css'` once. Its dark mode is
  scoped to the viewer's own root, so it never restyles the host page.
- **Ref API + callbacks.** A `DicomViewerHandle` ref drives `loadSample()` /
  `exportPdf()`, and `onImplantsChange` / `onPlanChange` report state back to the
  host (the plan is persisted to `localStorage` here).

## Notes

- `embedded` suppresses the built-in disclaimer banner — the host page is
  expected to own page-level consent. This is **research/demo software, not a
  medical device**; keep an appropriate disclaimer in your host UI.
- `react` / `react-dom` are peer dependencies of the package (React 18 or 19).
