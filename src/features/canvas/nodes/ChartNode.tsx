import { lazy, Suspense, useMemo, useRef } from 'react';
import type { NodeProps } from '@xyflow/react';
import {
  AlertTriangle,
  ArrowUpDown,
  BarChart2,
  BarChart3,
  Hash,
  LineChart,
  Percent,
  PieChart,
  RotateCcw,
  RotateCw,
  ScatterChart,
  TrendingUp,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useProject } from '../../../app/ProjectContext';
import type {
  BarChartCanvasElement,
  ChartAggregation,
  ChartDisplayOptions,
  ChartSortMode,
  Dataset,
  HistogramCanvasElement,
  LineChartCanvasElement,
  PieChartCanvasElement,
  ScatterCanvasElement,
  StackedBarCanvasElement,
} from '../../../domain/models';
import { useElementDataset } from '../../source-data/useElementDataset';
import type { EChartBoxHandle, EChartPayload } from '../../visualizations/EChartBox';
import {
  computeChartSeries,
  computeHistogram,
  computePieSeries,
  computeScatterPoints,
  computeStackedBarSeries,
  formatMetricNumber,
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

function applyPairSortFilter(
  labels: string[],
  values: number[],
  opts: ChartDisplayOptions,
): { labels: string[]; values: number[] } {
  let pairs = labels.map((label, idx) => ({ label, value: values[idx] ?? 0 }));

  const q = opts.filterText?.trim().toLowerCase();
  if (q) {
    pairs = pairs.filter((p) => p.label.toLowerCase().includes(q));
  }

  switch (opts.sortBy) {
    case 'label-asc':
      pairs.sort((a, b) => a.label.localeCompare(b.label, 'uk'));
      break;
    case 'label-desc':
      pairs.sort((a, b) => b.label.localeCompare(a.label, 'uk'));
      break;
    case 'value-asc':
      pairs.sort((a, b) => a.value - b.value);
      break;
    case 'value-desc':
      pairs.sort((a, b) => b.value - a.value);
      break;
  }

  if (opts.topN && opts.topN > 0) {
    pairs = pairs.slice(0, opts.topN);
  }

  let nextValues = pairs.map((p) => p.value);
  if (opts.cumulative) {
    let running = 0;
    nextValues = nextValues.map((v) => {
      running += v;
      return Math.round(running * 1000) / 1000;
    });
  }

  if (opts.asPercent) {
    const total = nextValues.reduce((acc, v) => acc + Math.abs(v), 0);
    nextValues =
      total > 0
        ? nextValues.map((v) => Math.round((v / total) * 1000) / 10)
        : nextValues.map(() => 0);
  }

  return {
    labels: pairs.map((p) => p.label),
    values: nextValues,
  };
}

function summarizeValues(values: number[]): string | null {
  if (values.length === 0) {
    return null;
  }
  const sum = values.reduce((acc, v) => acc + v, 0);
  const avg = sum / values.length;
  return `Σ ${formatMetricNumber(sum)} · x̄ ${formatMetricNumber(avg)}`;
}

function buildChartViewModel(
  dataset: Dataset,
  element: AnyChartElement,
):
  | { status: 'error'; message: string }
  | {
      status: 'ok';
      subtitle: string;
      mathSummary: string | null;
      skippedInvalidCount: number;
      payload: EChartPayload;
    } {
  if (element.type === 'line-chart' || element.type === 'bar-chart') {
    const res = computeChartSeries(dataset, element.config);
    if (res.status === 'error') {
      return res;
    }
    const mod = applyPairSortFilter(res.labels, res.values, element.config);
    return {
      status: 'ok',
      subtitle: `${res.xColumnName} → ${res.yColumnName} (${res.aggregation})`,
      mathSummary: element.config.asPercent ? null : summarizeValues(mod.values),
      skippedInvalidCount: res.skippedInvalidCount,
      payload: {
        kind: 'basic',
        chartType: element.type,
        labels: mod.labels,
        values: mod.values,
        seriesName: res.yColumnName,
      },
    };
  }

  if (element.type === 'histogram') {
    const res = computeHistogram(dataset, element.config);
    if (res.status === 'error') {
      return res;
    }
    const mod = applyPairSortFilter(res.labels, res.values, element.config);
    return {
      status: 'ok',
      subtitle: `Розподіл: ${res.columnName}`,
      mathSummary: element.config.asPercent ? null : summarizeValues(mod.values),
      skippedInvalidCount: res.skippedInvalidCount,
      payload: {
        kind: 'basic',
        chartType: 'histogram',
        labels: mod.labels,
        values: mod.values,
        seriesName: res.columnName,
      },
    };
  }

  if (element.type === 'pie-chart') {
    const res = computePieSeries(dataset, element.config);
    if (res.status === 'error') {
      return res;
    }
    let items = [...res.items];
    const q = element.config.filterText?.trim().toLowerCase();
    if (q) {
      items = items.filter((item) => item.name.toLowerCase().includes(q));
    }
    switch (element.config.sortBy) {
      case 'label-asc':
        items.sort((a, b) => a.name.localeCompare(b.name, 'uk'));
        break;
      case 'label-desc':
        items.sort((a, b) => b.name.localeCompare(a.name, 'uk'));
        break;
      case 'value-asc':
        items.sort((a, b) => a.value - b.value);
        break;
      case 'value-desc':
        items.sort((a, b) => b.value - a.value);
        break;
    }
    if (element.config.topN && element.config.topN > 0) {
      items = items.slice(0, element.config.topN);
    }
    return {
      status: 'ok',
      subtitle: `${res.categoryColumnName} · ${res.aggregation}`,
      mathSummary: summarizeValues(items.map((i) => i.value)),
      skippedInvalidCount: res.skippedInvalidCount,
      payload: {
        kind: 'pie',
        items,
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
    let indices = res.xLabels.map((_, idx) => idx);
    const q = element.config.filterText?.trim().toLowerCase();
    if (q) {
      indices = indices.filter((i) => res.xLabels[i].toLowerCase().includes(q));
    }
    const totalForIdx = (i: number) => res.series.reduce((sum, s) => sum + (s.data[i] ?? 0), 0);
    switch (element.config.sortBy) {
      case 'label-asc':
        indices.sort((a, b) => res.xLabels[a].localeCompare(res.xLabels[b], 'uk'));
        break;
      case 'label-desc':
        indices.sort((a, b) => res.xLabels[b].localeCompare(res.xLabels[a], 'uk'));
        break;
      case 'value-asc':
        indices.sort((a, b) => totalForIdx(a) - totalForIdx(b));
        break;
      case 'value-desc':
        indices.sort((a, b) => totalForIdx(b) - totalForIdx(a));
        break;
    }
    if (element.config.topN && element.config.topN > 0) {
      indices = indices.slice(0, element.config.topN);
    }
    const xLabels = indices.map((i) => res.xLabels[i]);
    const series = res.series.map((s) => ({
      name: s.name,
      data: indices.map((i) => s.data[i] ?? 0),
    }));
    return {
      status: 'ok',
      subtitle: `${res.xColumnName} × ${res.seriesColumnName} (${res.aggregation})`,
      mathSummary: summarizeValues(indices.map(totalForIdx)),
      skippedInvalidCount: res.skippedInvalidCount,
      payload: {
        kind: 'stacked-bar',
        xLabels,
        series,
      },
    };
  }

  const res = computeScatterPoints(dataset, element.config);
  if (res.status === 'error') {
    return res;
  }
  const q = element.config.filterText?.trim().toLowerCase();
  const points = q ? res.points.filter((pt) => pt.label.toLowerCase().includes(q)) : res.points;
  return {
    status: 'ok',
    subtitle: `${res.xColumnName} vs ${res.yColumnName}`,
    mathSummary: `n = ${points.length}`,
    skippedInvalidCount: res.skippedInvalidCount,
    payload: {
      kind: 'scatter',
      points,
      xName: res.xColumnName,
      yName: res.yColumnName,
    },
  };
}

const AGG_CYCLE: ChartAggregation[] = ['sum', 'avg', 'count', 'min', 'max'];
const AGG_SYMBOL: Record<ChartAggregation, string> = {
  sum: 'Σ',
  avg: 'x̄',
  count: 'N',
  min: '↓',
  max: '↑',
};
const SORT_CYCLE: ChartSortMode[] = ['none', 'value-desc', 'value-asc', 'label-asc', 'label-desc'];
const SORT_LABELS: Record<ChartSortMode, string> = {
  none: 'Без сортування',
  'value-desc': 'За спаданням значення',
  'value-asc': 'За зростанням значення',
  'label-asc': 'За назвою (А→Я)',
  'label-desc': 'За назвою (Я→А)',
};

export function ChartNode({ data, selected }: NodeProps<CanvasFlowNode>) {
  const { dispatch } = useProject();
  const chartRef = useRef<EChartBoxHandle | null>(null);
  const element = data.element as AnyChartElement;
  const dataset = useElementDataset(data.pageId, element);
  const vm = useMemo(
    () => buildChartViewModel(dataset, element),
    [dataset, element],
  );

  const isAxisChart =
    element.type === 'line-chart' ||
    element.type === 'bar-chart' ||
    element.type === 'histogram' ||
    element.type === 'stacked-bar';
  const isBasicChart =
    element.type === 'line-chart' ||
    element.type === 'bar-chart' ||
    element.type === 'histogram';
  const hasAggregation =
    element.type === 'line-chart' ||
    element.type === 'bar-chart' ||
    element.type === 'pie-chart' ||
    element.type === 'stacked-bar';
  const isZoomable = isAxisChart || element.type === 'scatter';
  const showDataLabels = Boolean(element.config.showDataLabels);
  const isRotateActive = element.config.rotateLabels !== false;
  const currentSort: ChartSortMode = element.config.sortBy ?? 'none';

  const patchConfig = (patch: Partial<typeof element.config>) => {
    dispatch({
      type: 'UPDATE_ELEMENT_CONFIG',
      pageId: data.pageId,
      elementId: element.id,
      config: {
        ...element.config,
        ...patch,
      },
    });
  };

  const toggleDataLabels = (e: React.MouseEvent) => {
    e.stopPropagation();
    patchConfig({ showDataLabels: !showDataLabels });
  };

  const toggleRotateLabels = (e: React.MouseEvent) => {
    e.stopPropagation();
    patchConfig({ rotateLabels: !isRotateActive });
  };

  const cycleAggregation = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!('aggregation' in element.config)) {
      return;
    }
    const idx = AGG_CYCLE.indexOf(element.config.aggregation);
    const next = AGG_CYCLE[(idx + 1) % AGG_CYCLE.length];
    patchConfig({ aggregation: next } as Partial<typeof element.config>);
  };

  const cycleSort = (e: React.MouseEvent) => {
    e.stopPropagation();
    const idx = SORT_CYCLE.indexOf(currentSort);
    const next = SORT_CYCLE[(idx + 1) % SORT_CYCLE.length];
    patchConfig({ sortBy: next });
  };

  const headerActions = (
    <div className="canvas-node-quick-group">
      {hasAggregation && 'aggregation' in element.config && (
        <button
          type="button"
          className="sd-mini-btn sd-mini-btn--text"
          onClick={cycleAggregation}
          title={`Агрегація: ${element.config.aggregation} (клік — змінити)`}
          aria-label="Змінити агрегацію"
        >
          {AGG_SYMBOL[element.config.aggregation]}
        </button>
      )}
      {element.type !== 'scatter' && (
        <button
          type="button"
          className={`sd-mini-btn ${currentSort !== 'none' ? 'sd-mini-btn--active' : ''}`}
          onClick={cycleSort}
          title={`Сортування: ${SORT_LABELS[currentSort]} (клік — змінити)`}
          aria-label="Сортування діаграми"
        >
          <ArrowUpDown size={11} />
        </button>
      )}
      {isBasicChart && (
        <>
          <button
            type="button"
            className={`sd-mini-btn sd-mini-btn--text ${element.config.showAvgLine ? 'sd-mini-btn--active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              patchConfig({ showAvgLine: !element.config.showAvgLine });
            }}
            title="Лінія середнього значення (μ)"
            aria-label="Лінія середнього значення"
          >
            μ
          </button>
          <button
            type="button"
            className={`sd-mini-btn ${element.config.cumulative ? 'sd-mini-btn--active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              patchConfig({ cumulative: !element.config.cumulative });
            }}
            title="Наростаючий підсумок (Cumulative)"
            aria-label="Наростаючий підсумок"
          >
            <TrendingUp size={11} />
          </button>
          <button
            type="button"
            className={`sd-mini-btn ${element.config.asPercent ? 'sd-mini-btn--active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              patchConfig({ asPercent: !element.config.asPercent });
            }}
            title="Частка у відсотках (%)"
            aria-label="Частка у відсотках"
          >
            <Percent size={11} />
          </button>
        </>
      )}
      <button
        type="button"
        className={`sd-mini-btn ${showDataLabels ? 'sd-mini-btn--active' : ''}`}
        onClick={toggleDataLabels}
        title={showDataLabels ? 'Сховати числа на графіку' : 'Показувати числа на графіку'}
        aria-label="Показувати числа на графіку"
      >
        <Hash size={11} />
      </button>
      {isAxisChart && (
        <button
          type="button"
          className={`sd-mini-btn ${isRotateActive ? 'sd-mini-btn--active' : ''}`}
          onClick={toggleRotateLabels}
          title={isRotateActive ? 'Вимкнути нахил підписів осі X' : 'Увімкнути нахил підписів осі X'}
          aria-label="Нахил підписів осі X"
        >
          <RotateCw size={11} />
        </button>
      )}
      {isZoomable && (
        <>
          <button
            type="button"
            className="sd-mini-btn"
            onClick={(e) => {
              e.stopPropagation();
              chartRef.current?.zoomIn();
            }}
            title="Наблизити графік"
            aria-label="Наблизити графік"
          >
            <ZoomIn size={11} />
          </button>
          <button
            type="button"
            className="sd-mini-btn"
            onClick={(e) => {
              e.stopPropagation();
              chartRef.current?.zoomOut();
            }}
            title="Віддалити графік"
            aria-label="Віддалити графік"
          >
            <ZoomOut size={11} />
          </button>
          <button
            type="button"
            className="sd-mini-btn"
            onClick={(e) => {
              e.stopPropagation();
              chartRef.current?.resetZoom();
            }}
            title="Скинути масштаб графіка"
            aria-label="Скинути масштаб графіка"
          >
            <RotateCcw size={11} />
          </button>
        </>
      )}
    </div>
  );

  return (
    <ElementFrame
      element={element}
      pageId={data.pageId}
      selected={selected}
      icon={getChartIcon(element.type)}
      headerActions={headerActions}
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
            <span className="canvas-chart-meta-right">
              {vm.mathSummary && <span className="mono-chip">{vm.mathSummary}</span>}
              {vm.skippedInvalidCount > 0 && (
                <span className="canvas-node-warn-inline">
                  Пропущено: {vm.skippedInvalidCount}
                </span>
              )}
            </span>
          </div>
          <div className="canvas-chart-area nodrag nopan nowheel">
            <Suspense fallback={<span className="placeholder-hint">Завантаження графіка…</span>}>
              <LazyEChartBox
                ref={chartRef}
                payload={vm.payload}
                displayOptions={element.config}
              />
            </Suspense>
          </div>
        </>
      )}
    </ElementFrame>
  );
}
