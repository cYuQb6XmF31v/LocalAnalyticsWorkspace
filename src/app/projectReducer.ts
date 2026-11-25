import { createStableId } from '../domain/id';
import type {
  CanvasElement,
  CanvasElementConfig,
  CanvasPage,
  CellValue,
  ColumnType,
  Dataset,
  ElementLink,
  Position,
  Project,
  Size,
  Viewport,
  WorkspaceState,
} from '../domain/models';
import {
  addColumn,
  addRow,
  changeColumnType,
  createEmptyDataset,
  deleteColumn,
  deleteRow,
  renameColumn,
  reorderColumn,
  updateCell,
  type AddColumnInput,
} from '../features/source-data/datasetOps';

export const CURRENT_FORMAT_VERSION = 1;

export function createEmptyProject(
  projectName = 'Новий проєкт',
  firstPageName = 'Головна сторінка',
): Project {
  const now = new Date().toISOString();
  const initialPage: CanvasPage = {
    id: createStableId('page'),
    name: firstPageName,
    viewport: { x: 0, y: 0, zoom: 1 },
    elements: [],
  };

  return {
    id: createStableId('proj'),
    name: projectName,
    formatVersion: CURRENT_FORMAT_VERSION,
    primaryDataset: createEmptyDataset('Source Data'),
    canvases: [initialPage],
    metadata: {
      createdAt: now,
      updatedAt: now,
    },
  };
}

export function createInitialWorkspaceState(project: Project = createEmptyProject()): WorkspaceState {
  return {
    project,
    activePageId: project.canvases[0]?.id ?? '',
    selectedElementId: null,
    selectedElementIds: [],
    dirtySinceLastExport: false,
    needsLayoutChooser: false,
  };
}

export type ProjectAction =
  | { type: 'RENAME_PROJECT'; name: string }
  | { type: 'RENAME_DATASET'; name: string }
  | { type: 'ADD_COLUMN'; input: AddColumnInput }
  | { type: 'RENAME_COLUMN'; columnId: string; name: string }
  | { type: 'CHANGE_COLUMN_TYPE'; columnId: string; columnType: ColumnType }
  | { type: 'REORDER_COLUMN'; columnId: string; targetIndex: number }
  | { type: 'DELETE_COLUMN'; columnId: string }
  | { type: 'ADD_ROW'; initialValues?: Record<string, CellValue>; insertAt?: number }
  | { type: 'UPDATE_CELL'; rowId: string; columnId: string; value: CellValue }
  | { type: 'DELETE_ROW'; rowId: string }
  | { type: 'REPLACE_DATASET'; dataset: Dataset; openLayoutChooser?: boolean }
  | { type: 'ADD_PAGE'; name: string; activate?: boolean }
  | { type: 'RENAME_PAGE'; pageId: string; name: string }
  | { type: 'DELETE_PAGE'; pageId: string }
  | { type: 'SELECT_PAGE'; pageId: string }
  | { type: 'SET_PAGE_VIEWPORT'; pageId: string; viewport: Viewport }
  | { type: 'ADD_ELEMENT'; pageId: string; element: CanvasElement; select?: boolean }
  | { type: 'UPDATE_ELEMENT_CONFIG'; pageId: string; elementId: string; config: CanvasElementConfig }
  | { type: 'UPDATE_ELEMENT_LINKS'; pageId: string; elementId: string; links: ElementLink[] }
  | { type: 'MOVE_ELEMENT'; pageId: string; elementId: string; position: Position }
  | { type: 'MOVE_ELEMENTS'; pageId: string; moves: Array<{ elementId: string; position: Position }> }
  | { type: 'RESIZE_ELEMENT'; pageId: string; elementId: string; size: Size; position?: Position }
  | { type: 'DELETE_ELEMENT'; pageId: string; elementId: string }
  | { type: 'DELETE_ELEMENTS'; pageId: string; elementIds: string[] }
  | { type: 'SELECT_ELEMENT'; elementId: string | null; pageId?: string }
  | { type: 'SELECT_ELEMENTS'; elementIds: string[]; primaryId?: string | null; pageId?: string }
  | { type: 'APPLY_CANVAS_PAGES'; pages: CanvasPage[]; activePageId?: string; append?: boolean }
  | { type: 'DISMISS_LAYOUT_CHOOSER' }
  | { type: 'REPLACE_PROJECT'; project: Project }
  | { type: 'RESTORE_SNAPSHOT'; project: Project; activePageId: string }
  | { type: 'MARK_EXPORTED' }
  | { type: 'RESET_PROJECT'; projectName?: string; firstPageName?: string };

function updateDatasetOnProject(
  state: WorkspaceState,
  nextDataset: Dataset,
): WorkspaceState {
  if (nextDataset === state.project.primaryDataset) {
    return state;
  }

  return {
    ...state,
    project: {
      ...state.project,
      primaryDataset: nextDataset,
      metadata: {
        ...state.project.metadata,
        updatedAt: new Date().toISOString(),
      },
    },
    dirtySinceLastExport: true,
  };
}

function updatePageInProject(
  state: WorkspaceState,
  pageId: string,
  updater: (page: CanvasPage) => CanvasPage,
): WorkspaceState {
  let changed = false;
  const nextCanvases = state.project.canvases.map((page) => {
    if (page.id !== pageId) {
      return page;
    }
    const updated = updater(page);
    if (updated !== page) {
      changed = true;
    }
    return updated;
  });

  if (!changed) {
    return state;
  }

  return {
    ...state,
    project: {
      ...state.project,
      canvases: nextCanvases,
      metadata: {
        ...state.project.metadata,
        updatedAt: new Date().toISOString(),
      },
    },
    dirtySinceLastExport: true,
  };
}

export function projectReducer(state: WorkspaceState, action: ProjectAction): WorkspaceState {
  switch (action.type) {
    case 'RENAME_PROJECT': {
      const trimmed = action.name.trim();
      if (!trimmed || trimmed === state.project.name) {
        return state;
      }
      return {
        ...state,
        project: {
          ...state.project,
          name: trimmed,
          metadata: { ...state.project.metadata, updatedAt: new Date().toISOString() },
        },
        dirtySinceLastExport: true,
      };
    }

    case 'RENAME_DATASET': {
      const trimmed = action.name.trim();
      if (!trimmed || trimmed === state.project.primaryDataset.name) {
        return state;
      }
      return updateDatasetOnProject(state, {
        ...state.project.primaryDataset,
        name: trimmed,
      });
    }

    case 'ADD_COLUMN':
      return updateDatasetOnProject(
        state,
        addColumn(state.project.primaryDataset, action.input),
      );

    case 'RENAME_COLUMN':
      return updateDatasetOnProject(
        state,
        renameColumn(state.project.primaryDataset, action.columnId, action.name),
      );

    case 'CHANGE_COLUMN_TYPE':
      return updateDatasetOnProject(
        state,
        changeColumnType(state.project.primaryDataset, action.columnId, action.columnType),
      );

    case 'REORDER_COLUMN':
      return updateDatasetOnProject(
        state,
        reorderColumn(state.project.primaryDataset, action.columnId, action.targetIndex),
      );

    case 'DELETE_COLUMN':
      // Column deletion intentionally leaves existing element field references untouched
      // so visualizations report missing-column errors instead of silently remapping.
      return updateDatasetOnProject(
        state,
        deleteColumn(state.project.primaryDataset, action.columnId),
      );

    case 'ADD_ROW':
      return updateDatasetOnProject(
        state,
        addRow(state.project.primaryDataset, action.initialValues, action.insertAt),
      );

    case 'UPDATE_CELL':
      return updateDatasetOnProject(
        state,
        updateCell(state.project.primaryDataset, action.rowId, action.columnId, action.value),
      );

    case 'DELETE_ROW':
      return updateDatasetOnProject(
        state,
        deleteRow(state.project.primaryDataset, action.rowId),
      );

    case 'REPLACE_DATASET':
      return {
        ...updateDatasetOnProject(state, action.dataset),
        needsLayoutChooser: action.openLayoutChooser ?? state.needsLayoutChooser,
      };

    case 'ADD_PAGE': {
      const trimmed = action.name.trim();
      const newPage: CanvasPage = {
        id: createStableId('page'),
        name: trimmed || `Сторінка ${state.project.canvases.length + 1}`,
        viewport: { x: 0, y: 0, zoom: 1 },
        elements: [],
      };
      return {
        ...state,
        project: {
          ...state.project,
          canvases: [...state.project.canvases, newPage],
          metadata: { ...state.project.metadata, updatedAt: new Date().toISOString() },
        },
        activePageId: action.activate === false ? state.activePageId : newPage.id,
        selectedElementId: action.activate === false ? state.selectedElementId : null,
        dirtySinceLastExport: true,
      };
    }

    case 'RENAME_PAGE': {
      const trimmed = action.name.trim();
      if (!trimmed) {
        return state;
      }
      return updatePageInProject(state, action.pageId, (page) =>
        page.name === trimmed ? page : { ...page, name: trimmed },
      );
    }

    case 'DELETE_PAGE': {
      if (state.project.canvases.length <= 1) {
        return state;
      }
      const nextCanvases = state.project.canvases.filter((page) => page.id !== action.pageId);
      if (nextCanvases.length === state.project.canvases.length) {
        return state;
      }
      const activeDeleted = state.activePageId === action.pageId;
      return {
        ...state,
        project: {
          ...state.project,
          canvases: nextCanvases,
          metadata: { ...state.project.metadata, updatedAt: new Date().toISOString() },
        },
        activePageId: activeDeleted ? nextCanvases[0].id : state.activePageId,
        selectedElementId: activeDeleted ? null : state.selectedElementId,
        selectedElementIds: activeDeleted ? [] : (state.selectedElementIds ?? []),
        dirtySinceLastExport: true,
      };
    }

    case 'SELECT_PAGE': {
      if (!state.project.canvases.some((page) => page.id === action.pageId)) {
        return state;
      }
      if (state.activePageId === action.pageId) {
        return state;
      }
      return {
        ...state,
        activePageId: action.pageId,
        selectedElementId: null,
        selectedElementIds: [],
      };
    }

    case 'SET_PAGE_VIEWPORT':
      return updatePageInProject(state, action.pageId, (page) => {
        if (
          page.viewport.x === action.viewport.x &&
          page.viewport.y === action.viewport.y &&
          page.viewport.zoom === action.viewport.zoom
        ) {
          return page;
        }
        return { ...page, viewport: action.viewport };
      });

    case 'ADD_ELEMENT': {
      const next = updatePageInProject(state, action.pageId, (page) => ({
        ...page,
        elements: [...page.elements, action.element],
      }));
      if (next === state) {
        return state;
      }
      return {
        ...next,
        selectedElementId: action.select === false ? state.selectedElementId : action.element.id,
        selectedElementIds:
          action.select === false ? (state.selectedElementIds ?? []) : [action.element.id],
      };
    }

    case 'UPDATE_ELEMENT_CONFIG':
      return updatePageInProject(state, action.pageId, (page) => ({
        ...page,
        elements: page.elements.map((el) =>
          el.id === action.elementId
            ? ({ ...el, config: action.config } as CanvasElement)
            : el,
        ),
      }));

    case 'UPDATE_ELEMENT_LINKS':
      return updatePageInProject(state, action.pageId, (page) => ({
        ...page,
        elements: page.elements.map((el) => {
          if (el.id !== action.elementId) {
            return el;
          }
          if (action.links.length === 0) {
            const { links: _removed, ...rest } = el;
            return rest as CanvasElement;
          }
          return { ...el, links: action.links };
        }),
      }));

    case 'MOVE_ELEMENT':
      return updatePageInProject(state, action.pageId, (page) => ({
        ...page,
        elements: page.elements.map((el) =>
          el.id === action.elementId ? { ...el, position: action.position } : el,
        ),
      }));

    case 'MOVE_ELEMENTS': {
      if (action.moves.length === 0) {
        return state;
      }
      const posById = new Map(action.moves.map((m) => [m.elementId, m.position]));
      return updatePageInProject(state, action.pageId, (page) => ({
        ...page,
        elements: page.elements.map((el) => {
          const nextPos = posById.get(el.id);
          return nextPos ? { ...el, position: nextPos } : el;
        }),
      }));
    }

    case 'RESIZE_ELEMENT':
      return updatePageInProject(state, action.pageId, (page) => ({
        ...page,
        elements: page.elements.map((el) =>
          el.id === action.elementId
            ? {
                ...el,
                size: action.size,
                ...(action.position ? { position: action.position } : {}),
              }
            : el,
        ),
      }));

    case 'DELETE_ELEMENT': {
      const next = updatePageInProject(state, action.pageId, (page) => {
        const filtered = page.elements.filter((el) => el.id !== action.elementId);
        return filtered.length === page.elements.length ? page : { ...page, elements: filtered };
      });
      if (next === state) {
        return state;
      }
      const nextIds = (state.selectedElementIds ?? []).filter((id) => id !== action.elementId);
      const nextPrimary =
        state.selectedElementId === action.elementId ? (nextIds[nextIds.length - 1] ?? null) : state.selectedElementId;
      return {
        ...next,
        selectedElementId: nextPrimary,
        selectedElementIds: nextIds,
      };
    }

    case 'DELETE_ELEMENTS': {
      if (action.elementIds.length === 0) {
        return state;
      }
      const toDelete = new Set(action.elementIds);
      const next = updatePageInProject(state, action.pageId, (page) => {
        const filtered = page.elements.filter((el) => !toDelete.has(el.id));
        return filtered.length === page.elements.length ? page : { ...page, elements: filtered };
      });
      if (next === state) {
        return state;
      }
      const nextIds = (state.selectedElementIds ?? []).filter((id) => !toDelete.has(id));
      const nextPrimary =
        state.selectedElementId && toDelete.has(state.selectedElementId)
          ? (nextIds[nextIds.length - 1] ?? null)
          : state.selectedElementId;
      return {
        ...next,
        selectedElementId: nextPrimary,
        selectedElementIds: nextIds,
      };
    }

    case 'SELECT_ELEMENT': {
      const targetPageId = action.pageId ?? state.activePageId;
      if (!state.project.canvases.some((page) => page.id === targetPageId)) {
        return state;
      }
      return {
        ...state,
        activePageId: targetPageId,
        selectedElementId: action.elementId,
        selectedElementIds: action.elementId ? [action.elementId] : [],
      };
    }

    case 'SELECT_ELEMENTS': {
      const targetPageId = action.pageId ?? state.activePageId;
      if (!state.project.canvases.some((page) => page.id === targetPageId)) {
        return state;
      }
      const uniqueIds = Array.from(new Set(action.elementIds));
      const primaryId =
        action.primaryId !== undefined
          ? action.primaryId
          : (uniqueIds[uniqueIds.length - 1] ?? null);
      return {
        ...state,
        activePageId: targetPageId,
        selectedElementId: primaryId,
        selectedElementIds: uniqueIds,
      };
    }

    case 'APPLY_CANVAS_PAGES': {
      if (action.pages.length === 0) {
        return state;
      }
      const nextCanvases = action.append
        ? [...state.project.canvases, ...action.pages]
        : action.pages;
      return {
        ...state,
        project: {
          ...state.project,
          canvases: nextCanvases,
          metadata: { ...state.project.metadata, updatedAt: new Date().toISOString() },
        },
        activePageId: action.activePageId ?? action.pages[0].id,
        selectedElementId: null,
        selectedElementIds: [],
        needsLayoutChooser: false,
        dirtySinceLastExport: true,
      };
    }

    case 'DISMISS_LAYOUT_CHOOSER':
      return state.needsLayoutChooser ? { ...state, needsLayoutChooser: false } : state;

    case 'REPLACE_PROJECT':
      return {
        project: action.project,
        activePageId: action.project.canvases[0]?.id ?? '',
        selectedElementId: null,
        selectedElementIds: [],
        dirtySinceLastExport: false,
        needsLayoutChooser: false,
      };

    case 'RESTORE_SNAPSHOT':
      return {
        ...state,
        project: action.project,
        activePageId: action.project.canvases.some((p) => p.id === action.activePageId)
          ? action.activePageId
          : (action.project.canvases[0]?.id ?? ''),
        selectedElementId: null,
        selectedElementIds: [],
        dirtySinceLastExport: true,
      };

    case 'MARK_EXPORTED':
      return state.dirtySinceLastExport ? { ...state, dirtySinceLastExport: false } : state;

    case 'RESET_PROJECT':
      return createInitialWorkspaceState(
        createEmptyProject(action.projectName, action.firstPageName),
      );

    default:
      return state;
  }
}
