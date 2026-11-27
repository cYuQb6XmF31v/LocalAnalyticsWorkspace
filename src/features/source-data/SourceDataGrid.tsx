import { useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  FileUp,
  Plus,
  Table2,
  Trash2,
} from 'lucide-react';
import { useProject } from '../../app/ProjectContext';
import { Modal } from '../../components/Modal';
import type { Column, ColumnType } from '../../domain/models';
import { uk } from '../../i18n/uk';
import { findColumnReferences, type ColumnReference } from './datasetOps';
import { ActivityHeatmapPanel } from './ActivityHeatmapPanel';
import {
  cellValueToInputString,
  SUPPORTED_COLUMN_TYPES,
  validateCellValue,
} from './typeValidation';
import './SourceDataGrid.css';

interface SourceDataGridProps {
  onRequestImportTxt: () => void;
}

interface PendingColumnDelete {
  column: Column;
  references: ColumnReference[];
}

const DEFAULT_COL_WIDTH = 152;

export function SourceDataGrid({ onRequestImportTxt }: SourceDataGridProps) {
  const { state, dispatch } = useProject();
  const dataset = state.project.primaryDataset;

  const [isAddingCol, setIsAddingCol] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState<ColumnType>('text');
  const [pendingDelete, setPendingDelete] = useState<PendingColumnDelete | null>(null);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const colResizeRef = useRef<{ colId: string; startX: number; startWidth: number } | null>(null);

  const handleColResizeStart = (colId: string, event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startWidth = colWidths[colId] ?? DEFAULT_COL_WIDTH;
    colResizeRef.current = { colId, startX: event.clientX, startWidth };

    const handleMove = (moveEvent: PointerEvent) => {
      if (!colResizeRef.current) {
        return;
      }
      const dx = moveEvent.clientX - colResizeRef.current.startX;
      const nextWidth = Math.max(
        44,
        Math.min(480, Math.round(colResizeRef.current.startWidth + dx)),
      );
      setColWidths((prev) => ({ ...prev, [colResizeRef.current!.colId]: nextWidth }));
    };

    const handleUp = () => {
      colResizeRef.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  };

  const handleCreateColumn = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = newColName.trim();
    dispatch({
      type: 'ADD_COLUMN',
      input: {
        name: trimmed || `Колонка ${dataset.columns.length + 1}`,
        type: newColType,
      },
    });
    setNewColName('');
    setNewColType('text');
    setIsAddingCol(false);
  };

  const handleRequestDeleteColumn = (column: Column) => {
    const references = findColumnReferences(state.project, column.id);
    if (references.length > 0) {
      setPendingDelete({ column, references });
      return;
    }
    dispatch({ type: 'DELETE_COLUMN', columnId: column.id });
  };

  const confirmDeleteColumn = () => {
    if (!pendingDelete) {
      return;
    }
    dispatch({ type: 'DELETE_COLUMN', columnId: pendingDelete.column.id });
    setPendingDelete(null);
  };

  return (
    <div className="sd-root">
      <div className="sd-toolbar">
        <div className="sd-meta">
          <input
            type="text"
            className="sd-dataset-name"
            aria-label={uk.sourceData.datasetNameLabel}
            defaultValue={dataset.name}
            key={dataset.id + dataset.name}
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next && next !== dataset.name) {
                dispatch({ type: 'RENAME_DATASET', name: next });
              } else {
                e.target.value = dataset.name;
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              } else if (e.key === 'Escape') {
                e.currentTarget.value = dataset.name;
                e.currentTarget.blur();
              }
            }}
          />
          <span className="mono-chip">
            {uk.sourceData.formatStats(dataset.columns.length, dataset.rows.length)}
          </span>
        </div>

        <div className="sd-actions">
          <button
            type="button"
            className={`icon-btn icon-btn--outlined ${isAddingCol ? 'icon-btn--active' : ''}`}
            onClick={() => setIsAddingCol((prev) => !prev)}
          >
            <Plus size={13} />
            <span>{uk.sourceData.addColumn}</span>
          </button>

          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            disabled={dataset.columns.length === 0}
            onClick={() => dispatch({ type: 'ADD_ROW' })}
          >
            <Plus size={13} />
            <span>{uk.sourceData.addRow}</span>
          </button>
        </div>
      </div>

      {isAddingCol && (
        <form className="sd-add-col-bar" onSubmit={handleCreateColumn}>
          <input
            type="text"
            className="sd-input"
            placeholder={uk.sourceData.newColumnNamePlaceholder}
            value={newColName}
            onChange={(e) => setNewColName(e.target.value)}
            autoFocus
          />
          <select
            className="sd-select"
            aria-label={uk.sourceData.columnTypeLabel}
            value={newColType}
            onChange={(e) => setNewColType(e.target.value as ColumnType)}
          >
            {SUPPORTED_COLUMN_TYPES.map((t) => (
              <option key={t} value={t}>
                {uk.sourceData.types[t]}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn--primary" style={{ height: '26px' }}>
            {uk.sourceData.createColumnConfirm}
          </button>
        </form>
      )}

      {dataset.columns.length === 0 ? (
        <div className="sd-empty">
          <span className="placeholder-icon" aria-hidden="true">
            <Table2 size={16} />
          </span>
          <h2 className="placeholder-title">{uk.sourceData.emptyTitle}</h2>
          <p className="placeholder-text">{uk.sourceData.emptyText}</p>
          <div className="sd-empty-actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setIsAddingCol(true)}
            >
              <Plus size={14} />
              <span>{uk.sourceData.addColumn}</span>
            </button>
            <button type="button" className="btn btn--secondary" onClick={onRequestImportTxt}>
              <FileUp size={14} />
              <span>{uk.header.importTxt}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="sd-grid-scroll">
          <table className="sd-table sd-table--houdini">
            <colgroup>
              <col style={{ width: '42px' }} />
              {dataset.columns.map((col) => (
                <col
                  key={col.id}
                  style={{ width: `${colWidths[col.id] ?? DEFAULT_COL_WIDTH}px` }}
                />
              ))}
              <col style={{ width: '32px' }} />
            </colgroup>
            <thead>
              <tr>
                <th className="sd-th-index" scope="col" title="Індекс рядка">
                  #
                </th>
                {dataset.columns.map((col, colIndex) => (
                  <th key={col.id} className="sd-th" scope="col">
                    <div className="sd-col-head">
                      <input
                        type="text"
                        className="sd-col-name"
                        aria-label={`${uk.sourceData.renameColumnPrompt}: ${col.name}`}
                        defaultValue={col.name}
                        key={`${col.id}-${col.name}`}
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          if (next && next !== col.name) {
                            dispatch({ type: 'RENAME_COLUMN', columnId: col.id, name: next });
                          } else {
                            e.target.value = col.name;
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.currentTarget.blur();
                          } else if (e.key === 'Escape') {
                            e.currentTarget.value = col.name;
                            e.currentTarget.blur();
                          }
                        }}
                      />

                      <div className="sd-col-controls">
                        <select
                          className="sd-type-select"
                          aria-label={`${uk.sourceData.columnTypeLabel} (${col.name})`}
                          value={col.type}
                          onChange={(e) =>
                            dispatch({
                              type: 'CHANGE_COLUMN_TYPE',
                              columnId: col.id,
                              columnType: e.target.value as ColumnType,
                            })
                          }
                        >
                          {SUPPORTED_COLUMN_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {uk.sourceData.types[t]}
                            </option>
                          ))}
                        </select>

                        <div className="sd-col-btns">
                          <button
                            type="button"
                            className="sd-mini-btn"
                            disabled={colIndex === 0}
                            onClick={() =>
                              dispatch({
                                type: 'REORDER_COLUMN',
                                columnId: col.id,
                                targetIndex: colIndex - 1,
                              })
                            }
                            aria-label={uk.sourceData.moveLeft}
                            title={uk.sourceData.moveLeft}
                          >
                            <ArrowLeft size={11} />
                          </button>
                          <button
                            type="button"
                            className="sd-mini-btn"
                            disabled={colIndex === dataset.columns.length - 1}
                            onClick={() =>
                              dispatch({
                                type: 'REORDER_COLUMN',
                                columnId: col.id,
                                targetIndex: colIndex + 1,
                              })
                            }
                            aria-label={uk.sourceData.moveRight}
                            title={uk.sourceData.moveRight}
                          >
                            <ArrowRight size={11} />
                          </button>
                          <button
                            type="button"
                            className="sd-mini-btn sd-mini-btn--danger"
                            onClick={() => handleRequestDeleteColumn(col)}
                            aria-label={`${uk.sourceData.deleteColumn}: ${col.name}`}
                            title={uk.sourceData.deleteColumn}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div
                      className="sd-col-resizer"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Змінити ширину колонки ${col.name}`}
                      title="Потягніть для зміни ширини · Подвійний клік — скинути"
                      onPointerDown={(e) => handleColResizeStart(col.id, e)}
                      onDoubleClick={() =>
                        setColWidths((prev) => {
                          const next = { ...prev };
                          delete next[col.id];
                          return next;
                        })
                      }
                    />
                  </th>
                ))}
                <th className="sd-th-actions" scope="col" aria-label={uk.sourceData.deleteRow} />
              </tr>
            </thead>

            <tbody>
              {dataset.rows.map((row, rowIndex) => (
                <tr key={row.id}>
                  <td className="sd-td-index">{rowIndex + 1}</td>
                  {dataset.columns.map((col) => {
                    const rawValue = row.values[col.id];
                    const stringValue = cellValueToInputString(rawValue);
                    const validation = validateCellValue(rawValue, col.type);
                    const errorTooltip = validation.errorKey
                      ? uk.sourceData.validationErrors[validation.errorKey]
                      : undefined;

                    return (
                      <td key={col.id} className="sd-td">
                        {col.type === 'boolean' && validation.valid ? (
                          <select
                            className="sd-cell-select"
                            aria-label={`${col.name}, рядок ${rowIndex + 1}`}
                            value={
                              validation.parsed === null ? '' : String(validation.parsed)
                            }
                            onChange={(e) =>
                              dispatch({
                                type: 'UPDATE_CELL',
                                rowId: row.id,
                                columnId: col.id,
                                value: e.target.value === '' ? null : e.target.value,
                              })
                            }
                          >
                            <option value="">{uk.sourceData.emptyBooleanOption}</option>
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        ) : (
                          <input
                            type="text"
                            className={`sd-cell-input ${
                              col.type === 'number' || col.type === 'date'
                                ? 'sd-cell-input--mono'
                                : ''
                            } ${col.type === 'number' ? 'sd-cell-input--number' : ''} ${
                              !validation.valid ? 'sd-cell-input--invalid' : ''
                            }`}
                            aria-label={`${col.name}, рядок ${rowIndex + 1}`}
                            aria-invalid={!validation.valid}
                            title={errorTooltip}
                            placeholder={col.type === 'date' ? 'YYYY-MM-DD' : ''}
                            value={stringValue}
                            onChange={(e) =>
                              dispatch({
                                type: 'UPDATE_CELL',
                                rowId: row.id,
                                columnId: col.id,
                                value: e.target.value === '' ? null : e.target.value,
                              })
                            }
                          />
                        )}
                      </td>
                    );
                  })}
                  <td className="sd-td-actions">
                    <button
                      type="button"
                      className="sd-mini-btn sd-mini-btn--danger"
                      onClick={() => dispatch({ type: 'DELETE_ROW', rowId: row.id })}
                      aria-label={`${uk.sourceData.deleteRow} ${rowIndex + 1}`}
                      title={uk.sourceData.deleteRow}
                    >
                      <Trash2 size={11} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {dataset.rows.length === 0 && (
            <div className="sd-empty-rows">
              <span>{uk.sourceData.emptyRowsHint}</span>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => dispatch({ type: 'ADD_ROW' })}
              >
                <Plus size={13} />
                <span>{uk.sourceData.addRow}</span>
              </button>
            </div>
          )}
        </div>
      )}

      <ActivityHeatmapPanel />

      {pendingDelete && (
        <Modal
          title={uk.sourceData.confirmDeleteColumnTitle}
          onClose={() => setPendingDelete(null)}
          narrow
          footer={
            <>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setPendingDelete(null)}
              >
                {uk.header.cancel}
              </button>
              <button type="button" className="btn btn--danger" onClick={confirmDeleteColumn}>
                {uk.sourceData.confirmDeleteColumnAction}
              </button>
            </>
          }
        >
          <p className="placeholder-text">
            {uk.sourceData.confirmDeleteColumnBody(
              pendingDelete.column.name,
              pendingDelete.references.length,
            )}
          </p>
          <ul className="sd-refs-list">
            {pendingDelete.references.map((ref) => (
              <li key={`${ref.elementId}-${ref.fieldRole}`}>
                {ref.pageName} → {ref.elementTitle || ref.elementId} ({ref.fieldRole})
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}
