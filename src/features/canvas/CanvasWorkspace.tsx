import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  NodeChangeset,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  BarChart2,
  BarChart3,
  Columns3,
  Copy,
  Crosshair,
  FilePlus,
  Grid3x3,
  Hash,
  LayoutTemplate,
  LineChart,
  Maximize2,
  PieChart,
  RotateCcw,
  ScatterChart,
  Settings2,
  StickyNote,
  Table,
  Trash2,
} from 'lucide-react';
import { useProject } from '../../app/ProjectContext';
import { createStableId } from '../../domain/id';
import type { CanvasElement, CanvasElementType, Dataset, Position } from '../../domain/models';
import { uk } from '../../i18n/uk';
import { ElementConfigPanel } from './ElementConfigPanel';
import { ChartNode } from './nodes/ChartNode';
import type { CanvasFlowNode } from './nodes/ElementFrame';
import { KanbanNode } from './nodes/KanbanNode';
import { KpiNode } from './nodes/KpiNode';
import { NoteNode } from './nodes/NoteNode';
import { PivotTableNode } from './nodes/PivotTableNode';
import { TableViewNode } from './nodes/TableViewNode';
import './CanvasWorkspace.css';

interface CanvasWorkspaceProps {
  onOpenTemplates: () => void;
}

const NODE_TYPES: NodeTypes = {
  note: NoteNode,
  kpi: KpiNode,
  'line-chart': ChartNode,
  'bar-chart': ChartNode,
  histogram: ChartNode,
  'pie-chart': ChartNode,
  'stacked-bar': ChartNode,
  scatter: ChartNode,
  'table-view': TableViewNode,
  kanban: KanbanNode,
  'pivot-table': PivotTableNode,
};

type ContextMenuState =
  | {
      kind: 'pane';
      screenX: number;
      screenY: number;
      flowPos: Position;
    }
  | {
      kind: 'node';
      screenX: number;
      screenY: number;
      element: CanvasElement;
    };

function createDefaultElement(
  type: CanvasElementType,
  indexOffset: number,
  dataset: Dataset,
  explicitPosition?: Position,
): CanvasElement {
  const offset = (indexOffset % 6) * 28;
  const basePos = explicitPosition
    ? { x: Math.round(explicitPosition.x), y: Math.round(explicitPosition.y) }
    : { x: 60 + offset, y: 60 + offset };

  const columnIds = dataset.columns.map((c) => c.id);
  const numericCols = dataset.columns.filter((c) => c.type === 'number').map((c) => c.id);
  const textCols = dataset.columns
    .filter((c) => c.type === 'text' || c.type === 'boolean')
    .map((c) => c.id);
  const dateCol = dataset.columns.find((c) => c.type === 'date')?.id ?? null;

  const firstNumeric = numericCols[0] ?? null;
  const secondNumeric = numericCols[1] ?? firstNumeric;
  const firstCategory = textCols[0] ?? columnIds[0] ?? null;
  const secondCategory = textCols[1] ?? columnIds[1] ?? firstCategory;
  const firstX = dateCol ?? firstCategory;

  switch (type) {
    case 'note':
      return {
        id: createStableId('el'),
        type: 'note',
        position: basePos,
        size: { width: 260, height: 160 },
        config: { title: 'Нотатка', content: '' },
      };
    case 'kpi':
      return {
        id: createStableId('el'),
        type: 'kpi',
        position: basePos,
        size: { width: 230, height: 155 },
        config: {
          title: 'Показник KPI',
          valueFieldId: firstNumeric ?? columnIds[0] ?? null,
          aggregation: firstNumeric ? 'sum' : 'count',
          showSparkline: false,
          sparklineOrderFieldId: dateCol,
        },
      };
    case 'line-chart':
      return {
        id: createStableId('el'),
        type: 'line-chart',
        position: basePos,
        size: { width: 420, height: 260 },
        config: {
          title: 'Лінійний графік',
          xFieldId: firstX,
          yFieldId: firstNumeric ?? firstX,
          aggregation: firstNumeric ? 'sum' : 'count',
        },
      };
    case 'bar-chart':
      return {
        id: createStableId('el'),
        type: 'bar-chart',
        position: basePos,
        size: { width: 420, height: 260 },
        config: {
          title: 'Стовпчиковий графік',
          xFieldId: firstX,
          yFieldId: firstNumeric ?? firstX,
          aggregation: firstNumeric ? 'sum' : 'count',
        },
      };
    case 'histogram':
      return {
        id: createStableId('el'),
        type: 'histogram',
        position: basePos,
        size: { width: 400, height: 250 },
        config: {
          title: 'Гістограма розподілу',
          valueFieldId: firstNumeric,
          binCount: 8,
        },
      };
    case 'pie-chart':
      return {
        id: createStableId('el'),
        type: 'pie-chart',
        position: basePos,
        size: { width: 340, height: 270 },
        config: {
          title: 'Кругова діаграма',
          categoryFieldId: firstCategory,
          valueFieldId: firstNumeric ?? firstCategory,
          aggregation: firstNumeric ? 'sum' : 'count',
          isDonut: true,
        },
      };
    case 'stacked-bar':
      return {
        id: createStableId('el'),
        type: 'stacked-bar',
        position: basePos,
        size: { width: 440, height: 280 },
        config: {
          title: 'Складений графік',
          xFieldId: firstX,
          seriesFieldId: secondCategory,
          yFieldId: firstNumeric ?? firstCategory,
          aggregation: firstNumeric ? 'sum' : 'count',
        },
      };
    case 'scatter':
      return {
        id: createStableId('el'),
        type: 'scatter',
        position: basePos,
        size: { width: 400, height: 270 },
        config: {
          title: 'Точкова діаграма',
          xFieldId: firstNumeric,
          yFieldId: secondNumeric,
          labelFieldId: firstCategory,
        },
      };
    case 'kanban':
      return {
        id: createStableId('el'),
        type: 'kanban',
        position: basePos,
        size: { width: 580, height: 320 },
        config: {
          title: 'Kanban-дошка',
          groupByFieldId: firstCategory,
          titleFieldId: secondCategory,
          detailFieldIds: firstNumeric ? [firstNumeric] : [],
        },
      };
    case 'pivot-table':
      return {
        id: createStableId('el'),
        type: 'pivot-table',
        position: basePos,
        size: { width: 480, height: 280 },
        config: {
          title: 'Зведена таблиця',
          rowFieldId: firstCategory,
          colFieldId: secondCategory !== firstCategory ? secondCategory : null,
          valueFieldId: firstNumeric ?? firstCategory,
          aggregation: firstNumeric ? 'sum' : 'count',
        },
      };
    case 'table-view':
      return {
        id: createStableId('el'),
        type: 'table-view',
        position: basePos,
        size: { width: 460, height: 260 },
        config: {
          title: 'Перегляд таблиці',
          columnIds: columnIds.slice(0, 6),
          maxRows: 50,
        },
      };
  }
}

function buildFlowNodes(
  elements: CanvasElement[],
  pageId: string,
  selectedElementId: string | null,
  onConfigure: (elementId: string) => void,
): CanvasFlowNode[] {
  return elements.map((el) => ({
    id: el.id,
    type: el.type,
    position: el.position,
    width: el.size.width,
    height: el.size.height,
    style: { width: el.size.width, height: el.size.height },
    selected: el.id === selectedElementId,
    dragHandle: '.canvas-node-drag',
    data: {
      element: el,
      pageId,
      onConfigure,
    },
  }));
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

function clampMenuPosition(x: number, y: number): { left: number; top: number } {
  if (typeof window === 'undefined') {
    return { left: x, top: y };
  }
  return {
    left: Math.max(8, Math.min(x, window.innerWidth - 250)),
    top: Math.max(8, Math.min(y, window.innerHeight - 360)),
  };
}

function CanvasInner({ onOpenTemplates }: CanvasWorkspaceProps) {
  const { state, dispatch } = useProject();
  const { fitView, screenToFlowPosition, setViewport, zoomIn, zoomOut } = useReactFlow();
  const [configElementId, setConfigElementId] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<Position | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const lastFocusedSelectionRef = useRef<string | null>(null);

  const activePage =
    state.project.canvases.find((p) => p.id === state.activePageId) ?? state.project.canvases[0];
  const dataset = state.project.primaryDataset;

  const handleOpenConfig = useCallback((elementId: string) => {
    setConfigElementId((prev) => (prev === elementId ? null : elementId));
  }, []);

  const [flowNodes, setFlowNodes] = useState<CanvasFlowNode[]>(() =>
    buildFlowNodes(
      activePage.elements,
      activePage.id,
      state.selectedElementId,
      handleOpenConfig,
    ),
  );

  // Sync authoritative project model into React Flow nodes whenever elements/selection change
  useEffect(() => {
    setFlowNodes(
      buildFlowNodes(
        activePage.elements,
        activePage.id,
        state.selectedElementId,
        handleOpenConfig,
      ),
    );
  }, [activePage.elements, activePage.id, state.selectedElementId, handleOpenConfig]);

  // Apply real-time drag and resize changes inside React Flow state
  const handleNodesChange = useCallback((changes: NodeChangeset<CanvasFlowNode>) => {
    setFlowNodes((prev) => {
      const updated = changes.applyTo(prev);
      const changeArray = changes.toArray();
      return updated.map((node) => {
        const dimChange = changeArray.find(
          (c) => c.type === 'dimensions' && c.id === node.id,
        );
        if (dimChange && dimChange.type === 'dimensions' && dimChange.dimensions) {
          return {
            ...node,
            width: dimChange.dimensions.width,
            height: dimChange.dimensions.height,
            style: {
              ...node.style,
              width: dimChange.dimensions.width,
              height: dimChange.dimensions.height,
            },
          };
        }
        return node;
      });
    });
  }, []);

  useEffect(() => {
    if (
      configElementId &&
      !activePage.elements.some((el) => el.id === configElementId)
    ) {
      setConfigElementId(null);
    }
  }, [activePage, configElementId]);

  useEffect(() => {
    if (!state.selectedElementId) {
      lastFocusedSelectionRef.current = null;
      return;
    }
    if (state.selectedElementId === lastFocusedSelectionRef.current) {
      return;
    }
    const existsOnPage = activePage.elements.some((el) => el.id === state.selectedElementId);
    if (!existsOnPage) {
      return;
    }
    lastFocusedSelectionRef.current = state.selectedElementId;
    const timer = window.setTimeout(() => {
      fitView({
        nodes: [{ id: state.selectedElementId! }],
        padding: 0.45,
        duration: 220,
        maxZoom: 1.15,
      });
    }, 30);
    return () => window.clearTimeout(timer);
  }, [state.selectedElementId, activePage.elements, fitView]);

  // Close custom context menu on outside click or Escape
  useEffect(() => {
    if (!contextMenu) {
      return;
    }
    const closeMenu = () => setContextMenu(null);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null);
      }
    };
    window.addEventListener('pointerdown', closeMenu);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('keydown', handleKey);
    };
  }, [contextMenu]);

  const handleAddElement = (type: CanvasElementType, explicitPosition?: Position) => {
    const element = createDefaultElement(
      type,
      activePage.elements.length,
      dataset,
      explicitPosition,
    );
    lastFocusedSelectionRef.current = element.id;
    dispatch({
      type: 'ADD_ELEMENT',
      pageId: activePage.id,
      element,
      select: true,
    });
    if (type !== 'note') {
      setConfigElementId(element.id);
    }
  };

  const handleDuplicateElement = (element: CanvasElement) => {
    const copy: CanvasElement = {
      ...element,
      id: createStableId('el'),
      position: {
        x: element.position.x + 28,
        y: element.position.y + 28,
      },
      config: {
        ...element.config,
        title: `${element.config.title} (копія)`,
      },
    } as CanvasElement;

    lastFocusedSelectionRef.current = copy.id;
    dispatch({
      type: 'ADD_ELEMENT',
      pageId: activePage.id,
      element: copy,
      select: true,
    });
  };

  const handleNodesDelete = useCallback(
    (deletedNodes: CanvasFlowNode[]) => {
      for (const node of deletedNodes) {
        dispatch({
          type: 'DELETE_ELEMENT',
          pageId: activePage.id,
          elementId: node.id,
        });
      }
    },
    [activePage.id, dispatch],
  );

  const handleSurfaceKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Delete' || !state.selectedElementId) {
      return;
    }
    if (isEditableTarget(event.target)) {
      return;
    }
    event.preventDefault();
    dispatch({
      type: 'DELETE_ELEMENT',
      pageId: activePage.id,
      elementId: state.selectedElementId,
    });
  };

  const selectedFlowNode = state.selectedElementId
    ? flowNodes.find((n) => n.id === state.selectedElementId) ?? null
    : null;

  const selectedNodeWidth = selectedFlowNode
    ? Number(selectedFlowNode.width ?? selectedFlowNode.style?.width ?? 0)
    : 0;
  const selectedNodeHeight = selectedFlowNode
    ? Number(selectedFlowNode.height ?? selectedFlowNode.style?.height ?? 0)
    : 0;
  const selectedCenter =
    selectedFlowNode && selectedNodeWidth > 0 && selectedNodeHeight > 0
      ? {
          x: Math.round(selectedFlowNode.position.x + selectedNodeWidth / 2),
          y: Math.round(selectedFlowNode.position.y + selectedNodeHeight / 2),
          w: Math.round(selectedNodeWidth),
          h: Math.round(selectedNodeHeight),
        }
      : null;

  const configElement = configElementId
    ? activePage.elements.find((el) => el.id === configElementId) ?? null
    : null;

  const menuCoords = contextMenu ? clampMenuPosition(contextMenu.screenX, contextMenu.screenY) : null;

  // Ctrl+wheel anywhere on canvas surface → zoom viewport
  const handleSurfaceWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          zoomIn({ duration: 150 });
        } else {
          zoomOut({ duration: 150 });
        }
      }
    },
    [zoomIn, zoomOut],
  );

  return (
    <div className="cw-root" onKeyDown={handleSurfaceKeyDown}>
      <div className="cw-toolbar">
        <div className="cw-toolbar-group">
          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            onClick={() => handleAddElement('note')}
          >
            <StickyNote size={13} />
            <span>{uk.canvas.addNote}</span>
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            onClick={() => handleAddElement('kpi')}
          >
            <Hash size={13} />
            <span>{uk.canvas.addKpi}</span>
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            onClick={() => handleAddElement('line-chart')}
          >
            <LineChart size={13} />
            <span>{uk.canvas.addLine}</span>
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            onClick={() => handleAddElement('bar-chart')}
          >
            <BarChart3 size={13} />
            <span>{uk.canvas.addBar}</span>
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            onClick={() => handleAddElement('histogram')}
          >
            <BarChart2 size={13} />
            <span>{uk.canvas.addHistogram}</span>
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            onClick={() => handleAddElement('pie-chart')}
          >
            <PieChart size={13} />
            <span>{uk.canvas.addPie}</span>
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            onClick={() => handleAddElement('stacked-bar')}
          >
            <BarChart3 size={13} />
            <span>{uk.canvas.addStackedBar}</span>
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            onClick={() => handleAddElement('scatter')}
          >
            <ScatterChart size={13} />
            <span>{uk.canvas.addScatter}</span>
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            onClick={() => handleAddElement('table-view')}
          >
            <Table size={13} />
            <span>{uk.canvas.addTable}</span>
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            onClick={() => handleAddElement('pivot-table')}
          >
            <Grid3x3 size={13} />
            <span>{uk.canvas.addPivot}</span>
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            onClick={() => handleAddElement('kanban')}
          >
            <Columns3 size={13} />
            <span>{uk.canvas.addKanban}</span>
          </button>
        </div>

        <div className="cw-toolbar-group">
          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            onClick={onOpenTemplates}
          >
            <LayoutTemplate size={13} />
            <span>{uk.canvas.templatesBtn}</span>
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            onClick={() => fitView({ padding: 0.25, duration: 220 })}
            title={uk.canvas.fitView}
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      <div
        className="cw-surface"
        onPointerMove={(event) => {
          const flowPoint = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          });
          setCursorPos({
            x: Math.round(flowPoint.x),
            y: Math.round(flowPoint.y),
          });
        }}
        onPointerLeave={() => setCursorPos(null)}
        onWheel={handleSurfaceWheel}
      >
        <ReactFlow
          key={activePage.id}
          nodes={flowNodes}
          edges={[]}
          nodeTypes={NODE_TYPES}
          defaultViewport={activePage.viewport}
          minZoom={0.25}
          maxZoom={2}
          deleteKeyCode="Delete"
          onNodesChange={handleNodesChange}
          onNodesDelete={handleNodesDelete}
          onNodeClick={(_event, node) => {
            setContextMenu(null);
            lastFocusedSelectionRef.current = node.id;
            dispatch({
              type: 'SELECT_ELEMENT',
              elementId: node.id,
              pageId: activePage.id,
            });
          }}
          onPaneClick={() => {
            setContextMenu(null);
            lastFocusedSelectionRef.current = null;
            dispatch({
              type: 'SELECT_ELEMENT',
              elementId: null,
              pageId: activePage.id,
            });
            setConfigElementId(null);
          }}
          onPaneContextMenu={(event) => {
            event.preventDefault();
            const flowPos = screenToFlowPosition({
              x: event.clientX,
              y: event.clientY,
            });
            setContextMenu({
              kind: 'pane',
              screenX: event.clientX,
              screenY: event.clientY,
              flowPos,
            });
          }}
          onNodeContextMenu={(event, node) => {
            event.preventDefault();
            lastFocusedSelectionRef.current = node.id;
            dispatch({
              type: 'SELECT_ELEMENT',
              elementId: node.id,
              pageId: activePage.id,
            });
            setContextMenu({
              kind: 'node',
              screenX: event.clientX,
              screenY: event.clientY,
              element: node.data.element,
            });
          }}
          onNodeDragStop={(_event, node) => {
            dispatch({
              type: 'MOVE_ELEMENT',
              pageId: activePage.id,
              elementId: node.id,
              position: {
                x: Math.round(node.position.x),
                y: Math.round(node.position.y),
              },
            });
          }}
          onMoveEnd={(_event, viewport) => {
            dispatch({
              type: 'SET_PAGE_VIEWPORT',
              pageId: activePage.id,
              viewport: {
                x: Math.round(viewport.x * 100) / 100,
                y: Math.round(viewport.y * 100) / 100,
                zoom: Math.round(viewport.zoom * 1000) / 1000,
              },
            });
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.1)" />
          <Controls showInteractive={false} />
        </ReactFlow>

        {activePage.elements.length === 0 && (
          <div className="cw-empty-hint">
            <div className="placeholder-card">
              <h1 className="placeholder-title">{activePage.name}</h1>
              <p className="placeholder-text">{uk.canvas.emptyPageText}</p>
              <div className="sd-empty-actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={onOpenTemplates}
                >
                  <LayoutTemplate size={14} />
                  <span>{uk.canvas.templatesBtn}</span>
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => handleAddElement('kpi')}
                >
                  <Hash size={14} />
                  <span>{uk.canvas.addKpi}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="cw-hud" aria-live="off">
          <span>
            Курсор: {cursorPos ? `X ${cursorPos.x} · Y ${cursorPos.y}` : '—'}
          </span>
          {selectedCenter && (
            <>
              <span className="cw-hud-sep" aria-hidden="true" />
              <span className="cw-hud-highlight">
                Центр: X {selectedCenter.x} · Y {selectedCenter.y} ({selectedCenter.w}×
                {selectedCenter.h})
              </span>
            </>
          )}
        </div>

        {configElement && (
          <ElementConfigPanel
            pageId={activePage.id}
            element={configElement}
            onClose={() => setConfigElementId(null)}
          />
        )}
      </div>

      {contextMenu && menuCoords && (
        <div
          className="cw-context-menu"
          style={{ left: `${menuCoords.left}px`, top: `${menuCoords.top}px` }}
          role="menu"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {contextMenu.kind === 'pane' ? (
            <>
              <div className="cw-context-section-label">Додати тут</div>
              <button
                type="button"
                className="cw-context-item"
                role="menuitem"
                onClick={() => {
                  handleAddElement('note', contextMenu.flowPos);
                  setContextMenu(null);
                }}
              >
                <span className="cw-context-item-left">
                  <StickyNote size={13} />
                  <span>Нотатка</span>
                </span>
              </button>
              <button
                type="button"
                className="cw-context-item"
                role="menuitem"
                onClick={() => {
                  handleAddElement('kpi', contextMenu.flowPos);
                  setContextMenu(null);
                }}
              >
                <span className="cw-context-item-left">
                  <Hash size={13} />
                  <span>KPI-картка</span>
                </span>
              </button>
              <button
                type="button"
                className="cw-context-item"
                role="menuitem"
                onClick={() => {
                  handleAddElement('line-chart', contextMenu.flowPos);
                  setContextMenu(null);
                }}
              >
                <span className="cw-context-item-left">
                  <LineChart size={13} />
                  <span>Лінійний графік</span>
                </span>
              </button>
              <button
                type="button"
                className="cw-context-item"
                role="menuitem"
                onClick={() => {
                  handleAddElement('bar-chart', contextMenu.flowPos);
                  setContextMenu(null);
                }}
              >
                <span className="cw-context-item-left">
                  <BarChart3 size={13} />
                  <span>Стовпчиковий графік</span>
                </span>
              </button>
              <button
                type="button"
                className="cw-context-item"
                role="menuitem"
                onClick={() => {
                  handleAddElement('pie-chart', contextMenu.flowPos);
                  setContextMenu(null);
                }}
              >
                <span className="cw-context-item-left">
                  <PieChart size={13} />
                  <span>Кругова діаграма</span>
                </span>
              </button>
              <button
                type="button"
                className="cw-context-item"
                role="menuitem"
                onClick={() => {
                  handleAddElement('kanban', contextMenu.flowPos);
                  setContextMenu(null);
                }}
              >
                <span className="cw-context-item-left">
                  <Columns3 size={13} />
                  <span>Kanban-дошка</span>
                </span>
              </button>
              <button
                type="button"
                className="cw-context-item"
                role="menuitem"
                onClick={() => {
                  handleAddElement('pivot-table', contextMenu.flowPos);
                  setContextMenu(null);
                }}
              >
                <span className="cw-context-item-left">
                  <Grid3x3 size={13} />
                  <span>Зведена таблиця</span>
                </span>
              </button>
              <button
                type="button"
                className="cw-context-item"
                role="menuitem"
                onClick={() => {
                  handleAddElement('table-view', contextMenu.flowPos);
                  setContextMenu(null);
                }}
              >
                <span className="cw-context-item-left">
                  <Table size={13} />
                  <span>Таблиця перегляду</span>
                </span>
              </button>

              <div className="cw-context-divider" />
              <div className="cw-context-section-label">Полотно</div>

              <button
                type="button"
                className="cw-context-item"
                role="menuitem"
                onClick={() => {
                  fitView({ padding: 0.25, duration: 220 });
                  setContextMenu(null);
                }}
              >
                <span className="cw-context-item-left">
                  <Maximize2 size={13} />
                  <span>Вписати в екран</span>
                </span>
              </button>
              <button
                type="button"
                className="cw-context-item"
                role="menuitem"
                onClick={() => {
                  setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 200 });
                  dispatch({
                    type: 'SET_PAGE_VIEWPORT',
                    pageId: activePage.id,
                    viewport: { x: 0, y: 0, zoom: 1 },
                  });
                  setContextMenu(null);
                }}
              >
                <span className="cw-context-item-left">
                  <RotateCcw size={13} />
                  <span>Скинути масштаб (100%)</span>
                </span>
              </button>
              <button
                type="button"
                className="cw-context-item"
                role="menuitem"
                onClick={() => {
                  setContextMenu(null);
                  onOpenTemplates();
                }}
              >
                <span className="cw-context-item-left">
                  <LayoutTemplate size={13} />
                  <span>Обрати шаблон</span>
                </span>
              </button>
              <button
                type="button"
                className="cw-context-item"
                role="menuitem"
                onClick={() => {
                  dispatch({
                    type: 'ADD_PAGE',
                    name: `Сторінка ${state.project.canvases.length + 1}`,
                    activate: true,
                  });
                  setContextMenu(null);
                }}
              >
                <span className="cw-context-item-left">
                  <FilePlus size={13} />
                  <span>Нова сторінка Canvas</span>
                </span>
              </button>
            </>
          ) : (
            <>
              <div className="cw-context-section-label">
                {contextMenu.element.config.title || 'Елемент'}
              </div>
              <button
                type="button"
                className="cw-context-item"
                role="menuitem"
                onClick={() => {
                  setConfigElementId(contextMenu.element.id);
                  setContextMenu(null);
                }}
              >
                <span className="cw-context-item-left">
                  <Settings2 size={13} />
                  <span>Налаштувати</span>
                </span>
              </button>
              <button
                type="button"
                className="cw-context-item"
                role="menuitem"
                onClick={() => {
                  handleDuplicateElement(contextMenu.element);
                  setContextMenu(null);
                }}
              >
                <span className="cw-context-item-left">
                  <Copy size={13} />
                  <span>Дублювати</span>
                </span>
              </button>
              <button
                type="button"
                className="cw-context-item"
                role="menuitem"
                onClick={() => {
                  fitView({
                    nodes: [{ id: contextMenu.element.id }],
                    padding: 0.45,
                    duration: 220,
                    maxZoom: 1.15,
                  });
                  setContextMenu(null);
                }}
              >
                <span className="cw-context-item-left">
                  <Crosshair size={13} />
                  <span>Центрувати на елементі</span>
                </span>
              </button>
              <div className="cw-context-divider" />
              <button
                type="button"
                className="cw-context-item cw-context-item--danger"
                role="menuitem"
                onClick={() => {
                  dispatch({
                    type: 'DELETE_ELEMENT',
                    pageId: activePage.id,
                    elementId: contextMenu.element.id,
                  });
                  setContextMenu(null);
                }}
              >
                <span className="cw-context-item-left">
                  <Trash2 size={13} />
                  <span>Видалити</span>
                </span>
                <span className="cw-context-kbd">Del</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function CanvasWorkspace(props: CanvasWorkspaceProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
