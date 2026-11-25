import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { uk } from '../../i18n/uk';
import type { ParsedTxtResult } from './txtParser';
import './ImportPreviewModal.css';

interface ImportPreviewModalProps {
  fileName: string;
  parsed: ParsedTxtResult;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ImportPreviewModal({
  fileName,
  parsed,
  onCancel,
  onConfirm,
}: ImportPreviewModalProps) {
  const dataset = parsed.kind === 'project' ? parsed.project.primaryDataset : parsed.dataset;
  const hasErrors = parsed.errors.length > 0;
  const previewRows = dataset.rows.slice(0, 6);

  const totalElements =
    parsed.kind === 'project'
      ? parsed.project.canvases.reduce((acc, page) => acc + page.elements.length, 0)
      : 0;

  return (
    <Modal
      title={uk.importModal.title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onCancel}>
            {uk.header.cancel}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={hasErrors}
            onClick={onConfirm}
          >
            <CheckCircle2 size={14} />
            <span>
              {parsed.kind === 'project'
                ? uk.importModal.confirmProject
                : uk.importModal.confirmDataset}
            </span>
          </button>
        </>
      }
    >
      <div className="import-meta-grid">
        <div className="import-meta-card">
          <span className="import-meta-label">{uk.importModal.fileLabel}</span>
          <span className="import-meta-value" title={fileName}>
            {fileName}
          </span>
        </div>

        <div className="import-meta-card">
          <span className="import-meta-label">Формат</span>
          <span className="import-meta-value">
            {parsed.kind === 'project' ? uk.importModal.modeProject : uk.importModal.modeDataset}
          </span>
        </div>

        {parsed.kind === 'project' && (
          <div className="import-meta-card">
            <span className="import-meta-label">{uk.importModal.projectName}</span>
            <span className="import-meta-value">{parsed.project.name}</span>
          </div>
        )}

        <div className="import-meta-card">
          <span className="import-meta-label">{uk.importModal.datasetName}</span>
          <span className="import-meta-value">{dataset.name}</span>
        </div>

        <div className="import-meta-card">
          <span className="import-meta-label">{uk.importModal.columnsCount}</span>
          <span className="import-meta-value">{dataset.columns.length}</span>
        </div>

        <div className="import-meta-card">
          <span className="import-meta-label">{uk.importModal.rowsCount}</span>
          <span className="import-meta-value">{dataset.rows.length}</span>
        </div>

        {parsed.kind === 'project' && (
          <>
            <div className="import-meta-card">
              <span className="import-meta-label">{uk.importModal.pagesCount}</span>
              <span className="import-meta-value">{parsed.project.canvases.length}</span>
            </div>
            <div className="import-meta-card">
              <span className="import-meta-label">{uk.importModal.elementsCount}</span>
              <span className="import-meta-value">{totalElements}</span>
            </div>
          </>
        )}
      </div>

      {hasErrors && (
        <div className="import-issues import-issues--error" role="alert">
          <div className="import-issues-title">
            <AlertCircle size={15} />
            <span>{uk.importModal.errorsTitle(parsed.errors.length)}</span>
          </div>
          <ul className="import-issues-list">
            {parsed.errors.map((err, idx) => (
              <li key={`${err.line}-${idx}`}>
                <strong>{uk.importModal.linePrefix(err.line)}</strong> {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {parsed.warnings.length > 0 && (
        <div className="import-issues import-issues--warning">
          <div className="import-issues-title">
            <AlertTriangle size={15} />
            <span>{uk.importModal.warningsTitle(parsed.warnings.length)}</span>
          </div>
          <ul className="import-issues-list">
            {parsed.warnings.map((warn, idx) => (
              <li key={`${warn.line}-${idx}`}>
                <strong>{uk.importModal.linePrefix(warn.line)}</strong> {warn.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {dataset.columns.length > 0 && (
        <div>
          <p className="import-note" style={{ marginBottom: '6px' }}>
            {uk.importModal.previewTitle}
          </p>
          {previewRows.length === 0 ? (
            <p className="import-note">{uk.importModal.noRowsPreview}</p>
          ) : (
            <div className="import-preview-wrap">
              <table className="import-preview-table">
                <thead>
                  <tr>
                    {dataset.columns.map((col) => (
                      <th key={col.id}>
                        {col.name}
                        <span className="import-preview-type">:{col.type}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.id}>
                      {dataset.columns.map((col) => (
                        <td key={col.id}>
                          {row.values[col.id] === null || row.values[col.id] === undefined
                            ? ''
                            : String(row.values[col.id])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <p className="import-note">{uk.importModal.replaceWarning}</p>
    </Modal>
  );
}
