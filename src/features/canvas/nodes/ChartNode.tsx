import { lazy, Suspense } from 'react';
import type { NodeProps } from '@xyflow/react';
import { AlertTriangle, BarChart3, LineChart } from 'lucide-react';
import { useProject } from '../../../app/ProjectContext';
import type { BarChartCanvasElement, LineChartCanvasElement } from '../../../domain/models';
import { computeChartSeries } from '../../visualizations/transforms';
import { ElementFrame, type CanvasFlowNode } from './ElementFrame';

const LazyEChartBox = lazy(() => import('../../visualizations/EChartBox'));

export function ChartNode({ data, selected }: NodeProps<CanvasFlowNode>) {
  const { state } = useProject();
  const element = data.element as LineChartCanvasElement | BarChartCanvasElement;
  const result = computeChartSeries(state.project.primaryDataset, element.config);
  const icon =
    element.type === 'line-chart' ? <LineChart size={12} /> : <BarChart3 size={12} />;

  return (
    <ElementFrame
      element={element}
      pageId={data.pageId}
      selected={selected}
      icon={icon}
      onConfigure={data.onConfigure}
    >
      {result.status === 'error' ? (
        <div className="canvas-node-error nodrag">
          <AlertTriangle size={14} />
          <span>{result.message}</span>
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
            <span>
              {result.xColumnName} → {result.yColumnName} ({result.aggregation})
            </span>
            {result.skippedInvalidCount > 0 && (
              <span className="canvas-node-warn-inline">
                Пропущено: {result.skippedInvalidCount}
              </span>
            )}
          </div>
          <div className="canvas-chart-area nodrag nopan nowheel">
            <Suspense fallback={<span className="placeholder-hint">Завантаження графіка…</span>}>
              <LazyEChartBox
                chartType={element.type}
                labels={result.labels}
                values={result.values}
                seriesName={result.yColumnName}
              />
            </Suspense>
          </div>
        </>
      )}
    </ElementFrame>
  );
}
