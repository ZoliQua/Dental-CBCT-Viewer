# 🦷 Dental CBCT Viewer — Deutsch

🇩🇪 Deutsch · 🇬🇧 [English](README-en.md) · 🇪🇸 [Español](README-es.md) · 🇭🇺 [Magyar](README-hu.md) · [⬅ Zurück](../README.md)

Einbettbarer **zahnmedizinischer DVT / CT DICOM-Viewer** für React + TypeScript: MPR + echte 3D-Ansicht, Panorama- (OPG-)Rekonstruktion, Querschnitte, geführte Implantatplanung, Sicherheitsabstände, Knochenqualität, eine druckbare Bohrschablone (STL) und ein mehrsprachiger PDF-Bericht.

---

## Installation

```bash
npm install dental-cbct-viewer react react-dom
```

- **React 18 oder 19** (Peer-Dependency).
- Nur ESM; benötigt einen Bundler mit Web-Worker- + WASM-Unterstützung (Vite, webpack 5, Next.js, Rollup).
- Cornerstone3D, vtk.js, jsPDF und dicom-parser werden als Dependencies installiert.

### ⚠️ Cross-Origin-Isolation (erforderlich)

Die DICOM-Decode-Worker nutzen `SharedArrayBuffer`. Die Host-Seite muss mit folgenden Headern ausgeliefert werden:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Ohne diese Header läuft die Bilddecodierung nicht. In Next.js über `headers()` in `next.config.js`, in Vite über `server.headers`.

## Schnellstart

```tsx
import { DicomViewer } from "dental-cbct-viewer";
import "dental-cbct-viewer/style.css";

export function Planer() {
  return (
    <div style={{ height: "100vh" }}>
      <DicomViewer lang="de" />
    </div>
  );
}
```

Der Viewer füllt sein Elternelement — geben Sie ihm einen dimensionierten Container. Er liefert sein eigenes Stylesheet; der Dark Mode ist Standard und auf die Viewer-Wurzel (`.dcv-root`) begrenzt, ändert also nie das Theme der Host-Seite.

## Props

| Prop | Typ | Beschreibung |
| --- | --- | --- |
| `patientId` | `string` | Im Berichtskopf angezeigte Patienten-ID. |
| `patientName` | `string` | Im Berichtskopf angezeigter Patientenname. |
| `initialPlan` | `PlanData` | Gespeicherten Plan beim Mounten laden. |
| `initialLayout` | `'1x1' \| '1+3' \| '2x2' \| 'OPG2+1'` | Start-Layout. |
| `lang` | `'en' \| 'de' \| 'es' \| 'hu'` | UI-Sprache. |
| `onPlanChange` | `(plan: PlanData) => void` | Wird (entprellt) bei Planänderungen aufgerufen. |
| `onImplantsChange` | `(implants: ImplantData[]) => void` | Wird bei Änderung der Implantatliste aufgerufen. |
| `className` | `string` | Zusätzliche Klasse am Wurzelelement. |
| `embedded` | `boolean` | Unterdrückt das eingebaute Haftungsbanner (der Host verwaltet die Zustimmung). |

## Imperative API (ref)

```tsx
import { useRef } from "react";
import { DicomViewer, type DicomViewerHandle } from "dental-cbct-viewer";

const ref = useRef<DicomViewerHandle>(null);
// <DicomViewer ref={ref} />
```

| Methode | Signatur | Beschreibung |
| --- | --- | --- |
| `getImplants` | `() => ImplantData[]` | Aktuelle Implantate. |
| `addImplant` | `(implant: ImplantData) => void` | Implantat hinzufügen. |
| `updateImplant` | `(implant: ImplantData) => void` | Implantat per id ersetzen. |
| `removeImplant` | `(id: string) => void` | Implantat entfernen. |
| `getPlan` | `() => PlanData` | Aktuellen Plan serialisieren. |
| `loadPlan` | `(plan: PlanData) => void` | Plan laden. |
| `loadStudy` | `(files: File[]) => Promise<void>` | DICOM aus Dateien laden. |
| `loadSample` | `() => Promise<void>` | Gebündelte anonymisierte Probe laden (der Host muss `/sample/*` ausliefern — siehe unten). |
| `setLayout` | `(mode: LayoutMode) => void` | Layout wechseln. |
| `setActiveView` | `(view: ViewKey) => void` | 1×1-Ansicht wechseln. |
| `exportPdf` | `() => Promise<void>` | PDF-Bericht erstellen + herunterladen. |
| `exportGuideStl` | `() => Promise<boolean>` | Bohrschablone (STL) erstellen + herunterladen (false ohne geführtes Implantat). |

## Framework-unabhängiger Kern (`/core`)

Rein, React-frei — läuft in Node, Tests oder eigener Logik:

```ts
import {
  // Implantat-Datenmodell + Systemkatalog
  IMPLANT_SYSTEMS, getImplantSystem,
  // Geometrie
  implantWorldAxis, archFrameAt, nearestArchFrame,
  // Sicherheit (Nerv / Sinus / Nachbar-Abstände)
  evaluateImplant,
  // Knochenqualität (Misch D1–D5, HU am Implantatort)
  classifyBone, sampleImplantBoneHU,
  // Bohrschablonen-Geometrie + binärer STL-Export
  triMeshToBinarySTL,
} from "dental-cbct-viewer/core";
```

Der CSG-Boolean-Kernel (`manifold-3d`, ~1,5 MB WASM) wird im Schablonen-Builder lazy geladen, sodass der `/core`-Import für Geometrie/Sicherheit leicht bleibt.

## Datenmodell (Wesentliches)

- **`ImplantData`** — Welt-Eintrittspunkt + Apex-Achse (aus zwei Winkeln relativ zum nächsten Bogenrahmen), Durchmesser, Länge, `systemId` und optionaler `guided`-Plan (Hülsen-Offset/-Höhe, Bohrlänge).
- **`IMPLANT_SYSTEMS`** — Katalog (Generic, Alpha-Bio, Straumann BLX, NobelActive) mit systemspezifischen Hülsendurchmessern.
- **`PlanData`** — der persistierbare Zustandsanteil (Implantate, Anatomiemarker, Bogenkurve, Querschnitt, Sicherheitsschwellen, Berichtsfelder, Anzeige- + Schablonen-Einstellungen). Über `onPlanChange` / `getPlan` speichern, über `initialPlan` / `loadPlan` wiederherstellen.

## Die gebündelte Probe

`loadSample()` und die Schaltfläche auf der Startseite laden ein ~16 MB großes anonymisiertes DVT aus `/sample/meta.json` + `/sample/volume.raw.bin`. Diese Assets sind **nicht** im npm-Paket enthalten (um es klein zu halten). Um die Probe in Ihrer App zu nutzen, kopieren Sie `public/sample/` aus dem Repo in das public-Verzeichnis Ihrer App. Im Normalbetrieb laden Sie eigenes DICOM per `loadStudy(files)`.

## Host-Bundler

- **Vite:** funktioniert sofort.
- **Next.js / webpack 5:** in einer Client-Komponente (`"use client"`) rendern; der Viewer liest das DOM beim Mounten. COOP/COEP-Header setzen. Worker- + WASM-Assets sind vorgebündelt.

## Lizenz & Haftungsausschluss

MIT © Zoltán Dul; gebündelte Roboto-Schrift unter Apache-2.0.

**Medizinischer Haftungsausschluss:** ausschließlich Forschungs-/Demonstrationssoftware — kein zertifiziertes Medizinprodukt und nicht für klinische Diagnose, Behandlungsplanung, präzise Messung oder Implantat-Workflows.
