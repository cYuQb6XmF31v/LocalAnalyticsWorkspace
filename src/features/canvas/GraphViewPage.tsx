import { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Columns2,
  GitFork,
  Orbit,
  RotateCcw,
  Share2,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { useProject } from '../../app/ProjectContext';
import {
  DEFAULT_GRAPH_SENSITIVITY,
  sensitivityToDwellMs,
  type EChartGraphBoxHandle,
  type GraphLayoutMode,
  type GraphSensitivitySettings,
} from '../visualizations/EChartGraphBox';
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
  { id: 'force', label: 'Вільний граф', icon: Sparkles },
  { id: 'radial', label: 'Орбіта', icon: Orbit },
  { id: 'tree', label: 'Дерево', icon: GitFork },
];

function formatSensitivityReadout(val: number): string {
  if (val <= 0) return 'вимк.';
  const ms = sensitivityToDwellMs(val);
  if (ms === 0) return '0 мс';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} с`;
  return `${ms} мс`;
}

export function GraphViewPage({ onBackToWorkspace }: GraphViewPageProps) {
  const { state, dispatch } = useProject();
  const [includeLineage, setIncludeLineage] = useState(true);
  const [isSplitView, setIsSplitView] = useState(false);
  const [primaryMode, setPrimaryMode] = useState<GraphLayoutMode>('force');
  const [secondaryMode, setSecondaryMode] = useState<GraphLayoutMode>('tree');
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [showSensitivityPanel, setShowSensitivityPanel] = useState(false);
  const [sensitivity, setSensitivity] = useState<GraphSensitivitySettings>(
    DEFAULT_GRAPH_SENSITIVITY,
  );

  const primaryGraphRef = useRef<EChartGraphBoxHandle | null>(null);
  const secondaryGraphRef = useRef<EChartGraphBoxHandle | null>(null);

  const graph = useMemo(
    () => computeProjectGraph(state.project, { includeDataLineage: includeLineage }),
    [state.project, includeLineage],
  );

  const hoveredNode = useMemo(
    () => (hoveredNodeId ? graph.nodes.find((n) => n.id === hoveredNodeId) ?? null : null),
    [graph.nodes, hoveredNodeId],
  );

  const handleHoverFromPane = useCallback(
    (sourcePane: 'primary' | 'secondary') => (nodeId: string | null) => {
      // Push highlight synchronously to the sibling panel so there is 0ms lag
      if (sourcePane === 'primary') {
        secondaryGraphRef.current?.syncHoveredNode(nodeId);
      } else {
        primaryGraphRef.current?.syncHoveredNode(nodeId);
      }
      setHoveredNodeId(nodeId);
    },
    [],
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

  const updateLevel = (
    key: keyof GraphSensitivitySettings['levels'],
    val: number,
  ) => {
    setSensitivity((prev) => ({
      ...prev,
      levels: {
        ...prev.levels,
        [key]: val,
      },
    }));
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

  const renderSensSlider = (
    id: string,
    label: string,
    value: number,
    onChange: (val: number) => void,
    dotColor?: string,
  ) => (
    <div className="gs-ctrl">
      <div className="gs-ctrl-row">
        <label htmlFor={id} className="gs-ctrl-label">
          {dotColor && <span className="graph-dot" style={{ backgroundColor: dotColor }} />}
          <span>{label}</span>
        </label>
        <span className="gs-ctrl-val">
          {value}% · {formatSensitivityReadout(value)}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        className="gs-slider"
        onChange={(e) => onChange(Number(e.target.value))}
      />
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
            className={`icon-btn icon-btn--outlined ${showSensitivityPanel ? 'icon-btn--active' : ''}`}
            onClick={() => setShowSensitivityPanel((prev) => !prev)}
            title="Налаштування чутливості, відстані та приліпання до зв’язків"
          >
            <SlidersHorizontal size={13} />
            <span>Чутливість</span>
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
        <span className="graph-legend-hint">
          ЛКМ або затиснуте коліщатко — переміщення · Колесо — зум
        </span>
        {hoveredNode && (
          <span className="graph-legend-hovered">Фокус: {hoveredNode.label}</span>
        )}
      </div>

      <div className="graph-body">
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
                ref={primaryGraphRef}
                graph={graph}
                mode={primaryMode}
                hoveredNodeId={hoveredNodeId}
                sensitivity={sensitivity}
                onHoverNode={handleHoverFromPane('primary')}
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
                  ref={secondaryGraphRef}
                  graph={graph}
                  mode={secondaryMode}
                  hoveredNodeId={hoveredNodeId}
                  sensitivity={sensitivity}
                  onHoverNode={handleHoverFromPane('secondary')}
                  onSelectNode={handleSelectNode}
                />
              </Suspense>
            </div>
          )}
        </div>

        {showSensitivityPanel && (
          <aside className="gs-drawer" aria-label="Параметри курсора">
            <div className="gs-drawer-head">
              <span>Параметри наведення</span>
              <button
                type="button"
                className="sd-mini-btn"
                title="Скинути за замовчуванням"
                aria-label="Скинути чутливість"
                onClick={() => setSensitivity(DEFAULT_GRAPH_SENSITIVITY)}
              >
                <RotateCcw size={12} />
              </button>
            </div>

            <div className="gs-drawer-body">
              <div className="gs-section-cap">Зв’язки (лінії)</div>
              {renderSensSlider(
                'gs-edges',
                'Чутливість',
                sensitivity.edges,
                (val) => setSensitivity((prev) => ({ ...prev, edges: val })),
                '#a78bfa',
              )}

              <div className="gs-ctrl">
                <div className="gs-ctrl-row">
                  <label htmlFor="gs-edge-radius" className="gs-ctrl-label">
                    Зона захоплення
                  </label>
                  <span className="gs-ctrl-val">{sensitivity.edgeHitRadius} px</span>
                </div>
                <input
                  id="gs-edge-radius"
                  type="range"
                  min={2}
                  max={36}
                  step={1}
                  value={sensitivity.edgeHitRadius}
                  className="gs-slider"
                  onChange={(e) =>
                    setSensitivity((prev) => ({
                      ...prev,
                      edgeHitRadius: Number(e.target.value),
                    }))
                  }
                />
              </div>

              <label className="gs-check">
                <input
                  type="checkbox"
                  checked={sensitivity.edgeSnap}
                  onChange={(e) =>
                    setSensitivity((prev) => ({ ...prev, edgeSnap: e.target.checked }))
                  }
                />
                <span>Приліпання до лінії</span>
              </label>

              <div className="gs-sep" />
              <div className="gs-section-cap">Об’єкти (вузли)</div>

              <label className="gs-check">
                <input
                  type="checkbox"
                  checked={sensitivity.splitByLevel}
                  onChange={(e) =>
                    setSensitivity((prev) => ({ ...prev, splitByLevel: e.target.checked }))
                  }
                />
                <span>Окремо по рівнях</span>
              </label>

              {!sensitivity.splitByLevel ? (
                renderSensSlider(
                  'gs-nodes-all',
                  'Усі вузли',
                  sensitivity.nodesGlobal,
                  (val) => setSensitivity((prev) => ({ ...prev, nodesGlobal: val })),
                )
              ) : (
                <div className="gs-levels">
                  {renderSensSlider(
                    'gs-lvl-project',
                    'Проєкт',
                    sensitivity.levels.project,
                    (v) => updateLevel('project', v),
                    '#c9bdff',
                  )}
                  {renderSensSlider(
                    'gs-lvl-page',
                    'Аркуші Canvas',
                    sensitivity.levels.page,
                    (v) => updateLevel('page', v),
                    '#7c5cff',
                  )}
                  {renderSensSlider(
                    'gs-lvl-element',
                    'Елементи',
                    sensitivity.levels.element,
                    (v) => updateLevel('element', v),
                    '#38bdf8',
                  )}
                  {renderSensSlider(
                    'gs-lvl-dataset',
                    'Таблиці',
                    sensitivity.levels.dataset,
                    (v) => updateLevel('dataset', v),
                    '#34d399',
                  )}
                  {renderSensSlider(
                    'gs-lvl-column',
                    'Колонки / fx',
                    sensitivity.levels.column,
                    (v) => updateLevel('column', v),
                    '#94a3b8',
                  )}
                  {renderSensSlider(
                    'gs-lvl-jf',
                    'Joins / Фільтри',
                    sensitivity.levels.joinFilter,
                    (v) => updateLevel('joinFilter', v),
                    '#fbbf24',
                  )}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
