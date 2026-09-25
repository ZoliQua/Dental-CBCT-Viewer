# Changelog

All notable changes to **dental-cbct-viewer** are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) from
`1.0.0` onward.

## [Unreleased]

### Added

- **3D IO view** — a dedicated layout showing the CBCT with the patient's
  **intraoral scans** on it, one layer per arch with its own on-image toggle
  (Upper jaw / Lower jaw). It has no MPR companions and no cutting planes — they
  would slice through the arches — and it only appears in the view switcher once
  an upper or lower scan is loaded.
- **Load scan** in the Series panel — import several surface scans (STL / OBJ /
  PLY) at once for the open CT. The arch is recognised from the file name
  (exocad / Medit / 3Shape conventions, EN / DE / HU), so a pair of jaw scans
  lands in the right layers without any picking.
- **Manual registration correction** — per-scan nudges (0.1 / 0.25 / 1 mm and
  0.5 / 1 / 5°, rotating about the scan's own centre) on top of the automatic
  registration, with a one-click reset back to the placement the scan arrived
  with.
- **"Load CT + IO scan sample"** on the landing page and in the New load menu: a
  second de-identified data set — a CBCT plus that patient's upper and lower
  intraoral scans, **already paired to it**. The pairing is measured offline by
  the new `scripts/register-scan-to-cbct.cjs` (coarse pose search + trimmed ICP
  against the CBCT's dense-tissue surface) and lands at ≈0.25–0.32 mm trimmed
  RMS, the CBCT's own voxel size. The existing button is now **"Load CT
  sample"**.
- `loadScans(files)` on the imperative ref API, and `loadSample('ct' | 'ctIo')`.
- `scripts/anonymize-dicom.cjs` — de-identifies a DICOM folder without
  re-encoding it (same-length value overwrites and deterministic pseudonymous
  UIDs, so pixel data and geometry come through untouched); used to prepare the
  bundled sample.
- **View preferences are remembered** — the layout (2D / 3D / Panoramic), the
  1+3 pane arrangement, the panoramic pane order and the 3D slice-plane
  toggles (A / S / C / CS) are restored on the next visit.

### Changed

- **Much faster first load** — the landing page no longer ships the imaging
  stack. Cornerstone, vtk.js, jsPDF and the viewer shell are code-split and
  fetched only when a scan is opened, cutting the landing payload from
  ~2.4 MB to ~350 kB.
- Refreshed the landing-page screenshots to the current interface.

## [1.3.0] — 2026-09-19

### Added

- **Auto arch** — estimates the dental-arch curve from the scan at the current
  axial level (heuristic, no ML); the result stays fully editable.
- **Prosthetically-driven planning** — "Plan from crown" on a tooth-setup /
  wax-up scan derives an implant whose axis follows the crown's long axis,
  detects upper vs lower jaw from bone density, and rejects meshes that are not
  a single crown. The cross-section shows the **screw-access** channel.
- **Measurement values** — length, angle, ROI mean ± SD HU (min–max), HU probe
  and bidirectional values now appear in the Layers list and the PDF report; a
  length measurement also shows an **HU profile** sparkline along the line.
- **Metal-sleeve seat** for the drill guide (opt-in, Settings → Guide): a stepped
  pocket that holds a real sleeve on a shoulder — a repeatable drill stop — over
  the unchanged working drill channel.
- **Guide pre-export checks** — warns about thin housing walls, drill channels
  too narrow for a bur, fragile webs between adjacent bores (seat-aware), and a
  drill path that reaches a marked nerve / sinus past the implant apex.
- **Panoramic view: swappable panes** — the ⤢ button swaps any small pane into
  the big slot and back. The coronal pane is replaced by **3D**, which marks where
  the cross-section cuts (CS toggle) and keeps only the controls relevant there.
- **Mouse-wheel zoom** in the 3D view.
- **API reference** (`API.md`, shipped in the package), a **Next.js embedding
  example** (`examples/nextjs/`) and **Playwright end-to-end smoke tests**.

### Changed

- Panoramic view defaults to **big-left**.
- 3D quality is a single button that cycles **Low → Medium → High**.
- The status bar's **Mode** names the layout ("3D view" / "Panoramic view").
- The demo bundle is code-split by vendor and the PDF stack (jsPDF,
  html2canvas, embedded font) is lazy-loaded — the app entry chunk drops from
  ~2.8 MB to ~0.37 MB.
- Registered-scan slicing uses a cached **BVH**, so dragging a plane no longer
  rebuilds and brute-forces the whole mesh on every move.

### Fixed

- The status-bar **zoom** never updated (it listened for camera events on the
  wrong target); it now follows the big view live, and shows "Fit" for the
  panoramic / cross-section canvases.
- An uncaught `voiRange` `TypeError` logged on every MPR volume load.
- A click without a drag no longer leaves a phantom "0.0 mm" measurement layer.
- Auto arch reports when it cannot find an arch instead of silently doing
  nothing.

### Security

- Plan files: the new measurement `profile` samples are validated (finite
  numbers, capped length) before they reach the SVG sparkline.

### Notes

- The metal-sleeve seat is **off by default**, so plans saved with 1.2.0 export
  exactly the same guide geometry until the seat is enabled.
- The exported drill guide remains for verification on a printed model — not
  for clinical use.

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
- The **sample-loading progress bar** now advances smoothly on the deployed CDN;
  it used the response `Content-Length`, which is absent on the CDN's chunked /
  compressed response, so it jumped straight from 0 % to 100 %. Progress is now
  measured against the bundled file size recorded in the sample metadata.

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

[1.3.0]: https://github.com/ZoliQua/Dental-CBCT-Viewer/releases/tag/v1.3.0
[1.2.0]: https://github.com/ZoliQua/Dental-CBCT-Viewer/releases/tag/v1.2.0
[1.1.0]: https://github.com/ZoliQua/Dental-CBCT-Viewer/releases/tag/v1.1.0
[1.0.1]: https://github.com/ZoliQua/Dental-CBCT-Viewer/releases/tag/v1.0.1
[1.0.0]: https://github.com/ZoliQua/Dental-CBCT-Viewer/releases/tag/v1.0.0
