import { describe, expect, it } from 'vitest';
import {
  addColumn,
  addRow,
  changeColumnType,
  createEmptyDataset,
  deleteColumn,
  deleteRow,
  findColumnReferences,
  renameColumn,
  reorderColumn,
  updateCell,
} from '../src/features/source-data/datasetOps';
import { createEmptyProject } from '../src/app/projectReducer';

describe('datasetOps', () => {
  it('supports building a table from zero with stable column and row IDs', () => {
    let ds = createEmptyDataset('Orders');
    ds = addColumn(ds, { id: 'col_item', name: 'Item', type: 'text' });
    ds = addColumn(ds, { id: 'col_qty', name: 'Qty', type: 'number' });
    ds = addRow(ds, { col_item: 'Widget', col_qty: '3' });
    ds = addRow(ds);

    expect(ds.columns.map((c) => c.id)).toEqual(['col_item', 'col_qty']);
    expect(ds.rows).toHaveLength(2);
    expect(ds.rows[0].values).toEqual({ col_item: 'Widget', col_qty: '3' });
    expect(ds.rows[1].values).toEqual({ col_item: null, col_qty: null });

    const rowId = ds.rows[1].id;
    ds = updateCell(ds, rowId, 'col_item', 'Gadget');
    expect(ds.rows[1].values.col_item).toBe('Gadget');

    ds = deleteRow(ds, rowId);
    expect(ds.rows).toHaveLength(1);
  });

  it('preserves stable ID on rename and keeps raw cell values on type change', () => {
    let ds = createEmptyDataset();
    ds = addColumn(ds, { id: 'col_a', name: 'Value', type: 'text' });
    ds = addRow(ds, { col_a: 'not-a-number' });

    ds = renameColumn(ds, 'col_a', 'Amount');
    expect(ds.columns[0].id).toBe('col_a');
    expect(ds.columns[0].name).toBe('Amount');

    ds = changeColumnType(ds, 'col_a', 'number');
    expect(ds.columns[0].type).toBe('number');
    expect(ds.rows[0].values.col_a).toBe('not-a-number');
  });

  it('reorders columns without losing row values and cleans up deleted columns', () => {
    let ds = createEmptyDataset();
    ds = addColumn(ds, { id: 'c1', name: 'First' });
    ds = addColumn(ds, { id: 'c2', name: 'Second' });
    ds = addColumn(ds, { id: 'c3', name: 'Third' });
    ds = addRow(ds, { c1: 'A', c2: 'B', c3: 'C' });

    ds = reorderColumn(ds, 'c3', 0);
    expect(ds.columns.map((c) => c.id)).toEqual(['c3', 'c1', 'c2']);
    expect(ds.rows[0].values).toEqual({ c1: 'A', c2: 'B', c3: 'C' });

    ds = deleteColumn(ds, 'c2');
    expect(ds.columns.map((c) => c.id)).toEqual(['c3', 'c1']);
    expect('c2' in ds.rows[0].values).toBe(false);
  });

  it('finds all Canvas element references for a column ID', () => {
    const project = createEmptyProject('Test', 'Page 1');
    project.canvases[0].elements = [
      {
        id: 'el_kpi',
        type: 'kpi',
        position: { x: 0, y: 0 },
        size: { width: 200, height: 120 },
        config: { title: 'Total', valueFieldId: 'col_amount', aggregation: 'sum' },
      },
      {
        id: 'el_chart',
        type: 'bar-chart',
        position: { x: 240, y: 0 },
        size: { width: 400, height: 260 },
        config: {
          title: 'By category',
          xFieldId: 'col_cat',
          yFieldId: 'col_amount',
          aggregation: 'sum',
        },
      },
      {
        id: 'el_table',
        type: 'table-view',
        position: { x: 0, y: 200 },
        size: { width: 400, height: 200 },
        config: { title: 'Preview', columnIds: ['col_cat', 'col_amount'] },
      },
    ];

    const refs = findColumnReferences(project, 'col_amount');
    expect(refs).toHaveLength(3);
    expect(refs.map((r) => `${r.elementId}:${r.fieldRole}`)).toEqual([
      'el_kpi:valueFieldId',
      'el_chart:yFieldId',
      'el_table:columnIds',
    ]);
  });
});
