export type ColumnType = 'text' | 'number' | 'date' | 'boolean';

export type CellValue = string | number | boolean | null;

export interface Column {
  id: string;
  name: string;
  type: ColumnType;
  displayFormat?: string;
}

export interface Row {
  id: string;
  values: Record<string, CellValue>;
}

export interface Dataset {
  id: string;
  name: string;
  columns: Column[];
  rows: Row[];
  unknownMetadata?: string[];
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export type CanvasElementType =
  | 'note'
  | 'kpi'
  | 'line-chart'
  | 'bar-chart'
  | 'table-view'
  | 'kanban'
  | 'histogram'
  | 'pie-chart'
  | 'stacked-bar'
  | 'scatter'
  | 'pivot-table';

export type KpiAggregation = 'sum' | 'avg' | 'count' | 'min' | 'max';

export type ChartAggregation = 'sum' | 'avg' | 'count' | 'min' | 'max';

export interface NoteElementConfig {
  title: string;
  content: string;
}

export interface KpiElementConfig {
  title: string;
  valueFieldId: string | null;
  aggregation: KpiAggregation;
  showSparkline?: boolean;
  sparklineOrderFieldId?: string | null;
}

export interface ChartDisplayOptions {
  showDataLabels?: boolean;
  dataLabelFontSize?: number;
  rotateLabels?: boolean;
  axisLabelFontSize?: number;
}

export interface ChartElementConfig extends ChartDisplayOptions {
  title: string;
  xFieldId: string | null;
  yFieldId: string | null;
  aggregation: ChartAggregation;
}

export interface TableViewElementConfig {
  title: string;
  columnIds: string[];
  maxRows?: number;
}

export interface KanbanElementConfig {
  title: string;
  groupByFieldId: string | null;
  titleFieldId: string | null;
  detailFieldIds: string[];
}

export interface HistogramElementConfig extends ChartDisplayOptions {
  title: string;
  valueFieldId: string | null;
  binCount: number;
}

export interface PieChartElementConfig extends ChartDisplayOptions {
  title: string;
  categoryFieldId: string | null;
  valueFieldId: string | null;
  aggregation: ChartAggregation;
  isDonut: boolean;
}

export interface StackedBarElementConfig extends ChartDisplayOptions {
  title: string;
  xFieldId: string | null;
  seriesFieldId: string | null;
  yFieldId: string | null;
  aggregation: ChartAggregation;
}

export interface ScatterElementConfig extends ChartDisplayOptions {
  title: string;
  xFieldId: string | null;
  yFieldId: string | null;
  labelFieldId: string | null;
}

export interface PivotTableElementConfig {
  title: string;
  rowFieldId: string | null;
  colFieldId: string | null;
  valueFieldId: string | null;
  aggregation: ChartAggregation;
}

export type CanvasElementConfig =
  | NoteElementConfig
  | KpiElementConfig
  | ChartElementConfig
  | TableViewElementConfig
  | KanbanElementConfig
  | HistogramElementConfig
  | PieChartElementConfig
  | StackedBarElementConfig
  | ScatterElementConfig
  | PivotTableElementConfig;

export interface ElementLink {
  targetPageId: string;
  targetElementId?: string;
  label?: string;
}

export interface CanvasElementBase<TType extends CanvasElementType, TConfig extends CanvasElementConfig> {
  id: string;
  type: TType;
  position: Position;
  size: Size;
  config: TConfig;
  links?: ElementLink[];
  unknownMetadata?: string[];
}

export type NoteCanvasElement = CanvasElementBase<'note', NoteElementConfig>;
export type KpiCanvasElement = CanvasElementBase<'kpi', KpiElementConfig>;
export type LineChartCanvasElement = CanvasElementBase<'line-chart', ChartElementConfig>;
export type BarChartCanvasElement = CanvasElementBase<'bar-chart', ChartElementConfig>;
export type TableViewCanvasElement = CanvasElementBase<'table-view', TableViewElementConfig>;
export type KanbanCanvasElement = CanvasElementBase<'kanban', KanbanElementConfig>;
export type HistogramCanvasElement = CanvasElementBase<'histogram', HistogramElementConfig>;
export type PieChartCanvasElement = CanvasElementBase<'pie-chart', PieChartElementConfig>;
export type StackedBarCanvasElement = CanvasElementBase<'stacked-bar', StackedBarElementConfig>;
export type ScatterCanvasElement = CanvasElementBase<'scatter', ScatterElementConfig>;
export type PivotTableCanvasElement = CanvasElementBase<'pivot-table', PivotTableElementConfig>;

export type CanvasElement =
  | NoteCanvasElement
  | KpiCanvasElement
  | LineChartCanvasElement
  | BarChartCanvasElement
  | TableViewCanvasElement
  | KanbanCanvasElement
  | HistogramCanvasElement
  | PieChartCanvasElement
  | StackedBarCanvasElement
  | ScatterCanvasElement
  | PivotTableCanvasElement;

export interface CanvasPage {
  id: string;
  name: string;
  viewport: Viewport;
  elements: CanvasElement[];
  unknownMetadata?: string[];
}

export interface ProjectMetadata {
  createdAt: string;
  updatedAt: string;
  unknownMetadata?: string[];
}

export interface Project {
  id: string;
  name: string;
  formatVersion: number;
  primaryDataset: Dataset;
  canvases: CanvasPage[];
  metadata: ProjectMetadata;
}

export interface WorkspaceState {
  project: Project;
  activePageId: string;
  selectedElementId: string | null;
  selectedElementIds?: string[];
  dirtySinceLastExport: boolean;
  needsLayoutChooser: boolean;
}
