# 🦷 DenCT — Suomi

🇨🇿 [Čeština](README-cs.md) · 🇩🇰 [Dansk](README-da.md) · 🇩🇪 [Deutsch](README-de.md) · 🇬🇧 [English](README-en.md) · 🇪🇸 [Español](README-es.md) · 🇫🇷 [Français](README-fr.md) · 🇭🇺 [Magyar](README-hu.md) · 🇳🇴 [Norsk](README-nb.md) · 🇵🇱 [Polski](README-pl.md) · 🇵🇹 [Português](README-pt.md) · 🇸🇰 [Slovenčina](README-sk.md) · 🇫🇮 Suomi · 🇸🇪 [Svenska](README-sv.md) · 🇷🇺 [Русский](README-ru.md) · 🇺🇦 [Українська](README-uk.md) · [⬅ Takaisin](../README.md)

Upotettava **hammaslääketieteellinen CBCT / CT DICOM -katselin** Reactille ja TypeScriptille: MPR ja aito 3D, panoraamarekonstruktio (OPG), poikkileikkaukset, ohjattu implanttisuunnittelu, turvaetäisyydet, luun laatu, tulostettava porausohjain (STL) ja monikielinen PDF-raportti.

▶ **[Kokeile live-demoa](https://dental-cbct-viewer.vercel.app)** — lataa anonymisoidun esimerkki-CBCT:n ja toimii kokonaan selaimessasi.

**Panoraamanäkymä — OPG, poikkileikkaus ja 3D suunnitellun implantin kanssa**
[![DenCT — Panoraamanäkymä — OPG, poikkileikkaus ja 3D suunnitellun implantin kanssa](https://raw.githubusercontent.com/ZoliQua/Dental-CBCT-Viewer/main/screenshots/panoramic-view.jpg)](https://dental-cbct-viewer.vercel.app)

**3D-näkymä — volyymirenderöinti linkitetyin aksiaali- / sagittaali- / koronaalinäkymin**
[![DenCT — 3D-näkymä — volyymirenderöinti linkitetyin aksiaali- / sagittaali- / koronaalinäkymin](https://raw.githubusercontent.com/ZoliQua/Dental-CBCT-Viewer/main/screenshots/3d-view.jpg)](https://dental-cbct-viewer.vercel.app)

---

## Asennus

```bash
npm install dental-cbct-viewer react react-dom
```

- **React 18 tai 19** (peer dependency).
- Vain ESM; vaatii bundlerin, joka tukee Web Workereita ja WASMia (Vite, webpack 5, Next.js, Rollup).
- Cornerstone3D, vtk.js, jsPDF ja dicom-parser asentuvat riippuvuuksina.

### ⚠️ Cross-origin-eristys (pakollinen)

DICOM-dekoodauksen workerit käyttävät `SharedArrayBuffer`ia. Tarjoile isäntäsivu näillä otsakkeilla:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Ilman näitä otsakkeita kuvien dekoodaus ei toimi. Next.js:ssä ne asetetaan `next.config.js`-tiedoston `headers()`-funktiolla, Vitessä `server.headers`-asetuksella.

## Pika-aloitus

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

Katselin täyttää isäelementtinsä — anna sille mitoitettu säiliö. Sillä on oma tyylitiedostonsa; tumma tila on oletus ja rajattu katselimen juurielementtiin (`.dcv-root`), joten se ei koskaan muuta isäntäsivun teemaa.

## Propsit

| Prop | Tyyppi | Kuvaus |
| --- | --- | --- |
| `patientId` | `string` | Raportin otsikossa näytettävä potilastunniste. |
| `patientName` | `string` | Raportin otsikossa näytettävä potilaan nimi. |
| `initialPlan` | `PlanData` | Lataa tallennetun suunnitelman käynnistettäessä. |
| `initialLayout` | `'1x1' \| '1+3' \| '2x2' \| 'OPG2+1' \| 'IO3D'` | Aloitusasettelu. |
| `lang` | `'cs' \| 'da' \| 'de' \| 'en' \| 'es' \| 'fi' \| 'fr' \| 'hu' \| 'nb' \| 'pl' \| 'pt' \| 'ru' \| 'sk' \| 'sv' \| 'uk'` | Käyttöliittymän kieli. Ilman sitä katselin noudattaa käyttäjän viimeisintä valintaa, sitten selaimen / käyttöjärjestelmän kieltä ja lopuksi englantia. |
| `onPlanChange` | `(plan: PlanData) => void` | Laukeaa (viivästetysti) aina, kun suunnitelma muuttuu. |
| `onImplantsChange` | `(implants: ImplantData[]) => void` | Laukeaa aina, kun implanttiluettelo muuttuu. |
| `className` | `string` | Lisäluokka juurielementille. |
| `embedded` | `boolean` | Piilottaa sisäänrakennetun vastuuvapausbannerin (isäntä hoitaa suostumuksen). |
| `autosave` | `boolean` | Säilyttää suunnitelmasta tutkimuskohtaisen kopion sessionStoragessa, jotta uudelleenlataus palauttaa sen (oletus `true`). Kytke pois, kun isäntä tallentaa suunnitelmat itse `onPlanChange`-kutsulla. |
| `features` | `ViewerFeatures` | Versiokytkimet: `{ implantPlanning?: boolean; drillGuide?: boolean }`, molemmat oletuksena päällä. `implantPlanning: false` tekee pelkän kuvankatseluohjelman. Katso [API.md](../API.md#editions). |
| `branding` | `boolean` | Näyttää verkkomainonnan (GitHub-tähti, Tietoja-ruutu, linkit muihin projekteihin). Oletus `true`. |
| `theme` | `'dark' \| 'light'` | Isännän hallitsema tumma / vaalea teema; ohittaa muistetun valinnan ja piilottaa katseluohjelman omat valitsimet. |

## Imperatiivinen API (ref)

```tsx
import { useRef } from "react";
import { DicomViewer, type DicomViewerHandle } from "dental-cbct-viewer";

const ref = useRef<DicomViewerHandle>(null);
// <DicomViewer ref={ref} />
```

| Metodi | Allekirjoitus | Kuvaus |
| --- | --- | --- |
| `getImplants` | `() => ImplantData[]` | Nykyiset implantit. |
| `addImplant` | `(implant: ImplantData) => void` | Lisää implantin. |
| `updateImplant` | `(implant: ImplantData) => void` | Korvaa implantin tunnisteen perusteella. |
| `removeImplant` | `(id: string) => void` | Poistaa implantin. |
| `getPlan` | `() => PlanData` | Sarjallistaa nykyisen suunnitelman. |
| `loadPlan` | `(plan: PlanData) => void` | Lataa suunnitelman. |
| `loadStudy` | `(files: File[]) => Promise<void>` | Lataa DICOMin tiedostoista. |
| `loadScans` | `(files: File[]) => Promise<void>` | Tuo pintaskannauksia (STL / OBJ / PLY) avoimen tutkimuksen rinnalle; kaari päätellään tiedostonimestä. |
| `loadSample` | `(kind?: 'ct' \| 'ctIo') => Promise<void>` | Lataa mukana tulevan anonymisoidun esimerkin — `'ct'` pelkkä CBCT, `'ctIo'` CBCT ja siihen kuuluvat suunsisäiset skannaukset (isännän on tarjoiltava `/sample/*` ja `/sample-io/*` — ks. alla). |
| `setLayout` | `(mode: LayoutMode) => void` | Vaihtaa asettelua. |
| `setActiveView` | `(view: ViewKey) => void` | Vaihtaa 1×1-näkymää. |
| `exportPdf` | `() => Promise<void>` | Luo ja lataa PDF-raportin. |
| `exportGuideStl` | `() => Promise<boolean>` | Luo ja lataa porausohjaimen STL:n (false, jos ohjattua implanttia ei ole). |
| `openSettings` | `() => void` | Avaa asetusikkunan. |
| `openHelp` | `() => void` | Avaa ohjepaneelin. |
| `startTour` | `() => void` | Käynnistää esittelykierroksen. |

## Kehyksetön ydin (`/core`)

Puhdas ja Reactista riippumaton — toimii Nodessa, testeissä tai omassa logiikassasi:

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

CSG-Boolen-ydin (`manifold-3d`, ~1,5 MB WASM) ladataan laiskasti porausohjaimen luonnin sisällä, joten `/core`-tuonti geometriaa/turvallisuutta varten pysyy kevyenä.

## Tietomalli (olennaiset)

- **`ImplantData`** — sisääntulopiste maailmankoordinaateissa ja apeksiakseli (kahdesta kulmasta suhteessa lähimpään kaarikehykseen), halkaisija, pituus, `systemId` sekä valinnainen `guided`-suunnitelma (holkin etäisyys/korkeus, poran pituus).
- **`IMPLANT_SYSTEMS`** — luettelo (Generic, Alpha-Bio, Straumann BLX, NobelActive) järjestelmäkohtaisine holkkihalkaisijoineen.
- **`PlanData`** — tilan tallennettava osa (implantit, anatomiset merkinnät, kaarikäyrä, poikkileikkaus, turvarajat, raporttikentät, näyttö- ja ohjainasetukset sekä tuotujen skannausten rekisteröinnit — vain kuvaajat, verkot pysyvät muistissa). Tallenna se `onPlanChange`- / `getPlan`-kautta ja palauta `initialPlan`- / `loadPlan`-kautta.

## Mukana tuleva esimerkki

`loadSample()` ja aloitussivun painike hakevat ~16 MB:n anonymisoidun CBCT:n osoitteista `/sample/meta.json` + `/sample/volume.raw.bin`. Näitä tiedostoja **ei** ole npm-paketissa (jotta se pysyy pienenä). Jos haluat käyttää esimerkkiä sovelluksessasi, kopioi repositorion `public/sample/` sovelluksesi public-hakemistoon. Normaalikäytössä lataat oman DICOMisi `loadStudy(files)`-kutsulla. `loadSample('ctIo')` ja aloitussivun toinen painike käyttävät sen sijaan polkua `/sample-io/` (~19 MB: volyymi, `scans.json` ja kaksi gzip-pakattua kaariverkkoa) — kopioi myös `public/sample-io/`, jos haluat sen.

## Isäntäbundlerit

- **Vite:** toimii sellaisenaan.
- **Next.js / webpack 5:** renderöi asiakaskomponentin sisällä (`"use client"`); katselin lukee DOMia käynnistyessään. Aseta COOP/COEP-otsakkeet. Worker- ja WASM-tiedostot on valmiiksi bundlattu.

## Viittaaminen

Jos DenCT on osana julkaisemaasi työtä, viittaa siihen: repositoriossa on
[`CITATION.cff`](../CITATION.cff) (GitHubin **Cite this repository** -painike tuottaa
BibTeX- tai APA-muodon), ja jokainen julkaisu arkistoidaan Zenodoon.

Viittaa konsepti-DOI:hin [`10.5281/zenodo.23458076`](https://doi.org/10.5281/zenodo.23458076)
ohjelmistoon yleisesti — se osoittaa aina uusimpaan arkistoituun julkaisuun — tai
julkaisun omaan DOI:hin tarkan version kiinnittämiseksi ([`10.5281/zenodo.23458077`](https://doi.org/10.5281/zenodo.23458077)
versiolle v1.4.0).

## Lisenssi ja vastuuvapauslauseke

MIT © Zoltán Dul; mukana tuleva Roboto-fontti Apache-2.0-lisenssillä.

**Lääketieteellinen vastuuvapauslauseke:** vain tutkimus- ja esittelyohjelmisto — ei sertifioitu lääkinnällinen laite eikä tarkoitettu kliiniseen diagnostiikkaan, hoidon suunnitteluun, tarkkoihin mittauksiin tai implanttityönkulkuihin.
