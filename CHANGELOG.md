# Changelog

All notable changes to **dental-cbct-viewer** are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) from
`1.0.0` onward.

## [1.2.0] — 2026-09-03

### Added

- **Multi-study** — load and hold several CTs at once in a left-panel **series
  tree**; switch between studies instantly (each keeps its own volume and plan),
  append more with "+ Load", and close one with its ✕. Series rows show pixel
  dimensions and spacing.
- **3D render controls** — a **Low/Medium/High quality** selector (a real
  sampling-density difference) and **Grayscale / Cool / Warm / Spectral /
  Inverted** colormaps, alongside the existing presets and slice planes.
- **Save Image** export modal — **PNG/JPG** at a chosen resolution, pick which of
  the current layout's views, tick the on-image info to burn in (name, clinic,
  orientation, slice number…), as separate files or a single grid.
- **Configurable Save PDF** — toggle header fields and report sections (views,
  implants, measurements, safety, bone quality, disclaimer), **portrait or
  landscape**, and which views to embed.
- **Bottom status bar** — a "local processing — data is not uploaded" line plus
  modality/image count, WW/WL, live zoom, view mode and active tool.

### Changed

- **Renamed to DenCT** (display name, browser title and docs). The npm package
  `dental-cbct-viewer` and the repository are unchanged.
- **Left panel reworked** into one collapsible rail with independent
  **Patients / Series / Layers / Tools** toggles; the Patient card and the
  study/series tree moved here. Layouts are now **2D view / 3D view /
  Panoramic view**.
- **Landing page** rebuilt as a sectioned overview (metrics, views, tools,
  imaging, privacy) with in-top-bar section navigation; the settings / intro /
  help controls stay hidden until a study is open.

### Fixed

- **Blank viewports on load in dev** — React StrictMode's mount→unmount→remount
  purged the volume that the loader had just created; the release is now deferred
  and cancelled on remount.
- The exported **3D view** no longer includes the crosshair tool's dark cross.

### Security

- **OneVolume import** now validates the declared geometry *before* allocating
  and reads exactly the declared voxels (no oversized transient copy; handles an
  odd byte offset), matching the GALILEOS loader's validate-then-allocate order.
- Ran `npm audit fix`; the remaining advisories are transitive build-time/dev
  dependencies of the imaging libraries (not shipped runtime code).
- Documented the recommended host **Content-Security-Policy** for embedders (see
  the README "Security & privacy" section). The viewer performs no network
  egress of scan or patient data.

## [1.1.0] — 2026-08-31

### Added

- **Native (non-DICOM) CT import** — GALILEOS (Sirona) folder exports
  (`*_vol_0` header + `*_vol_0_###` gzip'd uint16 slices) and OneVolume
  (Morita) `CT_0.vol` volumes are detected from the selected files and decoded
  onto the same Cornerstone pipeline as DICOM. Implemented from the documented
  format facts; verify against real exports (adapters in `src/core/import/`).
- **Landing / Settings refresh** — separate "what" / "how" info boxes with the
  accepted file types; a two-column loader (sample vs. file/folder upload) with
  a darkening % progress overlay for the sample; a short non-dismissable
  disclaimer; a new Settings "About & Credits" tab (main contributor + linked
  open-source dependencies).

## [1.0.1] — 2026-09-13

### Fixed

- **npm homepage** now points to the live Vercel demo instead of the GitHub readme.
- **Vercel deployment**: add `vercel.json` — the demo builds to `demo-dist/`
  (the library owns `dist/`), and the deployment now serves the required
  `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers so the
  DICOM decode workers run.

## [1.0.0] — 2026-09-12

First public release — the viewer is packaged as an embeddable React library.

### Added

- **Embeddable component** `DicomViewer` (default + named export) with a
  shipped stylesheet (`dental-cbct-viewer/style.css`).
- **Imperative ref API** (`DicomViewerHandle`): `getImplants`, `addImplant`,
  `updateImplant`, `removeImplant`, `getPlan`, `loadPlan`, `loadStudy(files)`,
  `loadSample`, `setLayout`, `setActiveView`, `exportPdf`, `exportGuideStl`.
- **Controlled props / callbacks**: `initialPlan`, `initialLayout`, `lang`,
  `onPlanChange` (debounced), `onImplantsChange`, `patientId`, `patientName`,
  `className`, `embedded`.
- **Framework-free `/core` subpath** (`dental-cbct-viewer/core`): React-free
  functions and types — implant geometry, nerve/sinus/neighbour safety
  clearances, Misch D1–D5 bone quality, CPR sampling, arch-curve and drill-guide
  geometry / binary STL export, plus the `IMPLANT_SYSTEMS` catalog.
- **Viewer features**: MPR + true-3D (translucent X-ray preset) with intersecting
  slice planes and a crop box; panoramic (OPG) reconstruction along a draggable
  dental arch; tiltable perpendicular cross-sections; guided implant planning
  (3D implant + drill sleeve, safety rings, bone quality); printable drill guide
  (STL) via `manifold-3d`; multilingual PDF report (bundled Unicode font);
  plan save/load (JSON); a 4-language UI (EN / DE / ES / HU).

### Build & packaging

- ESM library build (Vite library mode) with `.d.ts` type declarations and a
  `.` / `./core` / `./style.css` exports map.
- `react` / `react-dom` are peer dependencies; the heavy imaging libraries
  (Cornerstone3D, vtk.js, jsPDF, dicom-parser) stay external. The DICOM decode
  worker and its WASM codecs are bundled into self-contained chunks.
- Dark mode is scoped to the viewer's own root (`.dcv-root`), never the host
  page; the shipped CSS does not style the host `<body>`.

### Notes

- The host page must serve `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp` (the decode workers use
  `SharedArrayBuffer`).
- This is research / demonstration software — **not** a certified medical device.

[1.2.0]: https://github.com/ZoliQua/Dental-CBCT-Viewer/releases/tag/v1.2.0
[1.1.0]: https://github.com/ZoliQua/Dental-CBCT-Viewer/releases/tag/v1.1.0
[1.0.1]: https://github.com/ZoliQua/Dental-CBCT-Viewer/releases/tag/v1.0.1
[1.0.0]: https://github.com/ZoliQua/Dental-CBCT-Viewer/releases/tag/v1.0.0
