import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type {
  ChartDataLabelPosition,
  ChartDisplayOptions,
  ChartLegendPosition,
} from '../../domain/models';

echarts.use([
  LineChart,
  BarChart,
  PieChart,
  ScatterChart,
  DataZoomComponent,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  SVGRenderer,
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

export interface EChartBoxHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

interface EChartBoxProps {
  payload: EChartPayload;
  displayOptions?: ChartDisplayOptions;
}

function formatCompactValue(val: unknown): string {
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    return String(val ?? '');
  }
  if (Math.abs(val) >= 1_000_000) {
    return `${(val / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(val) >= 10_000) {
    return `${(val / 1_000).toFixed(1)}k`;
  }
  return Number.isInteger(val) ? String(val) : val.toFixed(1);
}

const DATA_LABEL_HALO = {
  textBorderColor: 'rgba(12, 13, 16, 0.85)',
  textBorderWidth: 2,
};

function resolveCartesianLabelPos(
  pos: ChartDataLabelPosition | undefined,
  fallback: ChartDataLabelPosition,
): 'top' | 'bottom' | 'left' | 'right' | 'inside' | 'insideTop' | 'insideBottom' {
  const effective = pos ?? fallback;
  if (effective === 'outside') {
    return 'top';
  }
  return effective;
}

function buildLegendAndOffsets(
  showLegend: boolean,
  position: ChartLegendPosition,
  axisLabelFontSize: number,
  showDataLabels: boolean,
  labelPos: ChartDataLabelPosition,
  bottomRotateOffset: number,
) {
  const isVertical = position === 'left' || position === 'right';
  const isBottom =
    position === 'bottom' || position === 'bottom-left' || position === 'bottom-right';
  const isTop = position === 'top' || position === 'top-left' || position === 'top-right';

  const legendBase: Record<string, unknown> = {
    show: showLegend,
    type: 'scroll',
    orient: isVertical ? 'vertical' : 'horizontal',
    textStyle: isVertical
      ? { color: '#a1a7b8', fontSize: axisLabelFontSize, width: 84, overflow: 'truncate' }
      : { color: '#a1a7b8', fontSize: axisLabelFontSize },
  };

  if (position === 'top') {
    legendBase.top = 2;
    legendBase.left = 'center';
  } else if (position === 'bottom') {
    legendBase.bottom = 2;
    legendBase.left = 'center';
  } else if (position === 'left') {
    legendBase.left = 2;
    legendBase.top = 'middle';
  } else if (position === 'right') {
    legendBase.right = 2;
    legendBase.top = 'middle';
  } else if (position === 'top-left') {
    legendBase.top = 2;
    legendBase.left = 6;
  } else if (position === 'top-right') {
    legendBase.top = 2;
    legendBase.right = 6;
  } else if (position === 'bottom-left') {
    legendBase.bottom = 2;
    legendBase.left = 6;
  } else if (position === 'bottom-right') {
    legendBase.bottom = 2;
    legendBase.right = 6;
  } else if (position === 'center') {
    legendBase.top = 'middle';
    legendBase.left = 'center';
    legendBase.backgroundColor = 'rgba(16, 18, 24, 0.86)';
    legendBase.borderColor = 'rgba(255, 255, 255, 0.12)';
    legendBase.borderWidth = 1;
    legendBase.borderRadius = 6;
    legendBase.padding = [4, 8];
  }

  const labelTopExtra = showDataLabels && (labelPos === 'top' || labelPos === 'outside') ? 10 : 0;
  const labelSideLeft = showDataLabels && labelPos === 'left' ? 28 : 14;
  const labelSideRight = showDataLabels && labelPos === 'right' ? 32 : 14;

  const grid = {
    top: showLegend && isTop ? 28 + labelTopExtra : 14 + labelTopExtra,
    right: showLegend && position === 'right' ? 114 : labelSideRight,
    bottom: bottomRotateOffset + (showLegend && isBottom ? 24 : 0),
    left: showLegend && position === 'left' ? 114 : labelSideLeft,
    containLabel: true,
  };

  const pieCenter: [string, string] = !showLegend
    ? ['50%', '50%']
    : isTop
      ? ['50%', '56%']
      : isBottom
        ? ['50%', '44%']
        : position === 'left'
          ? ['62%', '50%']
          : position === 'right'
            ? ['38%', '50%']
            : ['50%', '50%'];

  return { legend: legendBase, grid, pieCenter };
}

export const EChartBox = forwardRef<EChartBoxHandle, EChartBoxProps>(function EChartBox(
  { payload, displayOptions },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);
  const zoomRangeRef = useRef<{ start: number; end: number }>({ start: 0, end: 100 });

  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      const chart = instanceRef.current;
      if (!chart) {
        return;
      }
      const { start, end } = zoomRangeRef.current;
      const span = end - start;
      const nextSpan = Math.max(10, span * 0.72);
      const center = (start + end) / 2;
      const nextStart = Math.max(0, center - nextSpan / 2);
      const nextEnd = Math.min(100, nextStart + nextSpan);
      zoomRangeRef.current = { start: nextStart, end: nextEnd };
      chart.dispatchAction({ type: 'dataZoom', start: nextStart, end: nextEnd });
    },
    zoomOut: () => {
      const chart = instanceRef.current;
      if (!chart) {
        return;
      }
      const { start, end } = zoomRangeRef.current;
      const span = end - start;
      const nextSpan = Math.min(100, span * 1.38);
      const center = (start + end) / 2;
      let nextStart = center - nextSpan / 2;
      let nextEnd = center + nextSpan / 2;
      if (nextStart < 0) {
        nextEnd = Math.min(100, nextEnd - nextStart);
        nextStart = 0;
      }
      if (nextEnd > 100) {
        nextStart = Math.max(0, nextStart - (nextEnd - 100));
        nextEnd = 100;
      }
      zoomRangeRef.current = { start: nextStart, end: nextEnd };
      chart.dispatchAction({ type: 'dataZoom', start: nextStart, end: nextEnd });
    },
    resetZoom: () => {
      const chart = instanceRef.current;
      if (!chart) {
        return;
      }
      zoomRangeRef.current = { start: 0, end: 100 };
      chart.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
    },
  }));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    const chart = echarts.init(el, undefined, { renderer: 'svg' });
    instanceRef.current = chart;

    chart.on('datazoom', () => {
      const opt = chart.getOption() as { dataZoom?: Array<{ start?: number; end?: number }> };
      const dz = opt.dataZoom?.[0];
      if (dz && typeof dz.start === 'number' && typeof dz.end === 'number') {
        zoomRangeRef.current = { start: dz.start, end: dz.end };
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

    const showDataLabels = Boolean(displayOptions?.showDataLabels);
    const dataLabelFontSize = displayOptions?.dataLabelFontSize ?? 10;
    const axisLabelFontSize = displayOptions?.axisLabelFontSize ?? 10;
    const accentColor = displayOptions?.accentColor || '#7c5cff';
    const palette = [accentColor, ...SERIES_PALETTE.filter((c) => c.toLowerCase() !== accentColor.toLowerCase())];
    const asPercent = Boolean(displayOptions?.asPercent);
    const showAvgLine = Boolean(displayOptions?.showAvgLine);

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
      axisLabel: { color: '#8e96aa', fontSize: axisLabelFontSize },
    };

    const splitLine = {
      lineStyle: { color: 'rgba(255, 255, 255, 0.06)' },
    };

    const insideDataZoom = [
      {
        type: 'inside',
        xAxisIndex: 0,
        zoomOnMouseWheel: true,
        moveOnMouseMove: false,
        preventDefaultMouseMove: false,
      },
    ];

    if (payload.kind === 'pie') {
      const showLegend = displayOptions?.showLegend !== false;
      const legendPos = displayOptions?.legendPosition ?? 'bottom';
      const rawLabelPos = displayOptions?.dataLabelPosition;
      const pieLabelPos: 'inside' | 'outside' =
        rawLabelPos === 'inside' || rawLabelPos === 'insideTop' || rawLabelPos === 'insideBottom'
          ? 'inside'
          : 'outside';
      const layout = buildLegendAndOffsets(
        showLegend,
        legendPos,
        axisLabelFontSize,
        showDataLabels,
        pieLabelPos,
        0,
      );
      chart.setOption(
        {
          animationDuration: 220,
          backgroundColor: 'transparent',
          color: palette,
          tooltip: {
            ...baseTooltip,
            trigger: 'item',
            formatter: '{b}: {c} ({d}%)',
          },
          legend: layout.legend,
          series: [
            {
              name: payload.seriesName,
              type: 'pie',
              radius: payload.isDonut
                ? showLegend
                  ? ['40%', '68%']
                  : ['48%', '80%']
                : showLegend
                  ? '68%'
                  : '78%',
              center: layout.pieCenter,
              data: payload.items,
              label: showDataLabels
                ? {
                    show: true,
                    position: pieLabelPos,
                    color: '#eceef4',
                    fontSize: dataLabelFontSize,
                    ...DATA_LABEL_HALO,
                    formatter: (p: { name?: string; value?: unknown; percent?: number }) =>
                      Number(p.value) === 0 ? '' : `${p.name ?? ''}: ${p.percent ?? 0}%`,
                  }
                : { show: false },
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
      const showLegend = displayOptions?.showLegend !== false;
      const legendPos = displayOptions?.legendPosition ?? 'top';
      const labelPos = resolveCartesianLabelPos(displayOptions?.dataLabelPosition, 'inside');
      const autoRotate = payload.xLabels.length > 6 ? 35 : 0;
      const rotate =
        displayOptions?.rotateLabels === false
          ? 0
          : displayOptions?.rotateLabels === true
            ? payload.xLabels.length > 8
              ? 45
              : 30
            : autoRotate;
      const layout = buildLegendAndOffsets(
        showLegend,
        legendPos,
        axisLabelFontSize,
        showDataLabels,
        labelPos,
        rotate > 0 ? 52 : 34,
      );

      chart.setOption(
        {
          animationDuration: 220,
          backgroundColor: 'transparent',
          color: palette,
          tooltip: { ...baseTooltip, trigger: 'axis', axisPointer: { type: 'shadow' } },
          legend: layout.legend,
          grid: layout.grid,
          xAxis: {
            type: 'category',
            data: payload.xLabels,
            ...axisStyle,
            axisLabel: {
              ...axisStyle.axisLabel,
              interval: 0,
              rotate,
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
            label: showDataLabels
              ? {
                  show: true,
                  position: labelPos,
                  color: '#eceef4',
                  fontSize: dataLabelFontSize,
                  ...DATA_LABEL_HALO,
                  formatter: (p: { value?: unknown }) => {
                    const num = Number(p.value);
                    return Number.isFinite(num) && num !== 0 ? formatCompactValue(num) : '';
                  },
                }
              : { show: false },
          })),
        },
        true,
      );
      return;
    }

    if (payload.kind === 'scatter') {
      const scatterLabelPos = resolveCartesianLabelPos(displayOptions?.dataLabelPosition, 'top');
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
          grid: {
            top: showDataLabels && scatterLabelPos === 'top' ? 24 : 16,
            right: showDataLabels && scatterLabelPos === 'right' ? 32 : 16,
            bottom: 32,
            left: showDataLabels && scatterLabelPos === 'left' ? 32 : 14,
            containLabel: true,
          },
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
            {
              type: 'inside',
              xAxisIndex: 0,
              zoomOnMouseWheel: true,
              moveOnMouseMove: false,
              preventDefaultMouseMove: false,
            },
            {
              type: 'inside',
              yAxisIndex: 0,
              zoomOnMouseWheel: false,
              moveOnMouseMove: false,
              preventDefaultMouseMove: false,
            },
          ],
          series: [
            {
              type: 'scatter',
              symbolSize: 8,
              itemStyle: {
                color: accentColor,
                opacity: 0.88,
              },
              label: showDataLabels
                ? {
                    show: true,
                    position: scatterLabelPos,
                    color: '#c8cddb',
                    fontSize: dataLabelFontSize,
                    ...DATA_LABEL_HALO,
                    formatter: (p: { name?: string }) => p.name ?? '',
                  }
                : { show: false },
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
    const showLegend = Boolean(displayOptions?.showLegend);
    const legendPos = displayOptions?.legendPosition ?? 'top';
    const labelPos = resolveCartesianLabelPos(displayOptions?.dataLabelPosition, 'top');
    const isLine = payload.chartType === 'line-chart';
    const isHist = payload.chartType === 'histogram';
    const labelCount = payload.labels.length;
    const autoRotate = labelCount > 8 ? 45 : labelCount > 5 ? 30 : 0;
    const labelRotate =
      displayOptions?.rotateLabels === false
        ? 0
        : displayOptions?.rotateLabels === true
          ? labelCount > 8
            ? 45
            : 30
          : autoRotate;
    const layout = buildLegendAndOffsets(
      showLegend,
      legendPos,
      axisLabelFontSize,
      showDataLabels,
      labelPos,
      labelRotate > 0 ? 54 : 34,
    );

    chart.setOption(
      {
        animationDuration: 220,
        backgroundColor: 'transparent',
        legend: layout.legend,
        grid: layout.grid,
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
          axisLabel: {
            ...axisStyle.axisLabel,
            formatter: asPercent ? '{value}%' : undefined,
          },
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
            label: showDataLabels
              ? {
                  show: true,
                  position: labelPos,
                  color: '#eceef4',
                  fontSize: dataLabelFontSize,
                  ...DATA_LABEL_HALO,
                  formatter: (p: { value?: unknown }) => {
                    const num = Number(p.value);
                    if (isHist && Number.isFinite(num) && num === 0) {
                      return '';
                    }
                    return asPercent ? `${formatCompactValue(p.value)}%` : formatCompactValue(p.value);
                  },
                }
              : { show: false },
            markLine: showAvgLine
              ? {
                  animation: false,
                  silent: true,
                  symbol: 'none',
                  lineStyle: { color: '#fbbf24', type: 'dashed', width: 1.5 },
                  label: {
                    position: 'insideEndTop',
                    distance: [0, 4],
                    color: '#fbbf24',
                    backgroundColor: 'rgba(16, 18, 24, 0.88)',
                    borderRadius: 3,
                    padding: [2, 5],
                    fontSize: 10,
                    formatter: (p: { value?: unknown }) =>
                      `μ: ${formatCompactValue(p.value)}${asPercent ? '%' : ''}`,
                  },
                  data: [{ type: 'average', name: 'Середнє' }],
                }
              : undefined,
            itemStyle: {
              color: accentColor,
              borderRadius: isLine ? 0 : [3, 3, 0, 0],
            },
            lineStyle: isLine ? { width: 2, color: accentColor } : undefined,
            areaStyle: isLine
              ? {
                  color: accentColor,
                  opacity: 0.14,
                }
              : undefined,
          },
        ],
      },
      true,
    );
  }, [payload, displayOptions]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 0 }} />;
});

export default EChartBox;