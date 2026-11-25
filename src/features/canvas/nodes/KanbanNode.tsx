import { useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { AlertTriangle, Columns3 } from 'lucide-react';
import { useProject } from '../../../app/ProjectContext';
import type { CellValue, KanbanCanvasElement } from '../../../domain/models';
import { computeKanbanColumns } from '../../visualizations/transforms';
import { ElementFrame, type CanvasFlowNode } from './ElementFrame';

export function KanbanNode({ data, selected }: NodeProps<CanvasFlowNode>) {
  const { state, dispatch } = useProject();
  const element = data.element as KanbanCanvasElement;
  const result = computeKanbanColumns(state.project.primaryDataset, element.config);
  const [dragOverLane, setDragOverLane] = useState<string | null>(null);

  const moveCardToLane = (rowId: string, columnId: string, nextValue: CellValue) => {
    dispatch({
      type: 'UPDATE_CELL',
      rowId,
      columnId,
      value: nextValue,
    });
  };

  return (
    <ElementFrame
      element={element}
      pageId={data.pageId}
      selected={selected}
      icon={<Columns3 size={12} />}
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
            Налаштувати Kanban
          </button>
        </div>
      ) : (
        <>
          <div className="canvas-chart-meta">
            <span>
              Групування: {result.groupColumn.name} · Записів: {result.totalCards}
            </span>
          </div>

          {result.lanes.length === 0 ? (
            <div className="canvas-node-error nodrag">
              <span>У таблиці Source Data ще немає рядків для відображення карток.</span>
            </div>
          ) : (
            <div className="kanban-board nodrag nopan nowheel">
              {result.lanes.map((lane) => (
                <div
                  key={lane.key}
                  className={`kanban-lane ${
                    dragOverLane === lane.key ? 'kanban-lane--drag-over' : ''
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverLane !== lane.key) {
                      setDragOverLane(lane.key);
                    }
                  }}
                  onDragLeave={() => {
                    if (dragOverLane === lane.key) {
                      setDragOverLane(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverLane(null);
                    const rowId = e.dataTransfer.getData('text/plain');
                    if (rowId) {
                      moveCardToLane(rowId, result.groupColumn.id, lane.rawCellValue);
                    }
                  }}
                >
                  <div className="kanban-lane-head">
                    <span>{lane.label}</span>
                    <span className="kanban-lane-count">{lane.cards.length}</span>
                  </div>

                  <div className="kanban-lane-cards">
                    {lane.cards.map((card) => (
                      <div
                        key={card.rowId}
                        className="kanban-card"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', card.rowId);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                      >
                        <div className="kanban-card-title">{card.title}</div>
                        {card.details.map((d) => (
                          <div key={d.columnName} className="kanban-card-detail">
                            <span>{d.columnName}</span>
                            <span>{d.value}</span>
                          </div>
                        ))}
                        {result.lanes.length > 1 && (
                          <select
                            className="kanban-card-move"
                            aria-label={`Перемістити картку ${card.title}`}
                            value={lane.key}
                            onChange={(e) => {
                              const target = result.lanes.find((l) => l.key === e.target.value);
                              if (target) {
                                moveCardToLane(
                                  card.rowId,
                                  result.groupColumn.id,
                                  target.rawCellValue,
                                );
                              }
                            }}
                          >
                            {result.lanes.map((opt) => (
                              <option key={opt.key} value={opt.key}>
                                → {opt.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </ElementFrame>
  );
}
