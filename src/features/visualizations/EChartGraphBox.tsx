import { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts/core';
import { GraphChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import type { ProjectGraphNode, ProjectGraphResult } from './transforms';

echarts.use([GraphChart, TooltipComponent, CanvasRenderer, LabelLayout]);

export type GraphLayoutMode = 'force' | 'radial' | 'tree';

interface EChartGraphBoxProps {
  graph: ProjectGraphResult;
  mode: GraphLayoutMode;
  hoveredNodeId: string | null;
  onHoverNode: (nodeId: string | null) => void;
  onSelectNode: (node: ProjectGraphNode) => void;
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

  // Group outer elements in page order so edges stay clean and untangled
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

  // Group elements directly beside their parent pages for crystal-clear vertical alignment
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

export function EChartGraphBox({
  graph,
  mode,
  hoveredNodeId,
  onHoverNode,
  onSelectNode,
}: EChartGraphBoxProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);
  const onSelectRef = useRef(onSelectNode);
  const onHoverRef = useRef(onHoverNode);
  onSelectRef.current = onSelectNode;
  onHoverRef.current = onHoverNode;

  const nodeIndexById = useMemo(
    () => new Map(graph.nodes.map((n, idx) => [n.id, idx])),
    [graph.nodes],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    const chart = echarts.init(el, undefined, { renderer: 'canvas' });
    instanceRef.current = chart;

    chart.on('click', (params: unknown) => {
      const p = params as { dataType?: string; data?: { nodeMeta?: ProjectGraphNode } };
      if (p.dataType === 'node' && p.data?.nodeMeta) {
        onSelectRef.current(p.data.nodeMeta);
      }
    });

    chart.on('mouseover', (params: unknown) => {
      const p = params as { dataType?: string; data?: { nodeMeta?: ProjectGraphNode } };
      if (p.dataType === 'node' && p.data?.nodeMeta) {
        onHoverRef.current(p.data.nodeMeta.id);
      }
    });

    chart.on('mouseout', (params: unknown) => {
      const p = params as { dataType?: string };
      if (p.dataType === 'node') {
        onHoverRef.current(null);
      }
    });

    const observer = new ResizeObserver(() => {
      chart.resize();
    });
    observer.observe(el);

    return () => {
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
        animationDurationUpdate: 280,
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
            if (p.dataType === 'edge' && p.data?.edgeLabel) {
              return `Зв’язок: ${p.data.edgeLabel}`;
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
                width: 2.2,
                opacity: 0.95,
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
              return {
                id: node.id,
                name: node.label,
                ...(coords ? { x: coords.x, y: coords.y } : {}),
                symbolSize,
                itemStyle: {
                  color,
                  borderColor: '#0c0d10',
                  borderWidth: 1.8,
                  shadowBlur: node.kind === 'project' || node.kind === 'page' || node.kind === 'dataset' ? 12 : 4,
                  shadowColor: `${color}55`,
                },
                nodeMeta: node,
              };
            }),
            links: graph.edges.map((edge) => ({
              source: edge.source,
              target: edge.target,
              edgeLabel: edge.label,
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
  }, [graph, mode]);

  // Cross-panel synchronized highlight when hovering a node in either panel
  useEffect(() => {
    const chart = instanceRef.current;
    if (!chart) {
      return;
    }
    chart.dispatchAction({ type: 'downplay', seriesIndex: 0 });
    if (hoveredNodeId) {
      const idx = nodeIndexById.get(hoveredNodeId);
      if (idx !== undefined) {
        chart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: idx });
      }
    }
  }, [hoveredNodeId, nodeIndexById]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 0 }} />;
}

export default EChartGraphBox;
