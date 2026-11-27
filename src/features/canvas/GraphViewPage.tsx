import { lazy, Suspense, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Columns2,
  GitFork,
  Orbit,
  Share2,
  Sparkles,
} from 'lucide-react';
import { useProject } from '../../app/ProjectContext';
import type { GraphLayoutMode } from '../visualizations/EChartGraphBox';
import {
  computeProjectGraph,
  type ProjectGraphNode,
} from '../visualizations/transforms';
import './GraphViewPage.css';

const LazyGraphBox = lazy(() => import('../visualizations/EChartGraphBox'));

interface GraphViewPageProps {
  onBackToWorkspace: () => void;
}

const LAYOUT_OPTIONS: readonly {
  id: GraphLayoutMode;
  label: string;
  icon: typeof Sparkles;
}[] = [
  { id: 'force', label: 'Вільний (Obsidian)', icon: Sparkles },
  { id: 'radial', label: 'Орбіта', icon: Orbit },
  { id: 'tree', label: 'Дерево', icon: GitFork },
];

export function GraphViewPage({ onBackToWorkspace }: GraphViewPageProps) {
  const { state, dispatch } = useProject();
  const [includeLineage, setIncludeLineage] = useState(true);
  const [isSplitView, setIsSplitView] = useState(false);
  const [primaryMode, setPrimaryMode] = useState<GraphLayoutMode>('force');
  const [secondaryMode, setSecondaryMode] = useState<GraphLayoutMode>('tree');
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const graph = useMemo(
    () => computeProjectGraph(state.project, { includeDataLineage: includeLineage }),
    [state.project, includeLineage],
  );

  const hoveredNode = useMemo(
    () => (hoveredNodeId ? graph.nodes.find((n) => n.id === hoveredNodeId) ?? null : null),
    [graph.nodes, hoveredNodeId],
  );

  const handleSelectNode = (node: ProjectGraphNode) => {
    if (node.kind === 'page' && node.pageId) {
      dispatch({ type: 'SELECT_PAGE', pageId: node.pageId });
      onBackToWorkspace();
    } else if (node.kind === 'element' && node.pageId && node.elementId) {
      dispatch({
        type: 'SELECT_ELEMENT',
        pageId: node.pageId,
        elementId: node.elementId,
      });
      onBackToWorkspace();
    }
  };

  const renderModeSwitcher = (
    activeMode: GraphLayoutMode,
    onChange: (next: GraphLayoutMode) => void,
  ) => (
    <div className="graph-mode-tabs" role="tablist" aria-label="Режим відображення графа">
      {LAYOUT_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = activeMode === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`graph-mode-btn ${active ? 'graph-mode-btn--active' : ''}`}
            onClick={() => onChange(opt.id)}
          >
            <Icon size={12} />
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="graph-page">
      <div className="graph-topbar">
        <div className="graph-title-group">
          <Share2 size={15} />
          <h1 className="graph-title">Граф зв’язків (Graph View)</h1>
          <span className="mono-chip">
            {graph.nodes.length} вузлів · {graph.edges.length} зв’язків
            {graph.linkCount > 0 ? ` (внутрішніх: ${graph.linkCount})` : ''}
          </span>
          {graph.brokenLinkCount > 0 && (
            <span className="shell-badge shell-badge--warning">
              Битих посилань: {graph.brokenLinkCount}
            </span>
          )}
        </div>

        <div className="graph-controls">
          {!isSplitView && renderModeSwitcher(primaryMode, setPrimaryMode)}

          <button
            type="button"
            className={`icon-btn icon-btn--outlined ${isSplitView ? 'icon-btn--active' : ''}`}
            onClick={() => setIsSplitView((prev) => !prev)}
            title="Відкрити два варіанти графа одночасно із синхронним підсвічуванням"
          >
            <Columns2 size={13} />
            <span>{isSplitView ? '2 панелі: Увімк.' : '2 панелі'}</span>
          </button>

          <button
            type="button"
            className={`icon-btn icon-btn--outlined ${includeLineage ? 'icon-btn--active' : ''}`}
            onClick={() => setIncludeLineage((prev) => !prev)}
          >
            <span>{includeLineage ? 'Data Lineage: Увімк.' : 'Data Lineage: Вимк.'}</span>
          </button>

          <button
            type="button"
            className="btn btn--secondary"
            onClick={onBackToWorkspace}
            title="Повернутися до Canvas (Shift+G або Esc)"
          >
            <ArrowLeft size={14} />
            <span>До Canvas</span>
            <kbd className="graph-kbd">Shift+G</kbd>
          </button>
        </div>
      </div>

      <div className="graph-legend">
        <span className="graph-legend-item">
          <span className="graph-dot" style={{ backgroundColor: '#c9bdff' }} />
          Проєкт
        </span>
        <span className="graph-legend-item">
          <span className="graph-dot" style={{ backgroundColor: '#7c5cff' }} />
          Сторінки
        </span>
        <span className="graph-legend-item">
          <span className="graph-dot" style={{ backgroundColor: '#38bdf8' }} />
          Елементи
        </span>
        {includeLineage && (
          <>
            <span className="graph-legend-item">
              <span className="graph-dot" style={{ backgroundColor: '#34d399' }} />
              Таблиці
            </span>
            <span className="graph-legend-item">
              <span className="graph-dot" style={{ backgroundColor: '#94a3b8' }} />
              Колонки/fx
            </span>
            <span className="graph-legend-item">
              <span className="graph-dot" style={{ backgroundColor: '#fbbf24' }} />
              Joins
            </span>
            <span className="graph-legend-item">
              <span className="graph-dot" style={{ backgroundColor: '#fb7185' }} />
              Фільтри
            </span>
          </>
        )}
        {hoveredNode && (
          <span className="graph-legend-hovered">
            Фокус: {hoveredNode.label}
          </span>
        )}
      </div>

      <div className={`graph-canvas-wrap ${isSplitView ? 'graph-canvas-wrap--split' : ''}`}>
        <div className="graph-pane">
          {isSplitView && (
            <div className="graph-pane-badge">
              <span className="graph-pane-label">Панель 1</span>
              {renderModeSwitcher(primaryMode, setPrimaryMode)}
            </div>
          )}
          <Suspense
            fallback={
              <div className="canvas-stage">
                <span className="placeholder-hint">Завантаження графа…</span>
              </div>
            }
          >
            <LazyGraphBox
              graph={graph}
              mode={primaryMode}
              hoveredNodeId={hoveredNodeId}
              onHoverNode={setHoveredNodeId}
              onSelectNode={handleSelectNode}
            />
          </Suspense>
        </div>

        {isSplitView && (
          <div className="graph-pane">
            <div className="graph-pane-badge">
              <span className="graph-pane-label">Панель 2</span>
              {renderModeSwitcher(secondaryMode, setSecondaryMode)}
            </div>
            <Suspense
              fallback={
                <div className="canvas-stage">
                  <span className="placeholder-hint">Завантаження графа…</span>
                </div>
              }
            >
              <LazyGraphBox
                graph={graph}
                mode={secondaryMode}
                hoveredNodeId={hoveredNodeId}
                onHoverNode={setHoveredNodeId}
                onSelectNode={handleSelectNode}
              />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
