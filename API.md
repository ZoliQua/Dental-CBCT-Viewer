# DenCT — API reference

`dental-cbct-viewer` ([DenCT](README.md)) is an embeddable React dental CBCT / CT
viewer + guided implant planner. This document is the complete public API: the
`<DicomViewer>` component, its imperative ref, and the framework-free `/core`
subpath.

- **Package:** `dental-cbct-viewer` · **License:** MIT
- **Peer deps:** `react` and `react-dom` (18.3+ or 19)
- **Runnable example:** [`examples/nextjs/`](examples/nextjs/) (Next.js App Router)

---

## Install

```bash
npm install dental-cbct-viewer react react-dom
```

**Cross-origin isolation is required.** The DICOM decode workers use
`SharedArrayBuffer`, so the **host page must be served** with:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without these headers image decoding will not run. See
[Framework notes](#framework-notes) for how to set them.

---

## Quick start

```tsx
import { DicomViewer } from "dental-cbct-viewer";
import "dental-cbct-viewer/style.css"; // once, anywhere

export function Planner() {
  return (
    <div style={{ height: "100vh" }}>
      <DicomViewer lang="en" />
    </div>
  );
}
```

The viewer fills its parent, so give it a sized container. Dark mode is the
default and is **scoped to the viewer's own root** (`.dcv-root`) — it never
restyles the host page.

---

## `<DicomViewer>` props

All props are optional. Import the type with
`import type { DicomViewerProps } from "dental-cbct-viewer"`.

| Prop | Type | Description |
|------|------|-------------|
| `patientId` | `string` | Patient id shown in the report header. |
| `patientName` | `string` | Patient name shown in the report header. |
| `initialPlan` | `PlanData` | A saved plan (implants, anatomy, arch, settings…) loaded on mount. |
| `initialLayout` | `LayoutMode` | Starting layout: `'1x1'` \| `'1+3'` \| `'2x2'` \| `'OPG2+1'` \| `'IO3D'`. `'IO3D'` (the 3D IO view) only renders once an upper/lower intraoral scan is loaded. |
| `lang` | `string` | UI language: `'cs'` \| `'da'` \| `'de'` \| `'en'` \| `'es'` \| `'fi'` \| `'fr'` \| `'hu'` \| `'nb'` \| `'pl'` \| `'pt'` \| `'ru'` \| `'sk'` \| `'sv'` \| `'uk'`. An unknown code is ignored. Without it the viewer uses the user's last choice, then the browser / OS language, then English. Languages other than English load on first use as separate chunks. |
| `onPlanChange` | `(plan: PlanData) => void` | Called (debounced) whenever the plan changes — persist it host-side. |
| `onImplantsChange` | `(implants: ImplantData[]) => void` | Called whenever the implant list changes. |
| `className` | `string` | Extra class on the root element. |
| `embedded` | `boolean` | Embed mode — the host owns page-level consent, so the built-in disclaimer banner is suppressed. |
| `autosave` | `boolean` | Keep a per-study copy of the plan in sessionStorage so a reload restores it (default `true`). Turn it off when the host persists plans through `onPlanChange`. |
| `features` | `ViewerFeatures` | Edition switches, `{ implantPlanning?: boolean; drillGuide?: boolean }`, both `true` by default. See [Editions](#editions). |
| `branding` | `boolean` | Show the web promotion — the GitHub star, the landing page's About box and the other-projects links. Default `true`. |
| `theme` | `'dark' \| 'light'` | Host-owned theme. When set it overrides the remembered choice, follows the prop live, and the viewer's own theme toggles are hidden. Omit it to keep the built-in toggle. |

### Editions

The same component runs as a plain imaging viewer or as the full planner.

- **`features={{ implantPlanning: false }}`** — no implant planning. Every way
  in is gone: the *+ Implant* buttons, the implant list and its edit popup,
  *Plan from crown* on a tooth-setup scan, the implant-planning and drill-guide
  settings tabs, the implant / safety / bone-quality sections of the PDF report
  and the intro tour's planning step. It is enforced on the state, not only the
  UI: implants (and guide settings) are held back from every plan loaded —
  `initialPlan`, `loadPlan`, the *Load plan* menu and the session autosave —
  and `addImplant` / `updateImplant` are no-ops. Held data is not shown and is
  left out of a saved plan file and of `getImplants()`, but `getPlan()`,
  `onPlanChange` and the autosave keep it, and it returns when the feature is
  switched on again. A series switch clears held implants like visible ones. Viewing, MPR, panoramic and
  cross-sections, 3D, measurements and annotations, nerve / sinus tracing,
  scan import and registration, and image / PDF export all stay. It implies
  `drillGuide: false`. Help and intro text that described the planner switch
  to edition copy.
- **`features={{ drillGuide: false }}`** — implants without guided surgery: no
  sleeve settings, no drill-guide settings tab, no *Drill guide (STL)* export,
  and `exportGuideStl()` resolves `false`. Sleeves are held back from loaded
  plans in the same way.

```tsx
<DicomViewer features={{ implantPlanning: false }} branding={false} theme="dark" />
```

---

## Imperative ref (`DicomViewerHandle`)

```tsx
import { useRef } from "react";
import { DicomViewer, type DicomViewerHandle } from "dental-cbct-viewer";

function App() {
  const ref = useRef<DicomViewerHandle>(null);
  return (
    <>
      <button onClick={() => ref.current?.loadSample()}>Load sample</button>
      <button onClick={() => ref.current?.exportPdf()}>Export PDF</button>
      <DicomViewer ref={ref} initialLayout="1+3" />
    </>
  );
}
```

| Method | Signature | Description |
|--------|-----------|-------------|
| `getImplants` | `() => ImplantData[]` | Current implants. |
| `addImplant` | `(implant: ImplantData) => void` | Add an implant. |
| `updateImplant` | `(implant: ImplantData) => void` | Replace an implant (matched by `id`). |
| `removeImplant` | `(id: string) => void` | Remove an implant. |
| `getPlan` | `() => PlanData` | Serialize the current plan. |
| `loadPlan` | `(plan: PlanData) => void` | Load a plan. |
| `loadStudy` | `(files: File[]) => Promise<void>` | Load a DICOM study (or GALILEOS / OneVolume folder) from files. |
| `loadScans` | `(files: File[]) => Promise<void>` | Import surface scans (STL / OBJ / PLY) alongside the open study. The arch is guessed from each file name; an upper or lower scan enables the 3D IO view. Imported meshes land on the volume centre and still need registering. |
| `loadSample` | `(kind?: 'ct' \| 'ctIo') => Promise<void>` | Load a bundled anonymized sample: `'ct'` (default) is the CBCT alone, `'ctIo'` is a CBCT plus the patient's upper and lower intraoral scans, already paired to it. |
| `setLayout` | `(mode: LayoutMode) => void` | Switch layout. |
| `setActiveView` | `(view: ViewKey) => void` | Set the active MPR/3D view (`'AXIAL'` \| `'SAGITTAL'` \| `'CORONAL'` \| `'3D'`). |
| `exportPdf` | `() => Promise<void>` | Build + download the multi-view PDF report. |
| `exportGuideStl` | `() => Promise<boolean>` | Build + download the printable drill-guide STL (`false` if there is nothing to build, or the edition has no drill guide). |
| `openSettings` | `() => void` | Open the settings dialog (e.g. from a native app menu). |
| `openHelp` | `() => void` | Open the help panel. |
| `startTour` | `() => void` | Start the intro tour. |

With `features={{ implantPlanning: false }}`, `addImplant` and `updateImplant`
do nothing and `loadPlan` holds the plan's implants back (see [Editions](#editions)).

---

## `/core` — framework-free building blocks

`dental-cbct-viewer/core` is React-, Cornerstone- and DOM-free, so it runs in
Node, tests or your own logic. It re-exports the data model and the pure math.

```ts
import {
  IMPLANT_SYSTEMS, getImplantSystem,   // implant catalog
  implantWorldAxis, evaluateImplant,   // geometry + nerve/sinus/neighbour safety
  classifyBone, sampleImplantBoneHU,   // Misch D1–D5 bone quality
  buildDrillGuide, triMeshToBinarySTL, // printable drill-guide CSG + STL
} from "dental-cbct-viewer/core";
```

### Data model & catalog (`types/dicom`)
`ImplantData`, `ImplantSystem`, `GuidedPlan`, `GuideParams`, `AnatomyMarker`,
`LayoutMode`, `ViewKey`, plus the `IMPLANT_SYSTEMS` catalog and
`getImplantSystem(id)`.

> `PlanData` is **not** part of `/core` — import it from the main entry:
> `import type { PlanData } from "dental-cbct-viewer"`.

### Implant geometry (`core/implantGeometry`)
`implantWorldAxis(controlPoints, implant)` (entry→apex world axis),
`implantAxis(frame, angleBLDeg, angleMDDeg)`, `archFrameAt` / `nearestArchFrame`,
and the plane-intersection helpers used by the cross-section / panoramic views.

### Safety clearances (`core/safety`)
`evaluateImplant(self, others, markers, thresholds)` — nerve / sinus / neighbour
clearances for one implant — plus the segment-distance primitives
(`distSegmentToSegment3`, `distSegmentToPolyline3`).

### Bone quality (`core/boneQuality`)
`classifyBone(hu)` (Misch **D1** > 1250 · **D2** 850–1250 · **D3** 350–850 ·
**D4** 150–350 · **D5** < 150) and `sampleImplantBoneHU(vol, entry, apex, radius)`.
CBCT gray values are uncalibrated — treat as indicative, not true HU.

### CPR sampling (`core/cprMath`)
`trilinear`, `buildUniformCurve`, `computeCrossSection` and the
`VolumeSamplingData` type — the curved-planar-reformation math behind the
panoramic and cross-section views.

### Arch curve (`core/archCurve`)
`interpolateArchCurve`, `resampleByArcLength`, `computeCurveNormals`,
`generateDefaultArchCurve` — Catmull-Rom arch-curve math.

### Drill-guide geometry (`core/guideGeom`, `core/guideExport`, `core/guideBuilder`)
`cylinderMesh` / `sweptBarMesh` / `planSleeveSeat` (pure `TriMesh` primitives),
`triMeshToBinarySTL(mesh)`, and `buildDrillGuide(input)` — the async CSG build
(loads the `manifold-3d` WASM kernel lazily). The exported guide is for
**verification on a printed model, not clinical use**.

---

## Framework notes

- **Vite:** works out of the box; set the COOP/COEP headers in `server.headers`
  / `preview.headers`.
- **Next.js (App Router):** render the viewer in a `"use client"` component and
  load it with `next/dynamic` + `ssr: false` (it reads the DOM on mount); set the
  COOP/COEP headers in `next.config.js`. A complete example lives in
  [`examples/nextjs/`](examples/nextjs/).

---

## License & disclaimer

MIT © Zoltán Dul. **Research / demonstration software — not a certified medical
device** and not for clinical diagnosis, treatment planning, precise measurement
or implant workflows. Verify everything independently.
