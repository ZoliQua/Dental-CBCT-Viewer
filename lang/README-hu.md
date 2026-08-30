# 🦷 Dental CBCT Viewer — Magyar

🇭🇺 Magyar · 🇬🇧 [English](README-en.md) · 🇩🇪 [Deutsch](README-de.md) · 🇪🇸 [Español](README-es.md) · [⬅ Vissza](../README.md)

Beágyazható **dentális CBCT / CT DICOM-néző** React + TypeScript alá: MPR + valódi 3D, panoráma (OPG) rekonstrukció, keresztmetszetek, vezetett (guided) implantátum-tervezés, biztonsági távolságok, csontminőség, nyomtatható fúrósablon (STL) és többnyelvű PDF-riport.

---

## Telepítés

```bash
npm install dental-cbct-viewer react react-dom
```

- **React 18 vagy 19** (peer dependency).
- Csak ESM; Web Worker + WASM támogató bundler kell (Vite, webpack 5, Next.js, Rollup).
- A Cornerstone3D, vtk.js, jsPDF és dicom-parser függőségként települ.

### ⚠️ Cross-origin izoláció (kötelező)

A DICOM-dekóder workerek `SharedArrayBuffer`-t használnak. A befogadó oldalt az alábbi fejlécekkel kell kiszolgálni:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

E fejlécek nélkül a képdekódolás nem fut. Next.js-ben a `next.config.js` `headers()`-ében, Vite-ban a `server.headers`-ben állítható be.

## Gyors kezdés

```tsx
import { DicomViewer } from "dental-cbct-viewer";
import "dental-cbct-viewer/style.css";

export function Tervezo() {
  return (
    <div style={{ height: "100vh" }}>
      <DicomViewer lang="hu" />
    </div>
  );
}
```

A néző kitölti a szülőjét — adj neki méretezett konténert. Saját stíluslapot szállít; a sötét mód az alapértelmezés, és a néző gyökerére (`.dcv-root`) van scope-olva, így sosem változtatja meg a befogadó oldal témáját.

## Propok

| Prop | Típus | Leírás |
| --- | --- | --- |
| `patientId` | `string` | A riport fejlécében megjelenő páciens-azonosító. |
| `patientName` | `string` | A riport fejlécében megjelenő páciensnév. |
| `initialPlan` | `PlanData` | Mentett terv betöltése induláskor. |
| `initialLayout` | `'1x1' \| '1+3' \| '2x2' \| 'OPG2+1'` | Kezdő elrendezés. |
| `lang` | `'en' \| 'de' \| 'es' \| 'hu'` | UI-nyelv. |
| `onPlanChange` | `(plan: PlanData) => void` | A terv változásakor (késleltetve) hívódik. |
| `onImplantsChange` | `(implants: ImplantData[]) => void` | Az implant-lista változásakor hívódik. |
| `className` | `string` | Extra osztály a gyökér elemen. |
| `embedded` | `boolean` | Elrejti a beépített disclaimer-sávot (a befogadó kezeli a hozzájárulást). |

## Imperatív API (ref)

```tsx
import { useRef } from "react";
import { DicomViewer, type DicomViewerHandle } from "dental-cbct-viewer";

const ref = useRef<DicomViewerHandle>(null);
// <DicomViewer ref={ref} />
```

| Metódus | Szignatúra | Leírás |
| --- | --- | --- |
| `getImplants` | `() => ImplantData[]` | Az aktuális implantok. |
| `addImplant` | `(implant: ImplantData) => void` | Implant hozzáadása. |
| `updateImplant` | `(implant: ImplantData) => void` | Implant cseréje id alapján. |
| `removeImplant` | `(id: string) => void` | Implant törlése. |
| `getPlan` | `() => PlanData` | Az aktuális terv sorosítása. |
| `loadPlan` | `(plan: PlanData) => void` | Terv betöltése. |
| `loadStudy` | `(files: File[]) => Promise<void>` | DICOM betöltése fájlokból. |
| `loadSample` | `() => Promise<void>` | A csomagolt anonim minta betöltése (a `/sample/*`-ot a befogadónak ki kell szolgálnia — lásd lentebb). |
| `setLayout` | `(mode: LayoutMode) => void` | Elrendezés váltása. |
| `setActiveView` | `(view: ViewKey) => void` | Az 1×1 nézet váltása. |
| `exportPdf` | `() => Promise<void>` | PDF-riport készítése + letöltése. |
| `exportGuideStl` | `() => Promise<boolean>` | Fúrósablon STL készítése + letöltése (false, ha nincs guided implant). |

## Keret-független mag (`/core`)

Tiszta, React-mentes — Node-ban, tesztben vagy saját logikában is fut:

```ts
import {
  // Implant adatmodell + rendszer-katalógus
  IMPLANT_SYSTEMS, getImplantSystem,
  // Geometria
  implantWorldAxis, archFrameAt, nearestArchFrame,
  // Biztonság (ideg / arcüreg / szomszéd távolságok)
  evaluateImplant,
  // Csontminőség (Misch D1–D5, HU az implant helyén)
  classifyBone, sampleImplantBoneHU,
  // Fúrósablon-geometria + bináris STL export
  triMeshToBinarySTL,
} from "dental-cbct-viewer/core";
```

A CSG Boolean-kernel (`manifold-3d`, ~1,5 MB WASM) a sablonépítőn belül lazy módon töltődik, így a `/core` importja a geometriához/biztonsághoz könnyű marad.

## Adatmodell (lényeg)

- **`ImplantData`** — világ-belépési pont + apex-tengely (két szögből, a legközelebbi ív-kerethez képest), átmérő, hossz, `systemId`, és opcionális `guided` terv (persely offset/magasság, fúróhossz).
- **`IMPLANT_SYSTEMS`** — katalógus (Generic, Alpha-Bio, Straumann BLX, NobelActive) rendszerenkénti persely-átmérőkkel.
- **`PlanData`** — az állapot menthető szelete (implantok, anatómiai jelölők, ívgörbe, keresztmetszet, biztonsági küszöbök, riport-mezők, megjelenítés + sablon-beállítások). Mentsd `onPlanChange` / `getPlan` révén, töltsd vissza `initialPlan` / `loadPlan` révén.

## A csomagolt minta

A `loadSample()` és a nyitóoldali gomb egy ~16 MB-os anonim CBCT-t tölt be a `/sample/meta.json` + `/sample/volume.raw.bin` alól. Ezek az assetek **nincsenek** az npm-csomagban (hogy kicsi maradjon). Ha az appodban használnád a mintát, másold a repo `public/sample/` mappáját az app public könyvtárába. Normál használatban a saját DICOM-odat töltöd be `loadStudy(files)`-szal.

## Befogadó bundlerek

- **Vite:** out of the box működik.
- **Next.js / webpack 5:** kliens-komponensben (`"use client"`) rendereld; a néző mount-kor olvassa a DOM-ot. Állítsd be a COOP/COEP fejléceket. A worker + WASM assetek előre bundle-ölve vannak.

## Licenc & disclaimer

MIT © Dul Zoltán; a csomagolt Roboto font Apache-2.0 alatt.

**Orvosi figyelmeztetés:** kizárólag kutatási/bemutató szoftver — nem hitelesített orvostechnikai eszköz, és nem használható klinikai diagnózisra, kezeléstervezésre, pontos mérésre vagy implantációs munkafolyamatokra.
