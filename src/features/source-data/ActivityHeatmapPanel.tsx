import { lazy, Suspense, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronRight } from 'lucide-react';
import { useProject } from '../../app/ProjectContext';
import { computeActivityHeatmap } from '../visualizations/transforms';
import './ActivityHeatmapPanel.css';

const LazyHeatmapBox = lazy(() => import('../visualizations/EChartHeatmapBox'));

export function ActivityHeatmapPanel() {
  const { state } = useProject();
  const dataset = state.project.primaryDataset;
  const dateColumns = dataset.columns.filter((col) => col.type === 'date');

  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedDateColId, setSelectedDateColId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string | undefined>(undefined);

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
                />
              </Suspense>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
