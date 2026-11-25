import { lazy, Suspense, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronRight } from 'lucide-react';
import { useProject } from '../../app/ProjectContext';
import { computeActivityHeatmap } from '../visualizations/transforms';
import './ActivityHeatmapPanel.css';

const LazyHeatmapBox = lazy(() => import('../visualizations/EChartHeatmapBox'));
const LEGEND_SWATCHES = ['#141720', '#2d235a', '#493594', '#6648cc', '#7c5cff', '#b49eff'];

export function ActivityHeatmapPanel() {
  const { state } = useProject();
  const dataset = state.project.primaryDataset;
  const dateColumns = dataset.columns.filter((col) => col.type === 'date');

  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedDateColId, setSelectedDateColId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string | undefined>(undefined);
  const [heatmapHeight, setHeatmapHeight] = useState<number>(140);
  const dragStartRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragStartRef.current = { startY: e.clientY, startHeight: heatmapHeight };

    const handleMove = (moveEvent: PointerEvent) => {
      if (!dragStartRef.current) {
        return;
      }
      const delta = moveEvent.clientY - dragStartRef.current.startY;
      const next = Math.max(100, Math.min(340, dragStartRef.current.startHeight + delta));
      setHeatmapHeight(Math.round(next));
    };

    const handleUp = () => {
      dragStartRef.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const effectiveColId =
    selectedDateColId && dateColumns.some((c) => c.id === selectedDateColId)
      ? selectedDateColId
      : (dateColumns[0]?.id ?? null);

  const result = isExpanded
    ? computeActivityHeatmap(dataset, effectiveColId, selectedYear)
    : null;

  return (
    <section className="heatmap-dock" aria-label="Календар активності за датою">
      <div className="heatmap-toggle-bar">
        <button
          type="button"
          className="heatmap-toggle-btn"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <CalendarDays size={13} />
          <span>Календар записів (Activity Heatmap)</span>
        </button>

        <span className="mono-chip">
          {dateColumns.length > 0 ? `${dateColumns.length} date` : 'немає date'}
        </span>
      </div>

      {isExpanded && result && (
        <div className="heatmap-body">
          {dateColumns.length > 0 && (
            <div className="heatmap-controls">
              <select
                className="sd-select"
                aria-label="Колонка дати для календаря"
                value={effectiveColId ?? ''}
                onChange={(e) => setSelectedDateColId(e.target.value || null)}
              >
                {dateColumns.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.name}
                  </option>
                ))}
              </select>

              {result.status === 'ok' && result.availableYears.length > 1 && (
                <select
                  className="sd-select"
                  aria-label="Рік календаря"
                  value={result.year}
                  onChange={(e) => setSelectedYear(e.target.value)}
                >
                  {result.availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              )}

              {result.status === 'ok' && (
                <span className="placeholder-hint">
                  Записів: {result.totalValidRecords}
                  {result.skippedInvalidCount > 0
                    ? ` · Пропущено невалідних дат: ${result.skippedInvalidCount}`
                    : ''}
                </span>
              )}
            </div>
          )}

          {result.status === 'setup' ? (
            <div className="heatmap-setup">{result.message}</div>
          ) : (
            <div className="heatmap-chart-wrap">
              <Suspense fallback={<span className="placeholder-hint">Завантаження календаря…</span>}>
                <LazyHeatmapBox
                  year={result.year}
                  entries={result.entries}
                  maxCount={result.maxCount}
                  columnName={result.columnName}
                  height={heatmapHeight}
                />
              </Suspense>
              <div className="heatmap-legend-bar">
                <span className="heatmap-legend-label">Менше (0)</span>
                <div className="heatmap-legend-swatches" aria-hidden="true">
                  {LEGEND_SWATCHES.map((color, idx) => (
                    <span
                      key={color}
                      className="heatmap-legend-swatch"
                      style={{ backgroundColor: color }}
                      title={idx === 0 ? '0 записів' : `Рівень ${idx}`}
                    />
                  ))}
                </div>
                <span className="heatmap-legend-label">
                  Більше ({result.maxCount})
                </span>
              </div>
              <div
                className="heatmap-resize-handle"
                role="separator"
                aria-orientation="horizontal"
                aria-label="Змінити висоту календаря"
                title="Потягніть для зміни висоти календаря"
                onPointerDown={handleResizePointerDown}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
