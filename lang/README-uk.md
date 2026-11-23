# 🦷 DenCT — Українська

🇨🇿 [Čeština](README-cs.md) · 🇩🇰 [Dansk](README-da.md) · 🇩🇪 [Deutsch](README-de.md) · 🇬🇧 [English](README-en.md) · 🇪🇸 [Español](README-es.md) · 🇫🇷 [Français](README-fr.md) · 🇭🇺 [Magyar](README-hu.md) · 🇳🇴 [Norsk](README-nb.md) · 🇵🇱 [Polski](README-pl.md) · 🇵🇹 [Português](README-pt.md) · 🇸🇰 [Slovenčina](README-sk.md) · 🇫🇮 [Suomi](README-fi.md) · 🇸🇪 [Svenska](README-sv.md) · 🇷🇺 [Русский](README-ru.md) · 🇺🇦 Українська · [⬅ Назад](../README.md)

Вбудовуваний **переглядач стоматологічних КПКТ / КТ-знімків DICOM** для React + TypeScript: MPR і повноцінне 3D, панорамна (ОПТГ) реконструкція, поперечні зрізи, навігаційне планування імплантації, контроль безпечних відстаней, оцінка щільності кістки, хірургічний шаблон для друку (STL) і багатомовний PDF-звіт.

▶ **[Відкрити онлайн-демо](https://dental-cbct-viewer.vercel.app)** — завантажує анонімізований приклад КПКТ і працює повністю у вашому браузері.

**Панорамний вигляд — ОПТГ, поперечний зріз і 3D із запланованим імплантатом**
[![DenCT — панорамний вигляд — ОПТГ, поперечний зріз і 3D із запланованим імплантатом](https://raw.githubusercontent.com/ZoliQua/Dental-CBCT-Viewer/main/screenshots/panoramic-view.jpg)](https://dental-cbct-viewer.vercel.app)

**3D-вигляд — об’ємний рендеринг із пов’язаними аксіальним / сагітальним / корональним зрізами**
[![DenCT — 3D-вигляд — об’ємний рендеринг із пов’язаними аксіальним / сагітальним / корональним зрізами](https://raw.githubusercontent.com/ZoliQua/Dental-CBCT-Viewer/main/screenshots/3d-view.jpg)](https://dental-cbct-viewer.vercel.app)

---

## Встановлення

```bash
npm install dental-cbct-viewer react react-dom
```

- **React 18 або 19** (peer-залежність).
- Лише ESM; потрібен збирач із підтримкою Web Worker і WASM (Vite, webpack 5, Next.js, Rollup).
- Cornerstone3D, vtk.js, jsPDF і dicom-parser встановлюються як залежності.

### ⚠️ Cross-origin isolation (обов’язково)

Воркери декодування DICOM використовують `SharedArrayBuffer`. Віддавайте сторінку-хост із заголовками:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Без цих заголовків декодування зображень не працюватиме. У Next.js задайте їх через `headers()` у `next.config.js`; у Vite — через `server.headers`.

## Швидкий старт

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

Переглядач заповнює батьківський елемент — задайте контейнеру розміри. Він постачається з власною таблицею стилів; темна тема ввімкнена за замовчуванням і обмежена коренем переглядача (`.dcv-root`), тож ніколи не змінює тему сторінки-хоста.

## Props

| Prop | Тип | Опис |
| --- | --- | --- |
| `patientId` | `string` | ID пацієнта в заголовку звіту. |
| `patientName` | `string` | Ім’я пацієнта в заголовку звіту. |
| `initialPlan` | `PlanData` | Завантажити збережений план під час монтування. |
| `initialLayout` | `'1x1' \| '1+3' \| '2x2' \| 'OPG2+1' \| 'IO3D'` | Початкова розкладка. |
| `lang` | `'cs' \| 'da' \| 'de' \| 'en' \| 'es' \| 'fi' \| 'fr' \| 'hu' \| 'nb' \| 'pl' \| 'pt' \| 'ru' \| 'sk' \| 'sv' \| 'uk'` | Мова інтерфейсу. Якщо не задано, переглядач використовує останній вибір користувача, потім мову браузера / ОС, потім англійську. |
| `onPlanChange` | `(plan: PlanData) => void` | Викликається (з debounce) під час кожної зміни плану. |
| `onImplantsChange` | `(implants: ImplantData[]) => void` | Викликається під час кожної зміни списку імплантатів. |
| `className` | `string` | Додатковий клас кореневого елемента. |
| `embedded` | `boolean` | Вимикає вбудований банер із застереженням (згоду отримує хост). |
| `autosave` | `boolean` | Зберігає копію плану для кожного дослідження в sessionStorage, щоб перезавантаження її відновлювало (типово `true`). Вимкніть, якщо хост сам зберігає плани через `onPlanChange`. |
| `features` | `ViewerFeatures` | Перемикачі редакції: `{ implantPlanning?: boolean; drillGuide?: boolean }`, обидва типово ввімкнені. `implantPlanning: false` дає чистий переглядач зображень. Див. [API.md](../API.md#editions). |
| `branding` | `boolean` | Показує веб-просування (зірка GitHub, вікно «Про програму», посилання на інші проєкти). Типово `true`. |
| `theme` | `'dark' \| 'light'` | Темна / світла тема під керуванням хоста; перевизначає запам’ятований вибір і приховує власні перемикачі переглядача. |

## Імперативний API (ref)

```tsx
import { useRef } from "react";
import { DicomViewer, type DicomViewerHandle } from "dental-cbct-viewer";

const ref = useRef<DicomViewerHandle>(null);
// <DicomViewer ref={ref} />
```

| Метод | Сигнатура | Опис |
| --- | --- | --- |
| `getImplants` | `() => ImplantData[]` | Поточні імплантати. |
| `addImplant` | `(implant: ImplantData) => void` | Додати імплантат. |
| `updateImplant` | `(implant: ImplantData) => void` | Замінити імплантат за id. |
| `removeImplant` | `(id: string) => void` | Видалити імплантат. |
| `getPlan` | `() => PlanData` | Серіалізувати поточний план. |
| `loadPlan` | `(plan: PlanData) => void` | Завантажити план. |
| `loadStudy` | `(files: File[]) => Promise<void>` | Завантажити DICOM з файлів. |
| `loadScans` | `(files: File[]) => Promise<void>` | Імпортувати поверхневі скани (STL / OBJ / PLY) до відкритого дослідження; щелепа визначається за назвою файлу. |
| `loadSample` | `(kind?: 'ct' \| 'ctIo') => Promise<void>` | Завантажити вбудований анонімізований приклад — `'ct'` лише КПКТ, `'ctIo'` КПКТ разом із парними внутрішньоротовими сканами (хост має віддавати `/sample/*` і `/sample-io/*` — див. нижче). |
| `setLayout` | `(mode: LayoutMode) => void` | Змінити розкладку. |
| `setActiveView` | `(view: ViewKey) => void` | Змінити вигляд у режимі 1×1. |
| `exportPdf` | `() => Promise<void>` | Побудувати й завантажити PDF-звіт. |
| `exportGuideStl` | `() => Promise<boolean>` | Побудувати й завантажити STL хірургічного шаблону (false, якщо немає навігаційного імплантата). |
| `openSettings` | `() => void` | Відкриває вікно налаштувань. |
| `openHelp` | `() => void` | Відкриває панель довідки. |
| `startTour` | `() => void` | Запускає вступний тур. |

## Ядро без фреймворку (`/core`)

Чистий код без React — працює в Node, тестах або вашій власній логіці:

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

Ядро булевих CSG-операцій (`manifold-3d`, ~1,5 МБ WASM) завантажується ліниво всередині побудовника шаблону, тож імпорт `/core` заради геометрії та перевірок безпеки лишається легким.

## Модель даних (основне)

- **`ImplantData`** — точка входу у світових координатах і вісь до апекса (за двома кутами відносно найближчого кадру дуги), діаметр, довжина, `systemId` і необов’язковий навігаційний план `guided` (зміщення/висота втулки, довжина свердла).
- **`IMPLANT_SYSTEMS`** — каталог (Generic, Alpha-Bio, Straumann BLX, NobelActive) з діаметрами втулок для кожної системи.
- **`PlanData`** — збережувана частина стану (імплантати, анатомічні маркери, крива дуги, поперечний зріз, пороги безпеки, поля звіту, налаштування відображення й шаблону, а також суміщення імпортованих сканів — лише дескриптори, самі моделі лишаються в пам’яті). Зберігайте його з `onPlanChange` / `getPlan`, відновлюйте через `initialPlan` / `loadPlan`.

## Вбудований приклад

`loadSample()` і кнопка на стартовій сторінці завантажують анонімізовану КПКТ розміром ~16 МБ із `/sample/meta.json` + `/sample/volume.raw.bin`. Ці файли **не** входять до npm-пакета (щоб він лишався невеликим). Щоб використати приклад у своєму застосунку, скопіюйте `public/sample/` з репозиторію в публічну теку застосунку. У звичайній роботі ви завантажуєте власний DICOM через `loadStudy(files)`. `loadSample('ctIo')` і друга кнопка на стартовій сторінці натомість використовують `/sample-io/` (~19 МБ: об’єм, `scans.json` і дві стиснені gzip моделі щелеп) — скопіюйте й `public/sample-io/`, якщо він вам потрібен.

## Збирачі хоста

- **Vite:** працює одразу.
- **Next.js / webpack 5:** рендерте всередині клієнтського компонента (`"use client"`); переглядач звертається до DOM під час монтування. Задайте заголовки COOP/COEP. Ресурси Worker і WASM уже попередньо зібрані.

## Цитування

Якщо DenCT допоміг у роботі, яку ви публікуєте, будь ласка, процитуйте його: репозиторій містить
[`CITATION.cff`](../CITATION.cff) (кнопка GitHub **Cite this repository** формує
BibTeX або APA), а кожен реліз архівується на Zenodo.

Цитуйте концептуальний DOI [`10.5281/zenodo.23458076`](https://doi.org/10.5281/zenodo.23458076)
для програми загалом — він завжди вказує на останній архівований реліз — або власний DOI
релізу, щоб зафіксувати точну версію ([`10.5281/zenodo.23458077`](https://doi.org/10.5281/zenodo.23458077)
для v1.4.0).

## Ліцензія та застереження

MIT © Zoltán Dul; вбудований шрифт Roboto — за ліцензією Apache-2.0.

**Медичне застереження:** програма лише для досліджень і демонстрації — не є сертифікованим медичним виробом і не призначена для клінічної діагностики, планування лікування, точних вимірювань або робочих процесів імплантації.
