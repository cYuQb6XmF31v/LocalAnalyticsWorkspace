import { describe, expect, it } from 'vitest';
import type { Dataset } from '../src/domain/models';
import { addColumn, addRow, createEmptyDataset } from '../src/features/source-data/datasetOps';
import {
  computeHistogram,
  computeKanbanColumns,
  computeKpiSparkline,
  computePieSeries,
  computePivotTable,
  computeScatterPoints,
  computeStackedBarSeries,
} from '../src/features/visualizations/transforms';

function buildDataset(): Dataset {
  let ds = createEmptyDataset('Phase2Sample');
  ds = addColumn(ds, { id: 'c_date', name: 'Date', type: 'date' });
  ds = addColumn(ds, { id: 'c_status', name: 'Status', type: 'text' });
  ds = addColumn(ds, { id: 'c_cat', name: 'Category', type: 'text' });
  ds = addColumn(ds, { id: 'c_qty', name: 'Qty', type: 'number' });
  ds = addColumn(ds, { id: 'c_score', name: 'Score', type: 'number' });

  ds = addRow(ds, {
    c_date: '2026-01-02',
    c_status: 'Todo',
    c_cat: 'A',
    c_qty: '10',
    c_score: '2',
  });
  ds = addRow(ds, {
    c_date: '2026-01-01',
    c_status: 'Done',
    c_cat: 'A',
    c_qty: '20',
    c_score: '4',
  });
  ds = addRow(ds, {
    c_date: '2026-01-03',
    c_status: 'Done',
    c_cat: 'B',
    c_qty: '30',
    c_score: '6',
  });
  ds = addRow(ds, {
    c_date: '2026-01-03',
    c_status: null,
    c_cat: 'B',
    c_qty: 'bad',
    c_score: '8',
  });
  return ds;
}

describe('Phase 2 visualization transforms', () => {
  it('computes histogram bins and counts skipped invalid numbers', () => {
    const ds = buildDataset();
    const res = computeHistogram(ds, {
      title: 'Qty Dist',
      valueFieldId: 'c_qty',
      binCount: 3,
    });
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.labels).toHaveLength(3);
      expect(res.values.reduce((a, b) => a + b, 0)).toBe(3);
      expect(res.skippedInvalidCount).toBe(1);
    }
  });

  it('computes pie/donut aggregation and reports missing category column', () => {
    const ds = buildDataset();
    const ok = computePieSeries(ds, {
      title: 'By Cat',
      categoryFieldId: 'c_cat',
      valueFieldId: 'c_qty',
      aggregation: 'sum',
      isDonut: true,
    });
    expect(ok.status).toBe('ok');
    if (ok.status === 'ok') {
      expect(ok.items).toEqual([
        { name: 'A', value: 30 },
        { name: 'B', value: 30 },
      ]);
      expect(ok.skippedInvalidCount).toBe(1);
    }

    const err = computePieSeries(ds, {
      title: 'Missing',
      categoryFieldId: 'deleted',
      valueFieldId: 'c_qty',
      aggregation: 'sum',
      isDonut: false,
    });
    expect(err).toMatchObject({ status: 'error', reason: 'missing-column' });
  });

  it('computes stacked bar series sorted by date X-axis', () => {
    const ds = buildDataset();
    const res = computeStackedBarSeries(ds, {
      title: 'Stacked',
      xFieldId: 'c_date',
      seriesFieldId: 'c_cat',
      yFieldId: 'c_qty',
      aggregation: 'sum',
    });
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.xLabels).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
      expect(res.series).toEqual([
        { name: 'A', data: [20, 10, 0] },
        { name: 'B', data: [0, 0, 30] },
      ]);
    }
  });

  it('computes scatter points for valid numeric pairs and sparkline series', () => {
    const ds = buildDataset();
    const scatter = computeScatterPoints(ds, {
      title: 'Qty vs Score',
      xFieldId: 'c_qty',
      yFieldId: 'c_score',
      labelFieldId: 'c_cat',
    });
    expect(scatter.status).toBe('ok');
    if (scatter.status === 'ok') {
      expect(scatter.points).toEqual([
        { x: 10, y: 2, label: 'A' },
        { x: 20, y: 4, label: 'A' },
        { x: 30, y: 6, label: 'B' },
      ]);
      expect(scatter.skippedInvalidCount).toBe(1);
    }

    const spark = computeKpiSparkline(ds, {
      title: 'KPI',
      valueFieldId: 'c_qty',
      aggregation: 'sum',
      showSparkline: true,
      sparklineOrderFieldId: 'c_date',
    });
    expect(spark).toEqual({
      labels: ['2026-01-01', '2026-01-02', '2026-01-03'],
      values: [20, 10, 30],
    });
  });

  it('groups Kanban lanes with empty-value lane placed last', () => {
    const ds = buildDataset();
    const res = computeKanbanColumns(ds, {
      title: 'Board',
      groupByFieldId: 'c_status',
      titleFieldId: 'c_cat',
      detailFieldIds: ['c_qty'],
    });
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.lanes.map((l) => l.label)).toEqual(['Todo', 'Done', 'Без значення']);
      expect(res.lanes[1].cards).toHaveLength(2);
      expect(res.lanes[2].isEmptyLane).toBe(true);
    }
  });

  it('computes 2D Pivot summary matrix with row, column, and grand totals', () => {
    const ds = buildDataset();
    const res = computePivotTable(ds, {
      title: 'Pivot',
      rowFieldId: 'c_cat',
      colFieldId: 'c_status',
      valueFieldId: 'c_score',
      aggregation: 'sum',
    });
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.rowKeys).toEqual(['A', 'B']);
      expect(res.colKeys).toEqual(['Todo', 'Done', '(порожньо)']);
      expect(res.cells.A.Todo).toBe(2);
      expect(res.cells.A.Done).toBe(4);
      expect(res.rowTotals.A).toBe(6);
      expect(res.rowTotals.B).toBe(14);
      expect(res.colTotals.Done).toBe(10);
      expect(res.grandTotal).toBe(20);
    }
  });
});
