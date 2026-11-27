import type {
  CellValue,
  ChartAggregation,
  ChartElementConfig,
  Column,
  Dataset,
  HistogramElementConfig,
  KanbanElementConfig,
  KpiElementConfig,
  PieChartElementConfig,
  PivotTableElementConfig,
  Project,
  ScatterElementConfig,
  StackedBarElementConfig,
  TableViewElementConfig,
} from '../../domain/models';
import {
  getAllProjectDatasets,
  getJoinDatasetId,
  getJoinedColumnId,
} from '../source-data/dataPipeline';
import { extractFormulaColumnRefs } from '../source-data/formulaEngine';
import { isEmptyCellValue, validateCellValue } from '../source-data/typeValidation';

export type TransformErrorReason =
  | 'unconfigured'
  | 'missing-column'
  | 'empty-data'
  | 'invalid-values';

export type KpiTransformResult =
  | {
      status: 'ok';
      value: number;
      formattedValue: string;
      columnName: string;
      aggregation: KpiElementConfig['aggregation'];
      validCount: number;
      skippedInvalidCount: number;
    }
  | {
      status: 'error';
      reason: TransformErrorReason;
      message: string;
    };

export type ChartTransformResult =
  | {
      status: 'ok';
      labels: string[];
      values: number[];
      xColumnName: string;
      yColumnName: string;
      aggregation: ChartAggregation;
      skippedInvalidCount: number;
    }
  | {
      status: 'error';
      reason: TransformErrorReason;
      message: string;
    };

export interface TableViewTransformResult {
  status: 'ok' | 'error';
  columns: Column[];
  rows: Array<{ id: string; cells: Array<{ columnId: string; value: CellValue; valid: boolean }> }>;
  totalRowCount: number;
  missingColumnIds: string[];
  message?: string;
}

export interface SparklineSeries {
  labels: string[];
  values: number[];
}

export type HistogramTransformResult =
  | {
      status: 'ok';
      labels: string[];
      values: number[];
      columnName: string;
      skippedInvalidCount: number;
    }
  | {
      status: 'error';
      reason: TransformErrorReason;
      message: string;
    };

export type PieTransformResult =
  | {
      status: 'ok';
      items: Array<{ name: string; value: number }>;
      categoryColumnName: string;
      valueColumnName: string;
      aggregation: ChartAggregation;
      skippedInvalidCount: number;
    }
  | {
      status: 'error';
      reason: TransformErrorReason;
      message: string;
    };

export type StackedBarTransformResult =
  | {
      status: 'ok';
      xLabels: string[];
      series: Array<{ name: string; data: number[] }>;
      xColumnName: string;
      seriesColumnName: string;
      yColumnName: string;
      aggregation: ChartAggregation;
      skippedInvalidCount: number;
    }
  | {
      status: 'error';
      reason: TransformErrorReason;
      message: string;
    };

export type ScatterTransformResult =
  | {
      status: 'ok';
      points: Array<{ x: number; y: number; label: string }>;
      xColumnName: string;
      yColumnName: string;
      skippedInvalidCount: number;
    }
  | {
      status: 'error';
      reason: TransformErrorReason;
      message: string;
    };

export interface KanbanCard {
  rowId: string;
  title: string;
  details: Array<{ columnName: string; value: string }>;
}

export interface KanbanLane {
  key: string;
  label: string;
  rawCellValue: CellValue;
  isEmptyLane: boolean;
  cards: KanbanCard[];
}

export type KanbanTransformResult =
  | {
      status: 'ok';
      groupColumn: Column;
      lanes: KanbanLane[];
      totalCards: number;
    }
  | {
      status: 'error';
      reason: TransformErrorReason;
      message: string;
    };

export type PivotTransformResult =
  | {
      status: 'ok';
      rowColumnName: string;
      colColumnName: string | null;
      valueColumnName: string;
      aggregation: ChartAggregation;
      rowKeys: string[];
      colKeys: string[];
      cells: Record<string, Record<string, number | null>>;
      rowTotals: Record<string, number | null>;
      colTotals: Record<string, number | null>;
      grandTotal: number | null;
      skippedInvalidCount: number;
    }
  | {
      status: 'error';
      reason: TransformErrorReason;
      message: string;
    };

export function formatMetricNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  const hasDecimals = Math.abs(value % 1) > 1e-9;
  return new Intl.NumberFormat('uk-UA', {
    maximumFractionDigits: hasDecimals ? 2 : 0,
  }).format(value);
}

function aggregateNumbers(numbers: number[], aggregation: ChartAggregation): number {
  if (numbers.length === 0) {
    return 0;
  }
  switch (aggregation) {
    case 'sum':
      return numbers.reduce((acc, n) => acc + n, 0);
    case 'avg':
      return numbers.reduce((acc, n) => acc + n, 0) / numbers.length;
    case 'count':
      return numbers.length;
    case 'min':
      return Math.min(...numbers);
    case 'max':
      return Math.max(...numbers);
  }
}

export function computeKpiResult(
  dataset: Dataset,
  config: KpiElementConfig,
): KpiTransformResult {
  if (!config.valueFieldId) {
    return {
      status: 'error',
      reason: 'unconfigured',
      message: 'Оберіть колонку джерела для обчислення KPI.',
    };
  }

  const column = dataset.columns.find((col) => col.id === config.valueFieldId);
  if (!column) {
    return {
      status: 'error',
      reason: 'missing-column',
      message: `Пов’язану колонку (${config.valueFieldId}) видалено. Оберіть інше поле в налаштуваннях.`,
    };
  }

  if (dataset.rows.length === 0) {
    return {
      status: 'error',
      reason: 'empty-data',
      message: `У таблиці "${dataset.name}" поки немає рядків даних.`,
    };
  }

  if (config.aggregation === 'count') {
    let validCount = 0;
    for (const row of dataset.rows) {
      if (!isEmptyCellValue(row.values[column.id])) {
        validCount += 1;
      }
    }
    return {
      status: 'ok',
      value: validCount,
      formattedValue: formatMetricNumber(validCount),
      columnName: column.name,
      aggregation: config.aggregation,
      validCount,
      skippedInvalidCount: 0,
    };
  }

  const numericValues: number[] = [];
  let skippedInvalidCount = 0;

  for (const row of dataset.rows) {
    const raw = row.values[column.id];
    if (isEmptyCellValue(raw)) {
      continue;
    }
    const validation = validateCellValue(raw, 'number');
    if (validation.valid && typeof validation.parsed === 'number') {
      numericValues.push(validation.parsed);
    } else {
      skippedInvalidCount += 1;
    }
  }

  if (numericValues.length === 0) {
    return {
      status: 'error',
      reason: 'invalid-values',
      message: `Колонка "${column.name}" не містить валідних числових значень для агрегації "${config.aggregation}".`,
    };
  }

  const aggregated = aggregateNumbers(numericValues, config.aggregation);
  return {
    status: 'ok',
    value: aggregated,
    formattedValue: formatMetricNumber(aggregated),
    columnName: column.name,
    aggregation: config.aggregation,
    validCount: numericValues.length,
    skippedInvalidCount,
  };
}

export function computeKpiSparkline(
  dataset: Dataset,
  config: KpiElementConfig,
): SparklineSeries | null {
  if (!config.showSparkline || !config.valueFieldId) {
    return null;
  }
  const valueCol = dataset.columns.find((c) => c.id === config.valueFieldId);
  if (!valueCol) {
    return null;
  }

  const orderCol = config.sparklineOrderFieldId
    ? dataset.columns.find((c) => c.id === config.sparklineOrderFieldId)
    : undefined;

  if (orderCol) {
    const chartRes = computeChartSeries(dataset, {
      title: config.title,
      xFieldId: orderCol.id,
      yFieldId: valueCol.id,
      aggregation: config.aggregation,
    });
    if (chartRes.status === 'ok' && chartRes.values.length >= 2) {
      return { labels: chartRes.labels, values: chartRes.values };
    }
    return null;
  }

  const labels: string[] = [];
  const values: number[] = [];
  dataset.rows.forEach((row, idx) => {
    const raw = row.values[valueCol.id];
    if (isEmptyCellValue(raw)) {
      return;
    }
    if (config.aggregation === 'count') {
      labels.push(String(idx + 1));
      values.push(1);
      return;
    }
    const v = validateCellValue(raw, 'number');
    if (v.valid && typeof v.parsed === 'number') {
      labels.push(String(idx + 1));
      values.push(v.parsed);
    }
  });

  return values.length >= 2 ? { labels, values } : null;
}

export function computeChartSeries(
  dataset: Dataset,
  config: ChartElementConfig,
): ChartTransformResult {
  if (!config.xFieldId || (!config.yFieldId && config.aggregation !== 'count')) {
    return {
      status: 'error',
      reason: 'unconfigured',
      message: 'Оберіть колонки для осі X та значення Y у налаштуваннях графіка.',
    };
  }

  const xColumn = dataset.columns.find((col) => col.id === config.xFieldId);
  if (!xColumn) {
    return {
      status: 'error',
      reason: 'missing-column',
      message: `Колонку осі X (${config.xFieldId}) видалено. Оберіть іншу колонку.`,
    };
  }

  const yColumn = config.yFieldId
    ? dataset.columns.find((col) => col.id === config.yFieldId)
    : undefined;

  if (config.yFieldId && !yColumn) {
    return {
      status: 'error',
      reason: 'missing-column',
      message: `Колонку значень Y (${config.yFieldId}) видалено. Оберіть іншу колонку.`,
    };
  }

  if (dataset.rows.length === 0) {
    return {
      status: 'error',
      reason: 'empty-data',
      message: `У таблиці "${dataset.name}" поки немає рядків для побудови графіка.`,
    };
  }

  const groups = new Map<string, number[]>();
  let skippedInvalidCount = 0;

  for (const row of dataset.rows) {
    const rawX = row.values[xColumn.id];
    const xLabel = isEmptyCellValue(rawX) ? '(порожньо)' : String(rawX).trim();

    if (config.aggregation === 'count') {
      if (yColumn && isEmptyCellValue(row.values[yColumn.id])) {
        continue;
      }
      const bucket = groups.get(xLabel) ?? [];
      bucket.push(1);
      groups.set(xLabel, bucket);
      continue;
    }

    if (!yColumn) {
      continue;
    }

    const rawY = row.values[yColumn.id];
    if (isEmptyCellValue(rawY)) {
      continue;
    }

    const validation = validateCellValue(rawY, 'number');
    if (validation.valid && typeof validation.parsed === 'number') {
      const bucket = groups.get(xLabel) ?? [];
      bucket.push(validation.parsed);
      groups.set(xLabel, bucket);
    } else {
      skippedInvalidCount += 1;
    }
  }

  if (groups.size === 0) {
    return {
      status: 'error',
      reason: 'invalid-values',
      message: yColumn
        ? `Не знайдено валідних числових значень у колонці "${yColumn.name}".`
        : 'Недостатньо даних для побудови графіка.',
    };
  }

  let entries = Array.from(groups.entries());
  if (xColumn.type === 'date') {
    entries = entries.sort(([a], [b]) => a.localeCompare(b));
  }

  return {
    status: 'ok',
    labels: entries.map(([label]) => label),
    values: entries.map(([, nums]) => aggregateNumbers(nums, config.aggregation)),
    xColumnName: xColumn.name,
    yColumnName: yColumn?.name ?? xColumn.name,
    aggregation: config.aggregation,
    skippedInvalidCount,
  };
}

export function computeHistogram(
  dataset: Dataset,
  config: HistogramElementConfig,
): HistogramTransformResult {
  if (!config.valueFieldId) {
    return {
      status: 'error',
      reason: 'unconfigured',
      message: 'Оберіть числову колонку для побудови гістограми.',
    };
  }

  const column = dataset.columns.find((col) => col.id === config.valueFieldId);
  if (!column) {
    return {
      status: 'error',
      reason: 'missing-column',
      message: `Колонку (${config.valueFieldId}) видалено. Оберіть іншу колонку.`,
    };
  }

  if (dataset.rows.length === 0) {
    return {
      status: 'error',
      reason: 'empty-data',
      message: `У таблиці "${dataset.name}" поки немає рядків даних.`,
    };
  }

  const nums: number[] = [];
  let skippedInvalidCount = 0;
  for (const row of dataset.rows) {
    const raw = row.values[column.id];
    if (isEmptyCellValue(raw)) {
      continue;
    }
    const validation = validateCellValue(raw, 'number');
    if (validation.valid && typeof validation.parsed === 'number') {
      nums.push(validation.parsed);
    } else {
      skippedInvalidCount += 1;
    }
  }

  if (nums.length === 0) {
    return {
      status: 'error',
      reason: 'invalid-values',
      message: `Колонка "${column.name}" не містить валідних числових значень.`,
    };
  }

  const minVal = Math.min(...nums);
  const maxVal = Math.max(...nums);
  const binCount = Math.max(2, Math.min(30, Math.floor(config.binCount || 8)));

  if (minVal === maxVal) {
    return {
      status: 'ok',
      labels: [formatMetricNumber(minVal)],
      values: [nums.length],
      columnName: column.name,
      skippedInvalidCount,
    };
  }

  const step = (maxVal - minVal) / binCount;
  const counts = new Array<number>(binCount).fill(0);
  const labels: string[] = [];

  for (let i = 0; i < binCount; i += 1) {
    const start = minVal + i * step;
    const end = i === binCount - 1 ? maxVal : minVal + (i + 1) * step;
    labels.push(`${formatMetricNumber(start)}–${formatMetricNumber(end)}`);
  }

  for (const n of nums) {
    const rawIdx = Math.floor((n - minVal) / step);
    const idx = Math.min(binCount - 1, Math.max(0, rawIdx));
    counts[idx] += 1;
  }

  return {
    status: 'ok',
    labels,
    values: counts,
    columnName: column.name,
    skippedInvalidCount,
  };
}

export function computePieSeries(
  dataset: Dataset,
  config: PieChartElementConfig,
): PieTransformResult {
  if (!config.categoryFieldId) {
    return {
      status: 'error',
      reason: 'unconfigured',
      message: 'Оберіть колонку категорій для кругової діаграми.',
    };
  }

  const categoryCol = dataset.columns.find((c) => c.id === config.categoryFieldId);
  if (!categoryCol) {
    return {
      status: 'error',
      reason: 'missing-column',
      message: `Колонку категорій (${config.categoryFieldId}) видалено. Оберіть іншу.`,
    };
  }

  const valueCol = config.valueFieldId
    ? dataset.columns.find((c) => c.id === config.valueFieldId)
    : undefined;

  if (config.valueFieldId && !valueCol) {
    return {
      status: 'error',
      reason: 'missing-column',
      message: `Колонку значень (${config.valueFieldId}) видалено. Оберіть іншу.`,
    };
  }

  if (config.aggregation !== 'count' && !valueCol) {
    return {
      status: 'error',
      reason: 'unconfigured',
      message: 'Оберіть числову колонку значень або перемкніть агрегацію на count.',
    };
  }

  if (dataset.rows.length === 0) {
    return {
      status: 'error',
      reason: 'empty-data',
      message: `У таблиці "${dataset.name}" поки немає рядків даних.`,
    };
  }

  const groups = new Map<string, number[]>();
  let skippedInvalidCount = 0;

  for (const row of dataset.rows) {
    const rawCat = row.values[categoryCol.id];
    const catLabel = isEmptyCellValue(rawCat) ? '(порожньо)' : String(rawCat).trim();

    if (config.aggregation === 'count') {
      if (valueCol && isEmptyCellValue(row.values[valueCol.id])) {
        continue;
      }
      const bucket = groups.get(catLabel) ?? [];
      bucket.push(1);
      groups.set(catLabel, bucket);
      continue;
    }

    if (!valueCol) {
      continue;
    }
    const rawVal = row.values[valueCol.id];
    if (isEmptyCellValue(rawVal)) {
      continue;
    }
    const validation = validateCellValue(rawVal, 'number');
    if (validation.valid && typeof validation.parsed === 'number') {
      const bucket = groups.get(catLabel) ?? [];
      bucket.push(validation.parsed);
      groups.set(catLabel, bucket);
    } else {
      skippedInvalidCount += 1;
    }
  }

  if (groups.size === 0) {
    return {
      status: 'error',
      reason: 'invalid-values',
      message: 'Немає валідних значень для побудови кругової діаграми.',
    };
  }

  const items = Array.from(groups.entries()).map(([name, nums]) => ({
    name,
    value: aggregateNumbers(nums, config.aggregation),
  }));

  return {
    status: 'ok',
    items,
    categoryColumnName: categoryCol.name,
    valueColumnName: valueCol?.name ?? categoryCol.name,
    aggregation: config.aggregation,
    skippedInvalidCount,
  };
}

export function computeStackedBarSeries(
  dataset: Dataset,
  config: StackedBarElementConfig,
): StackedBarTransformResult {
  if (!config.xFieldId || !config.seriesFieldId) {
    return {
      status: 'error',
      reason: 'unconfigured',
      message: 'Оберіть вісь X та колонку групування серій.',
    };
  }

  const xCol = dataset.columns.find((c) => c.id === config.xFieldId);
  if (!xCol) {
    return {
      status: 'error',
      reason: 'missing-column',
      message: `Колонку осі X (${config.xFieldId}) видалено.`,
    };
  }

  const seriesCol = dataset.columns.find((c) => c.id === config.seriesFieldId);
  if (!seriesCol) {
    return {
      status: 'error',
      reason: 'missing-column',
      message: `Колонку серій (${config.seriesFieldId}) видалено.`,
    };
  }

  const yCol = config.yFieldId
    ? dataset.columns.find((c) => c.id === config.yFieldId)
    : undefined;
  if (config.yFieldId && !yCol) {
    return {
      status: 'error',
      reason: 'missing-column',
      message: `Колонку значень Y (${config.yFieldId}) видалено.`,
    };
  }
  if (config.aggregation !== 'count' && !yCol) {
    return {
      status: 'error',
      reason: 'unconfigured',
      message: 'Оберіть числову колонку Y або агрегацію count.',
    };
  }

  if (dataset.rows.length === 0) {
    return {
      status: 'error',
      reason: 'empty-data',
      message: `У таблиці "${dataset.name}" поки немає рядків даних.`,
    };
  }

  const xOrder: string[] = [];
  const xSet = new Set<string>();
  const sOrder: string[] = [];
  const sSet = new Set<string>();
  const matrix = new Map<string, Map<string, number[]>>();
  let skippedInvalidCount = 0;

  for (const row of dataset.rows) {
    const rawX = row.values[xCol.id];
    const xLabel = isEmptyCellValue(rawX) ? '(порожньо)' : String(rawX).trim();
    const rawS = row.values[seriesCol.id];
    const sLabel = isEmptyCellValue(rawS) ? '(порожньо)' : String(rawS).trim();

    let numVal: number | null = null;
    if (config.aggregation === 'count') {
      if (yCol && isEmptyCellValue(row.values[yCol.id])) {
        continue;
      }
      numVal = 1;
    } else if (yCol) {
      const rawY = row.values[yCol.id];
      if (isEmptyCellValue(rawY)) {
        continue;
      }
      const validation = validateCellValue(rawY, 'number');
      if (validation.valid && typeof validation.parsed === 'number') {
        numVal = validation.parsed;
      } else {
        skippedInvalidCount += 1;
        continue;
      }
    }

    if (numVal === null) {
      continue;
    }

    if (!xSet.has(xLabel)) {
      xSet.add(xLabel);
      xOrder.push(xLabel);
    }
    if (!sSet.has(sLabel)) {
      sSet.add(sLabel);
      sOrder.push(sLabel);
    }

    let xMap = matrix.get(sLabel);
    if (!xMap) {
      xMap = new Map<string, number[]>();
      matrix.set(sLabel, xMap);
    }
    const bucket = xMap.get(xLabel) ?? [];
    bucket.push(numVal);
    xMap.set(xLabel, bucket);
  }

  if (xOrder.length === 0 || sOrder.length === 0) {
    return {
      status: 'error',
      reason: 'invalid-values',
      message: 'Недостатньо валідних значень для складеного графіка.',
    };
  }

  const finalXLabels =
    xCol.type === 'date' ? [...xOrder].sort((a, b) => a.localeCompare(b)) : xOrder;

  const series = sOrder.map((seriesName) => {
    const xMap = matrix.get(seriesName);
    return {
      name: seriesName,
      data: finalXLabels.map((xLabel) => {
        const nums = xMap?.get(xLabel);
        return nums && nums.length > 0 ? aggregateNumbers(nums, config.aggregation) : 0;
      }),
    };
  });

  return {
    status: 'ok',
    xLabels: finalXLabels,
    series,
    xColumnName: xCol.name,
    seriesColumnName: seriesCol.name,
    yColumnName: yCol?.name ?? seriesCol.name,
    aggregation: config.aggregation,
    skippedInvalidCount,
  };
}

export function computeScatterPoints(
  dataset: Dataset,
  config: ScatterElementConfig,
): ScatterTransformResult {
  if (!config.xFieldId || !config.yFieldId) {
    return {
      status: 'error',
      reason: 'unconfigured',
      message: 'Оберіть дві числові колонки для осей X та Y.',
    };
  }

  const xCol = dataset.columns.find((c) => c.id === config.xFieldId);
  if (!xCol) {
    return {
      status: 'error',
      reason: 'missing-column',
      message: `Колонку осі X (${config.xFieldId}) видалено.`,
    };
  }

  const yCol = dataset.columns.find((c) => c.id === config.yFieldId);
  if (!yCol) {
    return {
      status: 'error',
      reason: 'missing-column',
      message: `Колонку осі Y (${config.yFieldId}) видалено.`,
    };
  }

  const labelCol = config.labelFieldId
    ? dataset.columns.find((c) => c.id === config.labelFieldId)
    : undefined;

  if (dataset.rows.length === 0) {
    return {
      status: 'error',
      reason: 'empty-data',
      message: `У таблиці "${dataset.name}" поки немає рядків даних.`,
    };
  }

  const points: Array<{ x: number; y: number; label: string }> = [];
  let skippedInvalidCount = 0;

  dataset.rows.forEach((row, index) => {
    const rawX = row.values[xCol.id];
    const rawY = row.values[yCol.id];
    if (isEmptyCellValue(rawX) || isEmptyCellValue(rawY)) {
      return;
    }
    const vx = validateCellValue(rawX, 'number');
    const vy = validateCellValue(rawY, 'number');
    if (
      vx.valid &&
      vy.valid &&
      typeof vx.parsed === 'number' &&
      typeof vy.parsed === 'number'
    ) {
      const rawLabel = labelCol ? row.values[labelCol.id] : null;
      const label = !isEmptyCellValue(rawLabel) ? String(rawLabel) : `Рядок ${index + 1}`;
      points.push({ x: vx.parsed, y: vy.parsed, label });
    } else {
      skippedInvalidCount += 1;
    }
  });

  if (points.length === 0) {
    return {
      status: 'error',
      reason: 'invalid-values',
      message: `Не знайдено пар валідних числових значень для "${xCol.name}" і "${yCol.name}".`,
    };
  }

  return {
    status: 'ok',
    points,
    xColumnName: xCol.name,
    yColumnName: yCol.name,
    skippedInvalidCount,
  };
}

export function computeKanbanColumns(
  dataset: Dataset,
  config: KanbanElementConfig,
): KanbanTransformResult {
  if (!config.groupByFieldId) {
    return {
      status: 'error',
      reason: 'unconfigured',
      message: 'Оберіть колонку статусу/категорії для групування карток Kanban.',
    };
  }

  const groupColumn = dataset.columns.find((c) => c.id === config.groupByFieldId);
  if (!groupColumn) {
    return {
      status: 'error',
      reason: 'missing-column',
      message: `Колонку групування (${config.groupByFieldId}) видалено. Оберіть інше поле.`,
    };
  }

  const titleColumn = config.titleFieldId
    ? dataset.columns.find((c) => c.id === config.titleFieldId)
    : dataset.columns.find((c) => c.id !== groupColumn.id) ?? groupColumn;

  const detailColumns = config.detailFieldIds
    .map((id) => dataset.columns.find((c) => c.id === id))
    .filter((c): c is Column => Boolean(c));

  const laneMap = new Map<string, KanbanLane>();
  const emptyLaneKey = '__empty__';

  dataset.rows.forEach((row, index) => {
    const rawGroup = row.values[groupColumn.id];
    const isEmpty = isEmptyCellValue(rawGroup);
    const laneKey = isEmpty ? emptyLaneKey : String(rawGroup).trim();
    const laneLabel = isEmpty ? 'Без значення' : laneKey;

    let lane = laneMap.get(laneKey);
    if (!lane) {
      lane = {
        key: laneKey,
        label: laneLabel,
        rawCellValue: isEmpty ? null : laneKey,
        isEmptyLane: isEmpty,
        cards: [],
      };
      laneMap.set(laneKey, lane);
    }

    const rawTitle = titleColumn ? row.values[titleColumn.id] : null;
    const cardTitle = !isEmptyCellValue(rawTitle) ? String(rawTitle) : `Запис #${index + 1}`;

    const details = detailColumns
      .map((col) => {
        const val = row.values[col.id];
        return {
          columnName: col.name,
          value: isEmptyCellValue(val) ? '—' : String(val),
        };
      });

    lane.cards.push({
      rowId: row.id,
      title: cardTitle,
      details,
    });
  });

  // Ensure empty lane is placed last if present
  const lanes = Array.from(laneMap.values()).sort((a, b) => {
    if (a.isEmptyLane === b.isEmptyLane) {
      return 0;
    }
    return a.isEmptyLane ? 1 : -1;
  });

  return {
    status: 'ok',
    groupColumn,
    lanes,
    totalCards: dataset.rows.length,
  };
}

export function computePivotTable(
  dataset: Dataset,
  config: PivotTableElementConfig,
): PivotTransformResult {
  if (!config.rowFieldId) {
    return {
      status: 'error',
      reason: 'unconfigured',
      message: 'Оберіть колонку рядків для зведеної таблиці.',
    };
  }

  const rowCol = dataset.columns.find((c) => c.id === config.rowFieldId);
  if (!rowCol) {
    return {
      status: 'error',
      reason: 'missing-column',
      message: `Колонку рядків (${config.rowFieldId}) видалено.`,
    };
  }

  const colCol = config.colFieldId
    ? dataset.columns.find((c) => c.id === config.colFieldId)
    : undefined;
  if (config.colFieldId && !colCol) {
    return {
      status: 'error',
      reason: 'missing-column',
      message: `Колонку стовпців (${config.colFieldId}) видалено.`,
    };
  }

  const valCol = config.valueFieldId
    ? dataset.columns.find((c) => c.id === config.valueFieldId)
    : undefined;
  if (config.valueFieldId && !valCol) {
    return {
      status: 'error',
      reason: 'missing-column',
      message: `Колонку значень (${config.valueFieldId}) видалено.`,
    };
  }
  if (config.aggregation !== 'count' && !valCol) {
    return {
      status: 'error',
      reason: 'unconfigured',
      message: 'Оберіть числову колонку значень або агрегацію count.',
    };
  }

  if (dataset.rows.length === 0) {
    return {
      status: 'error',
      reason: 'empty-data',
      message: `У таблиці "${dataset.name}" поки немає рядків даних.`,
    };
  }

  const singleColKey = config.aggregation.toUpperCase();
  const rowKeys: string[] = [];
  const rowSet = new Set<string>();
  const colKeys: string[] = [];
  const colSet = new Set<string>();

  const buckets = new Map<string, Map<string, number[]>>();
  const rowBuckets = new Map<string, number[]>();
  const colBuckets = new Map<string, number[]>();
  const allNumbers: number[] = [];
  let skippedInvalidCount = 0;

  for (const row of dataset.rows) {
    const rawR = row.values[rowCol.id];
    const rKey = isEmptyCellValue(rawR) ? '(порожньо)' : String(rawR).trim();
    const rawC = colCol ? row.values[colCol.id] : singleColKey;
    const cKey = colCol
      ? isEmptyCellValue(rawC)
        ? '(порожньо)'
        : String(rawC).trim()
      : singleColKey;

    let numVal: number | null = null;
    if (config.aggregation === 'count') {
      if (valCol && isEmptyCellValue(row.values[valCol.id])) {
        continue;
      }
      numVal = 1;
    } else if (valCol) {
      const rawV = row.values[valCol.id];
      if (isEmptyCellValue(rawV)) {
        continue;
      }
      const validation = validateCellValue(rawV, 'number');
      if (validation.valid && typeof validation.parsed === 'number') {
        numVal = validation.parsed;
      } else {
        skippedInvalidCount += 1;
        continue;
      }
    }

    if (numVal === null) {
      continue;
    }

    if (!rowSet.has(rKey)) {
      rowSet.add(rKey);
      rowKeys.push(rKey);
    }
    if (!colSet.has(cKey)) {
      colSet.add(cKey);
      colKeys.push(cKey);
    }

    let rMap = buckets.get(rKey);
    if (!rMap) {
      rMap = new Map<string, number[]>();
      buckets.set(rKey, rMap);
    }
    const cellNums = rMap.get(cKey) ?? [];
    cellNums.push(numVal);
    rMap.set(cKey, cellNums);

    const rAll = rowBuckets.get(rKey) ?? [];
    rAll.push(numVal);
    rowBuckets.set(rKey, rAll);

    const cAll = colBuckets.get(cKey) ?? [];
    cAll.push(numVal);
    colBuckets.set(cKey, cAll);

    allNumbers.push(numVal);
  }

  if (rowKeys.length === 0) {
    return {
      status: 'error',
      reason: 'invalid-values',
      message: 'Недостатньо валідних значень для побудови зведеної таблиці.',
    };
  }

  const cells: Record<string, Record<string, number | null>> = {};
  const rowTotals: Record<string, number | null> = {};
  const colTotals: Record<string, number | null> = {};

  for (const rKey of rowKeys) {
    cells[rKey] = {};
    for (const cKey of colKeys) {
      const nums = buckets.get(rKey)?.get(cKey);
      cells[rKey][cKey] =
        nums && nums.length > 0 ? aggregateNumbers(nums, config.aggregation) : null;
    }
    const rNums = rowBuckets.get(rKey);
    rowTotals[rKey] =
      rNums && rNums.length > 0 ? aggregateNumbers(rNums, config.aggregation) : null;
  }

  for (const cKey of colKeys) {
    const cNums = colBuckets.get(cKey);
    colTotals[cKey] =
      cNums && cNums.length > 0 ? aggregateNumbers(cNums, config.aggregation) : null;
  }

  return {
    status: 'ok',
    rowColumnName: rowCol.name,
    colColumnName: colCol?.name ?? null,
    valueColumnName: valCol?.name ?? rowCol.name,
    aggregation: config.aggregation,
    rowKeys,
    colKeys,
    cells,
    rowTotals,
    colTotals,
    grandTotal:
      allNumbers.length > 0 ? aggregateNumbers(allNumbers, config.aggregation) : null,
    skippedInvalidCount,
  };
}

export function computeTableView(
  dataset: Dataset,
  config: TableViewElementConfig,
): TableViewTransformResult {
  const maxRows = config.maxRows && config.maxRows > 0 ? config.maxRows : 50;

  if (dataset.columns.length === 0) {
    return {
      status: 'error',
      columns: [],
      rows: [],
      totalRowCount: 0,
      missingColumnIds: config.columnIds,
      message: 'У первинній таблиці Source Data ще немає колонок.',
    };
  }

  const targetIds =
    config.columnIds.length > 0 ? config.columnIds : dataset.columns.map((c) => c.id);

  const missingColumnIds: string[] = [];
  const resolvedColumns: Column[] = [];

  for (const id of targetIds) {
    const col = dataset.columns.find((c) => c.id === id);
    if (col) {
      resolvedColumns.push(col);
    } else {
      missingColumnIds.push(id);
    }
  }

  if (resolvedColumns.length === 0) {
    return {
      status: 'error',
      columns: [],
      rows: [],
      totalRowCount: dataset.rows.length,
      missingColumnIds,
      message: 'Усі налаштовані колонки видалено. Оберіть колонки в налаштуваннях елемента.',
    };
  }

  const slicedRows = dataset.rows.slice(0, maxRows).map((row) => ({
    id: row.id,
    cells: resolvedColumns.map((col) => {
      const value = row.values[col.id] ?? null;
      const valid = validateCellValue(value, col.type).valid;
      return { columnId: col.id, value, valid };
    }),
  }));

  return {
    status: missingColumnIds.length > 0 ? 'error' : 'ok',
    columns: resolvedColumns,
    rows: slicedRows,
    totalRowCount: dataset.rows.length,
    missingColumnIds,
    ...(missingColumnIds.length > 0
      ? {
          message: `Частину колонок видалено (${missingColumnIds.length}). Оновіть вибір колонок.`,
        }
      : {}),
  };
}

export type ActivityHeatmapResult =
  | {
      status: 'ok';
      columnName: string;
      year: string;
      availableYears: string[];
      entries: Array<[string, number]>;
      maxCount: number;
      totalValidRecords: number;
      skippedInvalidCount: number;
    }
  | {
      status: 'setup';
      reason: 'no-date-column' | 'empty-data' | 'no-valid-dates';
      message: string;
      skippedInvalidCount: number;
    };

/**
 * Counts dataset records grouped by valid ISO date (YYYY-MM-DD) for a selected date column.
 * Never fabricates activity when no date column or valid dates exist.
 */
export function computeActivityHeatmap(
  dataset: Dataset,
  dateFieldId: string | null,
  preferredYear?: string,
): ActivityHeatmapResult {
  const dateCols = dataset.columns.filter((col) => col.type === 'date');
  if (dateCols.length === 0) {
    return {
      status: 'setup',
      reason: 'no-date-column',
      message:
        'У таблиці Source Data ще немає колонки типу date. Додайте колонку дати або змініть тип існуючої колонки.',
      skippedInvalidCount: 0,
    };
  }

  const targetCol =
    (dateFieldId ? dateCols.find((col) => col.id === dateFieldId) : undefined) ?? dateCols[0];

  if (dataset.rows.length === 0) {
    return {
      status: 'setup',
      reason: 'empty-data',
      message: `У таблиці "${dataset.name}" поки немає рядків даних.`,
      skippedInvalidCount: 0,
    };
  }

  const countsByDate = new Map<string, number>();
  let skippedInvalidCount = 0;

  for (const row of dataset.rows) {
    const raw = row.values[targetCol.id];
    if (isEmptyCellValue(raw)) {
      continue;
    }
    const validation = validateCellValue(raw, 'date');
    if (validation.valid && typeof validation.parsed === 'string') {
      countsByDate.set(validation.parsed, (countsByDate.get(validation.parsed) ?? 0) + 1);
    } else {
      skippedInvalidCount += 1;
    }
  }

  if (countsByDate.size === 0) {
    return {
      status: 'setup',
      reason: 'no-valid-dates',
      message: `У колонці "${targetCol.name}" немає валідних ISO-дат (YYYY-MM-DD).`,
      skippedInvalidCount,
    };
  }

  const yearSet = new Set<string>();
  for (const isoDate of countsByDate.keys()) {
    yearSet.add(isoDate.slice(0, 4));
  }
  const availableYears = Array.from(yearSet).sort((a, b) => a.localeCompare(b));
  const selectedYear =
    preferredYear && yearSet.has(preferredYear)
      ? preferredYear
      : availableYears[availableYears.length - 1];

  const entries: Array<[string, number]> = [];
  let maxCount = 0;
  let totalValidRecords = 0;

  for (const [isoDate, count] of countsByDate.entries()) {
    totalValidRecords += count;
    if (isoDate.startsWith(`${selectedYear}-`)) {
      entries.push([isoDate, count]);
      if (count > maxCount) {
        maxCount = count;
      }
    }
  }

  entries.sort(([a], [b]) => a.localeCompare(b));

  return {
    status: 'ok',
    columnName: targetCol.name,
    year: selectedYear,
    availableYears,
    entries,
    maxCount: Math.max(1, maxCount),
    totalValidRecords,
    skippedInvalidCount,
  };
}

export interface ProjectGraphNode {
  id: string;
  kind: 'project' | 'page' | 'element' | 'dataset' | 'column' | 'join' | 'filter';
  label: string;
  pageId?: string;
  elementId?: string;
}

export interface ProjectGraphEdge {
  source: string;
  target: string;
  kind: 'hierarchy' | 'link' | 'lineage';
  label?: string;
}

export interface ProjectGraphResult {
  nodes: ProjectGraphNode[];
  edges: ProjectGraphEdge[];
  linkCount: number;
  brokenLinkCount: number;
}

function collectElementFieldIds(config: Record<string, unknown>): string[] {
  const refs: string[] = [];
  const singleKeys = [
    'valueFieldId',
    'sparklineOrderFieldId',
    'xFieldId',
    'yFieldId',
    'groupByFieldId',
    'titleFieldId',
    'categoryFieldId',
    'seriesFieldId',
    'labelFieldId',
    'rowFieldId',
    'colFieldId',
  ];
  for (const key of singleKeys) {
    const val = config[key];
    if (typeof val === 'string' && val.trim() !== '') {
      refs.push(val);
    }
  }
  for (const listKey of ['columnIds', 'detailFieldIds']) {
    const arr = config[listKey];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (typeof item === 'string' && item.trim() !== '') {
          refs.push(item);
        }
      }
    }
  }
  return Array.from(new Set(refs));
}

/**
 * Builds an Obsidian-style node/link graph of Project -> Canvas Pages -> Elements,
 * internal links, and optionally full Data Lineage (datasets, joins, formulas, filters, columns).
 */
export function computeProjectGraph(
  project: Project,
  options?: { includeDataLineage?: boolean },
): ProjectGraphResult {
  const includeLineage = Boolean(options?.includeDataLineage);
  const nodes: ProjectGraphNode[] = [];
  const edges: ProjectGraphEdge[] = [];

  const projectNodeId = `project:${project.id}`;
  nodes.push({
    id: projectNodeId,
    kind: 'project',
    label: project.name,
  });

  const pageNodeIds = new Set<string>();
  const elementPageMap = new Map<string, string>();
  const colNodeById = new Map<string, string>();

  if (includeLineage) {
    const allDatasets = getAllProjectDatasets(project);
    for (const ds of allDatasets) {
      const dsNodeId = `ds:${ds.id}`;
      nodes.push({ id: dsNodeId, kind: 'dataset', label: ds.name });
      edges.push({ source: projectNodeId, target: dsNodeId, kind: 'lineage', label: 'таблиця' });

      for (const col of ds.columns) {
        const cNodeId = `col:${ds.id}:${col.id}`;
        colNodeById.set(col.id, cNodeId);
        nodes.push({
          id: cNodeId,
          kind: 'column',
          label: col.formula ? `fx ${col.name}` : col.name,
        });
        edges.push({ source: dsNodeId, target: cNodeId, kind: 'lineage' });
      }
    }

    // Formula dependencies between columns
    for (const ds of allDatasets) {
      for (const col of ds.columns) {
        if (!col.formula) continue;
        const targetColNode = colNodeById.get(col.id);
        if (!targetColNode) continue;
        const depIds = extractFormulaColumnRefs(col.formula, ds.columns);
        for (const depId of depIds) {
          const srcColNode = colNodeById.get(depId);
          if (srcColNode && srcColNode !== targetColNode) {
            edges.push({
              source: srcColNode,
              target: targetColNode,
              kind: 'lineage',
              label: 'формула',
            });
          }
        }
      }
    }

    // Joins lineage
    for (const join of project.joins ?? []) {
      const jNodeId = `join:${join.id}`;
      nodes.push({ id: jNodeId, kind: 'join', label: `⋈ ${join.name}` });
      edges.push({
        source: `ds:${join.leftDatasetId}`,
        target: jNodeId,
        kind: 'lineage',
        label: join.joinType,
      });
      edges.push({
        source: `ds:${join.rightDatasetId}`,
        target: jNodeId,
        kind: 'lineage',
        label: join.joinType,
      });
      const rDs = allDatasets.find((d) => d.id === join.rightDatasetId);
      for (const rCol of rDs?.columns ?? []) {
        const mappedId = getJoinedColumnId(join.id, rCol.id);
        colNodeById.set(mappedId, jNodeId);
      }
    }

    // Reusable Filters lineage
    for (const flt of project.filters ?? []) {
      const fNodeId = `flt:${flt.id}`;
      nodes.push({ id: fNodeId, kind: 'filter', label: `Фільтр: ${flt.name}` });
      for (const rule of flt.rules) {
        const cNode = colNodeById.get(rule.columnId);
        if (cNode) {
          edges.push({ source: cNode, target: fNodeId, kind: 'lineage', label: 'фільтрує' });
        }
      }
    }
  }

  for (const page of project.canvases) {
    const pNodeId = `page:${page.id}`;
    pageNodeIds.add(pNodeId);
    nodes.push({
      id: pNodeId,
      kind: 'page',
      label: page.name,
      pageId: page.id,
    });
    edges.push({
      source: projectNodeId,
      target: pNodeId,
      kind: 'hierarchy',
    });

    if (includeLineage && page.filterIds) {
      for (const fId of page.filterIds) {
        if ((project.filters ?? []).some((f) => f.id === fId)) {
          edges.push({ source: `flt:${fId}`, target: pNodeId, kind: 'lineage', label: 'сторінка' });
        }
      }
    }

    for (const el of page.elements) {
      const elNodeId = `el:${el.id}`;
      elementPageMap.set(el.id, page.id);
      nodes.push({
        id: elNodeId,
        kind: 'element',
        label: el.config.title || el.id,
        pageId: page.id,
        elementId: el.id,
      });
      edges.push({
        source: pNodeId,
        target: elNodeId,
        kind: 'hierarchy',
      });

      if (includeLineage) {
        const fieldIds = collectElementFieldIds(el.config as unknown as Record<string, unknown>);
        for (const fid of fieldIds) {
          const srcNode = colNodeById.get(fid);
          if (srcNode) {
            edges.push({ source: srcNode, target: elNodeId, kind: 'lineage' });
          }
        }
        if (el.datasetId && el.datasetId.startsWith('join:')) {
          const jId = el.datasetId.slice('join:'.length);
          if ((project.joins ?? []).some((j) => getJoinDatasetId(j.id) === el.datasetId)) {
            edges.push({ source: `join:${jId}`, target: elNodeId, kind: 'lineage' });
          }
        }
        if (el.filterIds) {
          for (const fId of el.filterIds) {
            if ((project.filters ?? []).some((f) => f.id === fId)) {
              edges.push({ source: `flt:${fId}`, target: elNodeId, kind: 'lineage', label: 'фільтр' });
            }
          }
        }
      }
    }
  }

  let linkCount = 0;
  let brokenLinkCount = 0;

  for (const page of project.canvases) {
    for (const el of page.elements) {
      if (!el.links || el.links.length === 0) {
        continue;
      }
      const sourceId = `el:${el.id}`;
      for (const link of el.links) {
        if (link.targetElementId) {
          const targetElPage = elementPageMap.get(link.targetElementId);
          if (targetElPage === link.targetPageId) {
            edges.push({
              source: sourceId,
              target: `el:${link.targetElementId}`,
              kind: 'link',
              ...(link.label ? { label: link.label } : {}),
            });
            linkCount += 1;
          } else {
            brokenLinkCount += 1;
          }
        } else if (pageNodeIds.has(`page:${link.targetPageId}`)) {
          edges.push({
            source: sourceId,
            target: `page:${link.targetPageId}`,
            kind: 'link',
            ...(link.label ? { label: link.label } : {}),
          });
          linkCount += 1;
        } else {
          brokenLinkCount += 1;
        }
      }
    }
  }

  return {
    nodes,
    edges,
    linkCount,
    brokenLinkCount,
  };
}
