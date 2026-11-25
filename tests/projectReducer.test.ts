import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createInitialWorkspaceState,
  projectReducer,
} from '../src/app/projectReducer';

describe('projectReducer', () => {
  it('tracks dirty state across dataset edits and resets on MARK_EXPORTED', () => {
    let state = createInitialWorkspaceState(createEmptyProject('Demo', 'Overview'));
    expect(state.dirtySinceLastExport).toBe(false);

    state = projectReducer(state, {
      type: 'ADD_COLUMN',
      input: { id: 'col_1', name: 'Metric', type: 'number' },
    });
    expect(state.dirtySinceLastExport).toBe(true);
    expect(state.project.primaryDataset.columns).toHaveLength(1);

    state = projectReducer(state, { type: 'MARK_EXPORTED' });
    expect(state.dirtySinceLastExport).toBe(false);
  });

  it('keeps referenced column IDs intact when deleting a column so errors surface visibly', () => {
    let state = createInitialWorkspaceState(createEmptyProject('Demo', 'Overview'));
    const pageId = state.activePageId;

    state = projectReducer(state, {
      type: 'ADD_COLUMN',
      input: { id: 'col_val', name: 'Value', type: 'number' },
    });
    state = projectReducer(state, {
      type: 'ADD_ELEMENT',
      pageId,
      element: {
        id: 'kpi_1',
        type: 'kpi',
        position: { x: 40, y: 40 },
        size: { width: 220, height: 120 },
        config: { title: 'Sum', valueFieldId: 'col_val', aggregation: 'sum' },
      },
    });

    state = projectReducer(state, { type: 'DELETE_COLUMN', columnId: 'col_val' });
    const kpi = state.project.canvases[0].elements[0];
    expect(kpi.type).toBe('kpi');
    if (kpi.type === 'kpi') {
      expect(kpi.config.valueFieldId).toBe('col_val');
    }
  });

  it('manages pages, viewports, and prevents deleting the final page', () => {
    let state = createInitialWorkspaceState(createEmptyProject('Demo', 'Page 1'));
    const firstPageId = state.activePageId;

    // Cannot delete the only page
    state = projectReducer(state, { type: 'DELETE_PAGE', pageId: firstPageId });
    expect(state.project.canvases).toHaveLength(1);

    state = projectReducer(state, { type: 'ADD_PAGE', name: 'Trends' });
    expect(state.project.canvases).toHaveLength(2);
    const secondPageId = state.activePageId;
    expect(secondPageId).not.toBe(firstPageId);

    state = projectReducer(state, {
      type: 'SET_PAGE_VIEWPORT',
      pageId: secondPageId,
      viewport: { x: 120, y: -40, zoom: 1.25 },
    });
    expect(state.project.canvases[1].viewport).toEqual({ x: 120, y: -40, zoom: 1.25 });

    state = projectReducer(state, { type: 'DELETE_PAGE', pageId: secondPageId });
    expect(state.project.canvases).toHaveLength(1);
    expect(state.activePageId).toBe(firstPageId);
  });
});
