# 🦷 DenCT — Português

🇨🇿 [Čeština](README-cs.md) · 🇩🇰 [Dansk](README-da.md) · 🇩🇪 [Deutsch](README-de.md) · 🇬🇧 [English](README-en.md) · 🇪🇸 [Español](README-es.md) · 🇫🇷 [Français](README-fr.md) · 🇭🇺 [Magyar](README-hu.md) · 🇳🇴 [Norsk](README-nb.md) · 🇵🇱 [Polski](README-pl.md) · 🇵🇹 Português · 🇸🇰 [Slovenčina](README-sk.md) · 🇫🇮 [Suomi](README-fi.md) · 🇸🇪 [Svenska](README-sv.md) · 🇷🇺 [Русский](README-ru.md) · 🇺🇦 [Українська](README-uk.md) · [⬅ Voltar](../README.md)

Um **visualizador DICOM de CBCT / CT dentário** incorporável para React + TypeScript: MPR + 3D volumétrico, reconstrução panorâmica (OPG), cortes transversais, planeamento de implantes guiado, margens de segurança, qualidade óssea, uma guia cirúrgica imprimível (STL) e um relatório PDF multilingue.

▶ **[Experimentar a demonstração online](https://dental-cbct-viewer.vercel.app)** — carrega um CBCT de exemplo anonimizado e é executada inteiramente no seu navegador.

**Vista panorâmica — OPG, corte transversal e 3D com um implante planeado**
[![DenCT — Vista panorâmica — OPG, corte transversal e 3D com um implante planeado](https://raw.githubusercontent.com/ZoliQua/Dental-CBCT-Viewer/main/screenshots/panoramic-view.jpg)](https://dental-cbct-viewer.vercel.app)

**Vista 3D — renderização volumétrica com axial / sagital / coronal ligadas**
[![DenCT — Vista 3D — renderização volumétrica com axial / sagital / coronal ligadas](https://raw.githubusercontent.com/ZoliQua/Dental-CBCT-Viewer/main/screenshots/3d-view.jpg)](https://dental-cbct-viewer.vercel.app)

---

## Instalação

```bash
npm install dental-cbct-viewer react react-dom
```

- **React 18 ou 19** (dependência peer).
- Apenas ESM; requer um bundler com suporte para Web Workers e WASM (Vite, webpack 5, Next.js, Rollup).
- Cornerstone3D, vtk.js, jsPDF e dicom-parser são instalados como dependências.

### ⚠️ Isolamento cross-origin (obrigatório)

Os workers de descodificação DICOM utilizam `SharedArrayBuffer`. Sirva a página anfitriã com:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Sem estes cabeçalhos, a descodificação de imagens não funciona. No Next.js, defina-os através de `headers()` em `next.config.js`; no Vite, através de `server.headers`.

## Início rápido

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

O visualizador ocupa todo o elemento pai — dê-lhe um contentor com dimensões definidas. Inclui a sua própria folha de estilos; o modo escuro é o predefinido e está limitado à raiz do visualizador (`.dcv-root`), pelo que nunca altera o tema da página anfitriã.

## Props

| Prop | Tipo | Descrição |
| --- | --- | --- |
| `patientId` | `string` | ID do paciente mostrado no cabeçalho do relatório. |
| `patientName` | `string` | Nome do paciente mostrado no cabeçalho do relatório. |
| `initialPlan` | `PlanData` | Carrega um plano guardado ao montar. |
| `initialLayout` | `'1x1' \| '1+3' \| '2x2' \| 'OPG2+1' \| 'IO3D'` | Disposição inicial. |
| `lang` | `'cs' \| 'da' \| 'de' \| 'en' \| 'es' \| 'fi' \| 'fr' \| 'hu' \| 'nb' \| 'pl' \| 'pt' \| 'ru' \| 'sk' \| 'sv' \| 'uk'` | Idioma da interface. Sem ele, o visualizador segue a última escolha do utilizador, depois o idioma do navegador / sistema operativo e, por fim, o inglês. |
| `onPlanChange` | `(plan: PlanData) => void` | Disparado (com debounce) sempre que o plano muda. |
| `onImplantsChange` | `(implants: ImplantData[]) => void` | Disparado sempre que a lista de implantes muda. |
| `className` | `string` | Classe adicional no elemento raiz. |
| `embedded` | `boolean` | Suprime o banner de aviso integrado (o anfitrião gere o consentimento). |
| `autosave` | `boolean` | Guarda uma cópia do plano por estudo no sessionStorage para que um recarregamento a restaure (predefinição `true`). Desative-o quando o anfitrião guarda os planos através de `onPlanChange`. |
| `features` | `ViewerFeatures` | Interruptores de edição: `{ implantPlanning?: boolean; drillGuide?: boolean }`, ambos ativos por predefinição. `implantPlanning: false` dá um visualizador de imagem puro. Ver [API.md](../API.md#editions). |
| `branding` | `boolean` | Mostra a promoção web (estrela do GitHub, caixa Sobre, ligações para outros projetos). Predefinição `true`. |
| `theme` | `'dark' \| 'light'` | Tema escuro / claro controlado pelo anfitrião; substitui a escolha memorizada e oculta os comutadores próprios do visualizador. |

## API imperativa (ref)

```tsx
import { useRef } from "react";
import { DicomViewer, type DicomViewerHandle } from "dental-cbct-viewer";

const ref = useRef<DicomViewerHandle>(null);
// <DicomViewer ref={ref} />
```

| Método | Assinatura | Descrição |
| --- | --- | --- |
| `getImplants` | `() => ImplantData[]` | Implantes atuais. |
| `addImplant` | `(implant: ImplantData) => void` | Adiciona um implante. |
| `updateImplant` | `(implant: ImplantData) => void` | Substitui um implante pelo id. |
| `removeImplant` | `(id: string) => void` | Remove um implante. |
| `getPlan` | `() => PlanData` | Serializa o plano atual. |
| `loadPlan` | `(plan: PlanData) => void` | Carrega um plano. |
| `loadStudy` | `(files: File[]) => Promise<void>` | Carrega DICOM a partir de ficheiros. |
| `loadScans` | `(files: File[]) => Promise<void>` | Importa scans de superfície (STL / OBJ / PLY) junto ao estudo aberto; a arcada é deduzida a partir do nome do ficheiro. |
| `loadSample` | `(kind?: 'ct' \| 'ctIo') => Promise<void>` | Carrega um exemplo anonimizado incluído — `'ct'` apenas o CBCT, `'ctIo'` o CBCT com os scans intraorais correspondentes (o anfitrião tem de servir `/sample/*` e `/sample-io/*` — ver abaixo). |
| `setLayout` | `(mode: LayoutMode) => void` | Muda a disposição. |
| `setActiveView` | `(view: ViewKey) => void` | Muda a vista 1×1. |
| `exportPdf` | `() => Promise<void>` | Cria e descarrega o relatório PDF. |
| `exportGuideStl` | `() => Promise<boolean>` | Cria e descarrega o STL da guia cirúrgica (false se não houver implante guiado). |
| `openSettings` | `() => void` | Abre o diálogo de definições. |
| `openHelp` | `() => void` | Abre o painel de ajuda. |
| `startTour` | `() => void` | Inicia a visita de introdução. |

## Núcleo sem framework (`/core`)

Puro, sem React — funciona em Node, em testes ou na sua própria lógica:

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

O kernel booleano CSG (`manifold-3d`, ~1,5 MB de WASM) é carregado sob demanda dentro do gerador da guia, pelo que importar `/core` para geometria/segurança continua leve.

## Modelo de dados (essencial)

- **`ImplantData`** — ponto de entrada no espaço + eixo até ao ápice (a partir de dois ângulos relativos ao referencial da arcada mais próximo), diâmetro, comprimento, `systemId` e um plano `guided` opcional (desvio/altura da anilha, comprimento da broca).
- **`IMPLANT_SYSTEMS`** — catálogo (Generic, Alpha-Bio, Straumann BLX, NobelActive) com os diâmetros de anilha de cada sistema.
- **`PlanData`** — a parte persistente do estado (implantes, marcadores anatómicos, curva da arcada, corte transversal, limiares de segurança, campos do relatório, definições de visualização e da guia, e os registos dos scans importados — apenas descritores, as malhas ficam em memória). Guarde-o a partir de `onPlanChange` / `getPlan` e restaure-o através de `initialPlan` / `loadPlan`.

## O exemplo incluído

`loadSample()` e o botão da página inicial obtêm um CBCT anonimizado de ~16 MB a partir de `/sample/meta.json` + `/sample/volume.raw.bin`. Estes ficheiros **não** estão incluídos no pacote npm (para o manter pequeno). Para usar o exemplo na sua aplicação, copie `public/sample/` do repositório para o diretório público da sua aplicação. Em utilização normal, carrega o seu próprio DICOM através de `loadStudy(files)`. `loadSample('ctIo')` e o segundo botão da página inicial usam `/sample-io/` em alternativa (~19 MB: o volume, `scans.json` e as duas malhas de arcada comprimidas com gzip) — copie também `public/sample-io/` se o quiser.

## Bundlers anfitriões

- **Vite:** funciona de imediato.
- **Next.js / webpack 5:** renderize dentro de um componente cliente (`"use client"`); o visualizador lê o DOM ao montar. Defina os cabeçalhos COOP/COEP. Os ficheiros Worker e WASM vêm pré-empacotados.

## Citação

Se o DenCT contribuir para um trabalho que publique, cite-o: o repositório inclui um
[`CITATION.cff`](../CITATION.cff) (o botão **Cite this repository** do GitHub gera
BibTeX ou APA), e cada versão é arquivada no Zenodo.

Cite o DOI de conceito [`10.5281/zenodo.23458076`](https://doi.org/10.5281/zenodo.23458076)
para o software em geral — aponta sempre para a versão arquivada mais recente — ou o
DOI próprio de uma versão para fixar a versão exata ([`10.5281/zenodo.23458077`](https://doi.org/10.5281/zenodo.23458077)
para a v1.4.0).

## Licença e aviso legal

MIT © Zoltán Dul; tipo de letra Roboto incluído sob Apache-2.0.

**Aviso médico:** software apenas para investigação/demonstração — não é um dispositivo médico certificado e não se destina a diagnóstico clínico, planeamento de tratamentos, medições precisas nem fluxos de trabalho de implantes.
