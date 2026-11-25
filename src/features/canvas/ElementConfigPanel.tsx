import { useRef, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { useProject } from '../../app/ProjectContext';
import type {
  CanvasElement,
  ChartAggregation,
  ChartSortMode,
  Column,
  ElementLink,
  KpiAggregation,
} from '../../domain/models';
import './ElementConfigPanel.css';

const CHART_COLOR_PRESETS = [
  '#7c5cff',
  '#38bdf8',
  '#34d399',
  '#fbbf24',
  '#fb7185',
  '#f472b6',
] as const;

interface ScrubNumberControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (next: number) => void;
}

/**
 * AfterEffects-style scrubby numeric control + range slider:
 * drag the numeric pill left/right to scrub, click to type, or use the slider.
 */
function ScrubNumberControl({
  label,
  value,
  min,
  max,
  unit = 'px',
  onChange,
}: ScrubNumberControlProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const dragRef = useRef<{ startX: number; startVal: number; moved: boolean } | null>(null);

  const clampVal = (n: number) => Math.max(min, Math.min(max, Math.round(n)));

  const handlePointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startVal: value, moved: false };

    const handleMove = (ev: PointerEvent) => {
      if (!dragRef.current) {
        return;
      }
      const dx = ev.clientX - dragRef.current.startX;
      if (Math.abs(dx) > 3) {
        dragRef.current.moved = true;
      }
      const step = Math.round(dx / 6);
      onChange(clampVal(dragRef.current.startVal + step));
    };

    const handleUp = () => {
      const wasMoved = dragRef.current?.moved ?? false;
      dragRef.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      if (!wasMoved) {
        setDraft(String(value));
        setEditing(true);
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  return (
    <div className="config-scrub-row">
      <div className="config-scrub-head">
        <span className="config-label">{label}</span>
        {editing ? (
          <input
            type="number"
            min={min}
            max={max}
            className="config-input config-input--compact"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              const num = Number(draft);
              if (Number.isFinite(num)) {
                onChange(clampVal(num));
              }
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const num = Number(draft);
                if (Number.isFinite(num)) {
                  onChange(clampVal(num));
                }
                setEditing(false);
              } else if (e.key === 'Escape') {
                setEditing(false);
              }
            }}
          />
        ) : (
          <span
            className="config-scrub-pill"
            title="Потягніть вліво/вправо для зміни або клікніть для введення"
            onPointerDown={handlePointerDown}
          >
            {value}
            {unit}
          </span>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        className="config-range"
        onChange={(e) => onChange(clampVal(Number(e.target.value)))}
      />
    </div>
  );
}

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

interface FieldSelectProps {
  id: string;
  label: string;
  value: string | null;
  columns: Column[];
  emptyLabel?: string;
  onChange: (nextId: string | null) => void;
}

function FieldSelect({
  id,
  label,
  value,
  columns,
  emptyLabel = '— Оберіть колонку —',
  onChange,
}: FieldSelectProps) {
  const exists = Boolean(value && columns.some((c) => c.id === value));
  return (
    <div className="config-field">
      <label className="config-label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="config-select"
        value={exists && value ? value : ''}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">{emptyLabel}</option>
        {columns.map((col) => (
          <option key={col.id} value={col.id}>
            {col.name} ({col.type})
          </option>
        ))}
      </select>
      {value && !exists && (
        <span className="config-warn">Раніше обрану колонку ({value}) видалено.</span>
      )}
    </div>
  );
}

interface AggregationSelectProps {
  id: string;
  label?: string;
  value: ChartAggregation;
  onChange: (next: ChartAggregation) => void;
}

function AggregationSelect({
  id,
  label = 'Агрегація',
  value,
  onChange,
}: AggregationSelectProps) {
  return (
    <div className="config-field">
      <label className="config-label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="config-select"
        value={value}
        onChange={(e) => onChange(e.target.value as ChartAggregation)}
      >
        {AGGREGATIONS.map((agg) => (
          <option key={agg.value} value={agg.value}>
            {agg.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ElementConfigPanel({ pageId, element, onClose }: ElementConfigPanelProps) {
  const { state, dispatch } = useProject();
  const columns = state.project.primaryDataset.columns;
  const pages = state.project.canvases;

  const [linkPageId, setLinkPageId] = useState<string>(pages[0]?.id ?? pageId);
  const [linkElementId, setLinkElementId] = useState<string>('');
  const [linkLabel, setLinkLabel] = useState<string>('');
  const [panelHeight, setPanelHeight] = useState<number>(520);
  const panelRef = useRef<HTMLElement | null>(null);

  const handleResizePanelStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = panelRef.current?.getBoundingClientRect().height ?? panelHeight;

    const handleMove = (ev: PointerEvent) => {
      const delta = ev.clientY - startY;
      setPanelHeight(Math.max(240, Math.min(900, Math.round(startHeight + delta))));
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const selectedTargetPage = pages.find((p) => p.id === linkPageId) ?? pages[0];
  const currentLinks = element.links ?? [];

  const updateConfig = (nextConfig: CanvasElement['config']) => {
    dispatch({
      type: 'UPDATE_ELEMENT_CONFIG',
      pageId,
      elementId: element.id,
      config: nextConfig,
    });
  };

  const handleAddLink = () => {
    if (!selectedTargetPage) {
      return;
    }
    const nextLink: ElementLink = {
      targetPageId: selectedTargetPage.id,
      ...(linkElementId ? { targetElementId: linkElementId } : {}),
      ...(linkLabel.trim() ? { label: linkLabel.trim() } : {}),
    };
    dispatch({
      type: 'UPDATE_ELEMENT_LINKS',
      pageId,
      elementId: element.id,
      links: [...currentLinks, nextLink],
    });
    setLinkLabel('');
    setLinkElementId('');
  };

  const handleRemoveLink = (index: number) => {
    dispatch({
      type: 'UPDATE_ELEMENT_LINKS',
      pageId,
      elementId: element.id,
      links: currentLinks.filter((_, i) => i !== index),
    });
  };

  return (
    <aside
      ref={panelRef}
      className="config-panel nodrag nopan nowheel"
      style={{ maxHeight: `min(${panelHeight}px, calc(100% - 64px))` }}
      aria-label="Налаштування елемента Canvas"
    >
      <div className="config-panel-header">
        <span>Налаштування елемента</span>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрити">
          <X size={14} />
        </button>
      </div>

      <div className="config-panel-body">
        <div className="config-field">
          <span className="config-label">Розташування і розмір (px)</span>
          <div className="config-geom-grid">
            <label className="config-geom-cell">
              <span>X</span>
              <input
                type="number"
                className="config-input"
                aria-label="Позиція X"
                value={Math.round(element.position.x)}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!Number.isFinite(val)) {
                    return;
                  }
                  dispatch({
                    type: 'MOVE_ELEMENT',
                    pageId,
                    elementId: element.id,
                    position: {
                      x: Math.round(val),
                      y: element.position.y,
                    },
                  });
                }}
              />
            </label>
            <label className="config-geom-cell">
              <span>Y</span>
              <input
                type="number"
                className="config-input"
                aria-label="Позиція Y"
                value={Math.round(element.position.y)}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!Number.isFinite(val)) {
                    return;
                  }
                  dispatch({
                    type: 'MOVE_ELEMENT',
                    pageId,
                    elementId: element.id,
                    position: {
                      x: element.position.x,
                      y: Math.round(val),
                    },
                  });
                }}
              />
            </label>
            <label className="config-geom-cell">
              <span>Ш</span>
              <input
                type="number"
                min={180}
                max={2400}
                className="config-input"
                aria-label="Ширина елемента"
                value={Math.round(element.size.width)}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!Number.isFinite(val)) {
                    return;
                  }
                  dispatch({
                    type: 'RESIZE_ELEMENT',
                    pageId,
                    elementId: element.id,
                    size: {
                      width: Math.max(180, Math.min(2400, Math.round(val))),
                      height: element.size.height,
                    },
                  });
                }}
              />
            </label>
            <label className="config-geom-cell">
              <span>В</span>
              <input
                type="number"
                min={110}
                max={2000}
                className="config-input"
                aria-label="Висота елемента"
                value={Math.round(element.size.height)}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!Number.isFinite(val)) {
                    return;
                  }
                  dispatch({
                    type: 'RESIZE_ELEMENT',
                    pageId,
                    elementId: element.id,
                    size: {
                      width: element.size.width,
                      height: Math.max(110, Math.min(2000, Math.round(val))),
                    },
                  });
                }}
              />
            </label>
          </div>
        </div>

        <div className="config-divider" />

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
            <FieldSelect
              id="cfg-kpi-field"
              label="Колонка даних"
              value={element.config.valueFieldId}
              columns={columns}
              onChange={(valueFieldId) => updateConfig({ ...element.config, valueFieldId })}
            />
            <AggregationSelect
              id="cfg-kpi-agg"
              value={element.config.aggregation}
              onChange={(aggregation) => updateConfig({ ...element.config, aggregation })}
            />
            <label className="config-check-row">
              <input
                type="checkbox"
                checked={Boolean(element.config.showSparkline)}
                onChange={(e) =>
                  updateConfig({
                    ...element.config,
                    showSparkline: e.target.checked,
                  })
                }
              />
              <span>Показувати sparkline-тренд</span>
            </label>
            {element.config.showSparkline && (
              <FieldSelect
                id="cfg-kpi-spark-order"
                label="Порядок / дата для sparkline"
                value={element.config.sparklineOrderFieldId ?? null}
                columns={columns}
                emptyLabel="— Порядок рядків —"
                onChange={(sparklineOrderFieldId) =>
                  updateConfig({ ...element.config, sparklineOrderFieldId })
                }
              />
            )}
          </>
        )}

        {(element.type === 'line-chart' || element.type === 'bar-chart') && (
          <>
            <FieldSelect
              id="cfg-chart-x"
              label="Вісь X (категорія / дата)"
              value={element.config.xFieldId}
              columns={columns}
              onChange={(xFieldId) => updateConfig({ ...element.config, xFieldId })}
            />
            <FieldSelect
              id="cfg-chart-y"
              label="Вісь Y (значення)"
              value={element.config.yFieldId}
              columns={columns}
              onChange={(yFieldId) => updateConfig({ ...element.config, yFieldId })}
            />
            <AggregationSelect
              id="cfg-chart-agg"
              label="Агрегація значень"
              value={element.config.aggregation}
              onChange={(aggregation) => updateConfig({ ...element.config, aggregation })}
            />
          </>
        )}

        {element.type === 'histogram' && (
          <>
            <FieldSelect
              id="cfg-hist-field"
              label="Числова колонка"
              value={element.config.valueFieldId}
              columns={columns}
              onChange={(valueFieldId) => updateConfig({ ...element.config, valueFieldId })}
            />
            <div className="config-field">
              <label className="config-label" htmlFor="cfg-hist-bins">
                Кількість інтервалів (bins)
              </label>
              <input
                id="cfg-hist-bins"
                type="number"
                min={2}
                max={30}
                className="config-input"
                value={element.config.binCount}
                onChange={(e) => {
                  const num = Number(e.target.value);
                  updateConfig({
                    ...element.config,
                    binCount: Number.isFinite(num)
                      ? Math.max(2, Math.min(30, Math.floor(num)))
                      : 8,
                  });
                }}
              />
            </div>
          </>
        )}

        {element.type === 'pie-chart' && (
          <>
            <FieldSelect
              id="cfg-pie-cat"
              label="Колонка категорій"
              value={element.config.categoryFieldId}
              columns={columns}
              onChange={(categoryFieldId) =>
                updateConfig({ ...element.config, categoryFieldId })
              }
            />
            <FieldSelect
              id="cfg-pie-val"
              label="Колонка значень"
              value={element.config.valueFieldId}
              columns={columns}
              onChange={(valueFieldId) => updateConfig({ ...element.config, valueFieldId })}
            />
            <AggregationSelect
              id="cfg-pie-agg"
              value={element.config.aggregation}
              onChange={(aggregation) => updateConfig({ ...element.config, aggregation })}
            />
            <label className="config-check-row">
              <input
                type="checkbox"
                checked={element.config.isDonut}
                onChange={(e) =>
                  updateConfig({ ...element.config, isDonut: e.target.checked })
                }
              />
              <span>Кільцева діаграма (Donut)</span>
            </label>
          </>
        )}

        {element.type === 'stacked-bar' && (
          <>
            <FieldSelect
              id="cfg-stack-x"
              label="Вісь X"
              value={element.config.xFieldId}
              columns={columns}
              onChange={(xFieldId) => updateConfig({ ...element.config, xFieldId })}
            />
            <FieldSelect
              id="cfg-stack-series"
              label="Серії (стекування)"
              value={element.config.seriesFieldId}
              columns={columns}
              onChange={(seriesFieldId) =>
                updateConfig({ ...element.config, seriesFieldId })
              }
            />
            <FieldSelect
              id="cfg-stack-y"
              label="Вісь Y (значення)"
              value={element.config.yFieldId}
              columns={columns}
              onChange={(yFieldId) => updateConfig({ ...element.config, yFieldId })}
            />
            <AggregationSelect
              id="cfg-stack-agg"
              value={element.config.aggregation}
              onChange={(aggregation) => updateConfig({ ...element.config, aggregation })}
            />
          </>
        )}

        {element.type === 'scatter' && (
          <>
            <FieldSelect
              id="cfg-scatter-x"
              label="Вісь X (числова)"
              value={element.config.xFieldId}
              columns={columns}
              onChange={(xFieldId) => updateConfig({ ...element.config, xFieldId })}
            />
            <FieldSelect
              id="cfg-scatter-y"
              label="Вісь Y (числова)"
              value={element.config.yFieldId}
              columns={columns}
              onChange={(yFieldId) => updateConfig({ ...element.config, yFieldId })}
            />
            <FieldSelect
              id="cfg-scatter-label"
              label="Підпис точки (опціонально)"
              value={element.config.labelFieldId}
              columns={columns}
              emptyLabel="— Номер рядка —"
              onChange={(labelFieldId) => updateConfig({ ...element.config, labelFieldId })}
            />
          </>
        )}

        {element.type === 'kanban' && (
          <>
            <FieldSelect
              id="cfg-kanban-group"
              label="Колонка групування (статус / категорія)"
              value={element.config.groupByFieldId}
              columns={columns}
              onChange={(groupByFieldId) =>
                updateConfig({ ...element.config, groupByFieldId })
              }
            />
            <FieldSelect
              id="cfg-kanban-title"
              label="Заголовок картки"
              value={element.config.titleFieldId}
              columns={columns}
              emptyLabel="— Автовибір —"
              onChange={(titleFieldId) => updateConfig({ ...element.config, titleFieldId })}
            />
            <div className="config-field">
              <span className="config-label">Додаткові поля картки</span>
              <div className="config-cols-checklist">
                {columns.length === 0 ? (
                  <span className="placeholder-hint">Немає колонок у Source Data</span>
                ) : (
                  columns.map((col) => {
                    const checked = element.config.detailFieldIds.includes(col.id);
                    return (
                      <label key={col.id} className="config-check-row">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const nextIds = e.target.checked
                              ? [...element.config.detailFieldIds, col.id]
                              : element.config.detailFieldIds.filter((id) => id !== col.id);
                            updateConfig({
                              ...element.config,
                              detailFieldIds: nextIds,
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
          </>
        )}

        {element.type === 'pivot-table' && (
          <>
            <FieldSelect
              id="cfg-pivot-row"
              label="Рядки (групування)"
              value={element.config.rowFieldId}
              columns={columns}
              onChange={(rowFieldId) => updateConfig({ ...element.config, rowFieldId })}
            />
            <FieldSelect
              id="cfg-pivot-col"
              label="Стовпці (опціонально)"
              value={element.config.colFieldId}
              columns={columns}
              emptyLabel="— Без розбиття на стовпці —"
              onChange={(colFieldId) => updateConfig({ ...element.config, colFieldId })}
            />
            <FieldSelect
              id="cfg-pivot-val"
              label="Поле значень"
              value={element.config.valueFieldId}
              columns={columns}
              onChange={(valueFieldId) => updateConfig({ ...element.config, valueFieldId })}
            />
            <AggregationSelect
              id="cfg-pivot-agg"
              value={element.config.aggregation}
              onChange={(aggregation) => updateConfig({ ...element.config, aggregation })}
            />
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

        {(element.type === 'line-chart' ||
          element.type === 'bar-chart' ||
          element.type === 'histogram' ||
          element.type === 'pie-chart' ||
          element.type === 'stacked-bar' ||
          element.type === 'scatter') && (
          <>
            <div className="config-divider" />
            <div className="config-field">
              <span className="config-label">Відображення та шрифти</span>
              <label className="config-check-row">
                <input
                  type="checkbox"
                  checked={Boolean(element.config.showDataLabels)}
                  onChange={(e) =>
                    updateConfig({
                      ...element.config,
                      showDataLabels: e.target.checked,
                    })
                  }
                />
                <span>Показувати числа на графіку</span>
              </label>

              {element.config.showDataLabels && (
                <ScrubNumberControl
                  label="Розмір шрифту чисел"
                  value={element.config.dataLabelFontSize ?? 10}
                  min={8}
                  max={22}
                  onChange={(val) =>
                    updateConfig({
                      ...element.config,
                      dataLabelFontSize: val,
                    })
                  }
                />
              )}

              {(element.type === 'line-chart' ||
                element.type === 'bar-chart' ||
                element.type === 'histogram' ||
                element.type === 'stacked-bar') && (
                <label className="config-check-row">
                  <input
                    type="checkbox"
                    checked={element.config.rotateLabels !== false}
                    onChange={(e) =>
                      updateConfig({
                        ...element.config,
                        rotateLabels: e.target.checked,
                      })
                    }
                  />
                  <span>Нахил підписів осі X</span>
                </label>
              )}

              <ScrubNumberControl
                label="Розмір шрифту підписів"
                value={element.config.axisLabelFontSize ?? 10}
                min={8}
                max={20}
                onChange={(val) =>
                  updateConfig({
                    ...element.config,
                    axisLabelFontSize: val,
                  })
                }
              />
            </div>

            <div className="config-divider" />
            <div className="config-field">
              <span className="config-label">Колір графіка</span>
              <div className="config-color-row">
                {CHART_COLOR_PRESETS.map((hex) => {
                  const active =
                    (element.config.accentColor || '#7c5cff').toLowerCase() === hex.toLowerCase();
                  return (
                    <button
                      key={hex}
                      type="button"
                      className={`config-color-swatch ${active ? 'config-color-swatch--active' : ''}`}
                      style={{ backgroundColor: hex }}
                      aria-label={`Обрати колір ${hex}`}
                      onClick={() => updateConfig({ ...element.config, accentColor: hex })}
                    />
                  );
                })}
                <input
                  type="color"
                  className="config-color-picker"
                  aria-label="Власний колір графіка"
                  value={element.config.accentColor || '#7c5cff'}
                  onChange={(e) =>
                    updateConfig({ ...element.config, accentColor: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="config-divider" />
            <div className="config-field">
              <span className="config-label">Сортування та фільтри</span>

              {element.type !== 'scatter' && (
                <select
                  className="config-select"
                  aria-label="Сортування діаграми"
                  value={element.config.sortBy ?? 'none'}
                  onChange={(e) =>
                    updateConfig({
                      ...element.config,
                      sortBy: e.target.value as ChartSortMode,
                    })
                  }
                >
                  <option value="none">Без сортування (початковий порядок)</option>
                  <option value="value-desc">За значенням (спадання ↓)</option>
                  <option value="value-asc">За значенням (зростання ↑)</option>
                  <option value="label-asc">За назвою (А → Я)</option>
                  <option value="label-desc">За назвою (Я → А)</option>
                </select>
              )}

              <input
                type="text"
                className="config-input"
                placeholder="Фільтр за назвою категорії…"
                aria-label="Фільтр за назвою"
                value={element.config.filterText ?? ''}
                onChange={(e) =>
                  updateConfig({ ...element.config, filterText: e.target.value })
                }
              />

              {element.type !== 'scatter' && (
                <ScrubNumberControl
                  label="Топ N (0 = всі)"
                  value={element.config.topN ?? 0}
                  min={0}
                  max={50}
                  unit=""
                  onChange={(val) => updateConfig({ ...element.config, topN: val })}
                />
              )}
            </div>

            {(element.type === 'line-chart' ||
              element.type === 'bar-chart' ||
              element.type === 'histogram') && (
              <>
                <div className="config-divider" />
                <div className="config-field">
                  <span className="config-label">Математичні операції</span>
                  <label className="config-check-row">
                    <input
                      type="checkbox"
                      checked={Boolean(element.config.showAvgLine)}
                      onChange={(e) =>
                        updateConfig({ ...element.config, showAvgLine: e.target.checked })
                      }
                    />
                    <span>Лінія середнього (μ)</span>
                  </label>
                  <label className="config-check-row">
                    <input
                      type="checkbox"
                      checked={Boolean(element.config.cumulative)}
                      onChange={(e) =>
                        updateConfig({ ...element.config, cumulative: e.target.checked })
                      }
                    />
                    <span>Наростаючий підсумок (Cumulative)</span>
                  </label>
                  <label className="config-check-row">
                    <input
                      type="checkbox"
                      checked={Boolean(element.config.asPercent)}
                      onChange={(e) =>
                        updateConfig({ ...element.config, asPercent: e.target.checked })
                      }
                    />
                    <span>Частка у відсотках (%)</span>
                  </label>
                </div>
              </>
            )}
          </>
        )}

        <div className="config-divider" />

        <div className="config-field">
          <span className="config-label">Внутрішні посилання (перехід)</span>

          {currentLinks.length > 0 && (
            <div className="config-links-list">
              {currentLinks.map((lnk, idx) => {
                const targetPage = pages.find((p) => p.id === lnk.targetPageId);
                const targetEl = lnk.targetElementId
                  ? targetPage?.elements.find((el) => el.id === lnk.targetElementId)
                  : undefined;
                const displayText =
                  lnk.label ||
                  (targetPage
                    ? targetEl
                      ? `${targetPage.name} → ${targetEl.config.title}`
                      : targetPage.name
                    : 'Видалена ціль');

                return (
                  <div
                    key={`${lnk.targetPageId}-${lnk.targetElementId ?? 'page'}-${idx}`}
                    className="config-link-item"
                  >
                    <span className="config-link-text" title={displayText}>
                      {displayText}
                    </span>
                    <button
                      type="button"
                      className="sd-mini-btn sd-mini-btn--danger"
                      onClick={() => handleRemoveLink(idx)}
                      aria-label="Видалити посилання"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <select
            className="config-select"
            aria-label="Цільова сторінка посилання"
            value={selectedTargetPage?.id ?? ''}
            onChange={(e) => {
              setLinkPageId(e.target.value);
              setLinkElementId('');
            }}
          >
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                Сторінка: {p.name}
              </option>
            ))}
          </select>

          <select
            className="config-select"
            aria-label="Цільовий елемент (опціонально)"
            value={linkElementId}
            onChange={(e) => setLinkElementId(e.target.value)}
          >
            <option value="">— Вся сторінка —</option>
            {(selectedTargetPage?.elements ?? [])
              .filter((el) => el.id !== element.id)
              .map((el) => (
                <option key={el.id} value={el.id}>
                  Елемент: {el.config.title || el.id}
                </option>
              ))}
          </select>

          <div className="config-link-add-row">
            <input
              type="text"
              className="config-input"
              placeholder="Підпис посилання (опціонально)"
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
            />
            <button
              type="button"
              className="btn btn--secondary"
              style={{ height: '28px', padding: '0 8px' }}
              onClick={handleAddLink}
            >
              <Plus size={12} />
            </button>
          </div>
        </div>
      </div>
      <div
        className="config-panel-resizer"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Змінити висоту вікна властивостей"
        title="Потягніть для зміни висоти вікна"
        onPointerDown={handleResizePanelStart}
      />
    </aside>
  );
}
