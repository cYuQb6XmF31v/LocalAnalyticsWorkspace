import { X } from 'lucide-react';
import { useProject } from '../../app/ProjectContext';
import type {
  CanvasElement,
  ChartAggregation,
  KpiAggregation,
} from '../../domain/models';
import './ElementConfigPanel.css';

interface ElementConfigPanelProps {
  pageId: string;
  element: CanvasElement;
  onClose: () => void;
}

const AGGREGATIONS: readonly { value: KpiAggregation; label: string }[] = [
  { value: 'sum', label: 'Сума (sum)' },
  { value: 'avg', label: 'Середнє (avg)' },
  { value: 'count', label: 'Кількість (count)' },
  { value: 'min', label: 'Мінімум (min)' },
  { value: 'max', label: 'Максимум (max)' },
];

export function ElementConfigPanel({ pageId, element, onClose }: ElementConfigPanelProps) {
  const { state, dispatch } = useProject();
  const columns = state.project.primaryDataset.columns;

  const updateConfig = (nextConfig: CanvasElement['config']) => {
    dispatch({
      type: 'UPDATE_ELEMENT_CONFIG',
      pageId,
      elementId: element.id,
      config: nextConfig,
    });
  };

  const hasColumn = (id: string | null) => Boolean(id && columns.some((c) => c.id === id));

  return (
    <aside className="config-panel nodrag nopan" aria-label="Налаштування елемента Canvas">
      <div className="config-panel-header">
        <span>Налаштування елемента</span>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрити">
          <X size={14} />
        </button>
      </div>

      <div className="config-panel-body">
        <div className="config-field">
          <label className="config-label" htmlFor="cfg-title">
            Заголовок
          </label>
          <input
            id="cfg-title"
            type="text"
            className="config-input"
            value={element.config.title}
            onChange={(e) =>
              updateConfig({
                ...element.config,
                title: e.target.value,
              })
            }
          />
        </div>

        {element.type === 'note' && (
          <div className="config-field">
            <label className="config-label" htmlFor="cfg-note-text">
              Текст нотатки
            </label>
            <textarea
              id="cfg-note-text"
              rows={5}
              className="config-textarea"
              value={element.config.content}
              onChange={(e) =>
                updateConfig({
                  ...element.config,
                  content: e.target.value,
                })
              }
            />
          </div>
        )}

        {element.type === 'kpi' && (
          <>
            <div className="config-field">
              <label className="config-label" htmlFor="cfg-kpi-field">
                Колонка даних
              </label>
              <select
                id="cfg-kpi-field"
                className="config-select"
                value={
                  element.config.valueFieldId && hasColumn(element.config.valueFieldId)
                    ? element.config.valueFieldId
                    : ''
                }
                onChange={(e) =>
                  updateConfig({
                    ...element.config,
                    valueFieldId: e.target.value || null,
                  })
                }
              >
                <option value="">— Оберіть колонку —</option>
                {columns.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.name} ({col.type})
                  </option>
                ))}
              </select>
              {element.config.valueFieldId && !hasColumn(element.config.valueFieldId) && (
                <span className="config-warn">
                  Раніше обрану колонку ({element.config.valueFieldId}) видалено.
                </span>
              )}
            </div>

            <div className="config-field">
              <label className="config-label" htmlFor="cfg-kpi-agg">
                Агрегація
              </label>
              <select
                id="cfg-kpi-agg"
                className="config-select"
                value={element.config.aggregation}
                onChange={(e) =>
                  updateConfig({
                    ...element.config,
                    aggregation: e.target.value as KpiAggregation,
                  })
                }
              >
                {AGGREGATIONS.map((agg) => (
                  <option key={agg.value} value={agg.value}>
                    {agg.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {(element.type === 'line-chart' || element.type === 'bar-chart') && (
          <>
            <div className="config-field">
              <label className="config-label" htmlFor="cfg-chart-x">
                Вісь X (категорія / дата)
              </label>
              <select
                id="cfg-chart-x"
                className="config-select"
                value={
                  element.config.xFieldId && hasColumn(element.config.xFieldId)
                    ? element.config.xFieldId
                    : ''
                }
                onChange={(e) =>
                  updateConfig({
                    ...element.config,
                    xFieldId: e.target.value || null,
                  })
                }
              >
                <option value="">— Оберіть колонку —</option>
                {columns.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.name} ({col.type})
                  </option>
                ))}
              </select>
              {element.config.xFieldId && !hasColumn(element.config.xFieldId) && (
                <span className="config-warn">
                  Колонку осі X ({element.config.xFieldId}) видалено.
                </span>
              )}
            </div>

            <div className="config-field">
              <label className="config-label" htmlFor="cfg-chart-y">
                Вісь Y (значення)
              </label>
              <select
                id="cfg-chart-y"
                className="config-select"
                value={
                  element.config.yFieldId && hasColumn(element.config.yFieldId)
                    ? element.config.yFieldId
                    : ''
                }
                onChange={(e) =>
                  updateConfig({
                    ...element.config,
                    yFieldId: e.target.value || null,
                  })
                }
              >
                <option value="">— Оберіть колонку —</option>
                {columns.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.name} ({col.type})
                  </option>
                ))}
              </select>
              {element.config.yFieldId && !hasColumn(element.config.yFieldId) && (
                <span className="config-warn">
                  Колонку осі Y ({element.config.yFieldId}) видалено.
                </span>
              )}
            </div>

            <div className="config-field">
              <label className="config-label" htmlFor="cfg-chart-agg">
                Агрегація значень
              </label>
              <select
                id="cfg-chart-agg"
                className="config-select"
                value={element.config.aggregation}
                onChange={(e) =>
                  updateConfig({
                    ...element.config,
                    aggregation: e.target.value as ChartAggregation,
                  })
                }
              >
                {AGGREGATIONS.map((agg) => (
                  <option key={agg.value} value={agg.value}>
                    {agg.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {element.type === 'table-view' && (
          <>
            <div className="config-field">
              <span className="config-label">Видимі колонки (порожньо = всі)</span>
              <div className="config-cols-checklist">
                {columns.length === 0 ? (
                  <span className="placeholder-hint">Немає колонок у Source Data</span>
                ) : (
                  columns.map((col) => {
                    const checked = element.config.columnIds.includes(col.id);
                    return (
                      <label key={col.id} className="config-check-row">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const nextIds = e.target.checked
                              ? [...element.config.columnIds, col.id]
                              : element.config.columnIds.filter((id) => id !== col.id);
                            updateConfig({
                              ...element.config,
                              columnIds: nextIds,
                            });
                          }}
                        />
                        <span>{col.name}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <div className="config-field">
              <label className="config-label" htmlFor="cfg-table-max">
                Макс. рядків
              </label>
              <input
                id="cfg-table-max"
                type="number"
                min={1}
                max={500}
                className="config-input"
                value={element.config.maxRows ?? 50}
                onChange={(e) => {
                  const num = Number(e.target.value);
                  updateConfig({
                    ...element.config,
                    maxRows: Number.isFinite(num) && num > 0 ? Math.floor(num) : 50,
                  });
                }}
              />
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
