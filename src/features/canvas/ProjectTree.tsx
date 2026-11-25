import { useRef, useState } from 'react';
import {
  BarChart2,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Columns3,
  Edit2,
  Grid3x3,
  Hash,
  HelpCircle,
  LayoutGrid,
  LineChart,
  PieChart,
  Plus,
  ScatterChart,
  Share2,
  StickyNote,
  Table,
  Trash2,
} from 'lucide-react';
import { useProject } from '../../app/ProjectContext';
import { Modal } from '../../components/Modal';
import type { CanvasElement, CanvasElementType, CanvasPage } from '../../domain/models';
import { uk } from '../../i18n/uk';
import './ProjectTree.css';

interface ProjectTreeProps {
  onOpenGraph: () => void;
  onOpenHelp: () => void;
  onNavigateToCanvas: () => void;
  isGraphActive: boolean;
  isHelpActive: boolean;
}

function getElementIcon(type: CanvasElementType) {
  switch (type) {
    case 'note':
      return <StickyNote size={12} />;
    case 'kpi':
      return <Hash size={12} />;
    case 'line-chart':
      return <LineChart size={12} />;
    case 'bar-chart':
    case 'stacked-bar':
      return <BarChart3 size={12} />;
    case 'histogram':
      return <BarChart2 size={12} />;
    case 'pie-chart':
      return <PieChart size={12} />;
    case 'scatter':
      return <ScatterChart size={12} />;
    case 'kanban':
      return <Columns3 size={12} />;
    case 'pivot-table':
      return <Grid3x3 size={12} />;
    case 'table-view':
      return <Table size={12} />;
  }
}

export function ProjectTree({
  onOpenGraph,
  onOpenHelp,
  onNavigateToCanvas,
  isGraphActive,
  isHelpActive,
}: ProjectTreeProps) {
  const { state, dispatch } = useProject();
  const { project, activePageId, selectedElementId, selectedElementIds } = state;
  const activeSelectedIds =
    selectedElementIds && selectedElementIds.length > 0
      ? selectedElementIds
      : selectedElementId
        ? [selectedElementId]
        : [];

  const [collapsedPages, setCollapsedPages] = useState<Record<string, boolean>>({});
  const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renamingElementId, setRenamingElementId] = useState<string | null>(null);
  const [elementRenameDraft, setElementRenameDraft] = useState('');
  const [confirmDeletePage, setConfirmDeletePage] = useState<CanvasPage | null>(null);
  const selectionAnchorRef = useRef<string | null>(null);

  const toggleExpand = (pageId: string) => {
    setCollapsedPages((prev) => ({ ...prev, [pageId]: !prev[pageId] }));
  };

  const handleAddPage = () => {
    dispatch({
      type: 'ADD_PAGE',
      name: `Сторінка ${project.canvases.length + 1}`,
      activate: true,
    });
  };

  const handleRequestDeletePage = (page: CanvasPage) => {
    if (project.canvases.length <= 1) {
      return;
    }
    if (page.elements.length > 0) {
      setConfirmDeletePage(page);
      return;
    }
    dispatch({ type: 'DELETE_PAGE', pageId: page.id });
  };

  const commitRename = (pageId: string) => {
    const trimmed = renameDraft.trim();
    if (trimmed) {
      dispatch({ type: 'RENAME_PAGE', pageId, name: trimmed });
    }
    setRenamingPageId(null);
  };

  const commitElementRename = (pageId: string, element: CanvasElement) => {
    const trimmed = elementRenameDraft.trim();
    if (trimmed && trimmed !== element.config.title) {
      dispatch({
        type: 'UPDATE_ELEMENT_CONFIG',
        pageId,
        elementId: element.id,
        config: {
          ...element.config,
          title: trimmed,
        },
      });
    }
    setRenamingElementId(null);
  };

  const handleElementClick = (
    event: React.MouseEvent,
    page: CanvasPage,
    elId: string,
  ) => {
    const isSamePage = activePageId === page.id;
    const isCtrl = event.ctrlKey || event.metaKey;
    const isShift = event.shiftKey;

    if (isShift && isSamePage && selectionAnchorRef.current) {
      const anchorIdx = page.elements.findIndex((e) => e.id === selectionAnchorRef.current);
      const targetIdx = page.elements.findIndex((e) => e.id === elId);
      if (anchorIdx !== -1 && targetIdx !== -1) {
        const start = Math.min(anchorIdx, targetIdx);
        const end = Math.max(anchorIdx, targetIdx);
        const rangeIds = page.elements.slice(start, end + 1).map((e) => e.id);
        dispatch({
          type: 'SELECT_ELEMENTS',
          elementIds: rangeIds,
          primaryId: elId,
          pageId: page.id,
        });
        onNavigateToCanvas();
        return;
      }
    }

    if (isCtrl && isSamePage) {
      const exists = activeSelectedIds.includes(elId);
      const nextIds = exists
        ? activeSelectedIds.filter((id) => id !== elId)
        : [...activeSelectedIds, elId];
      selectionAnchorRef.current = elId;
      dispatch({
        type: 'SELECT_ELEMENTS',
        elementIds: nextIds,
        primaryId: exists ? (nextIds[nextIds.length - 1] ?? null) : elId,
        pageId: page.id,
      });
      onNavigateToCanvas();
      return;
    }

    selectionAnchorRef.current = elId;
    dispatch({
      type: 'SELECT_ELEMENT',
      elementId: elId,
      pageId: page.id,
    });
    onNavigateToCanvas();
  };

  return (
    <div className="pt-root">
      <div className="pt-scroll">
        <div className="pt-section-head">
          <span>{project.name}</span>
          <button
            type="button"
            className="sd-mini-btn"
            onClick={handleAddPage}
            aria-label={uk.navigator.addPage}
            title={uk.navigator.addPage}
          >
            <Plus size={13} />
          </button>
        </div>

        {project.canvases.map((page) => {
          const isPageActive = !isGraphActive && !isHelpActive && page.id === activePageId;
          const isCollapsed = Boolean(collapsedPages[page.id]);
          const isRenaming = renamingPageId === page.id;

          return (
            <div key={page.id} className="pt-page-group">
              <div className={`pt-page-row ${isPageActive ? 'pt-page-row--active' : ''}`}>
                <button
                  type="button"
                  className="sd-mini-btn"
                  onClick={() => toggleExpand(page.id)}
                  aria-label={isCollapsed ? 'Розгорнути сторінку' : 'Згорнути сторінку'}
                >
                  {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                </button>

                {isRenaming ? (
                  <input
                    type="text"
                    className="pt-rename-input"
                    value={renameDraft}
                    autoFocus
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={() => commitRename(page.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        commitRename(page.id);
                      } else if (e.key === 'Escape') {
                        setRenamingPageId(null);
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="pt-page-btn"
                    onClick={() => {
                      dispatch({ type: 'SELECT_PAGE', pageId: page.id });
                      onNavigateToCanvas();
                    }}
                    onDoubleClick={() => {
                      setRenamingPageId(page.id);
                      setRenameDraft(page.name);
                    }}
                    title="Клік — перейти · Подвійний клік — перейменувати"
                  >
                    <LayoutGrid size={12} />
                    <span className="pt-page-label">{page.name}</span>
                  </button>
                )}

                <button
                  type="button"
                  className="sd-mini-btn"
                  onClick={() => {
                    setRenamingPageId(page.id);
                    setRenameDraft(page.name);
                  }}
                  aria-label={`${uk.navigator.renamePage}: ${page.name}`}
                  title={uk.navigator.renamePage}
                >
                  <Edit2 size={11} />
                </button>

                <button
                  type="button"
                  className="sd-mini-btn sd-mini-btn--danger"
                  disabled={project.canvases.length <= 1}
                  onClick={() => handleRequestDeletePage(page)}
                  aria-label={`${uk.navigator.deletePage}: ${page.name}`}
                  title={uk.navigator.deletePage}
                >
                  <Trash2 size={11} />
                </button>
              </div>

              {!isCollapsed && page.elements.length > 0 && (
                <div className="pt-elements">
                  {page.elements.map((el) => {
                    const isElSelected =
                      !isGraphActive && !isHelpActive && activeSelectedIds.includes(el.id);
                    const isElRenaming = renamingElementId === el.id;

                    return (
                      <div
                        key={el.id}
                        className={`pt-el-row ${isElSelected ? 'pt-el-row--active' : ''}`}
                      >
                        {isElRenaming ? (
                          <input
                            type="text"
                            className="pt-rename-input"
                            value={elementRenameDraft}
                            autoFocus
                            onChange={(e) => setElementRenameDraft(e.target.value)}
                            onBlur={() => commitElementRename(page.id, el)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                commitElementRename(page.id, el);
                              } else if (e.key === 'Escape') {
                                setRenamingElementId(null);
                              }
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            className="pt-el-btn"
                            onClick={(e) => handleElementClick(e, page, el.id)}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setRenamingElementId(el.id);
                              setElementRenameDraft(el.config.title || el.id);
                            }}
                            title="Клік — обрати (Ctrl/Shift для мульти-вибору) · Подвійний клік — перейменувати"
                          >
                            {getElementIcon(el.type)}
                            <span className="pt-page-label">{el.config.title || el.id}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          className="sd-mini-btn sd-mini-btn--danger pt-el-del-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            dispatch({
                              type: 'DELETE_ELEMENT',
                              pageId: page.id,
                              elementId: el.id,
                            });
                          }}
                          aria-label={`Видалити елемент ${el.config.title || el.id}`}
                          title="Видалити елемент"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="pt-footer">
        <button
          type="button"
          className={`icon-btn pt-help-btn ${isGraphActive ? 'icon-btn--active' : ''}`}
          onClick={onOpenGraph}
        >
          <Share2 size={14} />
          <span>{uk.header.graphView}</span>
        </button>
        <button
          type="button"
          className={`icon-btn pt-help-btn ${isHelpActive ? 'icon-btn--active' : ''}`}
          onClick={onOpenHelp}
        >
          <HelpCircle size={14} />
          <span>{uk.header.help}</span>
        </button>
      </div>

      {confirmDeletePage && (
        <Modal
          title={uk.navigator.confirmDeletePageTitle}
          onClose={() => setConfirmDeletePage(null)}
          narrow
          footer={
            <>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setConfirmDeletePage(null)}
              >
                {uk.header.cancel}
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  dispatch({ type: 'DELETE_PAGE', pageId: confirmDeletePage.id });
                  setConfirmDeletePage(null);
                }}
              >
                {uk.navigator.deletePage}
              </button>
            </>
          }
        >
          <p className="placeholder-text">
            {uk.navigator.confirmDeletePageBody(
              confirmDeletePage.name,
              confirmDeletePage.elements.length,
            )}
          </p>
        </Modal>
      )}
    </div>
  );
}
