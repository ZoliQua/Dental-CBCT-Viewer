# 🦷 DenCT — Русский

🇨🇿 [Čeština](README-cs.md) · 🇩🇰 [Dansk](README-da.md) · 🇩🇪 [Deutsch](README-de.md) · 🇬🇧 [English](README-en.md) · 🇪🇸 [Español](README-es.md) · 🇫🇷 [Français](README-fr.md) · 🇭🇺 [Magyar](README-hu.md) · 🇳🇴 [Norsk](README-nb.md) · 🇵🇱 [Polski](README-pl.md) · 🇵🇹 [Português](README-pt.md) · 🇸🇰 [Slovenčina](README-sk.md) · 🇫🇮 [Suomi](README-fi.md) · 🇸🇪 [Svenska](README-sv.md) · 🇷🇺 Русский · 🇺🇦 [Українська](README-uk.md) · [⬅ Назад](../README.md)

Встраиваемый **просмотрщик стоматологических КЛКТ / КТ-снимков DICOM** для React + TypeScript: MPR и полноценный 3D, панорамная (ОПТГ) реконструкция, поперечные срезы, навигационное планирование имплантации, контроль безопасных расстояний, оценка плотности кости, хирургический шаблон для печати (STL) и многоязычный PDF-отчёт.

▶ **[Открыть онлайн-демо](https://dental-cbct-viewer.vercel.app)** — загружает анонимизированный пример КЛКТ и работает полностью в вашем браузере.

**Панорамный вид — ОПТГ, поперечный срез и 3D с запланированным имплантатом**
[![DenCT — панорамный вид — ОПТГ, поперечный срез и 3D с запланированным имплантатом](https://raw.githubusercontent.com/ZoliQua/Dental-CBCT-Viewer/main/screenshots/panoramic-view.jpg)](https://dental-cbct-viewer.vercel.app)

**3D-вид — объёмный рендеринг со связанными аксиальным / сагиттальным / корональным срезами**
[![DenCT — 3D-вид — объёмный рендеринг со связанными аксиальным / сагиттальным / корональным срезами](https://raw.githubusercontent.com/ZoliQua/Dental-CBCT-Viewer/main/screenshots/3d-view.jpg)](https://dental-cbct-viewer.vercel.app)

---

## Установка

```bash
npm install dental-cbct-viewer react react-dom
```

- **React 18 или 19** (peer-зависимость).
- Только ESM; нужен сборщик с поддержкой Web Worker и WASM (Vite, webpack 5, Next.js, Rollup).
- Cornerstone3D, vtk.js, jsPDF и dicom-parser устанавливаются как зависимости.

### ⚠️ Cross-origin isolation (обязательно)

Воркеры декодирования DICOM используют `SharedArrayBuffer`. Отдавайте страницу-хост с заголовками:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Без этих заголовков декодирование изображений не работает. В Next.js задайте их через `headers()` в `next.config.js`; в Vite — через `server.headers`.

## Быстрый старт

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

Просмотрщик заполняет родительский элемент — задайте контейнеру размеры. Он поставляется со своей таблицей стилей; тёмная тема включена по умолчанию и ограничена корнем просмотрщика (`.dcv-root`), поэтому никогда не меняет тему страницы-хоста.

## Props

| Prop | Тип | Описание |
| --- | --- | --- |
| `patientId` | `string` | ID пациента в заголовке отчёта. |
| `patientName` | `string` | Имя пациента в заголовке отчёта. |
| `initialPlan` | `PlanData` | Загрузить сохранённый план при монтировании. |
| `initialLayout` | `'1x1' \| '1+3' \| '2x2' \| 'OPG2+1' \| 'IO3D'` | Начальная раскладка. |
| `lang` | `'cs' \| 'da' \| 'de' \| 'en' \| 'es' \| 'fi' \| 'fr' \| 'hu' \| 'nb' \| 'pl' \| 'pt' \| 'ru' \| 'sk' \| 'sv' \| 'uk'` | Язык интерфейса. Если не задан, просмотрщик использует последний выбор пользователя, затем язык браузера / ОС, затем английский. |
| `onPlanChange` | `(plan: PlanData) => void` | Вызывается (с debounce) при каждом изменении плана. |
| `onImplantsChange` | `(implants: ImplantData[]) => void` | Вызывается при каждом изменении списка имплантатов. |
| `className` | `string` | Дополнительный класс корневого элемента. |
| `embedded` | `boolean` | Отключает встроенный баннер с отказом от ответственности (согласие получает хост). |
| `autosave` | `boolean` | Хранит копию плана для каждого исследования в sessionStorage, чтобы перезагрузка её восстанавливала (по умолчанию `true`). Отключите, если хост сам сохраняет планы через `onPlanChange`. |
| `features` | `ViewerFeatures` | Переключатели редакции: `{ implantPlanning?: boolean; drillGuide?: boolean }`, оба по умолчанию включены. `implantPlanning: false` даёт чистый просмотрщик изображений. См. [API.md](../API.md#editions). |
| `branding` | `boolean` | Показывает веб-продвижение (звезда GitHub, окно «О программе», ссылки на другие проекты). По умолчанию `true`. |
| `theme` | `'dark' \| 'light'` | Тёмная / светлая тема под управлением хоста; переопределяет запомненный выбор и скрывает собственные переключатели просмотрщика. |

## Императивный API (ref)

```tsx
import { useRef } from "react";
import { DicomViewer, type DicomViewerHandle } from "dental-cbct-viewer";

const ref = useRef<DicomViewerHandle>(null);
// <DicomViewer ref={ref} />
```

| Метод | Сигнатура | Описание |
| --- | --- | --- |
| `getImplants` | `() => ImplantData[]` | Текущие имплантаты. |
| `addImplant` | `(implant: ImplantData) => void` | Добавить имплантат. |
| `updateImplant` | `(implant: ImplantData) => void` | Заменить имплантат по id. |
| `removeImplant` | `(id: string) => void` | Удалить имплантат. |
| `getPlan` | `() => PlanData` | Сериализовать текущий план. |
| `loadPlan` | `(plan: PlanData) => void` | Загрузить план. |
| `loadStudy` | `(files: File[]) => Promise<void>` | Загрузить DICOM из файлов. |
| `loadScans` | `(files: File[]) => Promise<void>` | Импортировать поверхностные сканы (STL / OBJ / PLY) к открытому исследованию; челюсть определяется по имени файла. |
| `loadSample` | `(kind?: 'ct' \| 'ctIo') => Promise<void>` | Загрузить встроенный анонимизированный пример — `'ct'` только КЛКТ, `'ctIo'` КЛКТ вместе с парными внутриротовыми сканами (хост должен отдавать `/sample/*` и `/sample-io/*` — см. ниже). |
| `setLayout` | `(mode: LayoutMode) => void` | Сменить раскладку. |
| `setActiveView` | `(view: ViewKey) => void` | Сменить вид в режиме 1×1. |
| `exportPdf` | `() => Promise<void>` | Построить и скачать PDF-отчёт. |
| `exportGuideStl` | `() => Promise<boolean>` | Построить и скачать STL хирургического шаблона (false, если нет навигационного имплантата). |
| `openSettings` | `() => void` | Открывает окно настроек. |
| `openHelp` | `() => void` | Открывает панель справки. |
| `startTour` | `() => void` | Запускает вводный тур. |

## Ядро без фреймворка (`/core`)

Чистый код без React — работает в Node, тестах или вашей собственной логике:

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

Ядро булевых CSG-операций (`manifold-3d`, ~1,5 МБ WASM) загружается лениво внутри построителя шаблона, поэтому импорт `/core` ради геометрии и проверок безопасности остаётся лёгким.

## Модель данных (основное)

- **`ImplantData`** — точка входа в мировых координатах и ось к апексу (по двум углам относительно ближайшего кадра дуги), диаметр, длина, `systemId` и необязательный навигационный план `guided` (смещение/высота втулки, длина сверла).
- **`IMPLANT_SYSTEMS`** — каталог (Generic, Alpha-Bio, Straumann BLX, NobelActive) с диаметрами втулок для каждой системы.
- **`PlanData`** — сохраняемая часть состояния (имплантаты, анатомические маркеры, кривая дуги, поперечный срез, пороги безопасности, поля отчёта, настройки отображения и шаблона, а также совмещения импортированных сканов — только дескрипторы, сами модели остаются в памяти). Сохраняйте его из `onPlanChange` / `getPlan`, восстанавливайте через `initialPlan` / `loadPlan`.

## Встроенный пример

`loadSample()` и кнопка на стартовой странице загружают анонимизированную КЛКТ размером ~16 МБ из `/sample/meta.json` + `/sample/volume.raw.bin`. Эти файлы **не** входят в npm-пакет (чтобы он оставался небольшим). Чтобы использовать пример в своём приложении, скопируйте `public/sample/` из репозитория в публичную папку приложения. В обычной работе вы загружаете собственный DICOM через `loadStudy(files)`. `loadSample('ctIo')` и вторая кнопка на стартовой странице используют вместо этого `/sample-io/` (~19 МБ: объём, `scans.json` и две сжатые gzip модели челюстей) — скопируйте и `public/sample-io/`, если он вам нужен.

## Сборщики хоста

- **Vite:** работает «из коробки».
- **Next.js / webpack 5:** рендерите внутри клиентского компонента (`"use client"`); просмотрщик обращается к DOM при монтировании. Задайте заголовки COOP/COEP. Ресурсы Worker и WASM уже собраны заранее.

## Цитирование

Если DenCT использовался в опубликованной вами работе, пожалуйста, процитируйте его: в репозитории есть
[`CITATION.cff`](../CITATION.cff) (кнопка GitHub **Cite this repository** выдаёт
BibTeX или APA), а каждый релиз архивируется на Zenodo.

Цитируйте концептуальный DOI [`10.5281/zenodo.23458076`](https://doi.org/10.5281/zenodo.23458076)
для программы в целом — он всегда указывает на последний архивированный релиз — или собственный DOI
релиза, чтобы зафиксировать точную версию ([`10.5281/zenodo.23458077`](https://doi.org/10.5281/zenodo.23458077)
для v1.4.0).

## Лицензия и отказ от ответственности

MIT © Zoltán Dul; встроенный шрифт Roboto — под лицензией Apache-2.0.

**Медицинский отказ от ответственности:** программа только для исследований и демонстрации — не является сертифицированным медицинским изделием и не предназначена для клинической диагностики, планирования лечения, точных измерений или рабочих процессов имплантации.
