# 🦷 DenCT — Français

🇨🇿 [Čeština](README-cs.md) · 🇩🇰 [Dansk](README-da.md) · 🇩🇪 [Deutsch](README-de.md) · 🇬🇧 [English](README-en.md) · 🇪🇸 [Español](README-es.md) · 🇫🇷 Français · 🇭🇺 [Magyar](README-hu.md) · 🇳🇴 [Norsk](README-nb.md) · 🇵🇱 [Polski](README-pl.md) · 🇵🇹 [Português](README-pt.md) · 🇸🇰 [Slovenčina](README-sk.md) · 🇫🇮 [Suomi](README-fi.md) · 🇸🇪 [Svenska](README-sv.md) · 🇷🇺 [Русский](README-ru.md) · 🇺🇦 [Українська](README-uk.md) · [⬅ Retour](../README.md)

Une **visionneuse DICOM CBCT / CT dentaire** intégrable pour React + TypeScript : MPR + 3D volumique, reconstruction panoramique (OPG), coupes transversales, planification implantaire guidée, marges de sécurité, qualité osseuse, un guide chirurgical imprimable (STL) et un rapport PDF multilingue.

▶ **[Essayer la démo en ligne](https://dental-cbct-viewer.vercel.app)** — charge un CBCT d’exemple anonymisé et s’exécute entièrement dans votre navigateur.

**Vue panoramique — OPG, coupe transversale et 3D avec un implant planifié**
[![DenCT — Vue panoramique — OPG, coupe transversale et 3D avec un implant planifié](https://raw.githubusercontent.com/ZoliQua/Dental-CBCT-Viewer/main/screenshots/panoramic-view.jpg)](https://dental-cbct-viewer.vercel.app)

**Vue 3D — rendu volumique avec axiale / sagittale / coronale liées**
[![DenCT — Vue 3D — rendu volumique avec axiale / sagittale / coronale liées](https://raw.githubusercontent.com/ZoliQua/Dental-CBCT-Viewer/main/screenshots/3d-view.jpg)](https://dental-cbct-viewer.vercel.app)

---

## Installation

```bash
npm install dental-cbct-viewer react react-dom
```

- **React 18 ou 19** (dépendance peer).
- ESM uniquement ; nécessite un bundler prenant en charge les Web Workers et le WASM (Vite, webpack 5, Next.js, Rollup).
- Cornerstone3D, vtk.js, jsPDF et dicom-parser sont installés comme dépendances.

### ⚠️ Isolation cross-origin (obligatoire)

Les workers de décodage DICOM utilisent `SharedArrayBuffer`. Servez la page hôte avec :

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Sans ces en-têtes, le décodage des images ne fonctionne pas. Dans Next.js, définissez-les via `headers()` dans `next.config.js` ; dans Vite, via `server.headers`.

## Démarrage rapide

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

La visionneuse remplit son parent — donnez-lui un conteneur dimensionné. Elle fournit sa propre feuille de style ; le mode sombre est activé par défaut et limité à la racine de la visionneuse (`.dcv-root`), il ne modifie donc jamais le thème de la page hôte.

## Props

| Prop | Type | Description |
| --- | --- | --- |
| `patientId` | `string` | Identifiant du patient affiché dans l’en-tête du rapport. |
| `patientName` | `string` | Nom du patient affiché dans l’en-tête du rapport. |
| `initialPlan` | `PlanData` | Charge un plan enregistré au montage. |
| `initialLayout` | `'1x1' \| '1+3' \| '2x2' \| 'OPG2+1'` | Disposition de départ. |
| `lang` | `'cs' \| 'da' \| 'de' \| 'en' \| 'es' \| 'fi' \| 'fr' \| 'hu' \| 'nb' \| 'pl' \| 'pt' \| 'ru' \| 'sk' \| 'sv' \| 'uk'` | Langue de l’interface. Sans elle, la visionneuse suit le dernier choix de l’utilisateur, puis la langue du navigateur / du système, puis l’anglais. |
| `onPlanChange` | `(plan: PlanData) => void` | Déclenché (avec anti-rebond) à chaque modification du plan. |
| `onImplantsChange` | `(implants: ImplantData[]) => void` | Déclenché à chaque modification de la liste des implants. |
| `className` | `string` | Classe supplémentaire sur l’élément racine. |
| `embedded` | `boolean` | Supprime la bannière d’avertissement intégrée (l’hôte gère le consentement). |

## API impérative (ref)

```tsx
import { useRef } from "react";
import { DicomViewer, type DicomViewerHandle } from "dental-cbct-viewer";

const ref = useRef<DicomViewerHandle>(null);
// <DicomViewer ref={ref} />
```

| Méthode | Signature | Description |
| --- | --- | --- |
| `getImplants` | `() => ImplantData[]` | Implants actuels. |
| `addImplant` | `(implant: ImplantData) => void` | Ajoute un implant. |
| `updateImplant` | `(implant: ImplantData) => void` | Remplace un implant par son id. |
| `removeImplant` | `(id: string) => void` | Supprime un implant. |
| `getPlan` | `() => PlanData` | Sérialise le plan actuel. |
| `loadPlan` | `(plan: PlanData) => void` | Charge un plan. |
| `loadStudy` | `(files: File[]) => Promise<void>` | Charge du DICOM à partir de fichiers. |
| `loadScans` | `(files: File[]) => Promise<void>` | Importe des empreintes de surface (STL / OBJ / PLY) à côté de l’étude ouverte ; l’arcade est déduite du nom du fichier. |
| `loadSample` | `(kind?: 'ct' \| 'ctIo') => Promise<void>` | Charge un exemple anonymisé fourni — `'ct'` le CBCT seul, `'ctIo'` le CBCT avec les empreintes intra-orales associées (l’hôte doit servir `/sample/*` et `/sample-io/*` — voir ci-dessous). |
| `setLayout` | `(mode: LayoutMode) => void` | Change de disposition. |
| `setActiveView` | `(view: ViewKey) => void` | Change la vue 1×1. |
| `exportPdf` | `() => Promise<void>` | Génère et télécharge le rapport PDF. |
| `exportGuideStl` | `() => Promise<boolean>` | Génère et télécharge le STL du guide chirurgical (false s’il n’y a pas d’implant guidé). |

## Cœur sans framework (`/core`)

Pur, sans React — fonctionne dans Node, dans des tests ou dans votre propre logique :

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

Le noyau booléen CSG (`manifold-3d`, ~1,5 Mo de WASM) est chargé à la demande dans le générateur de guide ; importer `/core` pour la géométrie/la sécurité reste donc léger.

## Modèle de données (l’essentiel)

- **`ImplantData`** — point d’entrée dans l’espace + axe vers l’apex (à partir de deux angles relatifs au repère d’arcade le plus proche), diamètre, longueur, `systemId` et un plan `guided` facultatif (décalage/hauteur de la douille, longueur du foret).
- **`IMPLANT_SYSTEMS`** — catalogue (Generic, Alpha-Bio, Straumann BLX, NobelActive) avec les diamètres de douille propres à chaque système.
- **`PlanData`** — la partie persistante de l’état (implants, repères anatomiques, courbe d’arcade, coupe transversale, seuils de sécurité, champs du rapport, réglages d’affichage et du guide, et les recalages des empreintes importées — uniquement les descripteurs, les maillages restent en mémoire). Enregistrez-le depuis `onPlanChange` / `getPlan`, restaurez-le via `initialPlan` / `loadPlan`.

## L’exemple fourni

`loadSample()` et le bouton de la page d’accueil récupèrent un CBCT anonymisé d’environ 16 Mo depuis `/sample/meta.json` + `/sample/volume.raw.bin`. Ces fichiers ne sont **pas** inclus dans le paquet npm (pour qu’il reste léger). Pour utiliser l’exemple dans votre application, copiez `public/sample/` du dépôt dans le répertoire public de votre application. En utilisation normale, vous chargez votre propre DICOM via `loadStudy(files)`. `loadSample('ctIo')` et le second bouton de la page d’accueil utilisent `/sample-io/` à la place (~19 Mo : le volume, `scans.json` et les deux maillages d’arcade compressés en gzip) — copiez aussi `public/sample-io/` si vous le souhaitez.

## Bundlers hôtes

- **Vite :** fonctionne directement.
- **Next.js / webpack 5 :** effectuez le rendu dans un composant client (`"use client"`) ; la visionneuse lit le DOM au montage. Définissez les en-têtes COOP/COEP. Les fichiers Worker et WASM sont pré-empaquetés.

## Citation

Si DenCT contribue à un travail que vous publiez, merci de le citer : le dépôt contient un
[`CITATION.cff`](../CITATION.cff) (le bouton **Cite this repository** de GitHub génère du
BibTeX ou de l’APA), et chaque version est archivée sur Zenodo.

Citez le DOI de concept [`10.5281/zenodo.23458076`](https://doi.org/10.5281/zenodo.23458076)
pour le logiciel en général — il renvoie toujours à la dernière version archivée — ou le
DOI propre d’une version pour figer la version exacte ([`10.5281/zenodo.23458077`](https://doi.org/10.5281/zenodo.23458077)
pour la v1.4.0).

## Licence et avertissement

MIT © Zoltán Dul ; police Roboto incluse sous licence Apache-2.0.

**Avertissement médical :** logiciel de recherche/démonstration uniquement — ce n’est pas un dispositif médical certifié et il n’est pas destiné au diagnostic clinique, à la planification de traitements, aux mesures précises ni aux flux de travail implantaires.
