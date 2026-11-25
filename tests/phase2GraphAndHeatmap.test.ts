import { describe, expect, it } from 'vitest';
import { createEmptyProject, createInitialWorkspaceState, projectReducer } from '../src/app/projectReducer';
import { parseTxtContent } from '../src/features/project-file/txtParser';
import { serializeProjectTxt } from '../src/features/project-file/txtSerializer';
import { addColumn, addRow, createEmptyDataset } from '../src/features/source-data/datasetOps';
import {
  computeActivityHeatmap,
  computeProjectGraph,
} from '../src/features/visualizations/transforms';

describe('Activity Heatmap and Project Graph', () => {
  it('returns explicit setup state when no date column exists instead of inventing activity', () => {
    let ds = createEmptyDataset('NoDates');
    ds = addColumn(ds, { id: 'c_txt', name: 'Name', type: 'text' });
    ds = addRow(ds, { c_txt: 'Alpha' });

    const res = computeActivityHeatmap(ds, null);
    expect(res.status).toBe('setup');
    if (res.status === 'setup') {
      expect(res.reason).toBe('no-date-column');
    }
  });

  it('counts records accurately by selected ISO date column and year', () => {
    let ds = createEmptyDataset('Events');
    ds = addColumn(ds, { id: 'c_date', name: 'Дата', type: 'date' });
    ds = addRow(ds, { c_date: '2026-02-10' });
    ds = addRow(ds, { c_date: '2026-02-10' });
    ds = addRow(ds, { c_date: '2025-12-31' });
    ds = addRow(ds, { c_date: 'bad-date' });
    ds = addRow(ds, { c_date: null });

    const res2026 = computeActivityHeatmap(ds, 'c_date');
    expect(res2026.status).toBe('ok');
    if (res2026.status === 'ok') {
      expect(res2026.year).toBe('2026');
      expect(res2026.availableYears).toEqual(['2025', '2026']);
      expect(res2026.entries).toEqual([['2026-02-10', 2]]);
      expect(res2026.totalValidRecords).toBe(3);
      expect(res2026.skippedInvalidCount).toBe(1);
    }

    const res2025 = computeActivityHeatmap(ds, 'c_date', '2025');
    expect(res2025.status).toBe('ok');
    if (res2025.status === 'ok') {
      expect(res2025.entries).toEqual([['2025-12-31', 1]]);
    }
  });

  it('builds Obsidian-like project graph with hierarchy and internal links and round-trips links in TXT', () => {
    let state = createInitialWorkspaceState(createEmptyProject('GraphProj', 'Overview'));
    const p1 = state.project.canvases[0].id;
    state = projectReducer(state, { type: 'ADD_PAGE', name: 'Details', activate: false });
    const p2 = state.project.canvases[1].id;

    state = projectReducer(state, {
      type: 'ADD_ELEMENT',
      pageId: p1,
      element: {
        id: 'el_src',
        type: 'note',
        position: { x: 20, y: 20 },
        size: { width: 220, height: 140 },
        config: { title: 'Summary', content: 'See details' },
      },
    });
    state = projectReducer(state, {
      type: 'ADD_ELEMENT',
      pageId: p2,
      element: {
        id: 'el_dst',
        type: 'kpi',
        position: { x: 40, y: 40 },
        size: { width: 220, height: 140 },
        config: { title: 'Target KPI', valueFieldId: null, aggregation: 'count' },
      },
    });

    state = projectReducer(state, {
      type: 'UPDATE_ELEMENT_LINKS',
      pageId: p1,
      elementId: 'el_src',
      links: [
        { targetPageId: p2, targetElementId: 'el_dst', label: 'До KPI' },
        { targetPageId: 'missing_page', label: 'Broken' },
      ],
    });

    const graph = computeProjectGraph(state.project);
    expect(graph.nodes).toHaveLength(5); // 1 project + 2 pages + 2 elements
    expect(graph.linkCount).toBe(1);
    expect(graph.brokenLinkCount).toBe(1);
    expect(
      graph.edges.some(
        (e) => e.kind === 'link' && e.source === 'el:el_src' && e.target === 'el:el_dst',
      ),
    ).toBe(true);

    // Round-trip links through TXT export/import
    const txt = serializeProjectTxt(state.project);
    const parsed = parseTxtContent(txt);
    expect(parsed.kind).toBe('project');
    expect(parsed.errors).toEqual([]);
    if (parsed.kind === 'project') {
      expect(parsed.project.canvases[0].elements[0].links).toEqual([
        { targetPageId: p2, targetElementId: 'el_dst', label: 'До KPI' },
        { targetPageId: 'missing_page', label: 'Broken' },
      ]);
    }
  });
});
