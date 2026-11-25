import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  LineChart,
  BarChart,
  PieChart,
  ScatterChart,
  DataZoomComponent,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

const SERIES_PALETTE = [
  '#7c5cff',
  '#38bdf8',
  '#34d399',
  '#fbbf24',
  '#f472b6',
  '#a78bfa',
  '#fb7185',
];

export type EChartPayload =
  | {
      kind: 'basic';
      chartType: 'line-chart' | 'bar-chart' | 'histogram';
      labels: string[];
      values: number[];
      seriesName: string;
    }
  | {
      kind: 'pie';
      items: Array<{ name: string; value: number }>;
      isDonut: boolean;
      seriesName: string;
    }
  | {
      kind: 'stacked-bar';
      xLabels: string[];
      series: Array<{ name: string; data: number[] }>;
    }
  | {
      kind: 'scatter';
      points: Array<{ x: number; y: number; label: string }>;
      xName: string;
      yName: string;
    };

export function EChartBox({ payload }: { payload: EChartPayload }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    const chart = echarts.init(el, undefined, { renderer: 'canvas' });
    instanceRef.current = chart;

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

    const baseTooltip = {
      backgroundColor: '#171a22',
      borderColor: 'rgba(255, 255, 255, 0.14)',
      textStyle: {
        color: '#eceef4',
        fontSize: 11,
      },
    };

    const axisStyle = {
      axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.12)' } },
      axisTick: { show: false },
      axisLabel: { color: '#8e96aa', fontSize: 10 },
    };

    // dataZoom for scroll-wheel zooming inside charts
    const insideDataZoom = [
      { type: 'inside', xAxisIndex: 0, zoomOnMouseWheel: true, moveOnMouseMove: false, preventDefaultMouseMove: false },
    ];

    const splitLine = {
      lineStyle: { color: 'rgba(255, 255, 255, 0.06)' },
    };

    if (payload.kind === 'pie') {
      chart.setOption(
        {
          animationDuration: 220,
          backgroundColor: 'transparent',
          color: SERIES_PALETTE,
          tooltip: {
            ...baseTooltip,
            trigger: 'item',
            formatter: '{b}: {c} ({d}%)',
          },
          legend: {
            bottom: 0,
            textStyle: { color: '#a1a7b8', fontSize: 10 },
            type: 'scroll',
          },
          series: [
            {
              name: payload.seriesName,
              type: 'pie',
              radius: payload.isDonut ? ['44%', '72%'] : '70%',
              center: ['50%', '44%'],
              data: payload.items,
              label: { show: false },
              itemStyle: {
                borderColor: '#101218',
                borderWidth: 2,
              },
            },
          ],
        },
        true,
      );
      return;
    }

    if (payload.kind === 'stacked-bar') {
      chart.setOption(
        {
          animationDuration: 220,
          backgroundColor: 'transparent',
          color: SERIES_PALETTE,
          tooltip: { ...baseTooltip, trigger: 'axis', axisPointer: { type: 'shadow' } },
          legend: {
            top: 0,
            type: 'scroll',
            textStyle: { color: '#a1a7b8', fontSize: 10 },
          },
          grid: { top: 28, right: 14, bottom: 48, left: 14, containLabel: true },
          xAxis: {
            type: 'category',
            data: payload.xLabels,
            ...axisStyle,
            axisLabel: {
              ...axisStyle.axisLabel,
              interval: 0,
              rotate: payload.xLabels.length > 6 ? 35 : 0,
              hideOverlap: true,
            },
          },
          yAxis: {
            type: 'value',
            splitLine,
            axisLabel: axisStyle.axisLabel,
          },
          dataZoom: insideDataZoom,
          series: payload.series.map((s) => ({
            name: s.name,
            type: 'bar',
            stack: 'total',
            barMaxWidth: 34,
            data: s.data,
          })),
        },
        true,
      );
      return;
    }

    if (payload.kind === 'scatter') {
      chart.setOption(
        {
          animationDuration: 220,
          backgroundColor: 'transparent',
          tooltip: {
            ...baseTooltip,
            trigger: 'item',
            formatter: (params: unknown) => {
              const p = params as { data?: { value: [number, number]; name: string } };
              if (!p.data) {
                return '';
              }
              return `${p.data.name}<br/>${payload.xName}: ${p.data.value[0]}<br/>${payload.yName}: ${p.data.value[1]}`;
            },
          },
          grid: { top: 16, right: 16, bottom: 32, left: 14, containLabel: true },
          xAxis: {
            type: 'value',
            scale: true,
            splitLine,
            ...axisStyle,
            axisLabel: { ...axisStyle.axisLabel, hideOverlap: true },
          },
          yAxis: {
            type: 'value',
            scale: true,
            splitLine,
            axisLabel: axisStyle.axisLabel,
          },
          dataZoom: [
            { type: 'inside', xAxisIndex: 0, zoomOnMouseWheel: true, moveOnMouseMove: false },
            { type: 'inside', yAxisIndex: 0, zoomOnMouseWheel: false, moveOnMouseMove: false },
          ],
          series: [
            {
              type: 'scatter',
              symbolSize: 8,
              itemStyle: {
                color: '#8f73ff',
                opacity: 0.88,
              },
              data: payload.points.map((pt) => ({
                name: pt.label,
                value: [pt.x, pt.y],
              })),
            },
          ],
        },
        true,
      );
      return;
    }

    // basic: line-chart, bar-chart, histogram
    const isLine = payload.chartType === 'line-chart';
    const isHist = payload.chartType === 'histogram';
    const labelCount = payload.labels.length;
    // rotate labels when there are many categories so they don't overlap
    const labelRotate = labelCount > 8 ? 45 : labelCount > 5 ? 30 : 0;

    chart.setOption(
      {
        animationDuration: 220,
        backgroundColor: 'transparent',
        grid: {
          top: 14,
          right: 14,
          bottom: labelRotate > 0 ? 60 : 42,
          left: 14,
          containLabel: true,
        },
        tooltip: {
          ...baseTooltip,
          trigger: 'axis',
        },
        xAxis: {
          type: 'category',
          data: payload.labels,
          ...axisStyle,
          axisLabel: {
            ...axisStyle.axisLabel,
            interval: 0,
            rotate: labelRotate,
            hideOverlap: true,
          },
        },
        yAxis: {
          type: 'value',
          splitLine,
          axisLabel: axisStyle.axisLabel,
        },
        dataZoom: insideDataZoom,
        series: [
          {
            name: payload.seriesName,
            type: isLine ? 'line' : 'bar',
            data: payload.values,
            smooth: isLine ? 0.2 : false,
            symbolSize: isLine ? 6 : undefined,
            barMaxWidth: isHist ? undefined : 34,
            barCategoryGap: isHist ? '4%' : undefined,
            itemStyle: {
              color: '#7c5cff',
              borderRadius: isLine ? 0 : [3, 3, 0, 0],
            },
            lineStyle: isLine ? { width: 2, color: '#8f73ff' } : undefined,
            areaStyle: isLine
              ? {
                  color: 'rgba(124, 92, 255, 0.14)',
                }
              : undefined,
          },
        ],
      },
      true,
    );
  }, [payload]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 0 }} />;
}

export default EChartBox;
