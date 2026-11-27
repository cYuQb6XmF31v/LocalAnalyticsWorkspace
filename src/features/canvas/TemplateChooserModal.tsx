import { useState } from 'react';
import {
  BarChart2,
  BookmarkPlus,
  Columns3,
  FolderKanban,
  Layers,
  LayoutGrid,
  LineChart,
  PieChart,
  Square,
  Trash2,
} from 'lucide-react';
import { useProject } from '../../app/ProjectContext';
import { Modal } from '../../components/Modal';
import { createStableId } from '../../domain/id';
import type { CanvasElement, CanvasPage, SavedCanvasTemplate } from '../../domain/models';
import { uk } from '../../i18n/uk';
import { CANVAS_TEMPLATES, type CanvasTemplateId } from './templates';
import './TemplateChooserModal.css';

interface TemplateChooserModalProps {
  onSelect: (templateId: CanvasTemplateId) => void;
  onClose: () => void;
}

const TEMPLATE_ICONS: Record<CanvasTemplateId, typeof Square> = {
  blank: Square,
  overview: LayoutGrid,
  trends: LineChart,
  categories: PieChart,
  operations: Columns3,
  distribution: BarChart2,
  executive: Layers,
  analytics_suite: FolderKanban,
};

function instantiateSavedTemplatePages(tpl: SavedCanvasTemplate): CanvasPage[] {
  return tpl.pages.map((page) => ({
    ...page,
    id: createStableId('page'),
    elements: page.elements.map(
      (el) =>
        ({
          ...el,
          id: createStableId('el'),
          config: { ...el.config },
        }) as CanvasElement,
    ),
  }));
}

export function TemplateChooserModal({ onSelect, onClose }: TemplateChooserModalProps) {
  const { state, dispatch } = useProject();
  const [tplName, setTplName] = useState('');
  const savedTemplates = state.project.savedTemplates ?? [];

  const handleSaveCurrent = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = tplName.trim() || `Мій шаблон (${state.project.canvases.length} стор.)`;
    const newTpl: SavedCanvasTemplate = {
      id: createStableId('tpl'),
      name: trimmed,
      description: `Збережено сторінок: ${state.project.canvases.length}`,
      createdAt: new Date().toISOString(),
      pages: state.project.canvases.map((p) => ({
        ...p,
        elements: p.elements.map(
          (el) => ({ ...el, config: { ...el.config } }) as CanvasElement,
        ),
      })),
    };
    dispatch({ type: 'SAVE_CUSTOM_TEMPLATE', template: newTpl });
    setTplName('');
  };

  const handleApplySaved = (tpl: SavedCanvasTemplate) => {
    const pages = instantiateSavedTemplatePages(tpl);
    const shouldReplaceEmptyInitial =
      state.needsLayoutChooser &&
      state.project.canvases.length === 1 &&
      state.project.canvases[0].elements.length === 0;
    dispatch({
      type: 'APPLY_CANVAS_PAGES',
      pages,
      activePageId: pages[0]?.id,
      append: !shouldReplaceEmptyInitial,
    });
    onClose();
  };

  return (
    <Modal
      title={uk.templates.modalTitle}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn--secondary" onClick={onClose}>
          {uk.header.cancel}
        </button>
      }
    >
      <p className="placeholder-text">{uk.templates.modalSubtitle}</p>

      <div className="template-grid">
        {CANVAS_TEMPLATES.map((tpl) => {
          const Icon = TEMPLATE_ICONS[tpl.id];
          return (
            <button
              key={tpl.id}
              type="button"
              className="template-card"
              onClick={() => onSelect(tpl.id)}
            >
              <span className="placeholder-icon" aria-hidden="true">
                <Icon size={16} />
              </span>
              <span className="template-card-title">{tpl.title}</span>
              <span className="template-card-desc">{tpl.description}</span>
            </button>
          );
        })}
      </div>

      <div className="config-divider" />

      <div className="config-field" style={{ gap: '8px' }}>
        <span className="config-label">Зберегти поточні сторінки як шаблон у TXT</span>
        <form onSubmit={handleSaveCurrent} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            className="config-input"
            placeholder="Назва власного шаблону…"
            value={tplName}
            onChange={(e) => setTplName(e.target.value)}
          />
          <button type="submit" className="btn btn--secondary">
            <BookmarkPlus size={14} />
            <span>Зберегти шаблон</span>
          </button>
        </form>

        {savedTemplates.length > 0 && (
          <div className="template-grid" style={{ marginTop: '4px' }}>
            {savedTemplates.map((tpl) => (
              <div
                key={tpl.id}
                className="template-card"
                style={{ position: 'relative', justifyContent: 'space-between' }}
              >
                <button
                  type="button"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '6px',
                    textAlign: 'left',
                    width: '100%',
                  }}
                  onClick={() => handleApplySaved(tpl)}
                >
                  <span className="placeholder-icon" aria-hidden="true">
                    <Layers size={15} />
                  </span>
                  <span className="template-card-title">{tpl.name}</span>
                  <span className="template-card-desc">
                    {tpl.description || `Сторінок: ${tpl.pages.length}`}
                  </span>
                </button>
                <button
                  type="button"
                  className="sd-mini-btn sd-mini-btn--danger"
                  style={{ position: 'absolute', top: '10px', right: '10px' }}
                  onClick={() =>
                    dispatch({ type: 'DELETE_CUSTOM_TEMPLATE', templateId: tpl.id })
                  }
                  title="Видалити збережений шаблон"
                  aria-label={`Видалити шаблон ${tpl.name}`}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
