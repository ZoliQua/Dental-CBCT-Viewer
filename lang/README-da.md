# 🦷 DenCT — Dansk

🇨🇿 [Čeština](README-cs.md) · 🇩🇰 Dansk · 🇩🇪 [Deutsch](README-de.md) · 🇬🇧 [English](README-en.md) · 🇪🇸 [Español](README-es.md) · 🇫🇷 [Français](README-fr.md) · 🇭🇺 [Magyar](README-hu.md) · 🇳🇴 [Norsk](README-nb.md) · 🇵🇱 [Polski](README-pl.md) · 🇵🇹 [Português](README-pt.md) · 🇸🇰 [Slovenčina](README-sk.md) · 🇫🇮 [Suomi](README-fi.md) · 🇸🇪 [Svenska](README-sv.md) · 🇷🇺 [Русский](README-ru.md) · 🇺🇦 [Українська](README-uk.md) · [⬅ Tilbage](../README.md)

En indlejrbar **dental CBCT / CT DICOM-viewer** til React + TypeScript: MPR + ægte 3D, panoramarekonstruktion (OPG), tværsnit, guidet implantatplanlægning, sikkerhedsafstande, knoglekvalitet, en printbar boreskabelon (STL) og en flersproget PDF-rapport.

▶ **[Prøv live-demoen](https://dental-cbct-viewer.vercel.app)** — indlæser en anonymiseret eksempel-CBCT og kører udelukkende i din browser.

**Panoramavisning — OPG, tværsnit og 3D med et planlagt implantat**
[![DenCT — Panoramavisning — OPG, tværsnit og 3D med et planlagt implantat](https://raw.githubusercontent.com/ZoliQua/Dental-CBCT-Viewer/main/screenshots/panoramic-view.jpg)](https://dental-cbct-viewer.vercel.app)

**3D-visning — volumengengivelse med koblet aksial / sagittal / koronal**
[![DenCT — 3D-visning — volumengengivelse med koblet aksial / sagittal / koronal](https://raw.githubusercontent.com/ZoliQua/Dental-CBCT-Viewer/main/screenshots/3d-view.jpg)](https://dental-cbct-viewer.vercel.app)

---

## Installation

```bash
npm install dental-cbct-viewer react react-dom
```

- **React 18 eller 19** (peer dependency).
- Kun ESM; kræver en bundler med understøttelse af Web Workers + WASM (Vite, webpack 5, Next.js, Rollup).
- Cornerstone3D, vtk.js, jsPDF og dicom-parser installeres som afhængigheder.

### ⚠️ Cross-origin-isolering (påkrævet)

DICOM-dekoderens workers bruger `SharedArrayBuffer`. Server værtssiden med:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Uden disse headers kører billeddekodningen ikke. I Next.js sættes de via `headers()` i `next.config.js`; i Vite via `server.headers`.

## Hurtig start

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

Vieweren udfylder sit overordnede element — giv den en container med en størrelse. Den leveres med sit eget stylesheet; mørk tilstand er standard og er afgrænset til viewerens rodelement (`.dcv-root`), så den aldrig ændrer værtssidens tema.

## Props

| Prop | Type | Beskrivelse |
| --- | --- | --- |
| `patientId` | `string` | Patient-id, der vises i rapportens sidehoved. |
| `patientName` | `string` | Patientnavn, der vises i rapportens sidehoved. |
| `initialPlan` | `PlanData` | Indlæs en gemt plan ved montering. |
| `initialLayout` | `'1x1' \| '1+3' \| '2x2' \| 'OPG2+1' \| 'IO3D'` | Startlayout. |
| `lang` | `'cs' \| 'da' \| 'de' \| 'en' \| 'es' \| 'fi' \| 'fr' \| 'hu' \| 'nb' \| 'pl' \| 'pt' \| 'ru' \| 'sk' \| 'sv' \| 'uk'` | Brugerfladens sprog. Uden den følger vieweren brugerens seneste valg, derefter browser-/OS-sproget og til sidst engelsk. |
| `onPlanChange` | `(plan: PlanData) => void` | Udløses (debounced), hver gang planen ændres. |
| `onImplantsChange` | `(implants: ImplantData[]) => void` | Udløses, hver gang implantatlisten ændres. |
| `className` | `string` | Ekstra klasse på rodelementet. |
| `embedded` | `boolean` | Undertrykker det indbyggede banner med ansvarsfraskrivelse (værten håndterer samtykket). |
| `autosave` | `boolean` | Gemmer en kopi af planen pr. undersøgelse i sessionStorage, så en genindlæsning gendanner den (standard `true`). Slå den fra, når værten selv gemmer planer via `onPlanChange`. |
| `features` | `ViewerFeatures` | Udgavekontakter: `{ implantPlanning?: boolean; drillGuide?: boolean }`, begge slået til som standard. `implantPlanning: false` giver en ren billedviser. Se [API.md](../API.md#editions). |
| `branding` | `boolean` | Viser webpromoveringen (GitHub-stjernen, Om-boksen, links til andre projekter). Standard `true`. |
| `theme` | `'dark' \| 'light'` | Mørkt / lyst tema styret af værten; tilsidesætter det huskede valg og skjuler viserens egne knapper. |

## Imperativ API (ref)

```tsx
import { useRef } from "react";
import { DicomViewer, type DicomViewerHandle } from "dental-cbct-viewer";

const ref = useRef<DicomViewerHandle>(null);
// <DicomViewer ref={ref} />
```

| Metode | Signatur | Beskrivelse |
| --- | --- | --- |
| `getImplants` | `() => ImplantData[]` | Aktuelle implantater. |
| `addImplant` | `(implant: ImplantData) => void` | Tilføj et implantat. |
| `updateImplant` | `(implant: ImplantData) => void` | Erstat et implantat efter id. |
| `removeImplant` | `(id: string) => void` | Fjern et implantat. |
| `getPlan` | `() => PlanData` | Serialisér den aktuelle plan. |
| `loadPlan` | `(plan: PlanData) => void` | Indlæs en plan. |
| `loadStudy` | `(files: File[]) => Promise<void>` | Indlæs DICOM fra filer. |
| `loadScans` | `(files: File[]) => Promise<void>` | Importér overfladescanninger (STL / OBJ / PLY) til den åbne undersøgelse; kæben gættes ud fra filnavnet. |
| `loadSample` | `(kind?: 'ct' \| 'ctIo') => Promise<void>` | Indlæs et medfølgende anonymiseret eksempel — `'ct'` kun CBCT, `'ctIo'` CBCT plus de tilhørende intraorale scanninger (værten skal servere `/sample/*` og `/sample-io/*` — se nedenfor). |
| `setLayout` | `(mode: LayoutMode) => void` | Skift layout. |
| `setActiveView` | `(view: ViewKey) => void` | Skift 1×1-visningen. |
| `exportPdf` | `() => Promise<void>` | Byg + download PDF-rapporten. |
| `exportGuideStl` | `() => Promise<boolean>` | Byg + download boreskabelonen som STL (false, hvis der ikke er noget guidet implantat). |
| `openSettings` | `() => void` | Åbner indstillingsdialogen. |
| `openHelp` | `() => void` | Åbner hjælpepanelet. |
| `startTour` | `() => void` | Starter introduktionsturen. |

## Framework-uafhængig kerne (`/core`)

Ren og uden React — kører i Node, i tests eller i din egen logik:

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

CSG-Boolean-kernen (`manifold-3d`, ~1,5 MB WASM) indlæses dovent inde i skabelonbyggeren, så import af `/core` til geometri/sikkerhed forbliver let.

## Datamodel (det væsentligste)

- **`ImplantData`** — indgangspunkt i verdenskoordinater + apexakse (ud fra to vinkler i forhold til nærmeste bueramme), diameter, længde, `systemId` og en valgfri `guided`-plan (bøsningsafstand/-højde, borlængde).
- **`IMPLANT_SYSTEMS`** — katalog (Generic, Alpha-Bio, Straumann BLX, NobelActive) med bøsningsdiametre pr. system.
- **`PlanData`** — den del af tilstanden, der kan gemmes (implantater, anatomiske markører, buekurve, tværsnit, sikkerhedsgrænser, rapportfelter, visnings- og skabelonindstillinger samt registreringerne af de importerede scanninger — kun beskrivelser, selve mesh-dataene bliver i hukommelsen). Gem den fra `onPlanChange` / `getPlan`, og gendan den via `initialPlan` / `loadPlan`.

## Det medfølgende eksempel

`loadSample()` og knappen på startsiden henter en anonymiseret CBCT på ~16 MB fra `/sample/meta.json` + `/sample/volume.raw.bin`. Disse filer er **ikke** inkluderet i npm-pakken (for at holde den lille). For at bruge eksemplet i din app skal du kopiere `public/sample/` fra repoet til din apps public-mappe. Ved normal brug indlæser du din egen DICOM via `loadStudy(files)`. `loadSample('ctIo')` og den anden knap på startsiden bruger i stedet `/sample-io/` (~19 MB: volumenet, `scans.json` og de to gzip-komprimerede kæbe-meshes) — kopiér også `public/sample-io/`, hvis du vil bruge det.

## Værtsbundlere

- **Vite:** virker uden videre.
- **Next.js / webpack 5:** render inde i en klientkomponent (`"use client"`); vieweren læser DOM'en ved montering. Sæt COOP/COEP-headers. Worker- og WASM-filer er forhåndsbundlet.

## Citation

Hvis DenCT bidrager til arbejde, du publicerer, så citér det venligst: repoet indeholder en
[`CITATION.cff`](../CITATION.cff) (GitHubs knap **Cite this repository** genererer
BibTeX eller APA), og hver udgivelse arkiveres på Zenodo.

Citér koncept-DOI'en [`10.5281/zenodo.23458076`](https://doi.org/10.5281/zenodo.23458076)
for softwaren generelt — den peger altid på den senest arkiverede udgivelse — eller en
udgivelses egen DOI for at fastlåse den præcise version ([`10.5281/zenodo.24484034`](https://doi.org/10.5281/zenodo.24484034)
for v1.5.0).

## Licens og ansvarsfraskrivelse

MIT © Zoltán Dul; medfølgende Roboto-skrifttype under Apache-2.0.

**Medicinsk ansvarsfraskrivelse:** kun software til forskning/demonstration — ikke certificeret medicinsk udstyr og ikke til klinisk diagnostik, behandlingsplanlægning, præcise målinger eller implantatarbejdsgange.
