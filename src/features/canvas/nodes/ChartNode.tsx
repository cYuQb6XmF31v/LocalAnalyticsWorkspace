import { lazy, Suspense } from 'react';
import type { NodeProps } from '@xyflow/react';
import {
  AlertTriangle,
  BarChart2,
  BarChart3,
  LineChart,
  PieChart,
  ScatterChart,
} from 'lucide-react';
import { useProject } from '../../../app/ProjectContext';
import type {
  BarChartCanvasElement,
  Dataset,
  HistogramCanvasElement,
  LineChartCanvasElement,
  PieChartCanvasElement,
  ScatterCanvasElement,
  StackedBarCanvasElement,
} from '../../../domain/models';
import type { EChartPayload } from '../../visualizations/EChartBox';
import {
  computeChartSeries,
  computeHistogram,
  computePieSeries,
  computeScatterPoints,
  computeStackedBarSeries,
} from '../../visualizations/transforms';
import { ElementFrame, type CanvasFlowNode } from './ElementFrame';

const LazyEChartBox = lazy(() => import('../../visualizations/EChartBox'));

type AnyChartElement =
  | LineChartCanvasElement
  | BarChartCanvasElement
  | HistogramCanvasElement
  | PieChartCanvasElement
  | StackedBarCanvasElement
  | ScatterCanvasElement;

function getChartIcon(type: AnyChartElement['type']) {
  switch (type) {
    case 'line-chart':
      return <LineChart size={12} />;
    case 'bar-chart':
      return <BarChart3 size={12} />;
    case 'histogram':
      return <BarChart2 size={12} />;
    case 'pie-chart':
      return <PieChart size={12} />;
    case 'stacked-bar':
      return <BarChart3 size={12} />;
    case 'scatter':
      return <ScatterChart size={12} />;
  }
}

function buildChartViewModel(
  dataset: Dataset,
  element: AnyChartElement,
):
  | { status: 'error'; message: string }
  | { status: 'ok'; subtitle: string; skippedInvalidCount: number; payload: EChartPayload } {
  if (element.type === 'line-chart' || element.type === 'bar-chart') {
    const res = computeChartSeries(dataset, element.config);
    if (res.status === 'error') {
      return res;
    }
    return {
      status: 'ok',
      subtitle: `${res.xColumnName} → ${res.yColumnName} (${res.aggregation})`,
      skippedInvalidCount: res.skippedInvalidCount,
      payload: {
        kind: 'basic',
        chartType: element.type,
        labels: res.labels,
        values: res.values,
        seriesName: res.yColumnName,
      },
    };
  }

  if (element.type === 'histogram') {
    const res = computeHistogram(dataset, element.config);
    if (res.status === 'error') {
      return res;
    }
    return {
      status: 'ok',
      subtitle: `Розподіл: ${res.columnName}`,
      skippedInvalidCount: res.skippedInvalidCount,
      payload: {
        kind: 'basic',
        chartType: 'histogram',
        labels: res.labels,
        values: res.values,
        seriesName: res.columnName,
      },
    };
  }

  if (element.type === 'pie-chart') {
    const res = computePieSeries(dataset, element.config);
    if (res.status === 'error') {
      return res;
    }
    return {
      status: 'ok',
      subtitle: `${res.categoryColumnName} · ${res.aggregation}`,
      skippedInvalidCount: res.skippedInvalidCount,
      payload: {
        kind: 'pie',
        items: res.items,
        isDonut: element.config.isDonut,
        seriesName: res.valueColumnName,
      },
    };
  }

  if (element.type === 'stacked-bar') {
    const res = computeStackedBarSeries(dataset, element.config);
    if (res.status === 'error') {
      return res;
    }
    return {
      status: 'ok',
      subtitle: `${res.xColumnName} × ${res.seriesColumnName} (${res.aggregation})`,
      skippedInvalidCount: res.skippedInvalidCount,
      payload: {
        kind: 'stacked-bar',
        xLabels: res.xLabels,
        series: res.series,
      },
    };
  }

  const res = computeScatterPoints(dataset, element.config);
  if (res.status === 'error') {
    return res;
  }
  return {
    status: 'ok',
    subtitle: `${res.xColumnName} vs ${res.yColumnName}`,
    skippedInvalidCount: res.skippedInvalidCount,
    payload: {
      kind: 'scatter',
      points: res.points,
      xName: res.xColumnName,
      yName: res.yColumnName,
    },
  };
}

export function ChartNode({ data, selected }: NodeProps<CanvasFlowNode>) {
  const { state } = useProject();
  const element = data.element as AnyChartElement;
  const vm = buildChartViewModel(state.project.primaryDataset, element);

  return (
    <ElementFrame
      element={element}
      pageId={data.pageId}
      selected={selected}
      icon={getChartIcon(element.type)}
      onConfigure={data.onConfigure}
    >
      {vm.status === 'error' ? (
        <div className="canvas-node-error nodrag">
          <AlertTriangle size={14} />
          <span>{vm.message}</span>
          <button
            type="button"
            className="btn btn--secondary"
            style={{ height: '24px', fontSize: '11px' }}
            onClick={() => data.onConfigure(element.id)}
          >
            Налаштувати графік
          </button>
        </div>
      ) : (
        <>
          <div className="canvas-chart-meta">
            <span>{vm.subtitle}</span>
            {vm.skippedInvalidCount > 0 && (
              <span className="canvas-node-warn-inline">
                Пропущено: {vm.skippedInvalidCount}
              </span>
            )}
          </div>
          <div className="canvas-chart-area nodrag nopan nowheel">
            <Suspense fallback={<span className="placeholder-hint">Завантаження графіка…</span>}>
              <LazyEChartBox payload={vm.payload} />
            </Suspense>
          </div>
        </>
      )}
    </ElementFrame>
  );
}
