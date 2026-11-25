import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

interface EChartBoxProps {
  chartType: 'line-chart' | 'bar-chart';
  labels: string[];
  values: number[];
  seriesName: string;
}

export function EChartBox({ chartType, labels, values, seriesName }: EChartBoxProps) {
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

    const isLine = chartType === 'line-chart';

    chart.setOption(
      {
        animationDuration: 220,
        backgroundColor: 'transparent',
        grid: {
          top: 16,
          right: 14,
          bottom: 28,
          left: 44,
          containLabel: false,
        },
        tooltip: {
          trigger: 'axis',
          backgroundColor: '#171a22',
          borderColor: 'rgba(255, 255, 255, 0.14)',
          textStyle: {
            color: '#eceef4',
            fontSize: 11,
          },
        },
        xAxis: {
          type: 'category',
          data: labels,
          axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.12)' } },
          axisTick: { show: false },
          axisLabel: {
            color: '#8e96aa',
            fontSize: 10,
            overflow: 'truncate',
            width: 72,
          },
        },
        yAxis: {
          type: 'value',
          splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.06)' } },
          axisLabel: {
            color: '#8e96aa',
            fontSize: 10,
          },
        },
        series: [
          {
            name: seriesName,
            type: isLine ? 'line' : 'bar',
            data: values,
            smooth: isLine ? 0.2 : false,
            symbolSize: isLine ? 6 : undefined,
            barMaxWidth: 34,
            itemStyle: {
              color: '#7c5cff',
              borderRadius: isLine ? 0 : [4, 4, 0, 0],
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
  }, [chartType, labels, values, seriesName]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 0 }} />;
}

export default EChartBox;
