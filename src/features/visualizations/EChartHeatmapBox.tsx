import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { HeatmapChart } from 'echarts/charts';
import {
  CalendarComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  HeatmapChart,
  CalendarComponent,
  VisualMapComponent,
  TooltipComponent,
  CanvasRenderer,
]);

interface EChartHeatmapBoxProps {
  year: string;
  entries: Array<[string, number]>;
  maxCount: number;
  columnName: string;
}

export function EChartHeatmapBox({
  year,
  entries,
  maxCount,
  columnName,
}: EChartHeatmapBoxProps) {
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

    const gradientStops = ['#1e1a3a', '#3b2d7a', '#5c3dbf', '#7c5cff', '#a98fff'];

    chart.setOption(
      {
        animationDuration: 180,
        backgroundColor: 'transparent',
        tooltip: {
          position: 'top',
          backgroundColor: '#171a22',
          borderColor: 'rgba(255, 255, 255, 0.14)',
          textStyle: { color: '#eceef4', fontSize: 11 },
          formatter: (params: unknown) => {
            const p = params as { value?: [string, number] };
            if (!p.value) {
              return '';
            }
            return `${p.value[0]} (${columnName}): <b>${p.value[1]}</b>`;
          },
        },
        visualMap: {
          min: 0,
          max: Math.max(maxCount, 1),
          show: true,
          orient: 'horizontal',
          left: 'center',
          bottom: 2,
          itemWidth: 100,
          itemHeight: 8,
          borderWidth: 0,
          text: ['Більше', 'Менше'],
          textStyle: { color: '#6c7386', fontSize: 9 },
          inRange: {
            color: gradientStops,
          },
          outOfRange: {
            color: ['#141720'],
          },
          formatter: (val: number) => String(Math.round(val)),
        },
        calendar: {
          top: 22,
          left: 32,
          right: 10,
          bottom: 32,
          range: year,
          cellSize: ['auto', 11],
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

  return <div ref={containerRef} style={{ width: '100%', height: '158px' }} />;
}

export default EChartHeatmapBox;
