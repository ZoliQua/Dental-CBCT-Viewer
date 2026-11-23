# 🦷 DenCT — Čeština

🇨🇿 Čeština · 🇩🇰 [Dansk](README-da.md) · 🇩🇪 [Deutsch](README-de.md) · 🇬🇧 [English](README-en.md) · 🇪🇸 [Español](README-es.md) · 🇫🇷 [Français](README-fr.md) · 🇭🇺 [Magyar](README-hu.md) · 🇳🇴 [Norsk](README-nb.md) · 🇵🇱 [Polski](README-pl.md) · 🇵🇹 [Português](README-pt.md) · 🇸🇰 [Slovenčina](README-sk.md) · 🇫🇮 [Suomi](README-fi.md) · 🇸🇪 [Svenska](README-sv.md) · 🇷🇺 [Русский](README-ru.md) · 🇺🇦 [Українська](README-uk.md) · [⬅ Zpět](../README.md)

Vložitelný **stomatologický prohlížeč CBCT / CT DICOM** pro React + TypeScript: MPR + skutečné 3D, panoramatická (OPG) rekonstrukce, příčné řezy, navigované plánování implantátů, bezpečnostní odstupy, kvalita kosti, tisknutelná vrtací šablona (STL) a vícejazyčná PDF zpráva.

▶ **[Vyzkoušejte živé demo](https://dental-cbct-viewer.vercel.app)** — načte anonymizované ukázkové CBCT a běží zcela ve vašem prohlížeči.

**Panoramatické zobrazení — OPG, příčný řez a 3D s naplánovaným implantátem**
[![DenCT — Panoramatické zobrazení — OPG, příčný řez a 3D s naplánovaným implantátem](https://raw.githubusercontent.com/ZoliQua/Dental-CBCT-Viewer/main/screenshots/panoramic-view.jpg)](https://dental-cbct-viewer.vercel.app)

**3D zobrazení — objemové vykreslení s propojeným axiálním / sagitálním / koronálním řezem**
[![DenCT — 3D zobrazení — objemové vykreslení s propojeným axiálním / sagitálním / koronálním řezem](https://raw.githubusercontent.com/ZoliQua/Dental-CBCT-Viewer/main/screenshots/3d-view.jpg)](https://dental-cbct-viewer.vercel.app)

---

## Instalace

```bash
npm install dental-cbct-viewer react react-dom
```

- **React 18 nebo 19** (peer dependency).
- Pouze ESM; vyžaduje bundler s podporou Web Workerů + WASM (Vite, webpack 5, Next.js, Rollup).
- Cornerstone3D, vtk.js, jsPDF a dicom-parser se instalují jako závislosti.

### ⚠️ Cross-origin izolace (povinná)

Dekódovací workery DICOM používají `SharedArrayBuffer`. Hostitelskou stránku servírujte s hlavičkami:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Bez těchto hlaviček dekódování obrazu nepoběží. V Next.js je nastavte přes `headers()` v `next.config.js`; ve Vite přes `server.headers`.

## Rychlý start

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

Prohlížeč vyplní svého rodiče — dejte mu kontejner s danou velikostí. Dodává se s vlastní šablonou stylů; tmavý režim je výchozí a je omezen na kořen prohlížeče (`.dcv-root`), takže nikdy nemění motiv hostitelské stránky.

## Props

| Prop | Typ | Popis |
| --- | --- | --- |
| `patientId` | `string` | ID pacienta zobrazené v záhlaví zprávy. |
| `patientName` | `string` | Jméno pacienta zobrazené v záhlaví zprávy. |
| `initialPlan` | `PlanData` | Načte uložený plán při připojení. |
| `initialLayout` | `'1x1' \| '1+3' \| '2x2' \| 'OPG2+1' \| 'IO3D'` | Výchozí rozložení. |
| `lang` | `'cs' \| 'da' \| 'de' \| 'en' \| 'es' \| 'fi' \| 'fr' \| 'hu' \| 'nb' \| 'pl' \| 'pt' \| 'ru' \| 'sk' \| 'sv' \| 'uk'` | Jazyk rozhraní. Bez něj prohlížeč použije poslední volbu uživatele, poté jazyk prohlížeče / OS, poté angličtinu. |
| `onPlanChange` | `(plan: PlanData) => void` | Volá se (s debounce) při každé změně plánu. |
| `onImplantsChange` | `(implants: ImplantData[]) => void` | Volá se při každé změně seznamu implantátů. |
| `className` | `string` | Další třída na kořenovém prvku. |
| `embedded` | `boolean` | Potlačí vestavěný banner s upozorněním (souhlas spravuje hostitel). |
| `autosave` | `boolean` | Uchovává kopii plánu pro každou studii v sessionStorage, aby ji znovunačtení obnovilo (výchozí `true`). Vypněte, pokud hostitel ukládá plány přes `onPlanChange`. |
| `features` | `ViewerFeatures` | Přepínače edice: `{ implantPlanning?: boolean; drillGuide?: boolean }`, obojí ve výchozím stavu zapnuto. `implantPlanning: false` dává čistý zobrazovací prohlížeč. Viz [API.md](../API.md#editions). |
| `branding` | `boolean` | Zobrazí webovou propagaci (hvězdička GitHub, okno O aplikaci, odkazy na další projekty). Výchozí `true`. |
| `theme` | `'dark' \| 'light'` | Tmavý / světlý motiv řízený hostitelem; přepíše zapamatovanou volbu a skryje vlastní přepínače prohlížeče. |

## Imperativní API (ref)

```tsx
import { useRef } from "react";
import { DicomViewer, type DicomViewerHandle } from "dental-cbct-viewer";

const ref = useRef<DicomViewerHandle>(null);
// <DicomViewer ref={ref} />
```

| Metoda | Signatura | Popis |
| --- | --- | --- |
| `getImplants` | `() => ImplantData[]` | Aktuální implantáty. |
| `addImplant` | `(implant: ImplantData) => void` | Přidá implantát. |
| `updateImplant` | `(implant: ImplantData) => void` | Nahradí implantát podle id. |
| `removeImplant` | `(id: string) => void` | Odebere implantát. |
| `getPlan` | `() => PlanData` | Serializuje aktuální plán. |
| `loadPlan` | `(plan: PlanData) => void` | Načte plán. |
| `loadStudy` | `(files: File[]) => Promise<void>` | Načte DICOM ze souborů. |
| `loadScans` | `(files: File[]) => Promise<void>` | Importuje povrchové skeny (STL / OBJ / PLY) k otevřené studii; oblouk se odhadne z názvu souboru. |
| `loadSample` | `(kind?: 'ct' \| 'ctIo') => Promise<void>` | Načte přibalenou anonymizovanou ukázku — `'ct'` samotné CBCT, `'ctIo'` CBCT spolu s párovými intraorálními skeny (hostitel musí servírovat `/sample/*` a `/sample-io/*` — viz níže). |
| `setLayout` | `(mode: LayoutMode) => void` | Přepne rozložení. |
| `setActiveView` | `(view: ViewKey) => void` | Přepne zobrazení 1×1. |
| `exportPdf` | `() => Promise<void>` | Vytvoří a stáhne PDF zprávu. |
| `exportGuideStl` | `() => Promise<boolean>` | Vytvoří a stáhne STL vrtací šablony (false, pokud chybí navigovaný implantát). |
| `openSettings` | `() => void` | Otevře dialog nastavení. |
| `openHelp` | `() => void` | Otevře panel nápovědy. |
| `startTour` | `() => void` | Spustí úvodní prohlídku. |

## Jádro bez frameworku (`/core`)

Čisté, bez Reactu — běží v Node, v testech nebo ve vaší vlastní logice:

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

Jádro CSG booleovských operací (`manifold-3d`, ~1,5 MB WASM) se načítá líně uvnitř generátoru šablony, takže import `/core` pro geometrii/bezpečnost zůstává lehký.

## Datový model (základy)

- **`ImplantData`** — vstupní bod ve světových souřadnicích + osa k apexu (ze dvou úhlů vůči nejbližšímu rámci oblouku), průměr, délka, `systemId` a volitelný plán `guided` (odsazení/výška pouzdra, délka vrtáku).
- **`IMPLANT_SYSTEMS`** — katalog (Generic, Alpha-Bio, Straumann BLX, NobelActive) s průměry pouzder pro jednotlivé systémy.
- **`PlanData`** — ukládatelná část stavu (implantáty, anatomické značky, křivka oblouku, příčný řez, bezpečnostní prahy, pole zprávy, nastavení zobrazení a šablony a registrace importovaných skenů — pouze popisy, sítě zůstávají v paměti). Ukládejte jej z `onPlanChange` / `getPlan`, obnovujte přes `initialPlan` / `loadPlan`.

## Přibalená ukázka

`loadSample()` a tlačítko na úvodní stránce stahují ~16 MB anonymizované CBCT z `/sample/meta.json` + `/sample/volume.raw.bin`. Tyto soubory **nejsou** součástí balíčku npm (aby zůstal malý). Chcete-li ukázku použít ve své aplikaci, zkopírujte `public/sample/` z repozitáře do veřejného adresáře své aplikace. Při běžném použití načítáte vlastní DICOM přes `loadStudy(files)`. `loadSample('ctIo')` a druhé tlačítko na úvodní stránce používají místo toho `/sample-io/` (~19 MB: objem, `scans.json` a dvě sítě oblouků komprimované gzipem) — pokud je chcete, zkopírujte také `public/sample-io/`.

## Hostitelské bundlery

- **Vite:** funguje bez úprav.
- **Next.js / webpack 5:** vykreslujte uvnitř klientské komponenty (`"use client"`); prohlížeč při připojení čte DOM. Nastavte hlavičky COOP/COEP. Soubory workerů + WASM jsou předem přibaleny.

## Citace

Pokud DenCT přispívá k práci, kterou publikujete, citujte jej prosím: repozitář obsahuje
[`CITATION.cff`](../CITATION.cff) (tlačítko GitHubu **Cite this repository** vygeneruje
BibTeX nebo APA) a každé vydání je archivováno na Zenodo.

Citujte koncepční DOI [`10.5281/zenodo.23458076`](https://doi.org/10.5281/zenodo.23458076)
pro software obecně — vždy odkazuje na nejnovější archivované vydání — nebo vlastní
DOI vydání pro přesnou verzi ([`10.5281/zenodo.23458077`](https://doi.org/10.5281/zenodo.23458077)
pro v1.4.0).

## Licence a upozornění

MIT © Zoltán Dul; přibalené písmo Roboto pod licencí Apache-2.0.

**Lékařské upozornění:** pouze výzkumný/demonstrační software — nejde o certifikovaný zdravotnický prostředek a není určen ke klinické diagnostice, plánování léčby, přesnému měření ani k implantologickým postupům.
