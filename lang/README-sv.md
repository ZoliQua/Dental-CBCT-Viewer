# 🦷 DenCT — Svenska

🇨🇿 [Čeština](README-cs.md) · 🇩🇰 [Dansk](README-da.md) · 🇩🇪 [Deutsch](README-de.md) · 🇬🇧 [English](README-en.md) · 🇪🇸 [Español](README-es.md) · 🇫🇷 [Français](README-fr.md) · 🇭🇺 [Magyar](README-hu.md) · 🇳🇴 [Norsk](README-nb.md) · 🇵🇱 [Polski](README-pl.md) · 🇵🇹 [Português](README-pt.md) · 🇸🇰 [Slovenčina](README-sk.md) · 🇫🇮 [Suomi](README-fi.md) · 🇸🇪 Svenska · 🇷🇺 [Русский](README-ru.md) · 🇺🇦 [Українська](README-uk.md) · [⬅ Tillbaka](../README.md)

En inbäddningsbar **dental CBCT / CT DICOM-visare** för React + TypeScript: MPR + äkta 3D, panoramarekonstruktion (OPG), tvärsnitt, guidad implantatplanering, säkerhetsavstånd, benkvalitet, en utskrivbar borrmall (STL) och en flerspråkig PDF-rapport.

▶ **[Prova livedemon](https://dental-cbct-viewer.vercel.app)** — laddar en anonymiserad exempel-CBCT och körs helt i din webbläsare.

**Panoramavy — OPG, tvärsnitt och 3D med ett planerat implantat**
[![DenCT — Panoramavy — OPG, tvärsnitt och 3D med ett planerat implantat](https://raw.githubusercontent.com/ZoliQua/Dental-CBCT-Viewer/main/screenshots/panoramic-view.jpg)](https://dental-cbct-viewer.vercel.app)

**3D-vy — volymrendering med kopplade axiala / sagittala / koronala vyer**
[![DenCT — 3D-vy — volymrendering med kopplade axiala / sagittala / koronala vyer](https://raw.githubusercontent.com/ZoliQua/Dental-CBCT-Viewer/main/screenshots/3d-view.jpg)](https://dental-cbct-viewer.vercel.app)

---

## Installation

```bash
npm install dental-cbct-viewer react react-dom
```

- **React 18 eller 19** (peer dependency).
- Endast ESM; kräver en bundler med stöd för Web Workers + WASM (Vite, webpack 5, Next.js, Rollup).
- Cornerstone3D, vtk.js, jsPDF och dicom-parser installeras som beroenden.

### ⚠️ Cross-origin-isolering (krävs)

DICOM-avkodningens workers använder `SharedArrayBuffer`. Servera värdsidan med:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Utan dessa headers fungerar inte bildavkodningen. I Next.js sätter du dem via `headers()` i `next.config.js`; i Vite via `server.headers`.

## Snabbstart

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

Visaren fyller sitt föräldraelement — ge den en behållare med storlek. Den har en egen stilmall; mörkt läge är standard och är avgränsat till visarens rotelement (`.dcv-root`), så den ändrar aldrig värdsidans tema.

## Props

| Prop | Typ | Beskrivning |
| --- | --- | --- |
| `patientId` | `string` | Patient-id som visas i rapporthuvudet. |
| `patientName` | `string` | Patientnamn som visas i rapporthuvudet. |
| `initialPlan` | `PlanData` | Laddar en sparad plan vid montering. |
| `initialLayout` | `'1x1' \| '1+3' \| '2x2' \| 'OPG2+1'` | Startlayout. |
| `lang` | `'cs' \| 'da' \| 'de' \| 'en' \| 'es' \| 'fi' \| 'fr' \| 'hu' \| 'nb' \| 'pl' \| 'pt' \| 'ru' \| 'sk' \| 'sv' \| 'uk'` | Gränssnittsspråk. Utan den följer visaren användarens senaste val, därefter webbläsarens / operativsystemets språk och sist engelska. |
| `onPlanChange` | `(plan: PlanData) => void` | Anropas (med fördröjning) varje gång planen ändras. |
| `onImplantsChange` | `(implants: ImplantData[]) => void` | Anropas varje gång implantatlistan ändras. |
| `className` | `string` | Extra klass på rotelementet. |
| `embedded` | `boolean` | Döljer den inbyggda ansvarsfriskrivningsbannern (värden ansvarar för samtycket). |

## Imperativt API (ref)

```tsx
import { useRef } from "react";
import { DicomViewer, type DicomViewerHandle } from "dental-cbct-viewer";

const ref = useRef<DicomViewerHandle>(null);
// <DicomViewer ref={ref} />
```

| Metod | Signatur | Beskrivning |
| --- | --- | --- |
| `getImplants` | `() => ImplantData[]` | Aktuella implantat. |
| `addImplant` | `(implant: ImplantData) => void` | Lägger till ett implantat. |
| `updateImplant` | `(implant: ImplantData) => void` | Ersätter ett implantat utifrån id. |
| `removeImplant` | `(id: string) => void` | Tar bort ett implantat. |
| `getPlan` | `() => PlanData` | Serialiserar den aktuella planen. |
| `loadPlan` | `(plan: PlanData) => void` | Laddar en plan. |
| `loadStudy` | `(files: File[]) => Promise<void>` | Laddar DICOM från filer. |
| `loadScans` | `(files: File[]) => Promise<void>` | Importerar ytskanningar (STL / OBJ / PLY) till den öppna undersökningen; käken gissas utifrån filnamnet. |
| `loadSample` | `(kind?: 'ct' \| 'ctIo') => Promise<void>` | Laddar ett medföljande anonymiserat exempel — `'ct'` enbart CBCT, `'ctIo'` CBCT plus tillhörande intraorala skanningar (värden måste servera `/sample/*` och `/sample-io/*` — se nedan). |
| `setLayout` | `(mode: LayoutMode) => void` | Byter layout. |
| `setActiveView` | `(view: ViewKey) => void` | Byter 1×1-vyn. |
| `exportPdf` | `() => Promise<void>` | Skapar och laddar ner PDF-rapporten. |
| `exportGuideStl` | `() => Promise<boolean>` | Skapar och laddar ner borrmallen som STL (false om det inte finns något guidat implantat). |

## Ramverksfri kärna (`/core`)

Ren och fri från React — körs i Node, i tester eller i din egen logik:

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

CSG-kärnan för booleska operationer (`manifold-3d`, ~1,5 MB WASM) laddas först när borrmallen byggs, så att importera `/core` för geometri/säkerhet förblir lätt.

## Datamodell (det viktigaste)

- **`ImplantData`** — ingångspunkt i världskoordinater + apexaxel (från två vinklar i förhållande till närmaste bågram), diameter, längd, `systemId` och en valfri `guided`-plan (hylsans avstånd/höjd, borrlängd).
- **`IMPLANT_SYSTEMS`** — katalog (Generic, Alpha-Bio, Straumann BLX, NobelActive) med hylsdiametrar per system.
- **`PlanData`** — den sparbara delen av tillståndet (implantat, anatomiska markeringar, bågkurva, tvärsnitt, säkerhetsgränser, rapportfält, visnings- och mallinställningar samt de importerade skanningarnas registreringar — endast beskrivningar, näten stannar i minnet). Spara den från `onPlanChange` / `getPlan` och återställ den via `initialPlan` / `loadPlan`.

## Det medföljande exemplet

`loadSample()` och knappen på startsidan hämtar en anonymiserad CBCT på ~16 MB från `/sample/meta.json` + `/sample/volume.raw.bin`. Dessa filer ingår **inte** i npm-paketet (för att hålla det litet). För att använda exemplet i din app kopierar du `public/sample/` från repot till appens public-katalog. Vid normal användning laddar du din egen DICOM via `loadStudy(files)`. `loadSample('ctIo')` och den andra knappen på startsidan använder i stället `/sample-io/` (~19 MB: volymen, `scans.json` och de två gzip-komprimerade käknäten) — kopiera även `public/sample-io/` om du vill ha det.

## Värdbundlers

- **Vite:** fungerar direkt.
- **Next.js / webpack 5:** rendera inuti en klientkomponent (`"use client"`); visaren läser DOM:en vid montering. Sätt COOP/COEP-headers. Worker- och WASM-filer är förbundlade.

## Citering

Om DenCT bidrar till arbete som du publicerar, citera det gärna: repot innehåller en
[`CITATION.cff`](../CITATION.cff) (GitHubs knapp **Cite this repository** genererar
BibTeX eller APA), och varje release arkiveras på Zenodo.

Citera koncept-DOI:n [`10.5281/zenodo.23458076`](https://doi.org/10.5281/zenodo.23458076)
för programvaran i allmänhet — den pekar alltid på den senast arkiverade releasen — eller en
releases egen DOI för att låsa den exakta versionen ([`10.5281/zenodo.23458077`](https://doi.org/10.5281/zenodo.23458077)
för v1.4.0).

## Licens och ansvarsfriskrivning

MIT © Zoltán Dul; medföljande Roboto-typsnitt under Apache-2.0.

**Medicinsk ansvarsfriskrivning:** endast programvara för forskning/demonstration — inte en certifierad medicinteknisk produkt och inte avsedd för klinisk diagnostik, behandlingsplanering, precisa mätningar eller implantatarbetsflöden.
