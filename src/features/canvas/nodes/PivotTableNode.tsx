import type { NodeProps } from '@xyflow/react';
import { AlertTriangle, Grid3x3 } from 'lucide-react';
import type { PivotTableCanvasElement } from '../../../domain/models';
import { useElementDataset } from '../../source-data/useElementDataset';
import { computePivotTable, formatMetricNumber } from '../../visualizations/transforms';
import { ElementFrame, type CanvasFlowNode } from './ElementFrame';

export function PivotTableNode({ data, selected }: NodeProps<CanvasFlowNode>) {
  const element = data.element as PivotTableCanvasElement;
  const dataset = useElementDataset(data.pageId, element);
  const result = computePivotTable(dataset, element.config);

  return (
    <ElementFrame
      element={element}
      pageId={data.pageId}
      selected={selected}
      icon={<Grid3x3 size={12} />}
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
            Налаштувати зведену
          </button>
        </div>
      ) : (
        <>
          <div className="canvas-chart-meta">
            <span>
              {result.rowColumnName}
              {result.colColumnName ? ` × ${result.colColumnName}` : ''} → {result.valueColumnName} (
              {result.aggregation})
            </span>
            {result.skippedInvalidCount > 0 && (
              <span className="canvas-node-warn-inline">
                Пропущено: {result.skippedInvalidCount}
              </span>
            )}
          </div>

          <div className="canvas-table-scroll nodrag nopan nowheel">
            <table className="canvas-table">
              <thead>
                <tr>
                  <th>{result.rowColumnName}</th>
                  {result.colKeys.map((cKey) => (
                    <th key={cKey} className="pivot-num">
                      {cKey}
                    </th>
                  ))}
                  {result.colColumnName && <th className="pivot-num pivot-total">Разом</th>}
                </tr>
              </thead>
              <tbody>
                {result.rowKeys.map((rKey) => (
                  <tr key={rKey}>
                    <td className="pivot-row-head">{rKey}</td>
                    {result.colKeys.map((cKey) => {
                      const val = result.cells[rKey]?.[cKey] ?? null;
                      return (
                        <td key={cKey} className="pivot-num">
                          {val === null ? '—' : formatMetricNumber(val)}
                        </td>
                      );
                    })}
                    {result.colColumnName && (
                      <td className="pivot-num pivot-total">
                        {result.rowTotals[rKey] === null
                          ? '—'
                          : formatMetricNumber(result.rowTotals[rKey]!)}
                      </td>
                    )}
                  </tr>
                ))}
                <tr>
                  <td className="pivot-total">Разом</td>
                  {result.colKeys.map((cKey) => (
                    <td key={cKey} className="pivot-num pivot-total">
                      {result.colTotals[cKey] === null
                        ? '—'
                        : formatMetricNumber(result.colTotals[cKey]!)}
                    </td>
                  ))}
                  {result.colColumnName && (
                    <td className="pivot-num pivot-total">
                      {result.grandTotal === null ? '—' : formatMetricNumber(result.grandTotal)}
                    </td>
                  )}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </ElementFrame>
  );
}
