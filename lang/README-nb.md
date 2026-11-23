# 🦷 DenCT — Norsk

🇨🇿 [Čeština](README-cs.md) · 🇩🇰 [Dansk](README-da.md) · 🇩🇪 [Deutsch](README-de.md) · 🇬🇧 [English](README-en.md) · 🇪🇸 [Español](README-es.md) · 🇫🇷 [Français](README-fr.md) · 🇭🇺 [Magyar](README-hu.md) · 🇳🇴 Norsk · 🇵🇱 [Polski](README-pl.md) · 🇵🇹 [Português](README-pt.md) · 🇸🇰 [Slovenčina](README-sk.md) · 🇫🇮 [Suomi](README-fi.md) · 🇸🇪 [Svenska](README-sv.md) · 🇷🇺 [Русский](README-ru.md) · 🇺🇦 [Українська](README-uk.md) · [⬅ Tilbake](../README.md)

En innebyggbar **dental CBCT / CT DICOM-viser** for React + TypeScript: MPR + ekte 3D, panoramarekonstruksjon (OPG), tverrsnitt, guidet implantatplanlegging, sikkerhetsavstander, beinkvalitet, en utskrivbar boremal (STL) og en flerspråklig PDF-rapport.

▶ **[Prøv live-demoen](https://dental-cbct-viewer.vercel.app)** — laster inn en anonymisert eksempel-CBCT og kjører utelukkende i nettleseren din.

**Panoramavisning — OPG, tverrsnitt og 3D med et planlagt implantat**
[![DenCT — Panoramavisning — OPG, tverrsnitt og 3D med et planlagt implantat](https://raw.githubusercontent.com/ZoliQua/Dental-CBCT-Viewer/main/screenshots/panoramic-view.jpg)](https://dental-cbct-viewer.vercel.app)

**3D-visning — volumgjengivelse med koblet aksial / sagittal / koronal**
[![DenCT — 3D-visning — volumgjengivelse med koblet aksial / sagittal / koronal](https://raw.githubusercontent.com/ZoliQua/Dental-CBCT-Viewer/main/screenshots/3d-view.jpg)](https://dental-cbct-viewer.vercel.app)

---

## Installasjon

```bash
npm install dental-cbct-viewer react react-dom
```

- **React 18 eller 19** (peer dependency).
- Kun ESM; krever en bundler med støtte for Web Workers + WASM (Vite, webpack 5, Next.js, Rollup).
- Cornerstone3D, vtk.js, jsPDF og dicom-parser installeres som avhengigheter.

### ⚠️ Cross-origin-isolering (påkrevd)

DICOM-dekoderens workers bruker `SharedArrayBuffer`. Server vertssiden med:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Uten disse headerne kjører ikke bildedekodingen. I Next.js settes de via `headers()` i `next.config.js`; i Vite via `server.headers`.

## Hurtigstart

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

Viseren fyller foreldreelementet sitt — gi den en container med en størrelse. Den leveres med sitt eget stilark; mørk modus er standard og er avgrenset til viserens rotelement (`.dcv-root`), så den endrer aldri vertssidens tema.

## Props

| Prop | Type | Beskrivelse |
| --- | --- | --- |
| `patientId` | `string` | Pasient-ID som vises i rapportens topptekst. |
| `patientName` | `string` | Pasientnavn som vises i rapportens topptekst. |
| `initialPlan` | `PlanData` | Last inn en lagret plan ved montering. |
| `initialLayout` | `'1x1' \| '1+3' \| '2x2' \| 'OPG2+1' \| 'IO3D'` | Startlayout. |
| `lang` | `'cs' \| 'da' \| 'de' \| 'en' \| 'es' \| 'fi' \| 'fr' \| 'hu' \| 'nb' \| 'pl' \| 'pt' \| 'ru' \| 'sk' \| 'sv' \| 'uk'` | Grensesnittspråk. Uten den følger viseren brukerens siste valg, deretter nettleser-/OS-språket og til slutt engelsk. |
| `onPlanChange` | `(plan: PlanData) => void` | Utløses (debounced) hver gang planen endres. |
| `onImplantsChange` | `(implants: ImplantData[]) => void` | Utløses hver gang implantatlisten endres. |
| `className` | `string` | Ekstra klasse på rotelementet. |
| `embedded` | `boolean` | Undertrykker det innebygde banneret med ansvarsfraskrivelse (verten håndterer samtykket). |
| `autosave` | `boolean` | Lagrer en kopi av planen per undersøkelse i sessionStorage, slik at en ny innlasting gjenoppretter den (standard `true`). Slå den av når verten selv lagrer planer via `onPlanChange`. |
| `features` | `ViewerFeatures` | Utgavebrytere: `{ implantPlanning?: boolean; drillGuide?: boolean }`, begge på som standard. `implantPlanning: false` gir en ren bildeviser. Se [API.md](../API.md#editions). |
| `branding` | `boolean` | Viser webkampanjen (GitHub-stjernen, Om-boksen, lenker til andre prosjekter). Standard `true`. |
| `theme` | `'dark' \| 'light'` | Mørkt / lyst tema styrt av verten; overstyrer det lagrede valget og skjuler viserens egne brytere. |

## Imperativt API (ref)

```tsx
import { useRef } from "react";
import { DicomViewer, type DicomViewerHandle } from "dental-cbct-viewer";

const ref = useRef<DicomViewerHandle>(null);
// <DicomViewer ref={ref} />
```

| Metode | Signatur | Beskrivelse |
| --- | --- | --- |
| `getImplants` | `() => ImplantData[]` | Gjeldende implantater. |
| `addImplant` | `(implant: ImplantData) => void` | Legg til et implantat. |
| `updateImplant` | `(implant: ImplantData) => void` | Erstatt et implantat etter ID. |
| `removeImplant` | `(id: string) => void` | Fjern et implantat. |
| `getPlan` | `() => PlanData` | Serialiser den gjeldende planen. |
| `loadPlan` | `(plan: PlanData) => void` | Last inn en plan. |
| `loadStudy` | `(files: File[]) => Promise<void>` | Last inn DICOM fra filer. |
| `loadScans` | `(files: File[]) => Promise<void>` | Importer overflateskanninger (STL / OBJ / PLY) til den åpne undersøkelsen; kjeven gjettes ut fra filnavnet. |
| `loadSample` | `(kind?: 'ct' \| 'ctIo') => Promise<void>` | Last inn et medfølgende anonymisert eksempel — `'ct'` kun CBCT, `'ctIo'` CBCT pluss de tilhørende intraorale skanningene (verten må servere `/sample/*` og `/sample-io/*` — se nedenfor). |
| `setLayout` | `(mode: LayoutMode) => void` | Bytt layout. |
| `setActiveView` | `(view: ViewKey) => void` | Bytt 1×1-visningen. |
| `exportPdf` | `() => Promise<void>` | Bygg + last ned PDF-rapporten. |
| `exportGuideStl` | `() => Promise<boolean>` | Bygg + last ned boremalen som STL (false hvis det ikke finnes noe guidet implantat). |
| `openSettings` | `() => void` | Åpner innstillingsdialogen. |
| `openHelp` | `() => void` | Åpner hjelpepanelet. |
| `startTour` | `() => void` | Starter introduksjonsturen. |

## Rammeverksuavhengig kjerne (`/core`)

Ren og uten React — kjører i Node, i tester eller i din egen logikk:

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

CSG-Boolean-kjernen (`manifold-3d`, ~1,5 MB WASM) lastes inn ved behov inne i malbyggeren, så import av `/core` for geometri/sikkerhet forblir lett.

## Datamodell (det viktigste)

- **`ImplantData`** — inngangspunkt i verdenskoordinater + apeksakse (ut fra to vinkler i forhold til nærmeste bueramme), diameter, lengde, `systemId` og en valgfri `guided`-plan (hylseavstand/-høyde, borlengde).
- **`IMPLANT_SYSTEMS`** — katalog (Generic, Alpha-Bio, Straumann BLX, NobelActive) med hylsediametre per system.
- **`PlanData`** — den delen av tilstanden som kan lagres (implantater, anatomiske markører, buekurve, tverrsnitt, sikkerhetsterskler, rapportfelt, visnings- og malinnstillinger samt registreringene av de importerte skanningene — kun beskrivelser, selve meshene blir i minnet). Lagre den fra `onPlanChange` / `getPlan`, og gjenopprett den via `initialPlan` / `loadPlan`.

## Det medfølgende eksempelet

`loadSample()` og knappen på startsiden henter en anonymisert CBCT på ~16 MB fra `/sample/meta.json` + `/sample/volume.raw.bin`. Disse filene er **ikke** inkludert i npm-pakken (for å holde den liten). For å bruke eksempelet i appen din kopierer du `public/sample/` fra repoet til appens public-mappe. Ved vanlig bruk laster du inn din egen DICOM via `loadStudy(files)`. `loadSample('ctIo')` og den andre knappen på startsiden bruker i stedet `/sample-io/` (~19 MB: volumet, `scans.json` og de to gzip-komprimerte kjeve-meshene) — kopier også `public/sample-io/` hvis du vil bruke det.

## Vertsbundlere

- **Vite:** fungerer uten videre.
- **Next.js / webpack 5:** render inne i en klientkomponent (`"use client"`); viseren leser DOM-en ved montering. Sett COOP/COEP-headere. Worker- og WASM-filer er forhåndsbundlet.

## Sitering

Hvis DenCT bidrar til arbeid du publiserer, vennligst siter det: repoet inneholder en
[`CITATION.cff`](../CITATION.cff) (GitHubs knapp **Cite this repository** genererer
BibTeX eller APA), og hver utgivelse arkiveres på Zenodo.

Siter konsept-DOI-en [`10.5281/zenodo.23458076`](https://doi.org/10.5281/zenodo.23458076)
for programvaren generelt — den peker alltid til den sist arkiverte utgivelsen — eller en
utgivelses egen DOI for å låse den nøyaktige versjonen ([`10.5281/zenodo.23458077`](https://doi.org/10.5281/zenodo.23458077)
for v1.4.0).

## Lisens og ansvarsfraskrivelse

MIT © Zoltán Dul; medfølgende Roboto-skrift under Apache-2.0.

**Medisinsk ansvarsfraskrivelse:** kun programvare for forskning/demonstrasjon — ikke sertifisert medisinsk utstyr og ikke for klinisk diagnostikk, behandlingsplanlegging, presise målinger eller implantatarbeidsflyter.
