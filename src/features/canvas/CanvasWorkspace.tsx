import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  BarChart3,
  Hash,
  LayoutTemplate,
  LineChart,
  Maximize2,
  StickyNote,
  Table,
} from 'lucide-react';
import { useProject } from '../../app/ProjectContext';
import { createStableId } from '../../domain/id';
import type { CanvasElement, CanvasElementType } from '../../domain/models';
import { uk } from '../../i18n/uk';
import { ElementConfigPanel } from './ElementConfigPanel';
import { ChartNode } from './nodes/ChartNode';
import type { CanvasFlowNode } from './nodes/ElementFrame';
import { KpiNode } from './nodes/KpiNode';
import { NoteNode } from './nodes/NoteNode';
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
  'table-view': TableViewNode,
};

function createDefaultElement(
  type: CanvasElementType,
  indexOffset: number,
  columnIds: string[],
  firstNumericId: string | null,
  firstTextOrDateId: string | null,
): CanvasElement {
  const offset = (indexOffset % 6) * 28;
  const basePos = { x: 60 + offset, y: 60 + offset };

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
        size: { width: 230, height: 145 },
        config: {
          title: 'Показник KPI',
          valueFieldId: firstNumericId ?? columnIds[0] ?? null,
          aggregation: firstNumericId ? 'sum' : 'count',
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
          xFieldId: firstTextOrDateId,
          yFieldId: firstNumericId ?? firstTextOrDateId,
          aggregation: firstNumericId ? 'sum' : 'count',
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
          xFieldId: firstTextOrDateId,
          yFieldId: firstNumericId ?? firstTextOrDateId,
          aggregation: firstNumericId ? 'sum' : 'count',
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

function CanvasInner({ onOpenTemplates }: CanvasWorkspaceProps) {
  const { state, dispatch } = useProject();
  const { fitView } = useReactFlow();
  const [configElementId, setConfigElementId] = useState<string | null>(null);
  const lastFocusedSelectionRef = useRef<string | null>(null);

  const activePage =
    state.project.canvases.find((p) => p.id === state.activePageId) ?? state.project.canvases[0];
  const dataset = state.project.primaryDataset;

  const handleOpenConfig = useCallback((elementId: string) => {
    setConfigElementId((prev) => (prev === elementId ? null : elementId));
  }, []);

  // Close config panel if the configured element was deleted or page changed
  useEffect(() => {
    if (
      configElementId &&
      !activePage.elements.some((el) => el.id === configElementId)
    ) {
      setConfigElementId(null);
    }
  }, [activePage, configElementId]);

  // Center/focus element when selected from the Navigator tree
  useEffect(() => {
    if (!state.selectedElementId || state.selectedElementId === lastFocusedSelectionRef.current) {
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

  const nodes = useMemo<CanvasFlowNode[]>(
    () =>
      activePage.elements.map((el) => ({
        id: el.id,
        type: el.type,
        position: el.position,
        width: el.size.width,
        height: el.size.height,
        style: { width: el.size.width, height: el.size.height },
        selected: el.id === state.selectedElementId,
        dragHandle: '.canvas-node-drag',
        data: {
          element: el,
          pageId: activePage.id,
          onConfigure: handleOpenConfig,
        },
      })),
    [activePage.elements, activePage.id, state.selectedElementId, handleOpenConfig],
  );

  const handleAddElement = (type: CanvasElementType) => {
    const columnIds = dataset.columns.map((c) => c.id);
    const firstNumeric = dataset.columns.find((c) => c.type === 'number')?.id ?? null;
    const firstX =
      dataset.columns.find((c) => c.type === 'date' || c.type === 'text')?.id ??
      columnIds[0] ??
      null;
    const element = createDefaultElement(
      type,
      activePage.elements.length,
      columnIds,
      firstNumeric,
      firstX,
    );
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

  const configElement = configElementId
    ? activePage.elements.find((el) => el.id === configElementId) ?? null
    : null;

  return (
    <div className="cw-root">
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
            onClick={() => handleAddElement('table-view')}
          >
            <Table size={13} />
            <span>{uk.canvas.addTable}</span>
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

      <div className="cw-surface">
        <ReactFlow
          key={activePage.id}
          nodes={nodes}
          edges={[]}
          nodeTypes={NODE_TYPES}
          defaultViewport={activePage.viewport}
          minZoom={0.25}
          maxZoom={2}
          onNodeClick={(_event, node) => {
            lastFocusedSelectionRef.current = node.id;
            dispatch({
              type: 'SELECT_ELEMENT',
              elementId: node.id,
              pageId: activePage.id,
            });
          }}
          onPaneClick={() => {
            lastFocusedSelectionRef.current = null;
            dispatch({
              type: 'SELECT_ELEMENT',
              elementId: null,
              pageId: activePage.id,
            });
            setConfigElementId(null);
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

        {configElement && (
          <ElementConfigPanel
            pageId={activePage.id}
            element={configElement}
            onClose={() => setConfigElementId(null)}
          />
        )}
      </div>
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
