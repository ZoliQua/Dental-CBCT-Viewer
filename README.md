# 🦷 Dental CBCT Viewer

[![npm](https://img.shields.io/npm/v/dental-cbct-viewer?style=for-the-badge&logo=npm&color=CB3837)](https://www.npmjs.com/package/dental-cbct-viewer)
[![License](https://img.shields.io/badge/license-MIT-orange?style=for-the-badge)](https://github.com/ZoliQua/Dental-CBCT-Viewer/blob/main/LICENSE)
[![React](https://img.shields.io/badge/React-18%20%7C%2019-61DAFB?style=for-the-badge&logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)

**📖 Full documentation is available per language:**

🇬🇧 [English](lang/README-en.md) · 🇩🇪 [Deutsch](lang/README-de.md) · 🇪🇸 [Español](lang/README-es.md) · 🇭🇺 [Magyar](lang/README-hu.md)

<p align="center">
  <img src="https://raw.githubusercontent.com/ZoliQua/Dental-CBCT-Viewer/main/public/cbct-icon.png" width="120" alt="Dental CBCT Viewer" />
</p>

An embeddable **dental CBCT / CT DICOM viewer** for **React + TypeScript** — MPR and true-**3D** views, **panoramic (OPG)** reconstruction along the dental arch, perpendicular **cross-sections**, **guided implant planning** with nerve/sinus/neighbour **safety clearances** and **bone quality** (Misch D1–D5), a **printable drill-guide (STL)** export, a multilingual **PDF report**, and a 4-language UI (EN/DE/ES/HU). Built on [Cornerstone3D](https://www.cornerstonejs.org/) and [vtk.js](https://kitware.github.io/vtk.js/).

🔗 **Repository:** https://github.com/ZoliQua/Dental-CBCT-Viewer

---

## 📦 Installation

```bash
npm install dental-cbct-viewer react react-dom
```

**Requirements:** React **18 or 19** (peer dependency); a bundler that supports the `exports` field, ESM, Web Workers and WASM (Vite, webpack 5, Next.js, Rollup). The heavy imaging libraries (Cornerstone3D, vtk.js, jsPDF, dicom-parser) are regular dependencies and are installed for you.

> **⚠️ Cross-origin isolation.** The DICOM decode workers use `SharedArrayBuffer`, so the **host page must be served** with:
> ```
> Cross-Origin-Opener-Policy: same-origin
> Cross-Origin-Embedder-Policy: require-corp
> ```
> Without these headers, image decoding will not run.

## 🚀 Quick start

Render `DicomViewer` and import the stylesheet **once**:

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

The viewer fills its parent, so give it a sized container. Dark mode is the default and is scoped to the viewer's own root — it never touches the host page's theme.

## 🎛️ Imperative API (ref)

```tsx
import { useRef } from "react";
import { DicomViewer, type DicomViewerHandle } from "dental-cbct-viewer";
import "dental-cbct-viewer/style.css";

function App() {
  const ref = useRef<DicomViewerHandle>(null);

  return (
    <>
      <button onClick={() => ref.current?.loadSample()}>Load sample</button>
      <button onClick={() => ref.current?.exportPdf()}>Export PDF</button>
      <DicomViewer
        ref={ref}
        initialLayout="1+3"
        onImplantsChange={(implants) => console.log(implants.length, "implants")}
        onPlanChange={(plan) => localStorage.setItem("plan", JSON.stringify(plan))}
      />
    </>
  );
}
```

**Handle methods:** `getImplants`, `addImplant`, `updateImplant`, `removeImplant`, `getPlan`, `loadPlan`, `loadStudy(files)`, `loadSample`, `setLayout`, `setActiveView`, `exportPdf`, `exportGuideStl`.

**Props:** `patientId`, `patientName`, `initialPlan`, `initialLayout`, `lang`, `onPlanChange`, `onImplantsChange`, `className`, `embedded`.

## 🧩 Framework-free core (`/core`)

Pure, React-free building blocks run in Node, tests or your own logic — the implant data model + system catalog and all the geometry/analysis math:

```ts
import {
  IMPLANT_SYSTEMS, getImplantSystem,   // implant catalog
  implantWorldAxis, evaluateImplant,   // geometry + nerve/sinus/neighbour safety
  classifyBone, sampleImplantBoneHU,   // Misch D1–D5 bone quality
} from "dental-cbct-viewer/core";
```

The heavy CSG kernel (drill-guide Boolean via `manifold-3d`) is loaded lazily, so importing `/core` for the geometry/safety helpers stays light.

## ✨ Highlights

- 🧊 **True-3D** volume rendering (translucent X-ray preset) with intersecting MPR slice planes and a crop box
- 🩻 **MPR** (axial / sagittal / coronal) with linked crosshairs, plus **panoramic (OPG)** reconstruction and tiltable **cross-sections** along a draggable dental arch curve
- 🦷 **Guided implant planning** — 3D implant + drill sleeve, nerve / sinus / neighbour **safety clearances**, **bone quality** (Misch D1–D5, HU at the implant site)
- 🖨️ **Printable drill guide (STL)** via constructive solid geometry (`manifold-3d`)
- 📄 **Multilingual PDF report** (jsPDF, bundled Unicode font — Hungarian accents render correctly)
- 🔗 Plan save/load (JSON), imperative ref API, controlled props/callbacks
- 🌐 4 UI languages (EN / DE / ES / HU) · 🌓 self-scoped dark mode · 🧱 embeddable

## ⚙️ Notes for host bundlers

- **Vite:** works out of the box.
- **Next.js / webpack 5:** render the viewer in a **client component** (`"use client"`) — it reads the DOM on mount. Ensure the COOP/COEP headers above are set (e.g. via `next.config.js` headers). Worker/WASM assets are pre-bundled into the package.

## 📄 License & disclaimer

MIT © Zoltán Dul. Bundled Roboto font under Apache-2.0 (see [`LICENSE`](LICENSE)).

> **Medical disclaimer:** research/demonstration software only — **not** a certified medical device and **not** for clinical diagnosis, treatment planning, precise measurement or implant workflows.
