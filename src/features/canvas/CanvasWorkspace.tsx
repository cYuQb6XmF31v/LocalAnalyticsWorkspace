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
  BarChart2,
  BarChart3,
  Columns3,
  Grid3x3,
  Hash,
  LayoutTemplate,
  LineChart,
  Maximize2,
  PieChart,
  ScatterChart,
  StickyNote,
  Table,
} from 'lucide-react';
import { useProject } from '../../app/ProjectContext';
import { createStableId } from '../../domain/id';
import type { CanvasElement, CanvasElementType, Dataset } from '../../domain/models';
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

function createDefaultElement(
  type: CanvasElementType,
  indexOffset: number,
  dataset: Dataset,
): CanvasElement {
  const offset = (indexOffset % 6) * 28;
  const basePos = { x: 60 + offset, y: 60 + offset };

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

  useEffect(() => {
    if (
      configElementId &&
      !activePage.elements.some((el) => el.id === configElementId)
    ) {
      setConfigElementId(null);
    }
  }, [activePage, configElementId]);

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
    const element = createDefaultElement(type, activePage.elements.length, dataset);
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
