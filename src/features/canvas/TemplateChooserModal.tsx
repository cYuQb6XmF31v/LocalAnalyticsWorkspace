import { LayoutGrid, LineChart, Square } from 'lucide-react';
import { Modal } from '../../components/Modal';
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
};

export function TemplateChooserModal({ onSelect, onClose }: TemplateChooserModalProps) {
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
    </Modal>
  );
}
