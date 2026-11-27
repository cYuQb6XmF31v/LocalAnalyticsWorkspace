import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../src/app/projectReducer';
import { buildPagesFromTemplate } from '../src/features/canvas/templates';
import { parseTxtContent } from '../src/features/project-file/txtParser';
import { serializeProjectTxt } from '../src/features/project-file/txtSerializer';
import {
  applyProjectFilters,
  getJoinDatasetId,
  getJoinedColumnId,
  materializeJoinedDataset,
  resolveEffectiveDataset,
} from '../src/features/source-data/dataPipeline';
import { addColumn, addRow } from '../src/features/source-data/datasetOps';
import {
  evaluateDatasetFormulas,
  extractFormulaColumnRefs,
  validateFormula,
} from '../src/features/source-data/formulaEngine';
import { computeProjectGraph } from '../src/features/visualizations/transforms';

describe('Phase 3 features', () => {
  it('evaluates safe computed formula columns without eval and validates syntax', () => {
    expect(validateFormula('[amount] * 1.2').valid).toBe(true);
    expect(validateFormula('IF([qty] >= 5, "Опт", "Роздріб")').valid).toBe(true);
    expect(validateFormula('UNKNOWN_FN(1)').valid).toBe(false);
    expect(validateFormula('[unclosed').valid).toBe(false);

    let ds = addColumn(createEmptyProject().primaryDataset, {
      id: 'c_date',
      name: 'date',
      type: 'date',
    });
    ds = addColumn(ds, { id: 'c_qty', name: 'qty', type: 'number' });
    ds = addColumn(ds, { id: 'c_amt', name: 'amount', type: 'number' });
    ds = addColumn(ds, {
      id: 'c_unit',
      name: 'unit_price',
      type: 'number',
      formula: 'ROUND([amount] / [qty], 2)',
    });
    ds = addColumn(ds, {
      id: 'c_tier',
      name: 'tier',
      type: 'text',
      formula: 'IF([qty] >= 5, "Опт", "Роздріб")',
    });
    ds = addColumn(ds, {
      id: 'c_year',
      name: 'yr',
      type: 'number',
      formula: 'YEAR([date])',
    });

    ds = addRow(ds, { c_date: '2026-04-15', c_qty: '5', c_amt: '1250' });
    ds = addRow(ds, { c_date: '2026-04-16', c_qty: '2', c_amt: '300' });

    const evaluated = evaluateDatasetFormulas(ds);
    expect(evaluated.rows[0].values.c_unit).toBe(250);
    expect(evaluated.rows[0].values.c_tier).toBe('Опт');
    expect(evaluated.rows[0].values.c_year).toBe(2026);
    expect(evaluated.rows[1].values.c_tier).toBe('Роздріб');
    expect(extractFormulaColumnRefs('ROUND([amount] / [qty], 2)', ds.columns)).toEqual([
      'c_amt',
      'c_qty',
    ]);
  });

  it('materializes Left and Inner Joins across multiple datasets cleanly', () => {
    let orders = addColumn(createEmptyProject().primaryDataset, {
      id: 'o_prod',
      name: 'product_id',
      type: 'text',
    });
    orders = addColumn(orders, { id: 'o_amt', name: 'amount', type: 'number' });
    orders = addRow(orders, { o_prod: 'P1', o_amt: '500' });
    orders = addRow(orders, { o_prod: 'P2', o_amt: '300' });

    let catalog = addColumn(
      { id: 'ds_cat', name: 'Catalog', columns: [], rows: [] },
      { id: 'c_id', name: 'id', type: 'text' },
    );
    catalog = addColumn(catalog, { id: 'c_grp', name: 'group', type: 'text' });
    catalog = addRow(catalog, { c_id: 'P1', c_grp: 'Hardware' });

    const left = materializeJoinedDataset(orders, catalog, {
      id: 'j1',
      name: 'Orders + Catalog',
      leftDatasetId: orders.id,
      rightDatasetId: catalog.id,
      leftKeyColumnId: 'o_prod',
      rightKeyColumnId: 'c_id',
      joinType: 'left',
    });

    expect(left.rows).toHaveLength(2);
    expect(left.rows[0].values[getJoinedColumnId('j1', 'c_grp')]).toBe('Hardware');
    expect(left.rows[1].values[getJoinedColumnId('j1', 'c_grp')]).toBeNull();

    const inner = materializeJoinedDataset(orders, catalog, {
      id: 'j1',
      name: 'Orders + Catalog',
      leftDatasetId: orders.id,
      rightDatasetId: catalog.id,
      leftKeyColumnId: 'o_prod',
      rightKeyColumnId: 'c_id',
      joinType: 'inner',
    });
    expect(inner.rows).toHaveLength(1);
    expect(inner.rows[0].values.o_amt).toBe('500');
  });

  it('applies reusable filters non-destructively across date ranges, numbers, and lists', () => {
    let ds = addColumn(createEmptyProject().primaryDataset, {
      id: 'c_date',
      name: 'date',
      type: 'date',
    });
    ds = addColumn(ds, { id: 'c_reg', name: 'region', type: 'text' });
    ds = addColumn(ds, { id: 'c_amt', name: 'amount', type: 'number' });
    ds = addRow(ds, { c_date: '2026-01-10', c_reg: 'Київ', c_amt: '100' });
    ds = addRow(ds, { c_date: '2026-03-15', c_reg: 'Львів', c_amt: '450' });
    ds = addRow(ds, { c_date: '2026-05-20', c_reg: 'Одеса', c_amt: '800' });

    const filters = [
      {
        id: 'f1',
        name: 'Q1-Q2 Київ/Львів >= 200',
        datasetId: ds.id,
        rules: [
          { id: 'r1', columnId: 'c_date', operator: 'between' as const, value: '2026-01-01', valueTo: '2026-04-01' },
          { id: 'r2', columnId: 'c_reg', operator: 'in' as const, value: 'Київ, Львів', values: ['Київ', 'Львів'] },
          { id: 'r3', columnId: 'c_amt', operator: 'gte' as const, value: '200' },
        ],
      },
    ];

    const filtered = applyProjectFilters(ds, filters, ['f1']);
    expect(filtered.rows).toHaveLength(1);
    expect(filtered.rows[0].values.c_reg).toBe('Львів');
    expect(ds.rows).toHaveLength(3);
  });

  it('round-trips Format-Version 2 (multi-datasets, formulas, joins, filters, templates) and builds Data Lineage graph', () => {
    const project = createEmptyProject('BI Project', 'Overview');
    let mainDs = addColumn(project.primaryDataset, { id: 'c_key', name: 'sku', type: 'text' });
    mainDs = addColumn(mainDs, { id: 'c_val', name: 'amount', type: 'number' });
    mainDs = addColumn(mainDs, {
      id: 'c_tax',
      name: 'tax',
      type: 'number',
      formula: '[amount] * 0.2',
    });
    mainDs = addRow(mainDs, { c_key: 'A1', c_val: '100' });
    project.primaryDataset = mainDs;

    let refDs = addColumn(
      { id: 'ds_ref', name: 'Ref', columns: [], rows: [] },
      { id: 'r_key', name: 'sku', type: 'text' },
    );
    refDs = addColumn(refDs, { id: 'r_cat', name: 'category', type: 'text' });
    refDs = addRow(refDs, { r_key: 'A1', r_cat: 'Core' });

    project.secondaryDatasets = [refDs];
    project.joins = [
      {
        id: 'j_main_ref',
        name: 'Sales + Ref',
        leftDatasetId: mainDs.id,
        rightDatasetId: refDs.id,
        leftKeyColumnId: 'c_key',
        rightKeyColumnId: 'r_key',
        joinType: 'left',
      },
    ];
    project.filters = [
      {
        id: 'flt_1',
        name: 'High value',
        datasetId: mainDs.id,
        rules: [{ id: 'rule_1', columnId: 'c_val', operator: 'gt', value: '50' }],
      },
    ];
    project.savedTemplates = [
      {
        id: 'tpl_user',
        name: 'My Preset',
        createdAt: '2026-11-27T00:00:00.000Z',
        pages: buildPagesFromTemplate('analytics_suite', mainDs),
      },
    ];
    project.canvases = buildPagesFromTemplate('analytics_suite', mainDs);
    project.canvases[0].filterIds = ['flt_1'];
    project.canvases[0].elements[1].datasetId = getJoinDatasetId('j_main_ref');
    project.canvases[0].elements[1].filterIds = ['flt_1'];

    const txt = serializeProjectTxt(project);
    expect(txt).toContain('# Format-Version: 2');
    const parsed = parseTxtContent(txt);
    expect(parsed.kind).toBe('project');
    expect(parsed.errors).toEqual([]);

    if (parsed.kind === 'project') {
      expect(parsed.project.secondaryDatasets).toHaveLength(1);
      expect(parsed.project.joins).toHaveLength(1);
      expect(parsed.project.filters).toHaveLength(1);
      expect(parsed.project.savedTemplates).toHaveLength(1);
      expect(parsed.project.primaryDataset.columns[2].formula).toBe('[amount] * 0.2');
      expect(parsed.project.canvases).toHaveLength(3);
      expect(parsed.project.canvases[0].filterIds).toEqual(['flt_1']);
      expect(parsed.project.canvases[0].elements[1].datasetId).toBe(getJoinDatasetId('j_main_ref'));

      const resolved = resolveEffectiveDataset(
        parsed.project,
        getJoinDatasetId('j_main_ref'),
        ['flt_1'],
      );
      expect(resolved.rows).toHaveLength(1);
      expect(resolved.rows[0].values.c_tax).toBe(20);

      const lineage = computeProjectGraph(parsed.project, { includeDataLineage: true });
      expect(lineage.nodes.some((n) => n.kind === 'dataset')).toBe(true);
      expect(lineage.nodes.some((n) => n.kind === 'join')).toBe(true);
      expect(lineage.nodes.some((n) => n.kind === 'filter')).toBe(true);
      expect(lineage.nodes.some((n) => n.kind === 'column' && n.label.startsWith('fx '))).toBe(true);
      expect(lineage.edges.some((e) => e.kind === 'lineage')).toBe(true);
    }
  });
});
