import type { NodeProps } from '@xyflow/react';
import { AlertTriangle, Hash } from 'lucide-react';
import { useProject } from '../../../app/ProjectContext';
import type { KpiCanvasElement } from '../../../domain/models';
import { SparklineBox } from '../../visualizations/SparklineBox';
import { computeKpiResult, computeKpiSparkline } from '../../visualizations/transforms';
import { ElementFrame, type CanvasFlowNode } from './ElementFrame';

export function KpiNode({ data, selected }: NodeProps<CanvasFlowNode>) {
  const { state } = useProject();
  const element = data.element as KpiCanvasElement;
  const result = computeKpiResult(state.project.primaryDataset, element.config);
  const sparkline =
    result.status === 'ok'
      ? computeKpiSparkline(state.project.primaryDataset, element.config)
      : null;

  return (
    <ElementFrame
      element={element}
      pageId={data.pageId}
      selected={selected}
      icon={<Hash size={12} />}
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
            Налаштувати поле
          </button>
        </div>
      ) : (
        <div className="canvas-kpi-body">
          <div className="canvas-kpi-value" title={result.formattedValue}>
            {result.formattedValue}
          </div>
          {sparkline && <SparklineBox values={sparkline.values} />}
          <div className="canvas-kpi-meta">
            <span className="mono-chip">{result.columnName}</span>
            <span className="mono-chip">{result.aggregation}</span>
          </div>
          {result.skippedInvalidCount > 0 && (
            <span className="canvas-node-warn-inline">
              Пропущено нечислових значень: {result.skippedInvalidCount}
            </span>
          )}
        </div>
      )}
    </ElementFrame>
  );
}
