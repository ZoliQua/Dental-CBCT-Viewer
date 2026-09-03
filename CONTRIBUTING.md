# Contributing

Thanks for considering a contribution to **DenCT**. Bug reports,
fixes, translations and new features are all welcome, and contributions are
acknowledged in the project's commit history.

## Getting set up

This is a **React + TypeScript** library built with **Vite**.

- Install dependencies: `npm install`
- Run the demo/dev app (port 3340): `npm run dev`
- Build the npm library (into `dist/`): `npm run build:lib`
- Build the demo app (into `demo-dist/`): `npm run build`
- Run the tests: `npm test` (Vitest, specs under `tests/`)

> **Cross-origin isolation:** the DICOM decode workers use `SharedArrayBuffer`,
> so the dev server sets `Cross-Origin-Opener-Policy: same-origin` and
> `Cross-Origin-Embedder-Policy: require-corp` (see `vite.config.ts`). Any host
> that embeds the library must serve these headers too.

There is no separate linter; the strict TypeScript build (`tsc -b`, run by
`npm run build`) is the compile-time gate.

## Project layout

- `src/App.tsx` — the `DicomViewer` component (forwardRef + imperative handle).
- `src/index.ts` — the package's main entry (component + public types).
- `src/core.ts` — the `dental-cbct-viewer/core` entry: **React-free** functions,
  types and the `IMPLANT_SYSTEMS` catalog.
- `src/core/*.ts` — the pure math (implant geometry, safety clearances, bone
  quality, CPR sampling, arch curve, drill-guide geometry/STL). Anything under
  here that is exported from `src/core.ts` **must not import React, Cornerstone
  or the DOM** — it has to keep running in Node and tests.
- `src/components/`, `src/context/`, `src/hooks/` — the React UI and state.
- `src/i18n/translations.ts` — all UI strings, in **four languages**
  (EN / DE / ES / HU). Every new UI string needs a key in all four.

The two builds share the repo: `vite.config.ts` builds the demo app to
`demo-dist/`, and `vite.lib.config.ts` builds the published library to `dist/`.

## Tests

`npm test` runs the Vitest suite in `tests/`. The pure math is designed to be
tested without Cornerstone (a linear-field trick decodes exact sampled world
positions). Add or update tests for anything you change, and keep the geometry
math covered — the whole point of `/core` is that it is verifiable in isolation.

## Before you open a pull request

- Keep changes small and focused — one topic per pull request.
- Run `npm test` and `npm run build` (and `npm run build:lib` if you touched the
  package surface). They should all pass.
- Add or update tests for behaviour you change.
- If you change a persisted shape, bump the plan version (`PLAN_VERSION`).

## Translations & docs

- UI text lives in `src/i18n/translations.ts` (EN / DE / ES / HU).
- Documentation is `README.md` plus the per-language guides under
  `lang/README-{en,de,es,hu}.md`. When behaviour or the public API changes,
  update the README and the language guides together.

## Versioning

The package follows **Semantic Versioning** from `1.0.0`. Public API changes
(the `DicomViewer` props, the `DicomViewerHandle` methods, and the `/core`
exports) must respect semver; keep the `CHANGELOG.md` up to date and bump the
version in `package.json` (and `APP_VERSION` in `src/core/pdfExport.ts`) with
every release.

## Style

- Follow the patterns already in the surrounding code.
- Prefer explicit, readable logic over clever shortcuts.
- Don't add heavy dependencies — the bundle is meant to stay lean, and the heavy
  imaging libraries (Cornerstone, vtk.js) stay **external** to the package.

## A note on scope

This is **research / demonstration software**, not a certified medical device.
Please keep the medical disclaimer intact and don't frame the project as fit for
clinical diagnosis, treatment planning, precise measurement or implant workflows.
