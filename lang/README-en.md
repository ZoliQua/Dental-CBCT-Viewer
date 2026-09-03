# 🦷 DenCT — English

🇬🇧 English · 🇩🇪 [Deutsch](README-de.md) · 🇪🇸 [Español](README-es.md) · 🇭🇺 [Magyar](README-hu.md) · [⬅ Back](../README.md)

An embeddable **dental CBCT / CT DICOM viewer** for React + TypeScript: MPR + true-3D, panoramic (OPG) reconstruction, cross-sections, guided implant planning, safety clearances, bone quality, a printable drill guide (STL) and a multilingual PDF report.

---

## Installation

```bash
npm install dental-cbct-viewer react react-dom
```

- **React 18 or 19** (peer dependency).
- ESM-only; needs a bundler with Web Worker + WASM support (Vite, webpack 5, Next.js, Rollup).
- Cornerstone3D, vtk.js, jsPDF and dicom-parser are installed as dependencies.

### ⚠️ Cross-origin isolation (required)

The DICOM decode workers use `SharedArrayBuffer`. Serve the host page with:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without these headers, image decoding will not run. In Next.js set them via `headers()` in `next.config.js`; in Vite via `server.headers`.

## Quick start

```tsx
import { DicomViewer } from "dental-cbct-viewer";
import "dental-cbct-viewer/style.css";

export function Planner() {
  return (
    <div style={{ height: "100vh" }}>
      <DicomViewer lang="en" />
    </div>
  );
}
```

The viewer fills its parent — give it a sized container. It ships its own stylesheet; dark mode is the default and is scoped to the viewer root (`.dcv-root`), so it never changes the host page's theme.

## Props

| Prop | Type | Description |
| --- | --- | --- |
| `patientId` | `string` | Patient id shown in the report header. |
| `patientName` | `string` | Patient name shown in the report header. |
| `initialPlan` | `PlanData` | Load a saved plan on mount. |
| `initialLayout` | `'1x1' \| '1+3' \| '2x2' \| 'OPG2+1'` | Starting layout. |
| `lang` | `'en' \| 'de' \| 'es' \| 'hu'` | UI language. |
| `onPlanChange` | `(plan: PlanData) => void` | Fired (debounced) whenever the plan changes. |
| `onImplantsChange` | `(implants: ImplantData[]) => void` | Fired whenever the implant list changes. |
| `className` | `string` | Extra class on the root element. |
| `embedded` | `boolean` | Suppresses the built-in disclaimer banner (host owns consent). |

## Imperative API (ref)

```tsx
import { useRef } from "react";
import { DicomViewer, type DicomViewerHandle } from "dental-cbct-viewer";

const ref = useRef<DicomViewerHandle>(null);
// <DicomViewer ref={ref} />
```

| Method | Signature | Description |
| --- | --- | --- |
| `getImplants` | `() => ImplantData[]` | Current implants. |
| `addImplant` | `(implant: ImplantData) => void` | Add an implant. |
| `updateImplant` | `(implant: ImplantData) => void` | Replace an implant by id. |
| `removeImplant` | `(id: string) => void` | Remove an implant. |
| `getPlan` | `() => PlanData` | Serialize the current plan. |
| `loadPlan` | `(plan: PlanData) => void` | Load a plan. |
| `loadStudy` | `(files: File[]) => Promise<void>` | Load DICOM from files. |
| `loadSample` | `() => Promise<void>` | Load the bundled anonymized sample (host must serve `/sample/*` — see below). |
| `setLayout` | `(mode: LayoutMode) => void` | Switch layout. |
| `setActiveView` | `(view: ViewKey) => void` | Switch the 1×1 view. |
| `exportPdf` | `() => Promise<void>` | Build + download the PDF report. |
| `exportGuideStl` | `() => Promise<boolean>` | Build + download the drill guide STL (false if no guided implant). |

## Framework-free core (`/core`)

Pure, React-free — runs in Node, tests or your own logic:

```ts
import {
  // Implant data model + system catalog
  IMPLANT_SYSTEMS, getImplantSystem,
  // Geometry
  implantWorldAxis, archFrameAt, nearestArchFrame,
  // Safety (nerve / sinus / neighbour clearances)
  evaluateImplant,
  // Bone quality (Misch D1–D5, HU at the implant site)
  classifyBone, sampleImplantBoneHU,
  // Curved-planar-reformation sampling + arch curve math
  // Drill-guide geometry + binary STL export
  triMeshToBinarySTL,
} from "dental-cbct-viewer/core";
```

The CSG Boolean kernel (`manifold-3d`, ~1.5 MB WASM) is loaded lazily inside the guide builder, so importing `/core` for geometry/safety stays light.

## Data model (essentials)

- **`ImplantData`** — world entry + apex axis (from two angles relative to the nearest arch frame), diameter, length, `systemId`, and an optional `guided` plan (sleeve offset/height, drill length).
- **`IMPLANT_SYSTEMS`** — catalog (Generic, Alpha-Bio, Straumann BLX, NobelActive) with per-system sleeve diameters.
- **`PlanData`** — the persistable slice of state (implants, anatomy markers, arch curve, cross-section, safety thresholds, report fields, display + guide settings). Save it from `onPlanChange` / `getPlan`, restore it via `initialPlan` / `loadPlan`.

## The bundled sample

`loadSample()` and the landing-page button fetch a ~16 MB anonymized CBCT from `/sample/meta.json` + `/sample/volume.raw.bin`. These assets are **not** included in the npm package (to keep it small). To use the sample in your app, copy `public/sample/` from the repo into your app's public directory. In normal use you load your own DICOM via `loadStudy(files)`.

## Host bundlers

- **Vite:** works out of the box.
- **Next.js / webpack 5:** render inside a client component (`"use client"`); the viewer reads the DOM on mount. Set COOP/COEP headers. Worker + WASM assets are pre-bundled.

## License & disclaimer

MIT © Zoltán Dul; bundled Roboto font under Apache-2.0.

**Medical disclaimer:** research/demonstration software only — not a certified medical device and not for clinical diagnosis, treatment planning, precise measurement or implant workflows.
