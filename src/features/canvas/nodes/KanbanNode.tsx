import { useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { AlertTriangle, Columns3 } from 'lucide-react';
import { useProject } from '../../../app/ProjectContext';
import { CustomSelect } from '../../../components/CustomSelect';
import type { CellValue, KanbanCanvasElement } from '../../../domain/models';
import { isJoinDatasetId } from '../../source-data/dataPipeline';
import { useElementDataset } from '../../source-data/useElementDataset';
import { computeKanbanColumns } from '../../visualizations/transforms';
import { ElementFrame, type CanvasFlowNode } from './ElementFrame';

export function KanbanNode({ data, selected }: NodeProps<CanvasFlowNode>) {
  const { dispatch } = useProject();
  const element = data.element as KanbanCanvasElement;
  const dataset = useElementDataset(data.pageId, element);
  const result = computeKanbanColumns(dataset, element.config);
  const [dragOverLane, setDragOverLane] = useState<string | null>(null);
  const canMutateSource = !isJoinDatasetId(element.datasetId);

  const moveCardToLane = (rowId: string, columnId: string, nextValue: CellValue) => {
    if (!canMutateSource) {
      return;
    }
    dispatch({
      type: 'UPDATE_CELL',
      datasetId: element.datasetId,
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
                          <CustomSelect
                            size="xs"
                            className="kanban-card-move"
                            ariaLabel={`Перемістити картку ${card.title}`}
                            value={lane.key}
                            options={result.lanes.map((opt) => ({
                              value: opt.key,
                              label: `→ ${opt.label}`,
                            }))}
                            onChange={(val) => {
                              const target = result.lanes.find((l) => l.key === val);
                              if (target) {
                                moveCardToLane(
                                  card.rowId,
                                  result.groupColumn.id,
                                  target.rawCellValue,
                                );
                              }
                            }}
                          />
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
