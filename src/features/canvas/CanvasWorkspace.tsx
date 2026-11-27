import { useCallback, useEffect, useRef, useState } from 'react';
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
  BarChart2,
  BarChart3,
  ChevronDown,
  Columns3,
  Copy,
  Crosshair,
  FilePlus,
  Filter,
  Grid3x3,
  Hash,
  Keyboard,
  LayoutTemplate,
  LineChart,
  Magnet,
  Maximize2,
  PieChart,
  Plus,
  RotateCcw,
  ScatterChart,
  Settings2,
  SlidersHorizontal,
  StickyNote,
  Table,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useProject } from '../../app/ProjectContext';
import { createStableId } from '../../domain/id';
import type { CanvasElement, CanvasElementType, Dataset, Position } from '../../domain/models';
import { uk } from '../../i18n/uk';
import { CanvasSnapContext, type ResizeRect } from './canvasSnapContext';
import { ElementConfigPanel } from './ElementConfigPanel';
import { FiltersModal } from './FiltersModal';
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
  const { state, dispatch, undo, canUndo } = useProject();
  const { fitView, screenToFlowPosition, setViewport, getViewport } = useReactFlow();
  const [configElementId, setConfigElementId] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<Position | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);
  const [snapGuides, setSnapGuides] = useState<SnapGuideLine[]>([]);
  const [relativeBadge, setRelativeBadge] = useState<{ label: string; pos: Position } | null>(null);
  const [renamingTabPageId, setRenamingTabPageId] = useState<string | null>(null);
  const [tabRenameDraft, setTabRenameDraft] = useState('');
  const [openToolbarMenu, setOpenToolbarMenu] = useState<'charts' | 'tables' | null>(null);
  const [showHotkeysHint, setShowHotkeysHint] = useState(true);
  const [autoConfigOnSelect, setAutoConfigOnSelect] = useState(true);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const toolbarMenuRef = useRef<HTMLDivElement | null>(null);
  const snappedPosRef = useRef<Record<string, Position>>({});
  const snappedResizeRef = useRef<Record<string, ResizeRect>>({});
  const lastFocusedSelectionRef = useRef<string | null>(null);

  const activePage =
    state.project.canvases.find((p) => p.id === state.activePageId) ?? state.project.canvases[0];
  const dataset = state.project.primaryDataset;
  const selectedIds =
    state.selectedElementIds && state.selectedElementIds.length > 0
      ? state.selectedElementIds
      : state.selectedElementId
        ? [state.selectedElementId]
        : [];

  const handleOpenConfig = useCallback((elementId: string) => {
    setConfigElementId((prev) => (prev === elementId ? null : elementId));
  }, []);

  const [flowNodes, setFlowNodes] = useState<CanvasFlowNode[]>(() =>
    buildFlowNodes(
      activePage.elements,
      activePage.id,
      selectedIds,
      handleOpenConfig,
    ),
  );

  // Sync authoritative project model into React Flow nodes whenever elements/selection change
  useEffect(() => {
    setFlowNodes(
      buildFlowNodes(
        activePage.elements,
        activePage.id,
        selectedIds,
        handleOpenConfig,
      ),
    );
  }, [activePage.elements, activePage.id, state.selectedElementId, state.selectedElementIds, handleOpenConfig]);

  // Apply real-time drag and resize changes inside React Flow state, preserving resize snap
  const handleNodesChange = useCallback((changes: NodeChangeset<CanvasFlowNode>) => {
    setFlowNodes((prev) => {
      const updated = changes.applyTo(prev);
      const changeArray = changes.toArray();
      return updated.map((node) => {
        const snapRect = snappedResizeRef.current[node.id];
        const dimChange = changeArray.find(
          (c) => c.type === 'dimensions' && c.id === node.id,
        );
        if (snapRect && (dimChange || changeArray.some((c) => c.type === 'position' && c.id === node.id))) {
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
    if (
      configElementId &&
      !activePage.elements.some((el) => el.id === configElementId)
    ) {
      setConfigElementId(null);
    }
  }, [activePage, configElementId]);

  useEffect(() => {
    if (autoConfigOnSelect && state.selectedElementId) {
      setConfigElementId(state.selectedElementId);
    }
  }, [state.selectedElementId, autoConfigOnSelect]);

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

  useEffect(() => {
    if (!openToolbarMenu) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (
        toolbarMenuRef.current &&
        event.target instanceof Node &&
        !toolbarMenuRef.current.contains(event.target)
      ) {
        setOpenToolbarMenu(null);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenToolbarMenu(null);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKey);
    };
  }, [openToolbarMenu]);

  const handleAddElement = useCallback(
    (type: CanvasElementType, explicitPosition?: Position) => {
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
    },
    [activePage.elements.length, activePage.id, dataset, dispatch],
  );

  const handleDuplicateElement = useCallback(
    (element: CanvasElement) => {
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
    },
    [activePage.id, dispatch],
  );

  // Canvas-specific keyboard shortcuts (layout-independent via event.code)
  useEffect(() => {
    const handleCanvasHotkeys = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }
      if (document.querySelector('.modal-backdrop')) {
        return;
      }

      const mod = event.ctrlKey || event.metaKey;
      if (mod && !event.altKey && !event.shiftKey) {
        if (event.code === 'KeyD') {
          const primaryEl = state.selectedElementId
            ? activePage.elements.find((e) => e.id === state.selectedElementId)
            : null;
          if (primaryEl) {
            event.preventDefault();
            handleDuplicateElement(primaryEl);
          }
          return;
        }
        if (event.code === 'KeyA' && activePage.elements.length > 0) {
          event.preventDefault();
          const allIds = activePage.elements.map((e) => e.id);
          dispatch({
            type: 'SELECT_ELEMENTS',
            elementIds: allIds,
            primaryId: allIds[0] ?? null,
            pageId: activePage.id,
          });
          return;
        }
      }

      if (mod || event.altKey) {
        return;
      }

      if (event.key === '?' || (event.code === 'Slash' && event.shiftKey)) {
        event.preventDefault();
        setShowHotkeysHint((prev) => !prev);
        return;
      }

      switch (event.code) {
        case 'KeyN':
          event.preventDefault();
          handleAddElement('note');
          break;
        case 'KeyK':
          event.preventDefault();
          handleAddElement('kpi');
          break;
        case 'KeyC':
          event.preventDefault();
          handleAddElement('bar-chart');
          break;
        case 'KeyG':
          event.preventDefault();
          setSnapEnabled((prev) => !prev);
          break;
        case 'KeyF':
          event.preventDefault();
          fitView({ padding: 0.25, duration: 220 });
          break;
        case 'Digit0':
          event.preventDefault();
          setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 200 });
          dispatch({
            type: 'SET_PAGE_VIEWPORT',
            pageId: activePage.id,
            viewport: { x: 0, y: 0, zoom: 1 },
          });
          break;
        case 'Escape':
          if (configElementId) {
            setConfigElementId(null);
          } else if (selectedIds.length > 0) {
            lastFocusedSelectionRef.current = null;
            dispatch({ type: 'SELECT_ELEMENT', elementId: null, pageId: activePage.id });
          }
          break;
      }
    };

    window.addEventListener('keydown', handleCanvasHotkeys);
    return () => window.removeEventListener('keydown', handleCanvasHotkeys);
  }, [
    activePage.elements,
    activePage.id,
    configElementId,
    dispatch,
    fitView,
    handleAddElement,
    handleDuplicateElement,
    selectedIds.length,
    setViewport,
    state.selectedElementId,
  ]);

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
    if (event.key !== 'Delete' || selectedIds.length === 0) {
      return;
    }
    if (isEditableTarget(event.target)) {
      return;
    }
    event.preventDefault();
    dispatch({
      type: 'DELETE_ELEMENTS',
      pageId: activePage.id,
      elementIds: selectedIds,
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

  // Native capture-phase Ctrl+wheel anywhere on canvas surface → zoom viewport before ECharts intercepts
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }

    const handleNativeWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }
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
    return () => {
      surface.removeEventListener('wheel', handleNativeWheel, { capture: true });
    };
  }, [getViewport, setViewport]);

  const menuCoords = contextMenu ? clampMenuPosition(contextMenu.screenX, contextMenu.screenY) : null;

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
      const res = computeSnapAndGuides(node.id, node.position, { width: w, height: h }, staticOtherNodes);

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
      const origEl = activePage.elements.find((e) => e.id === elementId);
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
    [snapEnabled, activePage.elements, flowNodes],
  );

  const onResizeSnapEnd = useCallback(
    (elementId: string, rect: ResizeRect): ResizeRect => {
      let finalRect = rect;
      if (snapEnabled) {
        const origEl = activePage.elements.find((e) => e.id === elementId);
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
      // Keep snapped rect in ref briefly so XYResizer's trailing onChange doesn't overwrite it
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
    [snapEnabled, activePage.elements, flowNodes],
  );

  const snapContextValue = { onResizeSnap, onResizeSnapEnd };

  return (
    <CanvasSnapContext.Provider value={snapContextValue}>
    <div className="cw-root" onKeyDown={handleSurfaceKeyDown}>
      <div className="cw-toolbar">
        <div className="cw-toolbar-group" ref={toolbarMenuRef}>
          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            onClick={() => {
              handleAddElement('note');
              setOpenToolbarMenu(null);
            }}
          >
            <StickyNote size={13} />
            <span>{uk.canvas.addNote}</span>
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            onClick={() => {
              handleAddElement('kpi');
              setOpenToolbarMenu(null);
            }}
          >
            <Hash size={13} />
            <span>{uk.canvas.addKpi}</span>
          </button>

          <div className="cw-dropdown-wrap">
            <button
              type="button"
              className={`icon-btn icon-btn--outlined ${openToolbarMenu === 'charts' ? 'icon-btn--active' : ''}`}
              aria-haspopup="menu"
              aria-expanded={openToolbarMenu === 'charts'}
              onClick={() =>
                setOpenToolbarMenu((prev) => (prev === 'charts' ? null : 'charts'))
              }
            >
              <BarChart3 size={13} />
              <span>Графіки</span>
              <ChevronDown size={12} className="cw-dropdown-chevron" />
            </button>
            {openToolbarMenu === 'charts' && (
              <div className="cw-dropdown-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="cw-context-item"
                  onClick={() => {
                    handleAddElement('line-chart');
                    setOpenToolbarMenu(null);
                  }}
                >
                  <span className="cw-context-item-left">
                    <LineChart size={13} />
                    <span>Лінійний графік</span>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="cw-context-item"
                  onClick={() => {
                    handleAddElement('bar-chart');
                    setOpenToolbarMenu(null);
                  }}
                >
                  <span className="cw-context-item-left">
                    <BarChart3 size={13} />
                    <span>Стовпчиковий графік</span>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="cw-context-item"
                  onClick={() => {
                    handleAddElement('histogram');
                    setOpenToolbarMenu(null);
                  }}
                >
                  <span className="cw-context-item-left">
                    <BarChart2 size={13} />
                    <span>Гістограма розподілу</span>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="cw-context-item"
                  onClick={() => {
                    handleAddElement('pie-chart');
                    setOpenToolbarMenu(null);
                  }}
                >
                  <span className="cw-context-item-left">
                    <PieChart size={13} />
                    <span>Кругова діаграма</span>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="cw-context-item"
                  onClick={() => {
                    handleAddElement('stacked-bar');
                    setOpenToolbarMenu(null);
                  }}
                >
                  <span className="cw-context-item-left">
                    <BarChart3 size={13} />
                    <span>Складений графік</span>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="cw-context-item"
                  onClick={() => {
                    handleAddElement('scatter');
                    setOpenToolbarMenu(null);
                  }}
                >
                  <span className="cw-context-item-left">
                    <ScatterChart size={13} />
                    <span>Точкова діаграма</span>
                  </span>
                </button>
              </div>
            )}
          </div>

          <div className="cw-dropdown-wrap">
            <button
              type="button"
              className={`icon-btn icon-btn--outlined ${openToolbarMenu === 'tables' ? 'icon-btn--active' : ''}`}
              aria-haspopup="menu"
              aria-expanded={openToolbarMenu === 'tables'}
              onClick={() =>
                setOpenToolbarMenu((prev) => (prev === 'tables' ? null : 'tables'))
              }
            >
              <Table size={13} />
              <span>Таблиці та дошки</span>
              <ChevronDown size={12} className="cw-dropdown-chevron" />
            </button>
            {openToolbarMenu === 'tables' && (
              <div className="cw-dropdown-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="cw-context-item"
                  onClick={() => {
                    handleAddElement('table-view');
                    setOpenToolbarMenu(null);
                  }}
                >
                  <span className="cw-context-item-left">
                    <Table size={13} />
                    <span>Таблиця перегляду</span>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="cw-context-item"
                  onClick={() => {
                    handleAddElement('pivot-table');
                    setOpenToolbarMenu(null);
                  }}
                >
                  <span className="cw-context-item-left">
                    <Grid3x3 size={13} />
                    <span>Зведена таблиця</span>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="cw-context-item"
                  onClick={() => {
                    handleAddElement('kanban');
                    setOpenToolbarMenu(null);
                  }}
                >
                  <span className="cw-context-item-left">
                    <Columns3 size={13} />
                    <span>Kanban-дошка</span>
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="cw-toolbar-group">
          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            disabled={!canUndo}
            onClick={undo}
            title="Скасувати останню дію (Ctrl+Z)"
            aria-label="Скасувати (Ctrl+Z)"
          >
            <Undo2 size={13} />
          </button>
          <button
            type="button"
            className={`icon-btn icon-btn--outlined ${(activePage.filterIds?.length ?? 0) > 0 ? 'icon-btn--active' : ''}`}
            onClick={() => setIsFiltersOpen(true)}
            title="Багаторазові фільтри проєкту та сторінки"
          >
            <Filter size={13} />
            <span>
              Фільтри
              {(activePage.filterIds?.length ?? 0) > 0 ? ` (${activePage.filterIds!.length})` : ''}
            </span>
          </button>
          <button
            type="button"
            className={`icon-btn icon-btn--outlined ${autoConfigOnSelect ? 'icon-btn--active' : ''}`}
            onClick={() => setAutoConfigOnSelect((prev) => !prev)}
            title={
              autoConfigOnSelect
                ? 'Авто-відкриття властивостей при натисканні на елемент увімкнено (клік щоб вимкнути)'
                : 'Авто-відкриття властивостей при натисканні вимкнено (клік щоб увімкнути)'
            }
          >
            <SlidersHorizontal size={13} />
            <span>Авто-налашт.</span>
          </button>
          <button
            type="button"
            className={`icon-btn icon-btn--outlined ${snapEnabled ? 'icon-btn--active' : ''}`}
            onClick={() => setSnapEnabled((prev) => !prev)}
            title={
              snapEnabled
                ? 'Прив’язка та напрямні увімкнені (клік щоб вимкнути)'
                : 'Прив’язка вимкнена (клік щоб увімкнути)'
            }
          >
            <Magnet size={13} />
            <span>Прив’язка</span>
          </button>
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
        ref={surfaceRef}
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
      >
        <ReactFlow
          key={activePage.id}
          nodes={flowNodes}
          edges={[]}
          nodeTypes={NODE_TYPES}
          defaultViewport={activePage.viewport}
          minZoom={0.25}
          maxZoom={2}
          deleteKeyCode={null}
          onNodesChange={handleNodesChange}
          onNodesDelete={handleNodesDelete}
          onNodeClick={(event, node) => {
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
                pageId: activePage.id,
              });
              if (autoConfigOnSelect) {
                setConfigElementId(nextPrimary);
              }
            } else {
              dispatch({
                type: 'SELECT_ELEMENT',
                elementId: node.id,
                pageId: activePage.id,
              });
              if (autoConfigOnSelect) {
                setConfigElementId(node.id);
              }
            }
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
              const basePos = n.id === node.id && snappedMain ? snappedMain : {
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
                pageId: activePage.id,
                elementId: moves[0].elementId,
                position: moves[0].position,
              });
            } else {
              dispatch({
                type: 'MOVE_ELEMENTS',
                pageId: activePage.id,
                moves,
              });
            }
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

        {showHotkeysHint ? (
          <aside className="cw-hotkeys-card" aria-label="Підказка гарячих клавіш">
            <div className="cw-hotkeys-head">
              <span className="cw-hotkeys-title">
                <Keyboard size={12} />
                <span>Гарячі клавіші</span>
              </span>
              <button
                type="button"
                className="sd-mini-btn"
                onClick={() => setShowHotkeysHint(false)}
                title="Приховати підказку (?)"
                aria-label="Приховати підказку гарячих клавіш"
              >
                <X size={12} />
              </button>
            </div>
            <div className="cw-hotkeys-grid">
              <div className="cw-hotkey-item"><kbd>N</kbd><span>Нотатка</span></div>
              <div className="cw-hotkey-item"><kbd>K</kbd><span>KPI</span></div>
              <div className="cw-hotkey-item"><kbd>C</kbd><span>Графік</span></div>
              <div className="cw-hotkey-item"><kbd>G</kbd><span>Прив’язка</span></div>
              <div className="cw-hotkey-item"><kbd>F</kbd><span>Вписати</span></div>
              <div className="cw-hotkey-item"><kbd>0</kbd><span>100%</span></div>
              <div className="cw-hotkey-item"><kbd>Ctrl+D</kbd><span>Дублювати</span></div>
              <div className="cw-hotkey-item"><kbd>Ctrl+A</kbd><span>Обрати всі</span></div>
              <div className="cw-hotkey-item"><kbd>Ctrl+Z</kbd><span>Скасувати</span></div>
              <div className="cw-hotkey-item"><kbd>Del</kbd><span>Видалити</span></div>
            </div>
          </aside>
        ) : (
          <button
            type="button"
            className="cw-hotkeys-pill"
            onClick={() => setShowHotkeysHint(true)}
            title="Показати підказку гарячих клавіш (?)"
            aria-label="Показати гарячі клавіші"
          >
            <Keyboard size={12} />
            <span>Клавіші</span>
            <kbd>?</kbd>
          </button>
        )}

        {configElement && (
          <ElementConfigPanel
            pageId={activePage.id}
            element={configElement}
            onClose={() => setConfigElementId(null)}
          />
        )}

        {isFiltersOpen && (
          <FiltersModal pageId={activePage.id} onClose={() => setIsFiltersOpen(false)} />
        )}
      </div>

      {/* Excel-like bottom sheet tabs for Canvas pages */}
      <div className="cw-sheet-tabs" role="tablist" aria-label="Сторінки Canvas">
        <div className="cw-sheet-tabs-scroll">
          {state.project.canvases.map((page) => {
            const isActive = page.id === activePage.id;
            const isRenaming = renamingTabPageId === page.id;
            return isRenaming ? (
              <input
                key={page.id}
                type="text"
                className="cw-sheet-tab-input"
                value={tabRenameDraft}
                autoFocus
                onChange={(e) => setTabRenameDraft(e.target.value)}
                onBlur={() => {
                  const trimmed = tabRenameDraft.trim();
                  if (trimmed) {
                    dispatch({ type: 'RENAME_PAGE', pageId: page.id, name: trimmed });
                  }
                  setRenamingTabPageId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const trimmed = tabRenameDraft.trim();
                    if (trimmed) {
                      dispatch({ type: 'RENAME_PAGE', pageId: page.id, name: trimmed });
                    }
                    setRenamingTabPageId(null);
                  } else if (e.key === 'Escape') {
                    setRenamingTabPageId(null);
                  }
                }}
              />
            ) : (
              <button
                key={page.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`cw-sheet-tab ${isActive ? 'cw-sheet-tab--active' : ''}`}
                onClick={() => dispatch({ type: 'SELECT_PAGE', pageId: page.id })}
                onDoubleClick={() => {
                  setRenamingTabPageId(page.id);
                  setTabRenameDraft(page.name);
                }}
                title="Клік — перейти · Подвійний клік — перейменувати"
              >
                <span>{page.name}</span>
                {page.elements.length > 0 && (
                  <span className="cw-sheet-tab-count">{page.elements.length}</span>
                )}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="cw-sheet-add-btn"
          onClick={() =>
            dispatch({
              type: 'ADD_PAGE',
              name: `Сторінка ${state.project.canvases.length + 1}`,
              activate: true,
            })
          }
          title={uk.navigator.addPage}
          aria-label={uk.navigator.addPage}
        >
          <Plus size={13} />
        </button>
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
    </CanvasSnapContext.Provider>
  );
}

export function CanvasWorkspace(props: CanvasWorkspaceProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
