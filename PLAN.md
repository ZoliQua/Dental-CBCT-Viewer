# Dental-CBCT-Viewer — Programterv

## 1. Cél és Scope

**CT DICOM fájlok megjelenítése és implantátum tervezés** — önálló alkalmazásként fejleszthető, később git submodule-ként integrálható a DentalQuoteCreatorba (ahogy az odontogram és a dq-importer modul is).

### Fő funkciók
- **DICOM fájlok betöltése** — lokális fájlrendszerből (drag & drop / file picker)
- **2D nézetek** — axiális, koronális, szagittális síkok (MPR)
- **3D rekonstrukció** — Volume rendering a CT adatokból
- **Implantátum tervezés** — implantátum pozícionálás, méretezés, szögezés
- **Mérőeszközök** — távolság, szög, terület, denzitás (HU) mérés
- **Annotációk** — megjegyzések, jelölések a képeken
- **Export** — tervek mentése/betöltése, képernyőkép export (PNG/PDF)

---

## 2. Tech Stack

A DentalQuoteCreator-ral kompatibilis stack:

| Réteg | Technológia | Indoklás |
|-------|-------------|----------|
| Framework | **React 18 + TypeScript** | DQC kompatibilitás |
| Build | **Vite** | DQC kompatibilitás |
| Styling | **Tailwind CSS** | DQC kompatibilitás |
| DICOM parsing | **@cornerstonejs/dicom-image-loader** + **dicom-parser** | Iparági standard, aktívan fejlesztett |
| 2D rendering | **@cornerstonejs/core** + **@cornerstonejs/tools** | MPR nézetek, mérőeszközök |
| 3D rendering | **@cornerstonejs/streaming-image-volume-loader** + **vtk.js** | Volume rendering (Cornerstone3D VTK-ra épül) |
| State mgmt | **React Context** (később Zustand ha kell) | DQC pattern |
| i18n | Saját, DQC-kompatibilis | HU/EN/DE |

### Cornerstone3D választás indoklása
- A Cornerstone3D a legérettebb nyílt forráskódú orvosi képmegjelenítő library
- Natív TypeScript support
- Beépített MPR, volume rendering, annotációk, mérőeszközök
- Aktív community és OHIF viewer használja

---

## 3. Projekt struktúra

```
Dental-CBCT-Viewer/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── index.html                    # Standalone dev entry
├── public/
│   └── sample-data/              # Teszt DICOM fájlok (gitignored)
├── src/
│   ├── main.tsx                  # Standalone app entry point
│   ├── App.tsx                   # Shell integrációs entry point
│   ├── types/
│   │   ├── dicom.ts              # DICOM metadata típusok
│   │   ├── implant.ts            # Implantátum típusok (méret, típus, gyártó)
│   │   └── plan.ts               # Tervezési session típusok
│   ├── context/
│   │   ├── ViewerContext.tsx      # Viewport állapot, aktív tool, layout
│   │   └── PlanContext.tsx        # Implantátum terv állapot
│   ├── core/
│   │   ├── init.ts               # Cornerstone3D inicializálás
│   │   ├── dicomLoader.ts        # DICOM fájl betöltés és volume építés
│   │   ├── volumeBuilder.ts      # Volume rekonstrukció logika
│   │   └── toolManager.ts        # Tool regisztráció és kezelés
│   ├── components/
│   │   ├── layout/
│   │   │   ├── ViewerShell.tsx   # Fő layout wrapper
│   │   │   ├── Toolbar.tsx       # Felső eszköztár
│   │   │   └── SidePanel.tsx     # Jobb oldali panel (DICOM info, implant props)
│   │   ├── viewport/
│   │   │   ├── ViewportGrid.tsx  # 1x1, 2x2, 1+3 layout manager
│   │   │   ├── Viewport2D.tsx    # Egyedi 2D nézet (axial/coronal/sagittal)
│   │   │   ├── Viewport3D.tsx    # 3D volume rendering nézet
│   │   │   └── ViewportOverlay.tsx  # HU érték, pozíció, window/level kijelzés
│   │   ├── tools/
│   │   │   ├── MeasurementTools.tsx  # Távolság, szög mérők UI
│   │   │   ├── WindowLevel.tsx       # Ablakszélesség/szint presetjei
│   │   │   └── CrosshairSync.tsx     # Szálkereszt szinkronizáció
│   │   ├── implant/
│   │   │   ├── ImplantLibrary.tsx    # Implantátum katalógus
│   │   │   ├── ImplantPlacer.tsx     # Implantátum pozícionáló
│   │   │   ├── ImplantProperties.tsx # Kiválasztott implantátum tulajdonságai
│   │   │   ├── NerveCanal.tsx        # Nervus alveolaris inferior jelölés
│   │   │   └── BoneAnalysis.tsx      # Csont denzitás/vastagság elemzés
│   │   ├── dicom/
│   │   │   ├── FileDropZone.tsx      # Drag & drop DICOM import
│   │   │   ├── SeriesList.tsx        # DICOM sorozat lista
│   │   │   └── DicomTagBrowser.tsx   # DICOM tag böngésző
│   │   └── export/
│   │       ├── PlanExport.tsx        # Terv export (JSON + képek)
│   │       └── ScreenCapture.tsx     # Viewport screenshot
│   ├── data/
│   │   └── implants/
│   │       ├── straumann.json        # Straumann implantátum méretek
│   │       ├── nobel-biocare.json    # Nobel Biocare méretek
│   │       └── megagen.json          # MegaGen méretek
│   ├── hooks/
│   │   ├── useViewport.ts            # Viewport kezelő hook
│   │   ├── useDicomLoader.ts         # Fájl betöltés hook
│   │   ├── useImplantPlacement.ts    # Implantátum elhelyezés logika
│   │   └── useMeasurements.ts        # Mérések kezelése
│   ├── utils/
│   │   ├── dicomUtils.ts             # DICOM tag kinyerés, sorozat csoportosítás
│   │   ├── geometryUtils.ts          # 3D geometria számítások
│   │   └── exportUtils.ts            # Export segédfüggvények
│   └── i18n/
│       ├── hu.ts
│       ├── en.ts
│       └── de.ts
└── .gitignore
```

---

## 4. Fejlesztési fázisok

### Fázis 1 — Alapok (DICOM betöltés + 2D megjelenítés)
1. Projekt scaffold (Vite + React + TS + Tailwind)
2. Cornerstone3D inicializálás és konfiguráció
3. DICOM fájl betöltés (drag & drop, file picker)
4. DICOM sorozat felismerés és csoportosítás (SeriesInstanceUID alapján)
5. Egyedi 2D viewport (axiális nézet)
6. Window/Level kezelés (egér interakció + preset-ek: csont, lágyrész, stb.)
7. Alapvető navigáció (scroll a szeleteken, zoom, pan)
8. DICOM tag megjelenítés overlay-ben (beteg neve, vizsgálat dátuma, szeletvastagság)

### Fázis 2 — MPR + Mérőeszközök
1. MPR (Multi-Planar Reconstruction) — axiális, koronális, szagittális nézetek
2. Viewport grid layout (1x1, 2x2, 1+3 elrendezések)
3. Crosshair szinkronizáció a nézetek között
4. Mérőeszközök:
   - Távolságmérés (mm)
   - Szögmérés
   - HU (Hounsfield Unit) érték kijelzés
   - Terület/profil mérés
5. Annotációk (szöveg, nyíl)

### Fázis 3 — 3D Volume Rendering
1. Volume rekonstrukció a CT szeletekből
2. 3D nézet (VTK.js volume rendering)
3. Transfer function preset-ek (csont, fogak, lágyrész, bőr)
4. 3D forgatás, zoom
5. Clipping plane (vágósík) a 3D modellen

### Fázis 4 — Implantátum tervezés
1. Implantátum katalógus (JSON adatbázis: Straumann, Nobel Biocare, MegaGen stb.)
2. Implantátum elhelyezés a 2D nézeteken (pozíció + szög)
3. Implantátum megjelenítés mind a 3 MPR síkban + 3D-ben
4. Nervus alveolaris inferior (alsó fogideg) manuális jelölés
5. Csont denzitás elemzés az implantátum körül (D1-D4 osztályozás)
6. Csont vastagság mérés az implantátum vonalában
7. Több implantátum kezelése egy tervben
8. Abutment választás és megjelenítés

### Fázis 5 — Export és integráció
1. Terv mentés/betöltés (JSON formátum)
2. Screenshot export (PNG) az aktív nézetekből
3. PDF report generálás (beteg adatok + terv képek + méretek)
4. **DentalQuoteCreator integráció:**
   - Git submodule beállítás
   - Path alias a DQC tsconfig-ban: `@dq-dicom → src/modules/dq-dicom-viewer/src`
   - Entry point: `App.tsx` komponens exportálás
   - Beteg kontextus fogadása props-ként (PatientId, név)
   - Terv mentés callback a DQC felé

---

## 5. DentalQuoteCreator integráció terve

A meglévő submodule pattern-t követve:

```
# .gitmodules-ba kerül (DentalQuoteCreator oldalon):
[submodule "dq-dicom-viewer"]
    path = src/modules/dq-dicom-viewer
    url = https://github.com/ZoliQua/Dental-CBCT-Viewer.git
```

```typescript
// DQC tsconfig.json — új path alias:
"@dq-dicom": ["src/modules/dq-dicom-viewer/src"]

// DQC vite.config.ts — ha kell saját backend:
"/api/dicom/*": { target: "http://localhost:3335" }

// DQC App.tsx — új route:
<Route path="/dicom-viewer" element={
  <Guard permission="dicom.view">
    <DicomViewerPage />
  </Guard>
} />
```

Az `App.tsx` exportál egy `DicomViewer` komponenst ami props-ként fogadja:

```typescript
interface DicomViewerProps {
  patientId?: string;
  patientName?: string;
  onPlanSaved?: (plan: ImplantPlan) => void;
  embedded?: boolean;  // ha true, nincs saját header/nav
}
```

---

## 6. Kulcs technikai kihívások

| Kihívás | Megoldás |
|---------|----------|
| Nagy DICOM fájlok (CT = 200-500 MB) | Streaming betöltés, Web Worker-ek, progressive rendering |
| WebGL memória limit | Volume decimálás, LOD (Level of Detail), viewport cleanup |
| Cornerstone3D Vite kompatibilitás | SharedArrayBuffer polyfill, COOP/COEP headerek konfigurálása |
| Implantátum geometria pontos pozícionálás | Cornerstone3D custom annotation tool |
| Cross-origin isolation (SharedArrayBuffer) | Vite dev server header config + production `.htaccess` |

---

## 7. Ajánlott indulás

Az **1. fázissal** érdemes kezdeni — ez adja az összes többi fázis alapját. Amint egy DICOM fájl megjelenik a képernyőn és scrollozható, onnan iteratívan építhető minden más.
