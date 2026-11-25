import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { GraphChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ProjectGraphNode, ProjectGraphResult } from './transforms';

echarts.use([GraphChart, TooltipComponent, CanvasRenderer]);

interface EChartGraphBoxProps {
  graph: ProjectGraphResult;
  onSelectNode: (node: ProjectGraphNode) => void;
}

export function EChartGraphBox({ graph, onSelectNode }: EChartGraphBoxProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);
  const onSelectRef = useRef(onSelectNode);
  onSelectRef.current = onSelectNode;

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

    const colorForKind = (kind: ProjectGraphNode['kind']) => {
      switch (kind) {
        case 'project':
          return '#c4b5fd';
        case 'page':
          return '#7c5cff';
        case 'element':
          return '#38bdf8';
      }
    };

    const sizeForKind = (kind: ProjectGraphNode['kind']) => {
      switch (kind) {
        case 'project':
          return 28;
        case 'page':
          return 22;
        case 'element':
          return 15;
      }
    };

    chart.setOption(
      {
        animationDurationUpdate: 260,
        backgroundColor: 'transparent',
        tooltip: {
          backgroundColor: '#171a22',
          borderColor: 'rgba(255, 255, 255, 0.14)',
          textStyle: { color: '#eceef4', fontSize: 11 },
          formatter: (params: unknown) => {
            const p = params as {
              dataType?: string;
              data?: { name?: string; nodeMeta?: ProjectGraphNode; edgeLabel?: string };
            };
            if (p.dataType === 'node' && p.data?.nodeMeta) {
              const kindLabel =
                p.data.nodeMeta.kind === 'project'
                  ? 'Проєкт'
                  : p.data.nodeMeta.kind === 'page'
                    ? 'Сторінка Canvas'
                    : 'Елемент Canvas';
              return `${kindLabel}: <b>${p.data.nodeMeta.label}</b>`;
            }
            if (p.dataType === 'edge' && p.data?.edgeLabel) {
              return `Посилання: ${p.data.edgeLabel}`;
            }
            return '';
          },
        },
        series: [
          {
            type: 'graph',
            layout: 'force',
            roam: true,
            draggable: true,
            force: {
              repulsion: 220,
              edgeLength: [55, 110],
              gravity: 0.08,
            },
            label: {
              show: true,
              position: 'right',
              color: '#cbd5e1',
              fontSize: 11,
            },
            edgeSymbol: ['none', 'arrow'],
            edgeSymbolSize: [4, 7],
            data: graph.nodes.map((node) => ({
              id: node.id,
              name: node.label,
              symbolSize: sizeForKind(node.kind),
              itemStyle: {
                color: colorForKind(node.kind),
                borderColor: '#0b0c10',
                borderWidth: 2,
              },
              nodeMeta: node,
            })),
            links: graph.edges.map((edge) => ({
              source: edge.source,
              target: edge.target,
              edgeLabel: edge.label,
              lineStyle:
                edge.kind === 'link'
                  ? {
                      color: '#a78bfa',
                      width: 2,
                      type: 'dashed',
                      curveness: 0.18,
                      opacity: 0.95,
                    }
                  : {
                      color: 'rgba(255, 255, 255, 0.22)',
                      width: 1.2,
                      curveness: 0.05,
                    },
            })),
          },
        ],
      },
      true,
    );
  }, [graph]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 0 }} />;
}

export default EChartGraphBox;
