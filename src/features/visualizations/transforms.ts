import type {
  CellValue,
  ChartAggregation,
  ChartElementConfig,
  Column,
  Dataset,
  KpiElementConfig,
  TableViewElementConfig,
} from '../../domain/models';
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
