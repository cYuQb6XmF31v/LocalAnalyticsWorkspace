import { useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  Edit2,
  Hash,
  HelpCircle,
  LayoutGrid,
  LineChart,
  Plus,
  StickyNote,
  Table,
  Trash2,
} from 'lucide-react';
import { useProject } from '../../app/ProjectContext';
import { Modal } from '../../components/Modal';
import type { CanvasElementType, CanvasPage } from '../../domain/models';
import { uk } from '../../i18n/uk';
import './ProjectTree.css';

interface ProjectTreeProps {
  onOpenHelp: () => void;
  onNavigateToCanvas: () => void;
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
      return <BarChart3 size={12} />;
    case 'table-view':
      return <Table size={12} />;
  }
}

export function ProjectTree({
  onOpenHelp,
  onNavigateToCanvas,
  isHelpActive,
}: ProjectTreeProps) {
  const { state, dispatch } = useProject();
  const { project, activePageId, selectedElementId } = state;

  const [collapsedPages, setCollapsedPages] = useState<Record<string, boolean>>({});
  const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeletePage, setConfirmDeletePage] = useState<CanvasPage | null>(null);

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
          const isPageActive = !isHelpActive && page.id === activePageId;
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
                    const isElSelected = !isHelpActive && selectedElementId === el.id;
                    return (
                      <button
                        key={el.id}
                        type="button"
                        className={`pt-el-btn ${isElSelected ? 'pt-el-btn--active' : ''}`}
                        onClick={() => {
                          dispatch({
                            type: 'SELECT_ELEMENT',
                            elementId: el.id,
                            pageId: page.id,
                          });
                          onNavigateToCanvas();
                        }}
                      >
                        {getElementIcon(el.type)}
                        <span className="pt-page-label">{el.config.title || el.id}</span>
                      </button>
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
