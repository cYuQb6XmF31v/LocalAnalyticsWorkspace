import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { GraphChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import {
  sensitivityToDwellMs,
  type ProjectGraphNode,
  type ProjectGraphResult,
} from './transforms';

export { sensitivityToDwellMs };

echarts.use([GraphChart, TooltipComponent, CanvasRenderer, LabelLayout]);

export type GraphLayoutMode = 'force' | 'radial' | 'tree';

export interface GraphSensitivitySettings {
  splitByLevel: boolean;
  /** Sensitivity 0..100 for graph links/edges (0 = off, 1 = 2000ms, 100 = 0ms) */
  edges: number;
  /** Cursor hit / snap distance in px for edges (2..36) */
  edgeHitRadius: number;
  /** Magnetic snap indicator & sticky latch onto nearest edge */
  edgeSnap: boolean;
  /** Unified node sensitivity 0..100 when splitByLevel is false */
  nodesGlobal: number;
  /** Per-level node sensitivity 0..100 when splitByLevel is true */
  levels: {
    project: number;
    page: number;
    element: number;
    dataset: number;
    column: number;
    joinFilter: number;
  };
}

export const DEFAULT_GRAPH_SENSITIVITY: GraphSensitivitySettings = {
  splitByLevel: false,
  edges: 55,
  edgeHitRadius: 14,
  edgeSnap: true,
  nodesGlobal: 100,
  levels: {
    project: 100,
    page: 100,
    element: 100,
    dataset: 90,
    column: 75,
    joinFilter: 90,
  },
};

export interface EChartGraphBoxHandle {
  syncHoveredNode: (nodeId: string | null) => void;
}

interface EChartGraphBoxProps {
  graph: ProjectGraphResult;
  mode: GraphLayoutMode;
  hoveredNodeId: string | null;
  sensitivity: GraphSensitivitySettings;
  onHoverNode: (nodeId: string | null) => void;
  onSelectNode: (node: ProjectGraphNode) => void;
}

interface EdgeSnapOverlay {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cx?: number;
  cy?: number;
  px: number;
  py: number;
  label: string;
  showDot: boolean;
}

const NODE_COLORS: Record<ProjectGraphNode['kind'], string> = {
  project: '#c9bdff',
  page: '#7c5cff',
  element: '#38bdf8',
  dataset: '#34d399',
  column: '#94a3b8',
  join: '#fbbf24',
  filter: '#fb7185',
};

const NODE_KIND_LABELS: Record<ProjectGraphNode['kind'], string> = {
  project: 'Проєкт',
  page: 'Сторінка Canvas',
  element: 'Елемент Canvas',
  dataset: 'Таблиця даних',
  column: 'Колонка / Формула',
  join: 'З’єднання (Join)',
  filter: 'Фільтр',
};

function getSensitivityForKind(
  kind: ProjectGraphNode['kind'],
  settings: GraphSensitivitySettings,
): number {
  if (!settings.splitByLevel) {
    return settings.nodesGlobal;
  }
  switch (kind) {
    case 'project':
      return settings.levels.project;
    case 'page':
      return settings.levels.page;
    case 'element':
      return settings.levels.element;
    case 'dataset':
      return settings.levels.dataset;
    case 'column':
      return settings.levels.column;
    case 'join':
    case 'filter':
      return settings.levels.joinFilter;
  }
}

function closestPointOnSegment(
  mx: number,
  my: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { dist: number; px: number; py: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 0.0001) {
    return { dist: Math.hypot(mx - x1, my - y1), px: x1, py: y1 };
  }
  const t = Math.max(0, Math.min(1, ((mx - x1) * dx + (my - y1) * dy) / lenSq));
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  return { dist: Math.hypot(mx - px, my - py), px, py };
}

function closestPointOnQuadratic(
  mx: number,
  my: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
): { dist: number; px: number; py: number } {
  let bestDist = Infinity;
  let bestX = x1;
  let bestY = y1;
  const steps = 14;
  let prevX = x1;
  let prevY = y1;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const qx = mt * mt * x1 + 2 * mt * t * cx + t * t * x2;
    const qy = mt * mt * y1 + 2 * mt * t * cy + t * t * y2;
    const seg = closestPointOnSegment(mx, my, prevX, prevY, qx, qy);
    if (seg.dist < bestDist) {
      bestDist = seg.dist;
      bestX = seg.px;
      bestY = seg.py;
    }
    prevX = qx;
    prevY = qy;
  }
  return { dist: bestDist, px: bestX, py: bestY };
}

function computeNodeDegrees(graph: ProjectGraphResult): Map<string, number> {
  const deg = new Map<string, number>();
  for (const n of graph.nodes) {
    deg.set(n.id, 0);
  }
  for (const e of graph.edges) {
    deg.set(e.source, (deg.get(e.source) ?? 0) + 1);
    deg.set(e.target, (deg.get(e.target) ?? 0) + 1);
  }
  return deg;
}

function computeRadialPositions(graph: ProjectGraphResult): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();

  const projects = graph.nodes.filter((n) => n.kind === 'project');
  const innerHubs = graph.nodes.filter((n) => n.kind === 'page' || n.kind === 'dataset');
  const middleNodes = graph.nodes.filter(
    (n) => n.kind === 'join' || n.kind === 'filter' || n.kind === 'column',
  );
  const outerNodes = graph.nodes.filter((n) => n.kind === 'element');

  projects.forEach((n, idx) => {
    const angle = (idx / Math.max(1, projects.length)) * Math.PI * 2;
    const r = projects.length > 1 ? 50 : 0;
    pos.set(n.id, { x: Math.cos(angle) * r, y: Math.sin(angle) * r });
  });

  const placeRing = (nodes: ProjectGraphNode[], baseRadius: number, phase = -Math.PI / 2) => {
    if (nodes.length === 0) return;
    const radius = Math.max(baseRadius, nodes.length * 14);
    nodes.forEach((n, idx) => {
      const angle = phase + (idx / nodes.length) * Math.PI * 2;
      pos.set(n.id, {
        x: Math.round(Math.cos(angle) * radius),
        y: Math.round(Math.sin(angle) * radius),
      });
    });
  };

  const pageOrder = new Map(
    graph.nodes.filter((n) => n.kind === 'page').map((p, idx) => [p.pageId ?? p.id, idx]),
  );
  const sortedOuter = [...outerNodes].sort((a, b) => {
    const pa = pageOrder.get(a.pageId ?? '') ?? 999;
    const pb = pageOrder.get(b.pageId ?? '') ?? 999;
    return pa - pb;
  });

  placeRing(innerHubs, 170);
  if (middleNodes.length > 0 && sortedOuter.length > 0) {
    placeRing(middleNodes, 320, -Math.PI / 3);
    placeRing(sortedOuter, 470, -Math.PI / 2);
  } else {
    placeRing([...middleNodes, ...sortedOuter], 340, -Math.PI / 2);
  }

  return pos;
}

function computeTreePositions(graph: ProjectGraphResult): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();

  const datasets = graph.nodes.filter((n) => n.kind === 'dataset');
  const columns = graph.nodes.filter((n) => n.kind === 'column');
  const transforms = graph.nodes.filter((n) => n.kind === 'join' || n.kind === 'filter');
  const projects = graph.nodes.filter((n) => n.kind === 'project');
  const pages = graph.nodes.filter((n) => n.kind === 'page');
  const elements = graph.nodes.filter((n) => n.kind === 'element');

  const hasLineage = datasets.length > 0 || columns.length > 0 || transforms.length > 0;

  const placeColumn = (nodes: ProjectGraphNode[], x: number, rowGap: number) => {
    const totalHeight = Math.max(0, (nodes.length - 1) * rowGap);
    nodes.forEach((n, idx) => {
      pos.set(n.id, { x, y: Math.round(idx * rowGap - totalHeight / 2) });
    });
  };

  const elementsByPage = new Map<string, ProjectGraphNode[]>();
  for (const el of elements) {
    const pid = el.pageId ?? '__none__';
    const arr = elementsByPage.get(pid) ?? [];
    arr.push(el);
    elementsByPage.set(pid, arr);
  }

  const pageBlocks: Array<{ page: ProjectGraphNode; children: ProjectGraphNode[]; height: number }> =
    pages.map((page) => {
      const children = elementsByPage.get(page.pageId ?? '') ?? [];
      const slots = Math.max(1, children.length);
      return { page, children, height: slots * 44 };
    });

  const totalRightHeight = pageBlocks.reduce((acc, b) => acc + b.height + 24, 0);
  let cursorY = -totalRightHeight / 2;

  const pageX = hasLineage ? 220 : 40;
  const elemX = hasLineage ? 470 : 280;

  for (const block of pageBlocks) {
    const blockMid = cursorY + block.height / 2;
    pos.set(block.page.id, { x: pageX, y: Math.round(blockMid) });

    if (block.children.length > 0) {
      const childGap = 40;
      const childrenHeight = (block.children.length - 1) * childGap;
      block.children.forEach((child, idx) => {
        pos.set(child.id, {
          x: elemX,
          y: Math.round(blockMid - childrenHeight / 2 + idx * childGap),
        });
      });
    }
    cursorY += block.height + 24;
  }

  if (hasLineage) {
    placeColumn(columns, -460, Math.max(24, Math.min(38, 680 / Math.max(1, columns.length))));
    placeColumn(datasets, -250, 95);
    placeColumn(transforms, -90, 56);
    placeColumn(projects, 60, 80);
  } else {
    placeColumn(projects, -170, 80);
  }

  return pos;
}

export const EChartGraphBox = forwardRef<EChartGraphBoxHandle, EChartGraphBoxProps>(
  function EChartGraphBox(
    { graph, mode, hoveredNodeId, sensitivity, onHoverNode, onSelectNode },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const instanceRef = useRef<echarts.ECharts | null>(null);
    const onSelectRef = useRef(onSelectNode);
    const onHoverRef = useRef(onHoverNode);
    const sensitivityRef = useRef(sensitivity);
    const graphRef = useRef(graph);
    const dwellTimerRef = useRef<number | null>(null);
    const edgeHighlightTimerRef = useRef<number | null>(null);
    const hoverNodeActiveRef = useRef<boolean>(false);
    const latchedEdgeIdxRef = useRef<number | null>(null);
    const highlightedEdgeIdxRef = useRef<number | null>(null);
    const syncedNodeIdRef = useRef<string | null>(null);
    const [edgeSnapOverlay, setEdgeSnapOverlay] = useState<EdgeSnapOverlay | null>(null);

    onSelectRef.current = onSelectNode;
    onHoverRef.current = onHoverNode;
    sensitivityRef.current = sensitivity;
    graphRef.current = graph;

    const nodeIndexById = useMemo(
      () => new Map(graph.nodes.map((n, idx) => [n.id, idx])),
      [graph.nodes],
    );
    const nodeIndexByIdRef = useRef(nodeIndexById);
    nodeIndexByIdRef.current = nodeIndexById;

    const applyNodeHighlightImmediate = (nodeId: string | null) => {
      const chart = instanceRef.current;
      if (!chart || syncedNodeIdRef.current === nodeId) {
        return;
      }
      syncedNodeIdRef.current = nodeId;
      chart.dispatchAction({ type: 'downplay', seriesIndex: 0 });
      if (nodeId) {
        const idx = nodeIndexByIdRef.current.get(nodeId);
        if (idx !== undefined) {
          chart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: idx });
        }
      }
    };

    useImperativeHandle(ref, () => ({
      syncHoveredNode: applyNodeHighlightImmediate,
    }));

    // Middle mouse button (wheel click + drag) panning support via ECharts graphRoam action
    useEffect(() => {
      const el = containerRef.current;
      if (!el) {
        return;
      }

      let panState: { lastX: number; lastY: number } | null = null;

      const handleMouseDown = (e: MouseEvent) => {
        if (e.button !== 1) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        panState = { lastX: e.clientX, lastY: e.clientY };
        el.style.cursor = 'grabbing';
      };

      const handleMouseMove = (e: MouseEvent) => {
        if (!panState || !instanceRef.current) {
          return;
        }
        const dx = e.clientX - panState.lastX;
        const dy = e.clientY - panState.lastY;
        panState.lastX = e.clientX;
        panState.lastY = e.clientY;
        if (dx !== 0 || dy !== 0) {
          instanceRef.current.dispatchAction({
            type: 'graphRoam',
            seriesIndex: 0,
            dx,
            dy,
          });
        }
      };

      const stopPan = () => {
        if (!panState) {
          return;
        }
        panState = null;
        el.style.cursor = '';
      };

      const preventMiddleClickScroll = (e: MouseEvent) => {
        if (e.button === 1) {
          e.preventDefault();
        }
      };

      el.addEventListener('mousedown', handleMouseDown);
      el.addEventListener('auxclick', preventMiddleClickScroll);
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', stopPan);

      return () => {
        el.removeEventListener('mousedown', handleMouseDown);
        el.removeEventListener('auxclick', preventMiddleClickScroll);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', stopPan);
        el.style.cursor = '';
      };
    }, []);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) {
        return;
      }

      const chart = echarts.init(el, undefined, { renderer: 'canvas' });
      instanceRef.current = chart;

      const clearEdgeState = (clearHoverCallback: boolean) => {
        if (edgeHighlightTimerRef.current) {
          window.clearTimeout(edgeHighlightTimerRef.current);
          edgeHighlightTimerRef.current = null;
        }
        if (highlightedEdgeIdxRef.current !== null) {
          chart.dispatchAction({
            type: 'downplay',
            seriesIndex: 0,
            dataType: 'edge',
            dataIndex: highlightedEdgeIdxRef.current,
          });
          highlightedEdgeIdxRef.current = null;
        }
        latchedEdgeIdxRef.current = null;
        setEdgeSnapOverlay(null);
        if (clearHoverCallback) {
          applyNodeHighlightImmediate(null);
          onHoverRef.current(null);
        }
      };

      chart.on('click', (params: unknown) => {
        const p = params as { dataType?: string; data?: { nodeMeta?: ProjectGraphNode } };
        if (p.dataType === 'node' && p.data?.nodeMeta) {
          onSelectRef.current(p.data.nodeMeta);
        }
      });

      chart.on('mouseover', (params: unknown) => {
        const p = params as {
          dataType?: string;
          data?: { nodeMeta?: ProjectGraphNode };
        };
        if (dwellTimerRef.current) {
          window.clearTimeout(dwellTimerRef.current);
          dwellTimerRef.current = null;
        }

        const curSens = sensitivityRef.current;

        if (p.dataType === 'node' && p.data?.nodeMeta) {
          hoverNodeActiveRef.current = true;
          clearEdgeState(false);

          const node = p.data.nodeMeta;
          const levelSens = getSensitivityForKind(node.kind, curSens);
          if (levelSens <= 0) {
            return;
          }
          const dwell = sensitivityToDwellMs(levelSens);
          if (dwell === 0) {
            syncedNodeIdRef.current = node.id;
            onHoverRef.current(node.id);
          } else {
            dwellTimerRef.current = window.setTimeout(() => {
              applyNodeHighlightImmediate(node.id);
              onHoverRef.current(node.id);
              dwellTimerRef.current = null;
            }, dwell);
          }
        }
      });

      chart.on('mouseout', (params: unknown) => {
        const p = params as { dataType?: string };
        if (dwellTimerRef.current) {
          window.clearTimeout(dwellTimerRef.current);
          dwellTimerRef.current = null;
        }
        if (p.dataType === 'node') {
          hoverNodeActiveRef.current = false;
          applyNodeHighlightImmediate(null);
          onHoverRef.current(null);
        }
      });

      // Custom wide-radius edge hit testing + magnetic snapping via ZRender mousemove
      const zr = chart.getZr();
      let prevPointer: { x: number; y: number } | null = null;
      const handleZrMouseMove = (event: { offsetX: number; offsetY: number }) => {
        const moveDist = prevPointer
          ? Math.hypot(event.offsetX - prevPointer.x, event.offsetY - prevPointer.y)
          : 0;
        prevPointer = { x: event.offsetX, y: event.offsetY };

        if (hoverNodeActiveRef.current) {
          return;
        }
        const curSens = sensitivityRef.current;
        if (curSens.edges <= 0) {
          if (latchedEdgeIdxRef.current !== null || highlightedEdgeIdxRef.current !== null) {
            clearEdgeState(true);
          }
          return;
        }

        const internalModel = (
          chart as unknown as {
            getModel?: () => {
              getSeriesByIndex?: (idx: number) => {
                getEdgeData?: () => {
                  count: () => number;
                  getItemLayout?: (idx: number) => Array<[number, number]>;
                };
              };
            };
          }
        ).getModel?.();
        const seriesModel = internalModel?.getSeriesByIndex?.(0);
        const edgeData = seriesModel?.getEdgeData?.();
        if (!edgeData || !edgeData.getItemLayout) {
          return;
        }

        const mx = event.offsetX;
        const my = event.offsetY;
        const hitRadius = Math.max(2, curSens.edgeHitRadius);
        const count = edgeData.count();

        let bestIdx = -1;
        let bestDist = Infinity;
        let bestGeom: EdgeSnapOverlay | null = null;
        let latchedDist = Infinity;
        let latchedGeom: EdgeSnapOverlay | null = null;

        for (let idx = 0; idx < count; idx++) {
          const layoutPts = edgeData.getItemLayout(idx);
          if (!layoutPts || layoutPts.length < 2) continue;

          let pStart: number[];
          let pEnd: number[];
          let pCtrl: number[] | null = null;
          try {
            pStart = chart.convertToPixel({ seriesIndex: 0 }, layoutPts[0]) as number[];
            pEnd = chart.convertToPixel({ seriesIndex: 0 }, layoutPts[1]) as number[];
            if (layoutPts[2]) {
              pCtrl = chart.convertToPixel({ seriesIndex: 0 }, layoutPts[2]) as number[];
            }
          } catch {
            continue;
          }
          if (!pStart || !pEnd) continue;

          const hit = pCtrl
            ? closestPointOnQuadratic(
                mx,
                my,
                pStart[0],
                pStart[1],
                pCtrl[0],
                pCtrl[1],
                pEnd[0],
                pEnd[1],
              )
            : closestPointOnSegment(mx, my, pStart[0], pStart[1], pEnd[0], pEnd[1]);

          const buildGeom = (): EdgeSnapOverlay => {
            const edgeMeta = graphRef.current.edges[idx];
            return {
              x1: pStart[0],
              y1: pStart[1],
              x2: pEnd[0],
              y2: pEnd[1],
              ...(pCtrl ? { cx: pCtrl[0], cy: pCtrl[1] } : {}),
              px: hit.px,
              py: hit.py,
              label: edgeMeta?.label ?? 'зв’язок',
              showDot: curSens.edgeSnap,
            };
          };

          if (idx === latchedEdgeIdxRef.current) {
            latchedDist = hit.dist;
            latchedGeom = buildGeom();
          }

          if (hit.dist < bestDist) {
            bestDist = hit.dist;
            bestIdx = idx;
            bestGeom = buildGeom();
          }
        }

        // Strong magnetic lock once an edge is already activated
        const stickyRadius = Math.max(hitRadius * 2.4, hitRadius + 24);
        let chosenIdx = bestIdx;
        let chosenGeom = bestGeom;
        let effectiveWithin = bestDist <= hitRadius;
        if (
          curSens.edgeSnap &&
          highlightedEdgeIdxRef.current !== null &&
          latchedEdgeIdxRef.current === highlightedEdgeIdxRef.current &&
          latchedGeom &&
          latchedDist <= stickyRadius &&
          !(bestDist < Math.min(4, hitRadius * 0.25) && bestDist < latchedDist * 0.35)
        ) {
          chosenIdx = latchedEdgeIdxRef.current;
          chosenGeom = latchedGeom;
          effectiveWithin = true;
        }

        if (!effectiveWithin || chosenIdx < 0 || !chosenGeom) {
          if (
            latchedEdgeIdxRef.current !== null ||
            highlightedEdgeIdxRef.current !== null ||
            edgeHighlightTimerRef.current !== null
          ) {
            clearEdgeState(true);
          }
          return;
        }

        // Edge is already active: update snap circle & highlight line immediately
        if (highlightedEdgeIdxRef.current === chosenIdx) {
          setEdgeSnapOverlay(chosenGeom);
          return;
        }

        // Still waiting for dwell on the same edge: reset timer while pointer keeps moving fast
        if (latchedEdgeIdxRef.current === chosenIdx) {
          if (moveDist <= 5 || !edgeHighlightTimerRef.current) {
            return;
          }
        }

        if (edgeHighlightTimerRef.current) {
          window.clearTimeout(edgeHighlightTimerRef.current);
          edgeHighlightTimerRef.current = null;
        }
        if (highlightedEdgeIdxRef.current !== null) {
          chart.dispatchAction({
            type: 'downplay',
            seriesIndex: 0,
            dataType: 'edge',
            dataIndex: highlightedEdgeIdxRef.current,
          });
          highlightedEdgeIdxRef.current = null;
        }
        setEdgeSnapOverlay(null);

        latchedEdgeIdxRef.current = chosenIdx;
        const edgeMeta = graphRef.current.edges[chosenIdx];
        const geomSnapshot = chosenGeom;
        const dwell = sensitivityToDwellMs(curSens.edges);

        const activateEdge = () => {
          if (latchedEdgeIdxRef.current !== chosenIdx || hoverNodeActiveRef.current) {
            return;
          }
          highlightedEdgeIdxRef.current = chosenIdx;
          chart.dispatchAction({
            type: 'highlight',
            seriesIndex: 0,
            dataType: 'edge',
            dataIndex: chosenIdx,
          });
          // Show BOTH line highlight and snap circle simultaneously at activation moment
          setEdgeSnapOverlay({ ...geomSnapshot, showDot: sensitivityRef.current.edgeSnap });
          if (edgeMeta?.source) {
            applyNodeHighlightImmediate(edgeMeta.source);
            onHoverRef.current(edgeMeta.source);
          }
        };

        if (dwell === 0) {
          activateEdge();
        } else {
          edgeHighlightTimerRef.current = window.setTimeout(() => {
            edgeHighlightTimerRef.current = null;
            activateEdge();
          }, dwell);
        }
      };

      const handleZrGlobalOut = () => {
        hoverNodeActiveRef.current = false;
        clearEdgeState(true);
      };

      zr.on('mousemove', handleZrMouseMove);
      zr.on('globalout', handleZrGlobalOut);

      const observer = new ResizeObserver(() => {
        chart.resize();
      });
      observer.observe(el);

      return () => {
        if (dwellTimerRef.current) window.clearTimeout(dwellTimerRef.current);
        if (edgeHighlightTimerRef.current) window.clearTimeout(edgeHighlightTimerRef.current);
        zr.off('mousemove', handleZrMouseMove);
        zr.off('globalout', handleZrGlobalOut);
        observer.disconnect();
        chart.dispose();
        instanceRef.current = null;
      };
    }, []);

    useEffect(() => {
      const chart = instanceRef.current;
      if (!chart) {
        return;
      }

      const degrees = computeNodeDegrees(graph);
      const fixedPositions =
        mode === 'radial'
          ? computeRadialPositions(graph)
          : mode === 'tree'
            ? computeTreePositions(graph)
            : null;

      const repulsion = Math.max(460, Math.min(1150, graph.nodes.length * 26));

      chart.setOption(
        {
          animationDurationUpdate: 220,
          stateAnimation: { duration: 0 },
          backgroundColor: 'transparent',
          tooltip: {
            trigger: 'item',
            backgroundColor: 'rgba(17, 18, 22, 0.94)',
            borderColor: 'rgba(255, 255, 255, 0.14)',
            borderWidth: 1,
            padding: [6, 10],
            textStyle: { color: '#eceef2', fontSize: 12 },
            formatter: (params: unknown) => {
              const p = params as {
                dataType?: string;
                data?: { name?: string; nodeMeta?: ProjectGraphNode; edgeLabel?: string };
              };
              if (p.dataType === 'node' && p.data?.nodeMeta) {
                const kindLabel = NODE_KIND_LABELS[p.data.nodeMeta.kind];
                const deg = degrees.get(p.data.nodeMeta.id) ?? 0;
                return `<div style="font-size:10px;color:#9ba1b0;">${kindLabel}</div><div><b>${p.data.nodeMeta.label}</b> <span style="color:#686f7f;">(${deg})</span></div>`;
              }
              return '';
            },
          },
          series: [
            {
              type: 'graph',
              layout: mode === 'force' ? 'force' : 'none',
              roam: true,
              draggable: mode === 'force',
              scaleLimit: { min: 0.25, max: 3 },
              force:
                mode === 'force'
                  ? {
                      repulsion,
                      edgeLength: [90, 175],
                      gravity: 0.045,
                      friction: 0.55,
                      layoutAnimation: true,
                    }
                  : undefined,
              label: {
                show: true,
                position: 'right',
                distance: 5,
                color: '#cfd5e3',
                fontSize: 11,
                fontFamily: 'Inter, sans-serif',
                textBorderColor: '#0c0d10',
                textBorderWidth: 3,
                overflow: 'truncate',
                width: 140,
              },
              labelLayout: {
                hideOverlap: true,
              },
              emphasis: {
                focus: 'adjacency',
                scale: 1.25,
                label: {
                  show: true,
                  color: '#ffffff',
                  fontWeight: 600,
                  width: 220,
                },
                lineStyle: {
                  width: 2.4,
                  opacity: 0.96,
                },
              },
              blur: {
                itemStyle: {
                  opacity: 0.16,
                },
                lineStyle: {
                  opacity: 0.05,
                },
                label: {
                  opacity: 0.12,
                },
              },
              edgeSymbol: ['none', 'arrow'],
              edgeSymbolSize: [3, 6],
              data: graph.nodes.map((node) => {
                const deg = degrees.get(node.id) ?? 0;
                const baseSize =
                  node.kind === 'project'
                    ? 24
                    : node.kind === 'dataset' || node.kind === 'page'
                      ? 18
                      : node.kind === 'join' || node.kind === 'filter'
                        ? 14
                        : node.kind === 'element'
                          ? 12
                          : 9;
                const symbolSize = Math.min(34, baseSize + Math.min(8, Math.floor(deg * 0.7)));
                const color = NODE_COLORS[node.kind];
                const coords = fixedPositions?.get(node.id);
                const levelSens = getSensitivityForKind(node.kind, sensitivity);
                const nodeDisabled = levelSens <= 0;
                const nodeDelayGated = levelSens < 100;
                return {
                  id: node.id,
                  name: node.label,
                  ...(coords ? { x: coords.x, y: coords.y } : {}),
                  symbolSize,
                  silent: nodeDisabled,
                  emphasis:
                    nodeDisabled || nodeDelayGated
                      ? { disabled: true }
                      : undefined,
                  itemStyle: {
                    color,
                    borderColor: '#0c0d10',
                    borderWidth: 1.8,
                    shadowBlur:
                      node.kind === 'project' || node.kind === 'page' || node.kind === 'dataset'
                        ? 12
                        : 4,
                    shadowColor: `${color}55`,
                  },
                  nodeMeta: node,
                };
              }),
              links: graph.edges.map((edge) => ({
                source: edge.source,
                target: edge.target,
                edgeLabel: edge.label,
                silent: true,
                // Disable ECharts' built-in instant 0ms hover highlight on links so our dwell handler controls it cleanly
                emphasis: { disabled: true },
                lineStyle:
                  edge.kind === 'link'
                    ? {
                        color: '#a78bfa',
                        width: 1.8,
                        type: 'dashed',
                        curveness: 0.22,
                        opacity: 0.85,
                      }
                    : edge.kind === 'lineage'
                      ? {
                          color: 'rgba(52, 211, 153, 0.32)',
                          width: 1.2,
                          curveness: mode === 'tree' ? 0.18 : 0.12,
                        }
                      : {
                          color: 'rgba(203, 213, 225, 0.22)',
                          width: 1.1,
                          curveness: mode === 'tree' ? 0.14 : 0.08,
                        },
              })),
            },
          ],
        },
        true,
      );
    }, [graph, mode, sensitivity]);

    // Sync cross-panel hover via React prop fallback (primary instant path goes through syncHoveredNode)
    useEffect(() => {
      applyNodeHighlightImmediate(hoveredNodeId);
    }, [hoveredNodeId, nodeIndexById]);

    return (
      <div className="graph-box-wrap">
        <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 0 }} />
        {edgeSnapOverlay && (
          <svg className="graph-snap-overlay" aria-hidden="true">
            {edgeSnapOverlay.cx !== undefined && edgeSnapOverlay.cy !== undefined ? (
              <path
                d={`M ${edgeSnapOverlay.x1} ${edgeSnapOverlay.y1} Q ${edgeSnapOverlay.cx} ${edgeSnapOverlay.cy} ${edgeSnapOverlay.x2} ${edgeSnapOverlay.y2}`}
                fill="none"
                stroke="#a78bfa"
                strokeOpacity={0.85}
                strokeWidth="3"
              />
            ) : (
              <line
                x1={edgeSnapOverlay.x1}
                y1={edgeSnapOverlay.y1}
                x2={edgeSnapOverlay.x2}
                y2={edgeSnapOverlay.y2}
                stroke="#a78bfa"
                strokeOpacity={0.85}
                strokeWidth="3"
              />
            )}
            <circle cx={edgeSnapOverlay.x1} cy={edgeSnapOverlay.y1} r={4} fill="none" stroke="#c9bdff" strokeWidth={1.5} />
            <circle cx={edgeSnapOverlay.x2} cy={edgeSnapOverlay.y2} r={4} fill="none" stroke="#c9bdff" strokeWidth={1.5} />
            {edgeSnapOverlay.showDot && (
              <circle
                cx={edgeSnapOverlay.px}
                cy={edgeSnapOverlay.py}
                r={5.5}
                fill="#7c5cff"
                stroke="#ffffff"
                strokeWidth={1.5}
              />
            )}
            <g transform={`translate(${edgeSnapOverlay.px + 10}, ${edgeSnapOverlay.py - 12})`}>
              <rect
                x={0}
                y={-11}
                width={Math.max(44, edgeSnapOverlay.label.length * 6.5 + 14)}
                height={18}
                rx={3}
                fill="#14161c"
                stroke="rgba(255,255,255,0.18)"
              />
              <text x={7} y={1} fill="#e5e7eb" fontSize="10.5" fontFamily="JetBrains Mono, monospace">
                {edgeSnapOverlay.label}
              </text>
            </g>
          </svg>
        )}
      </div>
    );
  },
);

export default EChartGraphBox;
