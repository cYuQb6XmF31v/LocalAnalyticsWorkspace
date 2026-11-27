import type { NodeProps } from '@xyflow/react';
import { AlertTriangle, Table } from 'lucide-react';
import type { TableViewCanvasElement } from '../../../domain/models';
import { useElementDataset } from '../../source-data/useElementDataset';
import { computeTableView } from '../../visualizations/transforms';
import { ElementFrame, type CanvasFlowNode } from './ElementFrame';

export function TableViewNode({ data, selected }: NodeProps<CanvasFlowNode>) {
  const element = data.element as TableViewCanvasElement;
  const dataset = useElementDataset(data.pageId, element);
  const result = computeTableView(dataset, element.config);

  return (
    <ElementFrame
      element={element}
      pageId={data.pageId}
      selected={selected}
      icon={<Table size={12} />}
      onConfigure={data.onConfigure}
    >
      {result.columns.length === 0 ? (
        <div className="canvas-node-error nodrag">
          <AlertTriangle size={14} />
          <span>{result.message ?? 'Немає колонок для відображення.'}</span>
        </div>
      ) : (
        <>
          <div className="canvas-chart-meta">
            <span>
              Перегляд Source Data (показано {result.rows.length} з {result.totalRowCount})
            </span>
            {result.message && <span className="canvas-node-warn-inline">{result.message}</span>}
          </div>

          <div className="canvas-table-scroll nodrag nopan nowheel">
            <table
              className="canvas-table"
              style={
                element.config.fontSize
                  ? ({ '--table-font-size': `${element.config.fontSize}px` } as React.CSSProperties)
                  : undefined
              }
            >
              <thead>
                <tr>
                  {result.columns.map((col) => (
                    <th key={col.id}>{col.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.id}>
                    {row.cells.map((cell) => (
                      <td
                        key={cell.columnId}
                        className={!cell.valid ? 'canvas-table-cell--invalid' : undefined}
                        title={cell.value === null ? '' : String(cell.value)}
                      >
                        {cell.value === null ? '' : String(cell.value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ElementFrame>
  );
}
