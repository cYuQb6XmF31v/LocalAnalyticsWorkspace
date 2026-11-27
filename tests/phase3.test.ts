import fs from 'node:fs';
import path from 'node:path';
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
import { computeProjectGraph, sensitivityToDwellMs } from '../src/features/visualizations/transforms';

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

    // Add an unsold product P3 to catalog for right/full/anti tests
    const catalogExt = addRow(catalog, { c_id: 'P3', c_grp: 'Audio' });

    const right = materializeJoinedDataset(orders, catalogExt, {
      id: 'j1',
      name: 'Right',
      leftDatasetId: orders.id,
      rightDatasetId: catalogExt.id,
      leftKeyColumnId: 'o_prod',
      rightKeyColumnId: 'c_id',
      joinType: 'right',
    });
    expect(right.rows).toHaveLength(2);
    expect(right.rows[1].values.o_prod).toBeNull();
    expect(right.rows[1].values[getJoinedColumnId('j1', 'c_grp')]).toBe('Audio');

    const full = materializeJoinedDataset(orders, catalogExt, {
      id: 'j1',
      name: 'Full',
      leftDatasetId: orders.id,
      rightDatasetId: catalogExt.id,
      leftKeyColumnId: 'o_prod',
      rightKeyColumnId: 'c_id',
      joinType: 'full',
    });
    expect(full.rows).toHaveLength(3);

    const leftAnti = materializeJoinedDataset(orders, catalogExt, {
      id: 'j1',
      name: 'Left Anti',
      leftDatasetId: orders.id,
      rightDatasetId: catalogExt.id,
      leftKeyColumnId: 'o_prod',
      rightKeyColumnId: 'c_id',
      joinType: 'left-anti',
    });
    expect(leftAnti.rows).toHaveLength(1);
    expect(leftAnti.rows[0].values.o_prod).toBe('P2');

    const rightAnti = materializeJoinedDataset(orders, catalogExt, {
      id: 'j1',
      name: 'Right Anti',
      leftDatasetId: orders.id,
      rightDatasetId: catalogExt.id,
      leftKeyColumnId: 'o_prod',
      rightKeyColumnId: 'c_id',
      joinType: 'right-anti',
    });
    expect(rightAnti.rows).toHaveLength(1);
    expect(rightAnti.rows[0].values[getJoinedColumnId('j1', 'c_grp')]).toBe('Audio');
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
    if ('showLegend' in project.canvases[0].elements[1].config) {
      project.canvases[0].elements[1].config.showLegend = true;
      project.canvases[0].elements[1].config.legendPosition = 'right';
      project.canvases[0].elements[1].config.showDataLabels = true;
      project.canvases[0].elements[1].config.dataLabelPosition = 'right';
    }

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
      if ('legendPosition' in parsed.project.canvases[0].elements[1].config) {
        expect(parsed.project.canvases[0].elements[1].config.legendPosition).toBe('right');
        expect(parsed.project.canvases[0].elements[1].config.dataLabelPosition).toBe('right');
      }

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

  it('validates demo-project-50.txt and demo-suppliers-50-join.txt without errors', () => {
    const projectTxt = fs.readFileSync(
      path.resolve(process.cwd(), 'public/demo-project-50.txt'),
      'utf8',
    );
    const parsedProject = parseTxtContent(projectTxt);
    expect(parsedProject.kind).toBe('project');
    expect(parsedProject.errors).toEqual([]);
    if (parsedProject.kind === 'project') {
      expect(parsedProject.project.primaryDataset.rows).toHaveLength(50);
      expect(parsedProject.project.secondaryDatasets?.[0]?.rows).toHaveLength(50);
      expect(parsedProject.project.joins).toHaveLength(4);
      expect(parsedProject.project.canvases).toHaveLength(4);

      const unsold = resolveEffectiveDataset(
        parsedProject.project,
        getJoinDatasetId('j_unsold_right_anti'),
      );
      expect(unsold.rows).toHaveLength(5);

      const unlisted = resolveEffectiveDataset(
        parsedProject.project,
        getJoinDatasetId('j_unlisted_left_anti'),
      );
      expect(unlisted.rows).toHaveLength(3);
    }

    const suppliersTxt = fs.readFileSync(
      path.resolve(process.cwd(), 'public/demo-suppliers-50-join.txt'),
      'utf8',
    );
    const parsedSuppliers = parseTxtContent(suppliersTxt);
    expect(parsedSuppliers.kind).toBe('dataset');
    expect(parsedSuppliers.errors).toEqual([]);
    if (parsedSuppliers.kind === 'dataset') {
      expect(parsedSuppliers.dataset.rows).toHaveLength(50);
    }
  });

  it('computes exact graph hover dwell timing and preserves table/pivot/note fontSize & textScale', () => {
    expect(sensitivityToDwellMs(0)).toBe(Infinity);
    expect(sensitivityToDwellMs(1)).toBe(1000);
    expect(sensitivityToDwellMs(100)).toBe(0);
    expect(sensitivityToDwellMs(50)).toBeGreaterThan(450);
    expect(sensitivityToDwellMs(50)).toBeLessThan(550);

    const project = createEmptyProject('Font Test', 'Sheet 1');
    project.primaryDataset = addColumn(project.primaryDataset, {
      id: 'col_a',
      name: 'name',
      type: 'text',
    });
    project.canvases[0].elements = [
      {
        id: 'tbl_1',
        type: 'table-view',
        position: { x: 20, y: 20 },
        size: { width: 400, height: 220 },
        config: { title: 'Таблиця', columnIds: ['col_a'], maxRows: 20, fontSize: 15, textScale: 120 },
      },
      {
        id: 'piv_1',
        type: 'pivot-table',
        position: { x: 440, y: 20 },
        size: { width: 400, height: 220 },
        config: {
          title: 'Зведена',
          rowFieldId: 'col_a',
          colFieldId: null,
          valueFieldId: 'col_a',
          aggregation: 'count',
          fontSize: 16,
          textScale: 130,
        },
      },
      {
        id: 'note_1',
        type: 'note',
        position: { x: 20, y: 260 },
        size: { width: 280, height: 180 },
        config: {
          title: 'Нотатка',
          content: '**Важливо** і __підкреслено__',
          fontSize: 18,
          bold: true,
          italic: true,
          underline: true,
          textScale: 115,
        },
      },
    ];

    const txt = serializeProjectTxt(project);
    const reparsed = parseTxtContent(txt);
    expect(reparsed.errors).toEqual([]);
    expect(reparsed.kind).toBe('project');
    if (reparsed.kind === 'project') {
      const tCfg = reparsed.project.canvases[0].elements[0].config;
      const pCfg = reparsed.project.canvases[0].elements[1].config;
      const nCfg = reparsed.project.canvases[0].elements[2].config;
      expect('fontSize' in tCfg ? tCfg.fontSize : undefined).toBe(15);
      expect(tCfg.textScale).toBe(120);
      expect('fontSize' in pCfg ? pCfg.fontSize : undefined).toBe(16);
      expect(pCfg.textScale).toBe(130);
      expect('fontSize' in nCfg ? nCfg.fontSize : undefined).toBe(18);
      expect('bold' in nCfg ? nCfg.bold : undefined).toBe(true);
      expect('italic' in nCfg ? nCfg.italic : undefined).toBe(true);
      expect('underline' in nCfg ? nCfg.underline : undefined).toBe(true);
      expect(nCfg.textScale).toBe(115);
    }
  });
});
