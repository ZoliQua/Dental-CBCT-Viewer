# Changelog

All notable changes to **dental-cbct-viewer** are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) from
`1.0.0` onward.

## [Unreleased]

### Added

- **The registration says how far off it can be where the implant goes.** The
  panel could already show the residual at each landmark pair, which is the
  obvious number and the wrong one: Fitzpatrick, West & Maurer (IEEE TMI, 1998)
  showed it is essentially uncorrelated with the error at a target away from
  the markers. A constellation bunched on one side of the arch fits with a
  flattering 0.1 mm residual and still swings a millimetre at a molar on the
  far side, because the markers pin translation down well and rotation about
  themselves hardly at all — and nothing in the fit announces it. The panel now
  predicts the error at each planned implant's apex (at the scan's own extent
  when nothing is planned yet), names the worst one, and separates the two
  failures it can see: markers lying on one line, where rotation about that
  line is simply undetermined, and markers too bunched to hold the far end of
  the arch, where the fix is to spread them rather than to click more
  carefully. New pure `src/core/registrationError.ts`, exported from `/core`,
  with 12 tests. The estimate is an expectation over many registrations, not a
  bound on this one; its value is comparative, and it is reported because the
  failure it catches is invisible otherwise.

## [1.4.0] — 2026-10-18

### Added

- **A scan's registration is saved with the plan.** The transform is the
  expensive part of a plan — minutes of landmark picking, or a marker
  constellation confirmed bead by bead — and until now it lived only in memory,
  so reopening a case threw it away and the work had to be repeated. Plans now
  carry the scan descriptors (arch, colour, visibility and the 4x4), while the
  mesh itself, which is megabytes, still does not travel. Reopening a plan with
  the files already loaded puts each saved pose straight back on its mesh,
  matched by file name rather than by an id that changes every session; a saved
  scan whose file is not loaded is listed in the Series tree with the file to
  re-import, and importing it reattaches the registration instead of starting
  from the volume's centre.
- **Metal in the CT is detected and reported.** Restorations absorb more X-ray
  than the reconstruction can solve for, and what comes out is a bright core
  wrapped in dark bands and bright streaks reaching centimetres into the
  neighbouring anatomy — across exactly the tooth surfaces a scan would be
  matched against. The registration panel now sweeps the volume for material
  denser than any tissue, reports how much it found and in how many places, and
  says plainly that a surface fit cannot be trusted on such a scan. Measured on
  the bundled sample: 2396 mm³ in eight sites, half the crown surface within
  4 mm of it. Detecting metal is unambiguous in a way that correcting for it is
  not, and an operator who knows it is there can register on markers instead.
- **Radiopaque marker (fiducial) registration.** The answer to the problem the
  previous release could only describe: surface matching cannot pin a scan down
  at the millimetre scale, because most of an arch scan is gingiva the CBCT
  never imaged. A marker can, because a bead is a *point* rather than a surface
  — its centre is unambiguous in both the volume and the scan, so the
  correspondence is exact instead of a best guess between two similar edges.
  **Detect markers** sweeps the CT for bead-shaped blobs (coarse pass to find
  them, fine pass to measure each one's size, shape and centre) and draws the
  candidates in the 3D view. They are proposals, not answers — a restoration can
  be just as small, bright and round — so the operator confirms each by clicking
  it, which is the point: picking the CBCT side stops being "hit the right voxel
  of a translucent volume" and becomes "click the bead you can see". A click
  near a candidate takes its centre; a click on the scan is fitted to the sphere
  around it, because the centre of a sphere is fixed by its surface and the fit
  beats any single point on it. The scan being registered steps aside while a
  CBCT marker is picked.
- **Mis-paired markers are caught.** Pairing marker 2 with marker 3 is the
  classic fiducial blunder and it does not announce itself — the fit simply
  comes out wrong. The beads form a rigid constellation, so the correct
  assignment is the one whose inter-point distances agree; when a different
  assignment fits markedly better, the panel offers to apply it.
- **Landmarks can be picked on the 3D rendering**, not just the axial slice.
  Registration landmarks are cusp tips, and finding a tip on a slice means
  scrubbing until it happens to lie in the plane; on the 3D view it is simply
  the point you can see. A click walks the camera ray into the volume and stops
  at the first bone/enamel it meets, honouring whatever the view is clipped to,
  and the scan being registered steps out of the way while you aim at the CT
  underneath it.
- **Landmark registration takes as many pairs as you want** (three to eight),
  with each pair's residual shown live and the worst one flagged. Three is what
  a rigid fit needs, not what it wants: every pair carries the operator's click
  error and a least-squares fit averages it down. A landmark that is
  millimetres out is a mis-click, and now it is visible — re-pick that one pair
  instead of starting the registration over.
- **Jaw filter in the 3D view** — show the upper or the lower jaw alone, cut at
  the occlusal plane, so one arch can be turned around without the other in the
  way. The split is found from the scan itself (the two enamel peaks along the
  patient axis with the gap between them), and a volume holding only one arch
  is recognised as such: it gets no button rather than an option that would
  blank the view. Choosing a jaw also shows that arch's intraoral scan and
  hides the other, so "lower jaw" means the lower jaw and nothing else.
- **Sagittal slice in the 3D IO view**, with its own scrubber — drag it along
  the arch to see whether the scan's surface really sits on the enamel. This
  layout has no MPR pane for the plane to follow, so it gets a slider.
- **Imported scans appear in the Series tree** under the CT they belong to,
  with their arch, triangle count and extent, and their own visibility and
  remove controls.
- **3D IO view** — a dedicated layout showing the CBCT with the patient's
  **intraoral scans** on it, one layer per arch with its own on-image toggle
  (Upper jaw / Lower jaw). It has no MPR companions, and it only appears in the
  view switcher once an upper or lower scan is loaded.
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
  intraoral scans, **already paired to it**. The pairing is computed offline by
  the new `scripts/register-scan-to-cbct.cjs` (coarse pose search + trimmed ICP
  against the CBCT's dense-tissue surface). Its 0.25–0.32 mm trimmed RMS is the
  fit's own score and **not an accuracy**: the objective turns out to be shallow
  at the millimetre scale (see *Not shipped*), so treat the pairing as visually
  correct rather than measured. The existing button is now **"Load CT sample"**.
- `loadScans(files)` on the imperative ref API, and `loadSample('ct' | 'ctIo')`.
- `scripts/anonymize-dicom.cjs` — de-identifies a DICOM folder without
  re-encoding it (same-length value overwrites and deterministic pseudonymous
  UIDs, so pixel data and geometry come through untouched); used to prepare the
  bundled sample.
- **View preferences are remembered** — the layout (2D / 3D / Panoramic), the
  1+3 pane arrangement, the panoramic pane order and the 3D slice-plane
  toggles (A / S / C / CS) are restored on the next visit.

### Changed

- **ICP is usable on real surfaces.** Nearest-neighbour was brute force, which
  is fine for a handful of landmarks and hopeless for thousands of points; it
  now carries an exact uniform-grid index and an optional trimmed objective.

### Not shipped

- **Crown-only surface registration, masked by the scan's own colour.** The
  published method that reports 0.234 mm (Bioengineering 2023) does one thing
  this project's attempts did not: it removes the gingiva from the intraoral
  scan and matches crowns alone. The scans carry texture, and the colour does
  separate them cleanly — saturation runs about 0.23 over the occlusal surface
  against 0.48 higher up — so the mask was built: per-scan Otsu threshold, a
  hue window seeded from the occlusal 2 mm (which is enamel by construction, and
  so adapts to each scan's white balance), a specular reject, erosion over the
  mesh graph and a component-size floor.

  It does not make the objective usable, and the measurements say why it never
  could on this data. Starting a fit from seven nearby poses lands on seven
  different answers, 0.3–1.0 mm apart. Split the arch into thirds and each third
  converges tightly on its own, but to poses 1.4–2.7 mm from one another, so
  there is no single rigid pose that satisfies the whole arch. The cause is in
  the volume, not the algorithm: this sample holds 2396 mm³ of metal, and 90 %
  of the upper crown surface lies within 16 mm of it. Exclude everything near
  the metal and the lower jaw's objective does sharpen — six starts agreeing to
  within 0.2 mm — but it agrees on a pose 4.5 mm from the shipped one, and with
  no ground truth to check it against, that is a number to investigate rather
  than to ship. The upper jaw has too little clean surface left to try at all.

  Two corrections to what the previous entry claimed. An earlier round of this
  measurement reported that colour masking fixed the lower jaw; it probed
  positive offsets only, and the lower jaw's error runs the other way — it fails
  on −1 mm y like the upper fails on +1 mm y. And the `scans.json` transform
  used as "truth" throughout is the offline ICP's own output, so a test that
  only shows the objective disagreeing with it proves nothing by itself; the
  conclusions above rest on repeatability and internal consistency instead.
  What ships from this work is the metal warning, under *Added*.

  The paper's other pillar was tried too, and closes the question. Instead of
  an HU isolevel, the scan was matched against *segmented* dentition — connected
  components above 1800 HU with a size floor, which drops streak fragments by
  construction where an isosurface cannot. It does give a sharper objective
  (0.67 mm at the shipped pose falling to 0.28 mm). It also disagrees with the
  image-based one by 7.5 mm: on the lower jaw the image objective pulls 4.2 mm
  one way along the patient axis and the segmentation objective 3.3 mm the
  other. Two methods, one data set, opposite answers — neither has found
  anything real. The upper jaw does not even stay put: its crowns slide 8-9 mm
  backwards, because at 1800 HU the whole upper dentition fuses into a single
  3743 mm³ lump and a point cloud slides freely along it. Separating individual
  teeth, which is what the paper's correspondences need, is the hard problem
  here rather than a step on the way.

  One idea of our own went the same way: use the restorations as natural
  fiducials, since the CT locates them in 0.02 s and metal should read as grey
  in the scan's texture. The lower jaw's scan shows no grey patch at all and
  the upper's three sit 8 mm off the occlusal surface, so they are shadows. The
  CT says why — the largest site is 1648 mm³ in the anterior maxilla, a
  metal-ceramic framework. Its metal is substructure under a ceramic facing, so
  the scanner sees a tooth. Metal that a CBCT cannot miss is metal an intraoral
  scanner cannot see.

- **Automatic surface refinement of a scan's registration.** It was built,
  measured against a known-good registration, and removed: no local objective
  tried — trimmed point-to-point ICP against an extracted surface, nor
  Gauss–Newton on the image's own intensity edge, with or without a
  surface-normal gate — has its minimum at the correct pose. Measured on the
  bundled sample, a pose 1 mm from the truth scores *better* than the truth on
  every one of them, and a fit seeded 1 mm out converges further away rather
  than back. This is not a resolution limit: the same result comes back from
  the full 0.15 mm series. The cause is that most of an arch scan is gingiva,
  which a CBCT does not image, so the correspondences that remain do not
  constrain the pose at the millimetre scale. A button that degrades a
  registration is worse than no button, so the effort went into the manual
  path instead: landmarks on the 3D rendering, more pairs, per-pair residuals,
  and a sagittal slice to check the result against — and, above, markers, which
  is how the problem is actually solved rather than worked around.
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

[1.4.0]: https://github.com/ZoliQua/Dental-CBCT-Viewer/releases/tag/v1.4.0
[1.3.0]: https://github.com/ZoliQua/Dental-CBCT-Viewer/releases/tag/v1.3.0
[1.2.0]: https://github.com/ZoliQua/Dental-CBCT-Viewer/releases/tag/v1.2.0
[1.1.0]: https://github.com/ZoliQua/Dental-CBCT-Viewer/releases/tag/v1.1.0
[1.0.1]: https://github.com/ZoliQua/Dental-CBCT-Viewer/releases/tag/v1.0.1
[1.0.0]: https://github.com/ZoliQua/Dental-CBCT-Viewer/releases/tag/v1.0.0
