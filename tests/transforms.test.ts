import { describe, expect, it } from 'vitest';
import type { Dataset } from '../src/domain/models';
import { addRow, createEmptyDataset, addColumn, updateCell } from '../src/features/source-data/datasetOps';
import {
  computeChartSeries,
  computeKpiResult,
  computeTableView,
} from '../src/features/visualizations/transforms';

function buildSampleDataset(): Dataset {
  let ds = createEmptyDataset('Sample');
  ds = addColumn(ds, { id: 'c_date', name: 'Date', type: 'date' });
  ds = addColumn(ds, { id: 'c_cat', name: 'Category', type: 'text' });
  ds = addColumn(ds, { id: 'c_val', name: 'Amount', type: 'number' });

  ds = addRow(ds, { c_date: '2026-01-05', c_cat: 'B', c_val: '100' });
  ds = addRow(ds, { c_date: '2026-01-01', c_cat: 'A', c_val: '40' });
  ds = addRow(ds, { c_date: '2026-01-01', c_cat: 'A', c_val: '60' });
  ds = addRow(ds, { c_date: '2026-01-03', c_cat: 'B', c_val: 'invalid' });
  return ds;
}

describe('visualization transforms', () => {
  it('computes KPI sum, avg, count, min, max and skips invalid numeric cells with count', () => {
    const ds = buildSampleDataset();

    const sumRes = computeKpiResult(ds, { title: 'Sum', valueFieldId: 'c_val', aggregation: 'sum' });
    expect(sumRes.status).toBe('ok');
    if (sumRes.status === 'ok') {
      expect(sumRes.value).toBe(200);
      expect(sumRes.skippedInvalidCount).toBe(1);
    }

    const avgRes = computeKpiResult(ds, { title: 'Avg', valueFieldId: 'c_val', aggregation: 'avg' });
    expect(avgRes.status).toBe('ok');
    if (avgRes.status === 'ok') {
      expect(avgRes.value).toBeCloseTo(200 / 3);
    }

    const minRes = computeKpiResult(ds, { title: 'Min', valueFieldId: 'c_val', aggregation: 'min' });
    expect(minRes.status).toBe('ok');
    if (minRes.status === 'ok') {
      expect(minRes.value).toBe(40);
    }

    const maxRes = computeKpiResult(ds, { title: 'Max', valueFieldId: 'c_val', aggregation: 'max' });
    expect(maxRes.status).toBe('ok');
    if (maxRes.status === 'ok') {
      expect(maxRes.value).toBe(100);
    }

    const countRes = computeKpiResult(ds, { title: 'Count', valueFieldId: 'c_cat', aggregation: 'count' });
    expect(countRes.status).toBe('ok');
    if (countRes.status === 'ok') {
      expect(countRes.value).toBe(4);
    }
  });

  it('reports explicit errors when a referenced column is deleted instead of remapping', () => {
    const ds = buildSampleDataset();

    const missingKpi = computeKpiResult(ds, {
      title: 'Broken',
      valueFieldId: 'deleted_col',
      aggregation: 'sum',
    });
    expect(missingKpi).toMatchObject({ status: 'error', reason: 'missing-column' });

    const missingChart = computeChartSeries(ds, {
      title: 'Broken Chart',
      xFieldId: 'c_date',
      yFieldId: 'deleted_col',
      aggregation: 'sum',
    });
    expect(missingChart).toMatchObject({ status: 'error', reason: 'missing-column' });
  });

  it('sorts date X-axis chronologically and reflects live cell edits immediately', () => {
    let ds = buildSampleDataset();

    const chart1 = computeChartSeries(ds, {
      title: 'Daily',
      xFieldId: 'c_date',
      yFieldId: 'c_val',
      aggregation: 'sum',
    });
    expect(chart1.status).toBe('ok');
    if (chart1.status === 'ok') {
      expect(chart1.labels).toEqual(['2026-01-01', '2026-01-05']);
      expect(chart1.values).toEqual([100, 100]);
      expect(chart1.skippedInvalidCount).toBe(1);
    }

    // Live edit the invalid cell to a valid number
    ds = updateCell(ds, ds.rows[3].id, 'c_val', '25');
    const chart2 = computeChartSeries(ds, {
      title: 'Daily',
      xFieldId: 'c_date',
      yFieldId: 'c_val',
      aggregation: 'sum',
    });
    expect(chart2.status).toBe('ok');
    if (chart2.status === 'ok') {
      expect(chart2.labels).toEqual(['2026-01-01', '2026-01-03', '2026-01-05']);
      expect(chart2.values).toEqual([100, 25, 100]);
      expect(chart2.skippedInvalidCount).toBe(0);
    }
  });

  it('projects TableView columns and reports missing columns cleanly', () => {
    const ds = buildSampleDataset();
    const res = computeTableView(ds, {
      title: 'View',
      columnIds: ['c_cat', 'missing_col', 'c_val'],
      maxRows: 2,
    });

    expect(res.status).toBe('error');
    expect(res.missingColumnIds).toEqual(['missing_col']);
    expect(res.columns.map((c) => c.id)).toEqual(['c_cat', 'c_val']);
    expect(res.rows).toHaveLength(2);
    expect(res.totalRowCount).toBe(4);
  });
});
