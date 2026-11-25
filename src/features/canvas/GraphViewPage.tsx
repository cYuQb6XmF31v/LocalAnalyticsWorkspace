import { lazy, Suspense, useMemo } from 'react';
import { ArrowLeft, Share2 } from 'lucide-react';
import { useProject } from '../../app/ProjectContext';
import {
  computeProjectGraph,
  type ProjectGraphNode,
} from '../visualizations/transforms';
import './GraphViewPage.css';

const LazyGraphBox = lazy(() => import('../visualizations/EChartGraphBox'));

interface GraphViewPageProps {
  onBackToWorkspace: () => void;
}

export function GraphViewPage({ onBackToWorkspace }: GraphViewPageProps) {
  const { state, dispatch } = useProject();
  const graph = useMemo(() => computeProjectGraph(state.project), [state.project]);

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

        <div className="graph-legend">
          <span>
            <span className="graph-dot" style={{ backgroundColor: '#c4b5fd' }} />
            Проєкт
          </span>
          <span>
            <span className="graph-dot" style={{ backgroundColor: '#7c5cff' }} />
            Сторінки
          </span>
          <span>
            <span className="graph-dot" style={{ backgroundColor: '#38bdf8' }} />
            Елементи
          </span>
          <button type="button" className="btn btn--secondary" onClick={onBackToWorkspace}>
            <ArrowLeft size={14} />
            <span>До Canvas</span>
          </button>
        </div>
      </div>

      <div className="graph-canvas-wrap">
        <Suspense
          fallback={
            <div className="canvas-stage">
              <span className="placeholder-hint">Завантаження графа…</span>
            </div>
          }
        >
          <LazyGraphBox graph={graph} onSelectNode={handleSelectNode} />
        </Suspense>
      </div>
    </div>
  );
}
