# AGENTS.md — Local Analytics Workspace

These rules apply to the whole repository. Treat this file as the persistent product brief. Before changing code, inspect the existing project and preserve working implementations and conventions.

## 1. Product and non-negotiable constraints

Build a static, client-side web application for creating, editing, organizing, and visualizing business data. It must work without company-provided data: users can create a source table from zero or import a TXT file.

The product combines a Houdini Geometry Spreadsheet-inspired source table, a free-layout Canvas inspired by visual note/whiteboard tools, business analytics, and a portable human-readable TXT project file. Visual direction: Linear-inspired, dark-first, clean, compact, professional, with restrained violet/purple accents. Do not copy Linear branding or exact screens.

Hard constraints:
- Deploy on GitHub Pages as static files. Parsing, editing, calculations, and rendering happen in the browser.
- No backend, server API, cloud database, login, account system, or server-side processing.
- The TXT project file is the primary long-term/portable storage. Users must be able to start from an empty table without using an external editor.
- The primary source table is the single source of truth. All Canvas charts, KPIs, Kanban views, and table views derive from it. Never create disconnected copies of source values.
- The source table is distinct from table elements on a Canvas. A Canvas table is a configured view, not the underlying source editor.
- The source-data panel is visible by default on desktop and can be resized/collapsed. On narrow screens, use a drawer/tab rather than squeezing the desktop layout.
- Source edits update dependent elements immediately.
- Never silently discard malformed data, unsupported content, or layout/configuration during import/export. Never send user data to a server or third party.

## 2. Core concepts and main workflow

Use these terms consistently:
- **Project**: one portable workspace containing one primary dataset and one or more Canvas pages.
- **Source Data**: the editable primary table.
- **Canvas page**: a named free-layout workspace with its own viewport and elements.
- **Canvas element**: a movable/resizable note, KPI, chart, table view, Kanban board, etc.
- **Navigator tree**: project -> Canvas pages -> elements. Selecting an item selects/focuses it on the Canvas.
- **Activity heatmap**: GitHub-contribution-style calendar. Initially count records by a selected date column. If no date field exists, show a setup state; do not invent activity.
- **Graph view**: Obsidian-like nodes/links between pages and elements, not a machine-learning neural network.

Data flow: `Source table -> field selection/filtering/aggregation -> Canvas elements -> visualizations`.
Use stable IDs for projects, datasets, columns, rows, pages, and elements. Display names may change without breaking references.

First-use flow:
1. Create a project.
2. Create an empty source table or import TXT.
3. Edit the table in the app: add/edit/delete rows; add/rename/reorder/delete columns; correct types.
4. Show a layout chooser after a usable table exists.
5. Offer a few generic templates (for example Overview, Trends) and Blank Canvas. Do not hard-code one company's business fields or departments.
6. Add/configure/move/resize/link/delete elements across multiple Canvas pages.
7. Export the entire project to TXT.

A dataset-only TXT import creates the source table and then opens the layout chooser. A full-project TXT import restores data and supported pages/elements/layouts.

## 3. Scope and priorities

Build in phases. Do not spend time on advanced features before the core workflow works. If scope must be reduced, defer advanced analytics before weakening source editing, Canvas editing, live updates, or project import/export.

### Phase 1 — MVP (required)
- React static site, GitHub Pages build, no backend.
- New project and blank source table; dynamic columns/rows; inline editing; add/delete rows and columns; rename columns; basic type selection.
- Dataset-only TXT import with preview and validation errors.
- Project tree, multiple Canvas pages, and free-layout Canvas.
- Canvas pan/zoom; add/select/move/resize/configure/delete elements.
- Elements: text/note, KPI, line chart, bar/column chart, read-only table view of source data.
- A few generic templates plus Blank Canvas.
- Live source-to-visualization updates.
- Full-project TXT export/import, including layout and element configuration.
- Session recovery after reload in the same browser tab.
- Separate Help/Instructions page documenting workflow and TXT format.

### Phase 2 — requested extensions
Kanban grouped by a selected status/category field; histograms, pie/donut, stacked bar and scatter charts; sparklines; basic pivot/summary tables; date-column activity heatmap; internal links between pages/elements; basic Obsidian-like graph view.

### Phase 3 — optional advanced features
Advanced data-relationship graphs; multiple related datasets/joins; calculated fields/formulas; reusable filters; advanced templates; enhanced direct-to-file saving.

Pivot tables, multiple datasets, and advanced graph analytics are not MVP blockers. Do not start later phases unless asked or Phase 1 acceptance checks pass.

## 4. Recommended stack and structure

Use this stack unless the repository already has a suitable working alternative:
- React + TypeScript + Vite — application foundation.
- `@xyflow/react` (React Flow) — Canvas nodes, drag/move, selection, pan, zoom, and connections; use custom React nodes and supported resizing tools.
- Apache ECharts — charts, calendar heatmap, and graph view. Lazy-load advanced visualization code where practical.
- Plain CSS or CSS Modules with CSS custom properties — styles/design tokens. Avoid a large UI framework without a concrete need.
- React reducer/context or another small state solution. Avoid unnecessary state libraries.
- Browser File APIs — read local TXT and export TXT.
- `sessionStorage` — temporary same-tab recovery only, not permanent storage.

Keep dependencies minimal. Before adding a package, explain why it is needed and check browser APIs/existing dependencies first. Do not add a database or backend framework.

Suggested boundaries (adapt to the existing structure; do not create folders mechanically):
- `app/`: shell, navigation, global state.
- `features/source-data/`: dataset model, editable table, types, validation, data operations.
- `features/canvas/`: pages, viewport, elements, tree, Canvas interactions.
- `features/visualizations/`: charts/KPI/table views and transforms.
- `features/project-file/`: parser, serializer, preview, validation, file adapters.
- `features/help/`: user instructions and TXT format.
- `components/`, `styles/`: shared UI and design tokens.

Keep parsing, serialization, and data transformations testable independently from React components.

## 5. Data model and source-table rules

Phase 1 supports one primary dataset per project, with arbitrary columns/rows, stable IDs, empty cells, and column types at minimum `text`, `number`, `date`, `boolean`.

Conceptual model (adapt names to code conventions):
- `Project`: id, name, formatVersion, primaryDataset, canvases, metadata.
- `Dataset`: id, name, columns, rows.
- `Column`: id, name, type, optional display format.
- `Row`: id and values keyed by column ID.
- `CanvasPage`: id, name, viewport, ordered elements.
- `CanvasElement`: id, type, position, size, config, optional data references/links.

Rules:
- Users can build the source table entirely in the website; no fixed company schema.
- Type inference may suggest a type, but must not silently corrupt data. Let users correct types.
- A cell edit updates shared state and all dependent elements.
- Renaming a column must preserve references via its stable ID. If a referenced column is deleted, show a visible error or request a replacement; never silently map another column.
- Canvas table elements are read-only/configurable views in the MVP, not separate datasets.

## 6. TXT format contract

TXT is a core feature. Use UTF-8, semicolon (`;`) as delimiter, variable column count, a documented/versioned format, deterministic export, and tests. Do not hard-code sample column names.

### Dataset-only import format

```text
# Dataset: Sales
# Columns: date:date;product:text;category:text;quantity:number;amount:number
2026-01-01;Laptop;Electronics;2;40000
2026-01-02;Monitor;Electronics;5;25000
2026-01-03;Keyboard;Accessories;10;8000
```

Rules: `# Dataset:` is optional. `# Columns:` declares `name:type` items; missing type defaults to `text`. Initial types: `text`, `number`, `date`, `boolean`. Every row must have the declared number of fields. Support quoted fields containing `;` or quote characters; escape an inner quote by doubling it (`""`). Empty fields mean empty cells. Use ISO dates (`YYYY-MM-DD`) and dot decimals in the file; localize only in the UI. Document syntax, quoting, types, dates, and decimal rules in Help.

### Full-project import/export

Default export must preserve source data plus Canvas pages and layouts. Use a section-based, versioned format. Conceptual example:

```text
# LOCAL-ANALYTICS-PROJECT
# Format-Version: 1
# Project-Name: Sales Dashboard

[DATASET id="main"]
# Name: Sales
# Columns: date:date;product:text;amount:number
2026-01-01;Laptop;40000
[/DATASET]

[CANVAS id="overview"]
# Name: Overview
# Viewport: x=0;y=0;zoom=1
[ITEM id="revenue-kpi" type="kpi"]
# Position: x=80;y=80
# Size: width=260;height=140
# Config-JSON: {"title":"Total revenue","valueField":"amount","aggregation":"sum"}
[/ITEM]
[/CANVAS]
```

This is a format contract, not permission to write a fragile parser. Parse explicit sections and validate them. A `Config-JSON` metadata line may store element settings; keep ordinary table data semicolon-delimited. MVP may contain one dataset and multiple Canvas pages; keep the format versioned for future evolution.

Full-project round trips must preserve project name/version, column definitions/cell values, page IDs/names/order/viewports, element IDs/types/positions/sizes, data references, supported settings, and supported links.

Import must: read locally; parse/validate before replacement; show a preview with dataset/row/column/page/element counts; report actionable errors (line numbers where possible); never silently skip malformed rows or unsupported types; and never replace the current project until the user confirms a valid import. Preserve unknown metadata when safe, otherwise warn and avoid destructive import. Dataset-only import opens the template chooser; full project restores the workspace.

Export must: default to the full project; use stable ordering/consistent formatting; show whether changes exist since last export; and have parser/serializer round-trip tests (variable columns, empty cells, quotes, malformed rows, layout).

## 7. Browser storage and file access

Desired behavior: edits survive reloads in the same tab but are not intended as permanent storage after that tab session ends.
- Use `sessionStorage` for a versioned recovery snapshot; debounce writes rather than writing every keystroke.
- Handle quota/security errors. If recovery fails, retain in-memory work where possible, show a clear warning, and prompt export.
- Explain that session storage is temporary and tab-scoped; TXT is the reliable long-term copy. Do not use `localStorage` for project data by default.
- Baseline import: file input + `File` API. Baseline export: `Blob` download.
- `showOpenFilePicker()` / `showSaveFilePicker()` are optional progressive enhancements only: feature-detect, invoke only from a direct user action, and always keep the fallback. Browser support/permissions vary.
- Never access local files without explicit user selection/permission.

## 8. Interface and interaction

Overall: Linear-inspired dark-first UI; restrained dark surfaces, clear typography, compact spacing, subtle borders, violet/purple accents. Use Ukrainian as the default UI language unless the user specifies otherwise; keep user-facing strings easy to localize. Keep code identifiers/technical comments in English. Use CSS variables for theme tokens. Prioritize readability; avoid excessive glow/gradients, oversized cards, decorative charts, and clutter.

Desktop layout:
- **Left:** project tree with Canvas pages and child elements; expandable/collapsible; synchronized selection; access to Help and optional Activity/Graph views.
- **Center:** Canvas toolbar and free-layout surface.
- **Right:** Source Data dock, visible by default, resizable/collapsible, editable.
- Avoid rigid widths that cripple the Canvas. On small screens use drawers/tabs.

Canvas:
- Add from a toolbar/menu; select, drag, move, resize, configure, delete.
- Pan/zoom must not trigger accidental movement while editing text or interacting with a chart.
- Save each page's viewport and all element positions/sizes to the project model and TXT.
- Tree and Canvas selection stay synchronized. Page create/rename/delete must be clear; confirm deleting non-empty pages.
- Internal links navigate to the target page and focus the target element; implement after stable IDs/navigation exist.

Source Data:
- Clearly label it as the primary data source; show row/column counts and helpful empty states.
- Keep long tables scrollable without covering the Canvas.
- Activity heatmap is compact/collapsible and counts records by a selected date column; it is not GitHub commit history or app edit history.
- Graph view is secondary; implement only after page/element links work.

Help page must explain: creating a project/table; editing rows/columns; dataset-only import; full-project export; exact TXT syntax and validation; templates/blank Canvas; adding/configuring/moving/resizing elements; Source Data vs Canvas table; live updates; temporary session recovery/export before closing; and that data is not sent to a server. Use generic sample data, never claim it is real company data.

## 9. Visualization rules

Every visualization identifies source columns and aggregation. Provide sensible defaults, but allow field/chart configuration. Validate types (numeric values, date axes, etc.). Missing/invalid fields show actionable messages, not blank/misleading charts. KPI config must define field and aggregation (sum, average, count, min, max, etc.). Never label a metric as revenue/profit/growth unless the field or user configuration establishes that meaning. Keep colors theme-consistent and accessible.

## 10. Code quality and agent behavior

- Inspect relevant files and architecture before editing. For substantial work, state a short plan and likely changed files.
- Make the smallest coherent change. Preserve working features; do not rewrite the project or replace libraries without a concrete reason.
- Use TypeScript domain types; avoid `any` except for a narrow documented reason.
- Keep parsing/serialization/transforms pure and testable where practical.
- Handle errors explicitly; no empty catch blocks or fake success messages.
- Controls must work or be clearly marked unavailable; no decorative nonfunctional buttons.
- Use accessible labels, keyboard-operable controls, visible focus, and sufficient contrast.
- Do not add remote APIs, analytics trackers, cloud storage, authentication, secrets, private data, or actual company datasets.
- Explain why each new dependency is needed. Inspect existing scripts/settings before changing them.

## 11. Testing, deployment, and completion

A feature is complete only when interaction works, state is preserved as required, invalid input is handled, and relevant checks pass. UI presence alone is not completion.

Phase 1 checks:
- [ ] Static production build works under the GitHub Pages repository subpath.
- [ ] No backend/login/database server/network API is required.
- [ ] User can create/edit a source table from zero with variable rows/columns.
- [ ] Valid dataset-only TXT imports correctly; invalid import reports errors without destroying current work.
- [ ] Source edits immediately update dependent KPI/chart/table elements.
- [ ] Multiple Canvas pages work and are navigable in the tree.
- [ ] Phase 1 elements can be added, selected, moved, resized, configured, and deleted.
- [ ] Canvas table is a view of the primary dataset.
- [ ] Full-project export/re-import preserves data, pages, layout, positions, sizes, and supported settings.
- [ ] Session recovery survives reload in the same tab; storage failures are communicated.
- [ ] Help page matches implemented behavior; layout works on desktop and narrow screens; no recurring console errors.

Test at minimum: TXT parser/serializer (variable columns, empty cells, quoting, invalid row lengths, round trip); row/column operations and stable IDs; live visualization updates; Canvas layout round trip; cancelled/invalid/valid imports; export fallback; production build under GitHub Pages subpath.

GitHub Pages rules: static output only; set Vite `base` for the actual repository path; use base-aware asset paths (no hard-coded `/` assumptions); no server routes/rewrites; use hash-compatible navigation if URL routing is needed; test the production build, not only the dev server.

After each task, report: what changed, files changed, tests/build commands actually run and their real results, and remaining limitations. Never claim a test/build/browser check/deployment succeeded unless it actually did.
