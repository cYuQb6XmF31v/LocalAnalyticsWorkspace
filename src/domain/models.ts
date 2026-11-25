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

export type CanvasElementType = 'note' | 'kpi' | 'line-chart' | 'bar-chart' | 'table-view';

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
}

export interface ChartElementConfig {
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

export type CanvasElementConfig =
  | NoteElementConfig
  | KpiElementConfig
  | ChartElementConfig
  | TableViewElementConfig;

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

export type CanvasElement =
  | NoteCanvasElement
  | KpiCanvasElement
  | LineChartCanvasElement
  | BarChartCanvasElement
  | TableViewCanvasElement;

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
  dirtySinceLastExport: boolean;
  needsLayoutChooser: boolean;
}
