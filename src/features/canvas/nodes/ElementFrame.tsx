import type { ReactNode } from 'react';
import { NodeResizer, type Node } from '@xyflow/react';
import { ArrowUpRight, Settings2 } from 'lucide-react';
import { useProject } from '../../../app/ProjectContext';
import type { CanvasElement, ElementLink } from '../../../domain/models';
import { useCanvasSnap } from '../canvasSnapContext';
import './CanvasNodes.css';

export interface CanvasFlowNodeData extends Record<string, unknown> {
  element: CanvasElement;
  pageId: string;
  onConfigure: (elementId: string) => void;
}

export type CanvasFlowNode = Node<CanvasFlowNodeData, CanvasElement['type']>;

interface ElementFrameProps {
  element: CanvasElement;
  pageId: string;
  selected: boolean;
  icon: ReactNode;
  headerActions?: ReactNode;
  onConfigure: (elementId: string) => void;
  children: ReactNode;
}

export function ElementFrame({
  element,
  pageId,
  selected,
  icon,
  headerActions,
  onConfigure,
  children,
}: ElementFrameProps) {
  const { state, dispatch } = useProject();
  const canvasSnap = useCanvasSnap();
  const links = element.links ?? [];

  const resolveLinkDisplay = (link: ElementLink) => {
    const targetPage = state.project.canvases.find((p) => p.id === link.targetPageId);
    if (!targetPage) {
      return { valid: false, text: link.label || 'Видалена сторінка' };
    }
    if (link.targetElementId) {
      const targetEl = targetPage.elements.find((e) => e.id === link.targetElementId);
      if (!targetEl) {
        return { valid: false, text: link.label || 'Видалений елемент' };
      }
      return {
        valid: true,
        text: link.label || `${targetPage.name} → ${targetEl.config.title}`,
      };
    }
    return {
      valid: true,
      text: link.label || targetPage.name,
    };
  };

  const handleNavigateLink = (link: ElementLink) => {
    if (link.targetElementId) {
      dispatch({
        type: 'SELECT_ELEMENT',
        pageId: link.targetPageId,
        elementId: link.targetElementId,
      });
    } else {
      dispatch({
        type: 'SELECT_PAGE',
        pageId: link.targetPageId,
      });
    }
  };

  return (
    <div className={`canvas-node ${selected ? 'canvas-node--selected' : ''}`}>
      <NodeResizer
        isVisible={selected}
        minWidth={180}
        minHeight={110}
        color="#7c5cff"
        handleStyle={{ width: 10, height: 10, borderRadius: 3, background: '#7c5cff', border: '2px solid #fff2' }}
        lineStyle={{ borderColor: '#7c5cff', borderWidth: 2, opacity: 0.6 }}
        onResize={(_event, params) => {
          canvasSnap?.onResizeSnap(element.id, params);
        }}
        onResizeEnd={(_event, params) => {
          const snapped = canvasSnap?.onResizeSnapEnd(element.id, params) ?? params;
          dispatch({
            type: 'RESIZE_ELEMENT',
            pageId,
            elementId: element.id,
            size: {
              width: Math.max(180, Math.round(snapped.width)),
              height: Math.max(110, Math.round(snapped.height)),
            },
            position: {
              x: Math.round(snapped.x),
              y: Math.round(snapped.y),
            },
          });
        }}
      />

      <div className="canvas-node-header canvas-node-drag">
        <span className="canvas-node-title">
          {icon}
          <span className="canvas-node-title-text" title={element.config.title}>
            {element.config.title}
          </span>
        </span>

        <div className="canvas-node-actions nodrag">
          {headerActions}
          <button
            type="button"
            className="sd-mini-btn"
            onClick={(e) => {
              e.stopPropagation();
              dispatch({ type: 'SELECT_ELEMENT', elementId: element.id, pageId });
              onConfigure(element.id);
            }}
            aria-label="Налаштувати елемент"
            title="Налаштувати"
          >
            <Settings2 size={12} />
          </button>
        </div>
      </div>

      <div className="canvas-node-body">{children}</div>

      {links.length > 0 && (
        <div className="canvas-node-links nodrag">
          {links.map((link, idx) => {
            const info = resolveLinkDisplay(link);
            return (
              <button
                key={`${link.targetPageId}-${link.targetElementId ?? 'page'}-${idx}`}
                type="button"
                disabled={!info.valid}
                className={`canvas-link-chip ${!info.valid ? 'canvas-link-chip--broken' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (info.valid) {
                    handleNavigateLink(link);
                  }
                }}
                title={info.valid ? `Перейти: ${info.text}` : 'Ціль посилання видалено'}
              >
                <ArrowUpRight size={11} />
                <span>{info.text}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
