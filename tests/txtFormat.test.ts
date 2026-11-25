import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../src/app/projectReducer';
import { parseTxtContent } from '../src/features/project-file/txtParser';
import {
  serializeDatasetOnlyTxt,
  serializeProjectTxt,
} from '../src/features/project-file/txtSerializer';

describe('TXT parser & serializer', () => {
  it('parses dataset-only TXT with quotes, doubled quotes, empty cells, and multilines', () => {
    const raw = [
      '# Dataset: Sales',
      '# Columns: date:date;product:text;notes:text;qty:number;active:boolean',
      '2026-01-01;"Laptop; Pro";"Line 1',
      'Line ""2""";2;true',
      '2026-01-02;Monitor;;5;',
      '2026-01-03;"#Promo";plain;10;false',
    ].join('\n');

    const result = parseTxtContent(raw);
    expect(result.kind).toBe('dataset');
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);

    if (result.kind === 'dataset') {
      expect(result.dataset.name).toBe('Sales');
      expect(result.dataset.columns.map((c) => `${c.name}:${c.type}`)).toEqual([
        'date:date',
        'product:text',
        'notes:text',
        'qty:number',
        'active:boolean',
      ]);
      expect(result.dataset.rows).toHaveLength(3);
      expect(Object.values(result.dataset.rows[0].values)).toEqual([
        '2026-01-01',
        'Laptop; Pro',
        'Line 1\nLine "2"',
        '2',
        'true',
      ]);
      expect(Object.values(result.dataset.rows[1].values)).toEqual([
        '2026-01-02',
        'Monitor',
        null,
        '5',
        null,
      ]);
      expect(Object.values(result.dataset.rows[2].values)[0]).toBe('2026-01-03');
      expect(Object.values(result.dataset.rows[2].values)[1]).toBe('#Promo');
    }
  });

  it('reports line-numbered errors for invalid dataset TXT without crashing', () => {
    const missingHeader = '2026-01-01;Laptop;10';
    const res1 = parseTxtContent(missingHeader);
    expect(res1.errors.length).toBeGreaterThan(0);

    const badColumnsAndRowLength = [
      '# Columns: date:date;amount:currency;note',
      '2026-01-01;100;ok',
      '2026-01-02;200',
    ].join('\n');
    const res2 = parseTxtContent(badColumnsAndRowLength);
    expect(res2.errors.some((e) => e.line === 1 && e.message.includes('currency'))).toBe(true);
    expect(res2.errors.some((e) => e.line === 3)).toBe(true);

    const unclosedQuote = ['# Columns: name:text', '"unclosed'].join('\n');
    const res3 = parseTxtContent(unclosedQuote);
    expect(res3.errors.some((e) => e.line === 2)).toBe(true);
  });

  it('round-trips a full project including stable column IDs, viewports, items, and unknown metadata', () => {
    const project = createEmptyProject('Sales Workspace', 'Overview');
    project.metadata.unknownMetadata = ['# Custom-Tag: alpha'];
    project.primaryDataset = {
      id: 'ds_main',
      name: 'Orders',
      columns: [
        { id: 'col_date', name: 'Дата', type: 'date' },
        { id: 'col_prod', name: 'Товар', type: 'text' },
        { id: 'col_amt', name: 'Сума', type: 'number' },
      ],
      rows: [
        {
          id: 'r1',
          values: { col_date: '2026-01-01', col_prod: 'Item; "A"', col_amt: '40000' },
        },
        {
          id: 'r2',
          values: { col_date: null, col_prod: '#LeadingHash', col_amt: '12.5' },
        },
      ],
    };

    project.canvases = [
      {
        id: 'page_1',
        name: 'Overview',
        viewport: { x: 15, y: -20, zoom: 1.1 },
        elements: [
          {
            id: 'el_kpi',
            type: 'kpi',
            position: { x: 80, y: 80 },
            size: { width: 260, height: 140 },
            config: { title: 'Total', valueFieldId: 'col_amt', aggregation: 'sum' },
          },
          {
            id: 'el_note',
            type: 'note',
            position: { x: 380, y: 80 },
            size: { width: 240, height: 160 },
            config: { title: 'Note', content: 'Line 1\nLine 2' },
          },
        ],
      },
      {
        id: 'page_2',
        name: 'Trends',
        viewport: { x: 0, y: 0, zoom: 0.9 },
        elements: [
          {
            id: 'el_line',
            type: 'line-chart',
            position: { x: 40, y: 40 },
            size: { width: 420, height: 260 },
            config: {
              title: 'Trend',
              xFieldId: 'col_date',
              yFieldId: 'col_amt',
              aggregation: 'sum',
            },
          },
        ],
      },
    ];

    const txt = serializeProjectTxt(project);
    const parsed = parseTxtContent(txt);

    expect(parsed.kind).toBe('project');
    expect(parsed.errors).toEqual([]);
    if (parsed.kind === 'project') {
      expect(parsed.project.name).toBe('Sales Workspace');
      expect(parsed.project.metadata.unknownMetadata).toEqual(['# Custom-Tag: alpha']);
      expect(parsed.project.primaryDataset.columns.map((c) => c.id)).toEqual([
        'col_date',
        'col_prod',
        'col_amt',
      ]);
      expect(parsed.project.primaryDataset.rows).toHaveLength(2);
      expect(parsed.project.primaryDataset.rows[0].values.col_prod).toBe('Item; "A"');
      expect(parsed.project.primaryDataset.rows[1].values.col_prod).toBe('#LeadingHash');
      expect(parsed.project.primaryDataset.rows[1].values.col_date).toBeNull();

      expect(parsed.project.canvases).toHaveLength(2);
      expect(parsed.project.canvases[0].viewport).toEqual({ x: 15, y: -20, zoom: 1.1 });
      expect(parsed.project.canvases[0].elements[0].config).toEqual({
        title: 'Total',
        valueFieldId: 'col_amt',
        aggregation: 'sum',
      });
      expect(parsed.project.canvases[0].elements[1].config).toEqual({
        title: 'Note',
        content: 'Line 1\nLine 2',
      });
      expect(parsed.project.canvases[1].elements[0].config).toEqual({
        title: 'Trend',
        xFieldId: 'col_date',
        yFieldId: 'col_amt',
        aggregation: 'sum',
      });
    }
  });

  it('parses the AGENTS.md conceptual project TXT without Column-Ids by resolving field names', () => {
    const specSample = [
      '# LOCAL-ANALYTICS-PROJECT',
      '# Format-Version: 1',
      '# Project-Name: Sales Dashboard',
      '',
      '[DATASET id="main"]',
      '# Name: Sales',
      '# Columns: date:date;product:text;amount:number',
      '2026-01-01;Laptop;40000',
      '[/DATASET]',
      '',
      '[CANVAS id="overview"]',
      '# Name: Overview',
      '# Viewport: x=0;y=0;zoom=1',
      '[ITEM id="revenue-kpi" type="kpi"]',
      '# Position: x=80;y=80',
      '# Size: width=260;height=140',
      '# Config-JSON: {"title":"Total revenue","valueField":"amount","aggregation":"sum"}',
      '[/ITEM]',
      '[/CANVAS]',
    ].join('\n');

    const parsed = parseTxtContent(specSample);
    expect(parsed.kind).toBe('project');
    expect(parsed.errors).toEqual([]);
    if (parsed.kind === 'project') {
      const amtCol = parsed.project.primaryDataset.columns.find((c) => c.name === 'amount');
      expect(amtCol).toBeDefined();
      const kpi = parsed.project.canvases[0].elements[0];
      expect(kpi.type).toBe('kpi');
      if (kpi.type === 'kpi') {
        expect(kpi.config.valueFieldId).toBe(amtCol?.id);
      }
    }
  });

  it('serializes dataset-only TXT deterministically', () => {
    const project = createEmptyProject('Demo', 'Page');
    project.primaryDataset = {
      id: 'ds_1',
      name: 'Products',
      columns: [
        { id: 'c1', name: 'Name', type: 'text' },
        { id: 'c2', name: 'Price', type: 'number' },
      ],
      rows: [{ id: 'r1', values: { c1: '#Special; "1"', c2: '99.5' } }],
    };

    const output = serializeDatasetOnlyTxt(project.primaryDataset);
    expect(output).toBe(
      '# Dataset: Products\n# Columns: Name:text;Price:number\n"#Special; ""1""";99.5\n',
    );
  });

  it('rejects malformed full-project sections with actionable line errors', () => {
    const broken = [
      '# LOCAL-ANALYTICS-PROJECT',
      '# Format-Version: 99',
      '[DATASET id="main"]',
      '# Columns: a:text',
      'hello',
      '[/DATASET]',
      '[CANVAS id="p1"]',
      '# Viewport: x=bad;y=0;zoom=1',
      '[ITEM id="el1" type="kpi"]',
      '# Config-JSON: {not-valid-json}',
      '[/CANVAS]',
    ].join('\n');

    const parsed = parseTxtContent(broken);
    expect(parsed.kind).toBe('project');
    expect(parsed.errors.some((e) => e.line === 2)).toBe(true);
    expect(parsed.errors.some((e) => e.line === 8)).toBe(true);
    expect(parsed.errors.some((e) => e.line === 10)).toBe(true);
    expect(parsed.errors.some((e) => e.message.includes('[/ITEM]'))).toBe(true);
  });

  it('round-trips Phase 2 elements (kanban, histogram, pie-chart, stacked-bar, scatter, pivot-table, kpi sparkline)', () => {
    const project = createEmptyProject('Phase2RoundTrip', 'Analytics');
    project.primaryDataset = {
      id: 'ds_p2',
      name: 'Items',
      columns: [
        { id: 'c_date', name: 'Date', type: 'date' },
        { id: 'c_status', name: 'Status', type: 'text' },
        { id: 'c_cat', name: 'Category', type: 'text' },
        { id: 'c_val', name: 'Value', type: 'number' },
        { id: 'c_cost', name: 'Cost', type: 'number' },
      ],
      rows: [
        {
          id: 'r1',
          values: { c_date: '2026-01-01', c_status: 'Open', c_cat: 'X', c_val: '10', c_cost: '4' },
        },
      ],
    };

    project.canvases[0].elements = [
      {
        id: 'el_kpi',
        type: 'kpi',
        position: { x: 10, y: 10 },
        size: { width: 220, height: 150 },
        config: {
          title: 'KPI',
          valueFieldId: 'c_val',
          aggregation: 'sum',
          showSparkline: true,
          sparklineOrderFieldId: 'c_date',
        },
      },
      {
        id: 'el_kanban',
        type: 'kanban',
        position: { x: 250, y: 10 },
        size: { width: 520, height: 300 },
        config: {
          title: 'Board',
          groupByFieldId: 'c_status',
          titleFieldId: 'c_cat',
          detailFieldIds: ['c_val'],
        },
      },
      {
        id: 'el_hist',
        type: 'histogram',
        position: { x: 10, y: 200 },
        size: { width: 320, height: 220 },
        config: { title: 'Hist', valueFieldId: 'c_val', binCount: 6 },
      },
      {
        id: 'el_pie',
        type: 'pie-chart',
        position: { x: 350, y: 340 },
        size: { width: 320, height: 240 },
        config: {
          title: 'Donut',
          categoryFieldId: 'c_cat',
          valueFieldId: 'c_val',
          aggregation: 'sum',
          isDonut: true,
        },
      },
      {
        id: 'el_stack',
        type: 'stacked-bar',
        position: { x: 700, y: 10 },
        size: { width: 400, height: 260 },
        config: {
          title: 'Stacked',
          xFieldId: 'c_date',
          seriesFieldId: 'c_status',
          yFieldId: 'c_val',
          aggregation: 'sum',
        },
      },
      {
        id: 'el_scatter',
        type: 'scatter',
        position: { x: 700, y: 300 },
        size: { width: 380, height: 260 },
        config: {
          title: 'Scatter',
          xFieldId: 'c_val',
          yFieldId: 'c_cost',
          labelFieldId: 'c_cat',
        },
      },
      {
        id: 'el_pivot',
        type: 'pivot-table',
        position: { x: 10, y: 450 },
        size: { width: 420, height: 240 },
        config: {
          title: 'Pivot',
          rowFieldId: 'c_cat',
          colFieldId: 'c_status',
          valueFieldId: 'c_val',
          aggregation: 'sum',
        },
      },
    ];

    const txt = serializeProjectTxt(project);
    const parsed = parseTxtContent(txt);
    expect(parsed.kind).toBe('project');
    expect(parsed.errors).toEqual([]);
    if (parsed.kind === 'project') {
      expect(parsed.project.canvases[0].elements).toHaveLength(7);
      expect(parsed.project.canvases[0].elements.map((e) => e.type)).toEqual([
        'kpi',
        'kanban',
        'histogram',
        'pie-chart',
        'stacked-bar',
        'scatter',
        'pivot-table',
      ]);
      expect(parsed.project.canvases[0].elements[0].config).toEqual(
        project.canvases[0].elements[0].config,
      );
      expect(parsed.project.canvases[0].elements[1].config).toEqual(
        project.canvases[0].elements[1].config,
      );
      expect(parsed.project.canvases[0].elements[6].config).toEqual(
        project.canvases[0].elements[6].config,
      );
    }
  });
});
