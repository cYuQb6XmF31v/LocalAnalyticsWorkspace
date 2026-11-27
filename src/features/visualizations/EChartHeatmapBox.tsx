import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { HeatmapChart } from 'echarts/charts';
import {
  CalendarComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

echarts.use([
  HeatmapChart,
  CalendarComponent,
  VisualMapComponent,
  TooltipComponent,
  SVGRenderer,
]);

export const HEATMAP_GRADIENT_STOPS = [
  '#2d235a',
  '#493594',
  '#6648cc',
  '#7c5cff',
  '#b49eff',
];

interface EChartHeatmapBoxProps {
  year: string;
  entries: Array<[string, number]>;
  maxCount: number;
  columnName: string;
  height?: number;
}

export function EChartHeatmapBox({
  year,
  entries,
  maxCount,
  columnName,
  height = 140,
}: EChartHeatmapBoxProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    const chart = echarts.init(el, undefined, { renderer: 'svg' });
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

    chart.setOption(
      {
        animationDuration: 180,
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'item',
          appendToBody: true,
          confine: false,
          backgroundColor: '#17191f',
          borderColor: 'rgba(255, 255, 255, 0.14)',
          borderWidth: 1,
          padding: [6, 10],
          extraCssText:
            'z-index: 9999; pointer-events: none; border-radius: 6px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5); font-family: var(--font-sans);',
          textStyle: { color: '#eceef2', fontSize: 12 },
          formatter: (params: unknown) => {
            const p = params as { value?: [string, number] };
            if (!p.value) {
              return '';
            }
            return `<span style="font-family: var(--font-mono); color: #9ba1b0;">${p.value[0]}</span> · ${columnName}: <b style="color: #fff;">${p.value[1]}</b>`;
          },
        },
        visualMap: {
          min: maxCount > 1 ? 1 : 0,
          max: Math.max(maxCount, 1),
          show: false,
          inRange: {
            color: HEATMAP_GRADIENT_STOPS,
          },
        },
        calendar: {
          top: 22,
          left: 30,
          right: 10,
          bottom: 8,
          range: year,
          cellSize: ['auto', 'auto'],
          splitLine: { show: false },
          itemStyle: {
            color: '#141720',
            borderWidth: 2,
            borderColor: '#0b0c10',
          },
          yearLabel: { show: false },
          dayLabel: {
            color: '#6c7386',
            fontSize: 9,
            firstDay: 1,
            nameMap: ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
          },
          monthLabel: {
            color: '#a1a7b8',
            fontSize: 9,
          },
        },
        series: [
          {
            type: 'heatmap',
            coordinateSystem: 'calendar',
            data: entries,
          },
        ],
      },
      true,
    );
  }, [year, entries, maxCount, columnName]);

  useEffect(() => {
    instanceRef.current?.resize();
  }, [height]);

  return <div ref={containerRef} style={{ width: '100%', height: `${height}px` }} />;
}

export default EChartHeatmapBox;
