# 🦷 Dental CBCT Viewer — Español

🇪🇸 Español · 🇬🇧 [English](README-en.md) · 🇩🇪 [Deutsch](README-de.md) · 🇭🇺 [Magyar](README-hu.md) · [⬅ Volver](../README.md)

Visor **DICOM de CBCT / TC dental** integrable para React + TypeScript: MPR + 3D real, reconstrucción panorámica (OPG), cortes transversales, planificación guiada de implantes, distancias de seguridad, calidad ósea, una guía de fresado imprimible (STL) y un informe PDF multilingüe.

---

## Instalación

```bash
npm install dental-cbct-viewer react react-dom
```

- **React 18 o 19** (peer dependency).
- Solo ESM; requiere un bundler con soporte de Web Workers + WASM (Vite, webpack 5, Next.js, Rollup).
- Cornerstone3D, vtk.js, jsPDF y dicom-parser se instalan como dependencias.

### ⚠️ Aislamiento de origen cruzado (obligatorio)

Los workers de decodificación DICOM usan `SharedArrayBuffer`. Sirva la página anfitriona con:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Sin estas cabeceras, la decodificación de imágenes no funcionará. En Next.js con `headers()` en `next.config.js`; en Vite con `server.headers`.

## Inicio rápido

```tsx
import { DicomViewer } from "dental-cbct-viewer";
import "dental-cbct-viewer/style.css";

export function Planificador() {
  return (
    <div style={{ height: "100vh" }}>
      <DicomViewer lang="es" />
    </div>
  );
}
```

El visor ocupa su contenedor padre — asígnele un contenedor con tamaño. Incluye su propia hoja de estilos; el modo oscuro es el predeterminado y está acotado a la raíz del visor (`.dcv-root`), por lo que nunca cambia el tema de la página anfitriona.

## Props

| Prop | Tipo | Descripción |
| --- | --- | --- |
| `patientId` | `string` | Identificador del paciente en la cabecera del informe. |
| `patientName` | `string` | Nombre del paciente en la cabecera del informe. |
| `initialPlan` | `PlanData` | Cargar un plan guardado al montar. |
| `initialLayout` | `'1x1' \| '1+3' \| '2x2' \| 'OPG2+1'` | Disposición inicial. |
| `lang` | `'en' \| 'de' \| 'es' \| 'hu'` | Idioma de la interfaz. |
| `onPlanChange` | `(plan: PlanData) => void` | Se llama (con debounce) al cambiar el plan. |
| `onImplantsChange` | `(implants: ImplantData[]) => void` | Se llama al cambiar la lista de implantes. |
| `className` | `string` | Clase adicional en el elemento raíz. |
| `embedded` | `boolean` | Oculta el banner de aviso integrado (el anfitrión gestiona el consentimiento). |

## API imperativa (ref)

```tsx
import { useRef } from "react";
import { DicomViewer, type DicomViewerHandle } from "dental-cbct-viewer";

const ref = useRef<DicomViewerHandle>(null);
// <DicomViewer ref={ref} />
```

| Método | Firma | Descripción |
| --- | --- | --- |
| `getImplants` | `() => ImplantData[]` | Implantes actuales. |
| `addImplant` | `(implant: ImplantData) => void` | Añadir un implante. |
| `updateImplant` | `(implant: ImplantData) => void` | Reemplazar un implante por id. |
| `removeImplant` | `(id: string) => void` | Eliminar un implante. |
| `getPlan` | `() => PlanData` | Serializar el plan actual. |
| `loadPlan` | `(plan: PlanData) => void` | Cargar un plan. |
| `loadStudy` | `(files: File[]) => Promise<void>` | Cargar DICOM desde archivos. |
| `loadSample` | `() => Promise<void>` | Cargar la muestra anonimizada incluida (el anfitrión debe servir `/sample/*` — ver abajo). |
| `setLayout` | `(mode: LayoutMode) => void` | Cambiar la disposición. |
| `setActiveView` | `(view: ViewKey) => void` | Cambiar la vista 1×1. |
| `exportPdf` | `() => Promise<void>` | Generar + descargar el informe PDF. |
| `exportGuideStl` | `() => Promise<boolean>` | Generar + descargar la guía de fresado STL (false si no hay implante guiado). |

## Núcleo independiente del framework (`/core`)

Puro, sin React — se ejecuta en Node, tests o tu propia lógica:

```ts
import {
  // Modelo de datos de implantes + catálogo de sistemas
  IMPLANT_SYSTEMS, getImplantSystem,
  // Geometría
  implantWorldAxis, archFrameAt, nearestArchFrame,
  // Seguridad (distancias nervio / seno / vecino)
  evaluateImplant,
  // Calidad ósea (Misch D1–D5, HU en el sitio del implante)
  classifyBone, sampleImplantBoneHU,
  // Geometría de la guía + exportación STL binaria
  triMeshToBinarySTL,
} from "dental-cbct-viewer/core";
```

El kernel CSG booleano (`manifold-3d`, ~1,5 MB WASM) se carga de forma perezosa dentro del constructor de la guía, así que importar `/core` para geometría/seguridad se mantiene ligero.

## Modelo de datos (esencial)

- **`ImplantData`** — punto de entrada en el mundo + eje del ápice (a partir de dos ángulos relativos al marco de arco más cercano), diámetro, longitud, `systemId` y un plan `guided` opcional (offset/altura del casquillo, longitud de fresado).
- **`IMPLANT_SYSTEMS`** — catálogo (Generic, Alpha-Bio, Straumann BLX, NobelActive) con diámetros de casquillo por sistema.
- **`PlanData`** — la porción persistible del estado (implantes, marcadores anatómicos, curva del arco, corte transversal, umbrales de seguridad, campos del informe, ajustes de visualización + guía). Guárdalo con `onPlanChange` / `getPlan`, restáuralo con `initialPlan` / `loadPlan`.

## La muestra incluida

`loadSample()` y el botón de la pantalla de inicio cargan un CBCT anonimizado de ~16 MB desde `/sample/meta.json` + `/sample/volume.raw.bin`. Estos recursos **no** están en el paquete npm (para mantenerlo pequeño). Para usar la muestra en tu app, copia `public/sample/` del repositorio al directorio público de tu app. En uso normal cargas tu propio DICOM con `loadStudy(files)`.

## Bundlers anfitriones

- **Vite:** funciona directamente.
- **Next.js / webpack 5:** renderiza dentro de un componente cliente (`"use client"`); el visor lee el DOM al montar. Configura las cabeceras COOP/COEP. Los recursos de worker + WASM vienen preempaquetados.

## Licencia y aviso

MIT © Zoltán Dul; fuente Roboto incluida bajo Apache-2.0.

**Aviso médico:** software solo para investigación/demostración — no es un dispositivo médico certificado y no debe usarse para diagnóstico clínico, planificación de tratamientos, mediciones precisas ni flujos de trabajo de implantes.
