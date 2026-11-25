import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../src/app/projectReducer';
import { buildPagesFromTemplate } from '../src/features/canvas/templates';
import { parseTxtContent } from '../src/features/project-file/txtParser';
import { serializeProjectTxt } from '../src/features/project-file/txtSerializer';
import { addColumn, addRow } from '../src/features/source-data/datasetOps';

describe('templates and full layout round-trip', () => {
  it('builds generic Overview, Trends, and Blank templates adapting to arbitrary dataset columns', () => {
    let ds = addColumn(createEmptyProject().primaryDataset, {
      id: 'col_d',
      name: 'День',
      type: 'date',
    });
    ds = addColumn(ds, { id: 'col_g', name: 'Група', type: 'text' });
    ds = addColumn(ds, { id: 'col_n', name: 'Значення', type: 'number' });
    ds = addRow(ds, { col_d: '2026-02-01', col_g: 'Alpha', col_n: '15' });

    const blank = buildPagesFromTemplate('blank', ds);
    expect(blank).toHaveLength(1);
    expect(blank[0].elements).toHaveLength(0);

    const overview = buildPagesFromTemplate('overview', ds);
    expect(overview[0].elements.length).toBeGreaterThanOrEqual(4);
    expect(overview[0].elements.some((el) => el.type === 'bar-chart')).toBe(true);
    expect(overview[0].elements.some((el) => el.type === 'table-view')).toBe(true);

    const trends = buildPagesFromTemplate('trends', ds);
    const line = trends[0].elements.find((el) => el.type === 'line-chart');
    expect(line).toBeDefined();
    if (line && line.type === 'line-chart') {
      expect(line.config.xFieldId).toBe('col_d');
      expect(line.config.yFieldId).toBe('col_n');
    }
  });

  it('round-trips generated template layouts through full-project TXT export and import', () => {
    const project = createEmptyProject('RoundTrip', 'Init');
    let ds = addColumn(project.primaryDataset, { id: 'c_date', name: 'Дата', type: 'date' });
    ds = addColumn(ds, { id: 'c_val', name: 'Одиниці', type: 'number' });
    ds = addRow(ds, { c_date: '2026-03-01', c_val: '42' });
    project.primaryDataset = ds;
    project.canvases = [
      ...buildPagesFromTemplate('overview', ds),
      ...buildPagesFromTemplate('trends', ds),
    ];
    project.canvases[0].viewport = { x: 45, y: 12, zoom: 0.85 };

    const txt = serializeProjectTxt(project);
    const parsed = parseTxtContent(txt);
    expect(parsed.kind).toBe('project');
    expect(parsed.errors).toEqual([]);

    if (parsed.kind === 'project') {
      expect(parsed.project.canvases).toHaveLength(2);
      expect(parsed.project.canvases[0].viewport).toEqual({ x: 45, y: 12, zoom: 0.85 });
      expect(parsed.project.canvases[0].elements.length).toBe(
        project.canvases[0].elements.length,
      );
      expect(parsed.project.canvases[1].elements.length).toBe(
        project.canvases[1].elements.length,
      );
    }
  });
});
