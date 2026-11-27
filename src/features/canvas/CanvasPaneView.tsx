import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  NodeChangeset,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  ViewportPortal,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
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
  Settings2,
  StickyNote,
  Table,
  Trash2,
} from 'lucide-react';
import { useProject } from '../../app/ProjectContext';
import { createStableId } from '../../domain/id';
import type {
  CanvasElement,
  CanvasElementType,
  CanvasPage,
  Dataset,
  Position,
} from '../../domain/models';
import { uk } from '../../i18n/uk';
import { CanvasSnapContext, type ResizeRect } from './canvasSnapContext';
import { ChartNode } from './nodes/ChartNode';
import type { CanvasFlowNode } from './nodes/ElementFrame';
import { KanbanNode } from './nodes/KanbanNode';
import { KpiNode } from './nodes/KpiNode';
import { NoteNode } from './nodes/NoteNode';
import { PivotTableNode } from './nodes/PivotTableNode';
import { TableViewNode } from './nodes/TableViewNode';

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

interface SnapGuideLine {
  orientation: 'vertical' | 'horizontal';
  pos: number;
  start: number;
  end: number;
  label: string;
}

interface SnapResult {
  snappedPosition: Position;
  guides: SnapGuideLine[];
  relativeLabel: string | null;
  relativePos: Position | null;
}

const SNAP_THRESHOLD = 8;

function computeSnapAndGuides(
  draggedId: string,
  rawPos: Position,
  draggedSize: { width: number; height: number },
  otherNodes: CanvasFlowNode[],
): SnapResult {
  const w = draggedSize.width;
  const h = draggedSize.height;

  const xAnchors = [
    { offset: 0, value: rawPos.x },
    { offset: w / 2, value: rawPos.x + w / 2 },
    { offset: w, value: rawPos.x + w },
  ];
  const yAnchors = [
    { offset: 0, value: rawPos.y },
    { offset: h / 2, value: rawPos.y + h / 2 },
    { offset: h, value: rawPos.y + h },
  ];

  let bestDx = SNAP_THRESHOLD + 1;
  let bestSnappedX = rawPos.x;
  let matchedXTarget: { pos: number; otherTop: number; otherBottom: number; otherLeft: number } | null = null;

  let bestDy = SNAP_THRESHOLD + 1;
  let bestSnappedY = rawPos.y;
  let matchedYTarget: { pos: number; otherLeft: number; otherRight: number; otherTop: number } | null = null;

  let nearestNode: { node: CanvasFlowNode; dist: number; ow: number; oh: number } | null = null;

  for (const other of otherNodes) {
    if (other.id === draggedId) {
      continue;
    }
    const ow = Number(other.width ?? other.style?.width ?? 200);
    const oh = Number(other.height ?? other.style?.height ?? 140);
    const ox = other.position.x;
    const oy = other.position.y;

    const dist = Math.hypot(ox + ow / 2 - (rawPos.x + w / 2), oy + oh / 2 - (rawPos.y + h / 2));
    if (!nearestNode || dist < nearestNode.dist) {
      nearestNode = { node: other, dist, ow, oh };
    }

    const otherXs = [ox, ox + ow / 2, ox + ow];
    for (const anchor of xAnchors) {
      for (const tx of otherXs) {
        const diff = Math.abs(anchor.value - tx);
        if (diff < bestDx) {
          bestDx = diff;
          bestSnappedX = tx - anchor.offset;
          matchedXTarget = { pos: tx, otherTop: oy, otherBottom: oy + oh, otherLeft: ox };
        }
      }
    }

    const otherYs = [oy, oy + oh / 2, oy + oh];
    for (const anchor of yAnchors) {
      for (const ty of otherYs) {
        const diff = Math.abs(anchor.value - ty);
        if (diff < bestDy) {
          bestDy = diff;
          bestSnappedY = ty - anchor.offset;
          matchedYTarget = { pos: ty, otherLeft: ox, otherRight: ox + ow, otherTop: oy };
        }
      }
    }
  }

  const finalX = bestDx <= SNAP_THRESHOLD ? Math.round(bestSnappedX) : Math.round(rawPos.x);
  const finalY = bestDy <= SNAP_THRESHOLD ? Math.round(bestSnappedY) : Math.round(rawPos.y);

  const guides: SnapGuideLine[] = [];
  if (bestDx <= SNAP_THRESHOLD && matchedXTarget) {
    guides.push({
      orientation: 'vertical',
      pos: matchedXTarget.pos,
      start: Math.min(finalY, matchedXTarget.otherTop) - 16,
      end: Math.max(finalY + h, matchedXTarget.otherBottom) + 16,
      label: `X ${Math.round(matchedXTarget.pos)}`,
    });
  }
  if (bestDy <= SNAP_THRESHOLD && matchedYTarget) {
    guides.push({
      orientation: 'horizontal',
      pos: matchedYTarget.pos,
      start: Math.min(finalX, matchedYTarget.otherLeft) - 16,
      end: Math.max(finalX + w, matchedYTarget.otherRight) + 16,
      label: `Y ${Math.round(matchedYTarget.pos)}`,
    });
  }

  let relativeLabel: string | null = null;
  let relativePos: Position | null = null;
  if (nearestNode) {
    const ox = Math.round(nearestNode.node.position.x);
    const oy = Math.round(nearestNode.node.position.y);
    const gapX =
      finalX >= ox + nearestNode.ow
        ? finalX - (ox + nearestNode.ow)
        : ox >= finalX + w
          ? ox - (finalX + w)
          : finalX - ox;
    const gapY =
      finalY >= oy + nearestNode.oh
        ? finalY - (oy + nearestNode.oh)
        : oy >= finalY + h
          ? oy - (finalY + h)
          : finalY - oy;
    relativeLabel = `ΔX ${gapX >= 0 ? `+${gapX}` : gapX} · ΔY ${gapY >= 0 ? `+${gapY}` : gapY}`;
    relativePos = { x: finalX, y: finalY - 22 };
  }

  return {
    snappedPosition: { x: finalX, y: finalY },
    guides,
    relativeLabel,
    relativePos,
  };
}

function computeResizeSnap(
  resizedId: string,
  raw: ResizeRect,
  orig: ResizeRect,
  otherNodes: CanvasFlowNode[],
): { rect: ResizeRect; guides: SnapGuideLine[]; badge: { label: string; pos: Position } | null } {
  const leftMoved = Math.abs(raw.x - orig.x) > 0.5;
  const topMoved = Math.abs(raw.y - orig.y) > 0.5;

  const rawLeft = raw.x;
  const rawRight = raw.x + raw.width;
  const rawTop = raw.y;
  const rawBottom = raw.y + raw.height;

  let bestDx = SNAP_THRESHOLD + 1;
  let snappedX = raw.x;
  let snappedW = raw.width;
  let matchedX: { pos: number; otherTop: number; otherBottom: number } | null = null;

  let bestDy = SNAP_THRESHOLD + 1;
  let snappedY = raw.y;
  let snappedH = raw.height;
  let matchedY: { pos: number; otherLeft: number; otherRight: number } | null = null;

  for (const other of otherNodes) {
    if (other.id === resizedId) {
      continue;
    }
    const ow = Number(other.width ?? other.style?.width ?? 200);
    const oh = Number(other.height ?? other.style?.height ?? 140);
    const ox = other.position.x;
    const oy = other.position.y;

    const otherXs = [ox, ox + ow / 2, ox + ow];
    for (const tx of otherXs) {
      if (leftMoved) {
        const diff = Math.abs(rawLeft - tx);
        const candidateW = rawRight - tx;
        if (diff < bestDx && candidateW >= 180) {
          bestDx = diff;
          snappedX = tx;
          snappedW = candidateW;
          matchedX = { pos: tx, otherTop: oy, otherBottom: oy + oh };
        }
      } else {
        const diff = Math.abs(rawRight - tx);
        const candidateW = tx - rawLeft;
        if (diff < bestDx && candidateW >= 180) {
          bestDx = diff;
          snappedX = rawLeft;
          snappedW = candidateW;
          matchedX = { pos: tx, otherTop: oy, otherBottom: oy + oh };
        }
      }
    }

    const otherYs = [oy, oy + oh / 2, oy + oh];
    for (const ty of otherYs) {
      if (topMoved) {
        const diff = Math.abs(rawTop - ty);
        const candidateH = rawBottom - ty;
        if (diff < bestDy && candidateH >= 110) {
          bestDy = diff;
          snappedY = ty;
          snappedH = candidateH;
          matchedY = { pos: ty, otherLeft: ox, otherRight: ox + ow };
        }
      } else {
        const diff = Math.abs(rawBottom - ty);
        const candidateH = ty - rawTop;
        if (diff < bestDy && candidateH >= 110) {
          bestDy = diff;
          snappedY = rawTop;
          snappedH = candidateH;
          matchedY = { pos: ty, otherLeft: ox, otherRight: ox + ow };
        }
      }
    }
  }

  const finalRect: ResizeRect = {
    x: Math.round(bestDx <= SNAP_THRESHOLD ? snappedX : raw.x),
    y: Math.round(bestDy <= SNAP_THRESHOLD ? snappedY : raw.y),
    width: Math.max(180, Math.round(bestDx <= SNAP_THRESHOLD ? snappedW : raw.width)),
    height: Math.max(110, Math.round(bestDy <= SNAP_THRESHOLD ? snappedH : raw.height)),
  };

  const guides: SnapGuideLine[] = [];
  if (bestDx <= SNAP_THRESHOLD && matchedX) {
    guides.push({
      orientation: 'vertical',
      pos: matchedX.pos,
      start: Math.min(finalRect.y, matchedX.otherTop) - 16,
      end: Math.max(finalRect.y + finalRect.height, matchedX.otherBottom) + 16,
      label: `X ${Math.round(matchedX.pos)}`,
    });
  }
  if (bestDy <= SNAP_THRESHOLD && matchedY) {
    guides.push({
      orientation: 'horizontal',
      pos: matchedY.pos,
      start: Math.min(finalRect.x, matchedY.otherLeft) - 16,
      end: Math.max(finalRect.x + finalRect.width, matchedY.otherRight) + 16,
      label: `Y ${Math.round(matchedY.pos)}`,
    });
  }

  const badge = {
    label: `${finalRect.width}×${finalRect.height}`,
    pos: { x: finalRect.x, y: finalRect.y - 22 },
  };

  return { rect: finalRect, guides, badge };
}

export function createDefaultElement(
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

export function isEditableTarget(target: EventTarget | null): boolean {
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

function buildFlowNodes(
  elements: CanvasElement[],
  pageId: string,
  selectedElementIds: string[],
  onConfigure: (elementId: string) => void,
): CanvasFlowNode[] {
  const selectedSet = new Set(selectedElementIds);
  return elements.map((el) => ({
    id: el.id,
    type: el.type,
    position: el.position,
    width: el.size.width,
    height: el.size.height,
    style: { width: el.size.width, height: el.size.height },
    selected: selectedSet.has(el.id),
    dragHandle: '.canvas-node-drag',
    data: {
      element: el,
      pageId,
      onConfigure,
    },
  }));
}

export interface CanvasPaneHandle {
  fitView: () => void;
  resetViewport: () => void;
}

interface CanvasPaneViewProps {
  page: CanvasPage;
  snapEnabled: boolean;
  autoConfigOnSelect: boolean;
  lastFocusedSelectionRef: MutableRefObject<string | null>;
  onFocusPane: () => void;
  onConfigureElement: (pageId: string, elementId: string | null, toggle?: boolean) => void;
  onAddElement: (pageId: string, type: CanvasElementType, explicitPosition?: Position) => void;
  onDuplicateElement: (pageId: string, element: CanvasElement) => void;
  onOpenTemplates: () => void;
}

const CanvasPaneInner = forwardRef<CanvasPaneHandle, CanvasPaneViewProps>(function CanvasPaneInner(
  {
    page,
    snapEnabled,
    autoConfigOnSelect,
    lastFocusedSelectionRef,
    onFocusPane,
    onConfigureElement,
    onAddElement,
    onDuplicateElement,
    onOpenTemplates,
  },
  ref,
) {
  const { state, dispatch } = useProject();
  const { fitView, screenToFlowPosition, setViewport, getViewport } = useReactFlow();
  const [cursorPos, setCursorPos] = useState<Position | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuideLine[]>([]);
  const [relativeBadge, setRelativeBadge] = useState<{ label: string; pos: Position } | null>(null);

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const snappedPosRef = useRef<Record<string, Position>>({});
  const snappedResizeRef = useRef<Record<string, ResizeRect>>({});

  useImperativeHandle(ref, () => ({
    fitView: () => {
      fitView({ padding: 0.25, duration: 220 });
    },
    resetViewport: () => {
      setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 200 });
      dispatch({
        type: 'SET_PAGE_VIEWPORT',
        pageId: page.id,
        viewport: { x: 0, y: 0, zoom: 1 },
      });
    },
  }));

  const selectedIds =
    state.selectedElementIds && state.selectedElementIds.length > 0
      ? state.selectedElementIds
      : state.selectedElementId
        ? [state.selectedElementId]
        : [];

  const handleOpenConfig = useCallback(
    (elementId: string) => {
      onFocusPane();
      onConfigureElement(page.id, elementId, true);
    },
    [onFocusPane, onConfigureElement, page.id],
  );

  const [flowNodes, setFlowNodes] = useState<CanvasFlowNode[]>(() =>
    buildFlowNodes(page.elements, page.id, selectedIds, handleOpenConfig),
  );

  useEffect(() => {
    setFlowNodes(buildFlowNodes(page.elements, page.id, selectedIds, handleOpenConfig));
  }, [page.elements, page.id, state.selectedElementId, state.selectedElementIds, handleOpenConfig]);

  const handleNodesChange = useCallback((changes: NodeChangeset<CanvasFlowNode>) => {
    setFlowNodes((prev) => {
      const updated = changes.applyTo(prev);
      const changeArray = changes.toArray();
      return updated.map((node) => {
        const snapRect = snappedResizeRef.current[node.id];
        const dimChange = changeArray.find(
          (c) => c.type === 'dimensions' && c.id === node.id,
        );
        if (
          snapRect &&
          (dimChange || changeArray.some((c) => c.type === 'position' && c.id === node.id))
        ) {
          return {
            ...node,
            position: { x: snapRect.x, y: snapRect.y },
            width: snapRect.width,
            height: snapRect.height,
            style: {
              ...node.style,
              width: snapRect.width,
              height: snapRect.height,
            },
          };
        }
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
    if (!state.selectedElementId) {
      lastFocusedSelectionRef.current = null;
      return;
    }
    if (state.selectedElementId === lastFocusedSelectionRef.current) {
      return;
    }
    const existsOnPage = page.elements.some((el) => el.id === state.selectedElementId);
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
  }, [state.selectedElementId, page.elements, fitView, lastFocusedSelectionRef]);

  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = () => setContextMenu(null);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('pointerdown', closeMenu);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('keydown', handleKey);
    };
  }, [contextMenu]);

  // Native capture-phase Ctrl+wheel anywhere on canvas surface → zoom viewport before ECharts intercepts
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const handleNativeWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      event.stopPropagation();

      const rect = surface.getBoundingClientRect();
      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;
      const vp = getViewport();
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      const nextZoom = Math.min(2, Math.max(0.25, vp.zoom * factor));
      const scale = nextZoom / vp.zoom;

      setViewport({
        x: cursorX - (cursorX - vp.x) * scale,
        y: cursorY - (cursorY - vp.y) * scale,
        zoom: nextZoom,
      });
    };

    surface.addEventListener('wheel', handleNativeWheel, { capture: true, passive: false });
    return () => surface.removeEventListener('wheel', handleNativeWheel, { capture: true });
  }, [getViewport, setViewport]);

  const handleNodesDelete = useCallback(
    (deletedNodes: CanvasFlowNode[]) => {
      for (const node of deletedNodes) {
        dispatch({
          type: 'DELETE_ELEMENT',
          pageId: page.id,
          elementId: node.id,
        });
      }
    },
    [page.id, dispatch],
  );

  const handleSurfaceKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Delete' || selectedIds.length === 0) return;
    if (isEditableTarget(event.target)) return;
    event.preventDefault();
    dispatch({
      type: 'DELETE_ELEMENTS',
      pageId: page.id,
      elementIds: selectedIds,
    });
  };

  const handleNodeDrag = useCallback(
    (_event: unknown, node: CanvasFlowNode) => {
      if (!snapEnabled) {
        setSnapGuides([]);
        setRelativeBadge(null);
        delete snappedPosRef.current[node.id];
        return;
      }

      const w = Number(node.width ?? node.style?.width ?? 220);
      const h = Number(node.height ?? node.style?.height ?? 140);
      const staticOtherNodes = flowNodes.filter((n) => n.id !== node.id && !n.selected);
      const res = computeSnapAndGuides(
        node.id,
        node.position,
        { width: w, height: h },
        staticOtherNodes,
      );

      snappedPosRef.current[node.id] = res.snappedPosition;
      setSnapGuides(res.guides);
      setRelativeBadge(
        res.relativeLabel && res.relativePos
          ? { label: res.relativeLabel, pos: res.relativePos }
          : null,
      );

      if (
        res.snappedPosition.x !== node.position.x ||
        res.snappedPosition.y !== node.position.y
      ) {
        setFlowNodes((prev) =>
          prev.map((n) => (n.id === node.id ? { ...n, position: res.snappedPosition } : n)),
        );
      }
    },
    [snapEnabled, flowNodes],
  );

  const onResizeSnap = useCallback(
    (elementId: string, rect: ResizeRect) => {
      if (!snapEnabled) {
        setSnapGuides([]);
        setRelativeBadge({
          label: `${Math.round(rect.width)}×${Math.round(rect.height)}`,
          pos: { x: rect.x, y: rect.y - 22 },
        });
        delete snappedResizeRef.current[elementId];
        return;
      }
      const origEl = page.elements.find((e) => e.id === elementId);
      const origRect: ResizeRect = origEl
        ? {
            x: origEl.position.x,
            y: origEl.position.y,
            width: origEl.size.width,
            height: origEl.size.height,
          }
        : rect;
      const res = computeResizeSnap(elementId, rect, origRect, flowNodes);
      snappedResizeRef.current[elementId] = res.rect;
      setSnapGuides(res.guides);
      setRelativeBadge(res.badge);
    },
    [snapEnabled, page.elements, flowNodes],
  );

  const onResizeSnapEnd = useCallback(
    (elementId: string, rect: ResizeRect): ResizeRect => {
      let finalRect = rect;
      if (snapEnabled) {
        const origEl = page.elements.find((e) => e.id === elementId);
        const origRect: ResizeRect = origEl
          ? {
              x: origEl.position.x,
              y: origEl.position.y,
              width: origEl.size.width,
              height: origEl.size.height,
            }
          : rect;
        const res = computeResizeSnap(elementId, rect, origRect, flowNodes);
        finalRect = res.rect;
      }
      snappedResizeRef.current[elementId] = finalRect;
      window.setTimeout(() => {
        delete snappedResizeRef.current[elementId];
      }, 0);
      setSnapGuides([]);
      setRelativeBadge(null);
      setFlowNodes((prev) =>
        prev.map((n) =>
          n.id === elementId
            ? {
                ...n,
                position: { x: finalRect.x, y: finalRect.y },
                width: finalRect.width,
                height: finalRect.height,
                style: { ...n.style, width: finalRect.width, height: finalRect.height },
              }
            : n,
        ),
      );
      return finalRect;
    },
    [snapEnabled, page.elements, flowNodes],
  );

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

  const menuCoords = contextMenu ? clampMenuPosition(contextMenu.screenX, contextMenu.screenY) : null;

  return (
    <CanvasSnapContext.Provider value={{ onResizeSnap, onResizeSnapEnd }}>
      <div
        ref={surfaceRef}
        className="cw-surface"
        onKeyDown={handleSurfaceKeyDown}
        onPointerDown={() => onFocusPane()}
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
      >
        <ReactFlow
          key={page.id}
          nodes={flowNodes}
          edges={[]}
          nodeTypes={NODE_TYPES}
          defaultViewport={page.viewport}
          minZoom={0.25}
          maxZoom={2}
          deleteKeyCode={null}
          onNodesChange={handleNodesChange}
          onNodesDelete={handleNodesDelete}
          onNodeClick={(event, node) => {
            onFocusPane();
            setContextMenu(null);
            lastFocusedSelectionRef.current = node.id;
            if (event.shiftKey || event.ctrlKey || event.metaKey) {
              const exists = selectedIds.includes(node.id);
              const nextIds = exists
                ? selectedIds.filter((id) => id !== node.id)
                : [...selectedIds, node.id];
              const nextPrimary = nextIds.includes(node.id)
                ? node.id
                : (nextIds[nextIds.length - 1] ?? null);
              dispatch({
                type: 'SELECT_ELEMENTS',
                elementIds: nextIds,
                primaryId: nextPrimary,
                pageId: page.id,
              });
              if (autoConfigOnSelect) {
                onConfigureElement(page.id, nextPrimary, false);
              }
            } else {
              dispatch({
                type: 'SELECT_ELEMENT',
                elementId: node.id,
                pageId: page.id,
              });
              if (autoConfigOnSelect) {
                onConfigureElement(page.id, node.id, false);
              }
            }
          }}
          onPaneClick={() => {
            onFocusPane();
            setContextMenu(null);
            lastFocusedSelectionRef.current = null;
            dispatch({
              type: 'SELECT_ELEMENT',
              elementId: null,
              pageId: page.id,
            });
            onConfigureElement(page.id, null, false);
          }}
          onPaneContextMenu={(event) => {
            event.preventDefault();
            onFocusPane();
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
            onFocusPane();
            lastFocusedSelectionRef.current = node.id;
            dispatch({
              type: 'SELECT_ELEMENT',
              elementId: node.id,
              pageId: page.id,
            });
            setContextMenu({
              kind: 'node',
              screenX: event.clientX,
              screenY: event.clientY,
              element: node.data.element,
            });
          }}
          onNodeDrag={handleNodeDrag}
          onNodeDragStop={(_event, node, draggedNodes) => {
            const snappedMain = snappedPosRef.current[node.id];
            delete snappedPosRef.current[node.id];
            setSnapGuides([]);
            setRelativeBadge(null);

            const dx = snappedMain ? snappedMain.x - node.position.x : 0;
            const dy = snappedMain ? snappedMain.y - node.position.y : 0;
            const targetNodes =
              draggedNodes && draggedNodes.length > 0 ? draggedNodes : [node];

            const moves = targetNodes.map((n) => {
              const basePos =
                n.id === node.id && snappedMain
                  ? snappedMain
                  : {
                      x: n.position.x + dx,
                      y: n.position.y + dy,
                    };
              return {
                elementId: n.id,
                position: {
                  x: Math.round(basePos.x),
                  y: Math.round(basePos.y),
                },
              };
            });

            if (moves.length === 1) {
              dispatch({
                type: 'MOVE_ELEMENT',
                pageId: page.id,
                elementId: moves[0].elementId,
                position: moves[0].position,
              });
            } else {
              dispatch({
                type: 'MOVE_ELEMENTS',
                pageId: page.id,
                moves,
              });
            }
          }}
          onMoveEnd={(_event, viewport) => {
            dispatch({
              type: 'SET_PAGE_VIEWPORT',
              pageId: page.id,
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
          {(snapGuides.length > 0 || relativeBadge) && (
            <ViewportPortal>
              <div className="cw-snap-overlay" aria-hidden="true">
                {snapGuides.map((g, idx) =>
                  g.orientation === 'vertical' ? (
                    <div
                      key={`v-${idx}`}
                      className="cw-snap-line cw-snap-line--vertical"
                      style={{
                        left: `${g.pos}px`,
                        top: `${g.start}px`,
                        height: `${Math.max(1, g.end - g.start)}px`,
                      }}
                    >
                      <span className="cw-snap-label">{g.label}</span>
                    </div>
                  ) : (
                    <div
                      key={`h-${idx}`}
                      className="cw-snap-line cw-snap-line--horizontal"
                      style={{
                        top: `${g.pos}px`,
                        left: `${g.start}px`,
                        width: `${Math.max(1, g.end - g.start)}px`,
                      }}
                    >
                      <span className="cw-snap-label">{g.label}</span>
                    </div>
                  ),
                )}
                {relativeBadge && (
                  <div
                    className="cw-snap-rel-badge"
                    style={{
                      left: `${relativeBadge.pos.x}px`,
                      top: `${relativeBadge.pos.y}px`,
                    }}
                  >
                    {relativeBadge.label}
                  </div>
                )}
              </div>
            </ViewportPortal>
          )}
        </ReactFlow>

        {page.elements.length === 0 && (
          <div className="cw-empty-hint">
            <div className="placeholder-card">
              <h1 className="placeholder-title">{page.name}</h1>
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
                  onClick={() => onAddElement(page.id, 'kpi')}
                >
                  <Hash size={14} />
                  <span>{uk.canvas.addKpi}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="cw-hud" aria-live="off">
          <span>{cursorPos ? `X ${cursorPos.x} · Y ${cursorPos.y}` : '—'}</span>
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
                    onAddElement(page.id, 'note', contextMenu.flowPos);
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
                    onAddElement(page.id, 'kpi', contextMenu.flowPos);
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
                    onAddElement(page.id, 'line-chart', contextMenu.flowPos);
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
                    onAddElement(page.id, 'bar-chart', contextMenu.flowPos);
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
                    onAddElement(page.id, 'pie-chart', contextMenu.flowPos);
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
                    onAddElement(page.id, 'kanban', contextMenu.flowPos);
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
                    onAddElement(page.id, 'pivot-table', contextMenu.flowPos);
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
                    onAddElement(page.id, 'table-view', contextMenu.flowPos);
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
                      pageId: page.id,
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
                    onConfigureElement(page.id, contextMenu.element.id, false);
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
                    onDuplicateElement(page.id, contextMenu.element);
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
                      pageId: page.id,
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
    </CanvasSnapContext.Provider>
  );
});

export const CanvasPaneView = forwardRef<CanvasPaneHandle, CanvasPaneViewProps>(
  function CanvasPaneView(props, ref) {
    return (
      <ReactFlowProvider>
        <CanvasPaneInner {...props} ref={ref} />
      </ReactFlowProvider>
    );
  },
);
