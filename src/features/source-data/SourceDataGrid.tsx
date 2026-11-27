import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  FileUp,
  FunctionSquare,
  GitMerge,
  Plus,
  Table2,
  Trash2,
} from 'lucide-react';
import { useProject } from '../../app/ProjectContext';
import { Modal } from '../../components/Modal';
import { createStableId } from '../../domain/id';
import type { Column, ColumnType } from '../../domain/models';
import { uk } from '../../i18n/uk';
import { readTxtFromFileInput, stripTxtExtension } from '../project-file/fileAdapters';
import { parseTxtContent } from '../project-file/txtParser';
import { ActivityHeatmapPanel } from './ActivityHeatmapPanel';
import { getAllProjectDatasets } from './dataPipeline';
import { findColumnReferences, type ColumnReference } from './datasetOps';
import { evaluateDatasetFormulas, validateFormula } from './formulaEngine';
import { JoinsModal } from './JoinsModal';
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
  const allDatasets = getAllProjectDatasets(state.project);
  const [activeDatasetId, setActiveDatasetId] = useState<string>(state.project.primaryDataset.id);
  const dataset =
    allDatasets.find((d) => d.id === activeDatasetId) ?? state.project.primaryDataset;
  const isPrimaryDataset = dataset.id === state.project.primaryDataset.id;
  const evaluatedDataset = useMemo(() => evaluateDatasetFormulas(dataset), [dataset]);

  const [isAddingCol, setIsAddingCol] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState<ColumnType>('number');
  const [newColUseFormula, setNewColUseFormula] = useState(false);
  const [newColFormula, setNewColFormula] = useState('');
  const [editingFormulaColId, setEditingFormulaColId] = useState<string | null>(null);
  const [formulaDraft, setFormulaDraft] = useState('');
  const [isJoinsOpen, setIsJoinsOpen] = useState(false);
  const [secondaryImportError, setSecondaryImportError] = useState<string | null>(null);
  const secondaryFileRef = useRef<HTMLInputElement | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingColumnDelete | null>(null);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const colResizeRef = useRef<{ colId: string; startX: number; startWidth: number } | null>(null);

  const newFormulaCheck = newColUseFormula ? validateFormula(newColFormula) : null;
  const editFormulaValidation = editingFormulaColId
    ? validateFormula(formulaDraft)
    : null;

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
    if (newColUseFormula && newFormulaCheck && !newFormulaCheck.valid) {
      return;
    }
    const trimmed = newColName.trim();
    dispatch({
      type: 'ADD_COLUMN',
      datasetId: dataset.id,
      input: {
        name: trimmed || `Колонка ${dataset.columns.length + 1}`,
        type: newColType,
        ...(newColUseFormula && newColFormula.trim() ? { formula: newColFormula.trim() } : {}),
      },
    });
    setNewColName('');
    setNewColType('number');
    setNewColUseFormula(false);
    setNewColFormula('');
    setIsAddingCol(false);
  };

  const handleAddSecondaryTable = () => {
    const newDsId = createStableId('ds');
    dispatch({
      type: 'ADD_SECONDARY_DATASET',
      dataset: {
        id: newDsId,
        name: `Додаткова таблиця ${allDatasets.length + 1}`,
        columns: [
          { id: createStableId('col'), name: 'key', type: 'text' },
          { id: createStableId('col'), name: 'value', type: 'number' },
        ],
        rows: [],
      },
    });
    setActiveDatasetId(newDsId);
  };

  const handleSecondaryTxtPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setSecondaryImportError(null);
    if (!file) return;
    const read = await readTxtFromFileInput(file);
    if (read.status !== 'picked') {
      if (read.status === 'error') setSecondaryImportError(read.message);
      return;
    }
    const parsed = parseTxtContent(read.file.content, stripTxtExtension(read.file.fileName));
    if (parsed.errors.length > 0) {
      setSecondaryImportError(parsed.errors[0].message);
      return;
    }
    const importedDs =
      parsed.kind === 'dataset'
        ? parsed.dataset
        : { ...parsed.project.primaryDataset, id: createStableId('ds') };
    dispatch({ type: 'ADD_SECONDARY_DATASET', dataset: importedDs });
    setActiveDatasetId(importedDs.id);
  };

  const handleRequestDeleteColumn = (column: Column) => {
    const references = findColumnReferences(state.project, column.id);
    if (references.length > 0) {
      setPendingDelete({ column, references });
      return;
    }
    dispatch({ type: 'DELETE_COLUMN', datasetId: dataset.id, columnId: column.id });
  };

  const confirmDeleteColumn = () => {
    if (!pendingDelete) {
      return;
    }
    dispatch({ type: 'DELETE_COLUMN', datasetId: dataset.id, columnId: pendingDelete.column.id });
    setPendingDelete(null);
  };

  return (
    <div className="sd-root">
      <input
        ref={secondaryFileRef}
        type="file"
        accept=".txt,text/plain"
        hidden
        onChange={handleSecondaryTxtPicked}
      />

      <div className="sd-dataset-bar">
        <div className="sd-dataset-select-wrap">
          <select
            className="sd-select"
            aria-label="Активна таблиця даних"
            value={dataset.id}
            onChange={(e) => {
              setActiveDatasetId(e.target.value);
              setEditingFormulaColId(null);
            }}
          >
            {allDatasets.map((ds, idx) => (
              <option key={ds.id} value={ds.id}>
                {idx === 0 ? `★ ${ds.name}` : ds.name} ({ds.rows.length})
              </option>
            ))}
          </select>
          {!isPrimaryDataset && (
            <button
              type="button"
              className="sd-mini-btn sd-mini-btn--danger"
              title="Видалити додаткову таблицю"
              aria-label="Видалити додаткову таблицю"
              onClick={() => {
                dispatch({ type: 'DELETE_SECONDARY_DATASET', datasetId: dataset.id });
                setActiveDatasetId(state.project.primaryDataset.id);
              }}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>

        <div className="sd-actions">
          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            style={{ height: '24px', fontSize: '11px', padding: '0 7px' }}
            onClick={handleAddSecondaryTable}
            title="Створити нову пов’язану таблицю"
          >
            <Plus size={12} />
            <span>Таблиця</span>
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            style={{ height: '24px', fontSize: '11px', padding: '0 7px' }}
            onClick={() => secondaryFileRef.current?.click()}
            title="Імпортувати TXT як додаткову таблицю для Join"
          >
            <FileUp size={12} />
            <span>+TXT</span>
          </button>
          <button
            type="button"
            className={`icon-btn icon-btn--outlined ${(state.project.joins?.length ?? 0) > 0 ? 'icon-btn--active' : ''}`}
            style={{ height: '24px', fontSize: '11px', padding: '0 7px' }}
            onClick={() => setIsJoinsOpen(true)}
            title="Налаштувати з’єднання таблиць (Joins)"
          >
            <GitMerge size={12} />
            <span>
              Joins{(state.project.joins?.length ?? 0) > 0 ? ` (${state.project.joins!.length})` : ''}
            </span>
          </button>
        </div>
      </div>

      {secondaryImportError && (
        <div className="sd-formula-error" role="alert">
          {secondaryImportError}
        </div>
      )}

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
                dispatch({ type: 'RENAME_DATASET', datasetId: dataset.id, name: next });
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
            onClick={() => dispatch({ type: 'ADD_ROW', datasetId: dataset.id })}
          >
            <Plus size={13} />
            <span>{uk.sourceData.addRow}</span>
          </button>
        </div>
      </div>

      {isAddingCol && (
        <form className="sd-add-col-bar" style={{ flexDirection: 'column', alignItems: 'stretch' }} onSubmit={handleCreateColumn}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
            <button
              type="button"
              className={`icon-btn icon-btn--outlined ${newColUseFormula ? 'icon-btn--active' : ''}`}
              style={{ height: '26px', padding: '0 7px', fontSize: '11px' }}
              onClick={() => setNewColUseFormula((prev) => !prev)}
              title="Зробити обчислюваною колонкою з формулою (fx)"
            >
              <FunctionSquare size={12} />
              <span>fx</span>
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              style={{ height: '26px' }}
              disabled={Boolean(newColUseFormula && newFormulaCheck && !newFormulaCheck.valid)}
            >
              {uk.sourceData.createColumnConfirm}
            </button>
          </div>
          {newColUseFormula && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <input
                type="text"
                className="sd-input sd-cell-input--mono"
                placeholder='Формула: [amount] * 1.2 або IF([quantity]>=5, "Опт", "Роздріб")'
                value={newColFormula}
                onChange={(e) => setNewColFormula(e.target.value)}
              />
              {newFormulaCheck && !newFormulaCheck.valid && newColFormula.trim() !== '' && (
                <span className="sd-formula-error">{newFormulaCheck.error}</span>
              )}
            </div>
          )}
        </form>
      )}

      {editingFormulaColId && (
        <div className="sd-add-col-bar" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <span className="placeholder-hint">
              Формула для:{' '}
              <strong>
                {dataset.columns.find((c) => c.id === editingFormulaColId)?.name ?? ''}
              </strong>
            </span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                className="btn btn--secondary"
                style={{ height: '24px', fontSize: '11px', padding: '0 8px' }}
                onClick={() => {
                  dispatch({
                    type: 'SET_COLUMN_FORMULA',
                    datasetId: dataset.id,
                    columnId: editingFormulaColId,
                    formula: undefined,
                  });
                  setEditingFormulaColId(null);
                }}
              >
                Зробити звичайною
              </button>
              <button
                type="button"
                className="btn btn--primary"
                style={{ height: '24px', fontSize: '11px', padding: '0 8px' }}
                disabled={Boolean(editFormulaValidation && !editFormulaValidation.valid)}
                onClick={() => {
                  dispatch({
                    type: 'SET_COLUMN_FORMULA',
                    datasetId: dataset.id,
                    columnId: editingFormulaColId,
                    formula: formulaDraft,
                  });
                  setEditingFormulaColId(null);
                }}
              >
                Застосувати fx
              </button>
            </div>
          </div>
          <input
            type="text"
            className="sd-input sd-cell-input--mono"
            placeholder='Напр.: ROUND([amount] / [quantity], 2) або YEAR([date])'
            value={formulaDraft}
            onChange={(e) => setFormulaDraft(e.target.value)}
          />
          {editFormulaValidation && !editFormulaValidation.valid && formulaDraft.trim() !== '' && (
            <span className="sd-formula-error">{editFormulaValidation.error}</span>
          )}
        </div>
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
                            dispatch({ type: 'RENAME_COLUMN', datasetId: dataset.id, columnId: col.id, name: next });
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
                              datasetId: dataset.id,
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
                            className={`sd-mini-btn ${col.formula ? 'sd-fx-btn--active' : ''}`}
                            onClick={() => {
                              setEditingFormulaColId(col.id);
                              setFormulaDraft(col.formula ?? '');
                            }}
                            aria-label={`Формула для ${col.name}`}
                            title={col.formula ? `fx: ${col.formula}` : 'Додати формулу (fx)'}
                          >
                            <FunctionSquare size={11} />
                          </button>
                          <button
                            type="button"
                            className="sd-mini-btn"
                            disabled={colIndex === 0}
                            onClick={() =>
                              dispatch({
                                type: 'REORDER_COLUMN',
                                datasetId: dataset.id,
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
                                datasetId: dataset.id,
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
              {evaluatedDataset.rows.map((row, rowIndex) => (
                <tr key={row.id}>
                  <td className="sd-td-index">{rowIndex + 1}</td>
                  {evaluatedDataset.columns.map((col) => {
                    const rawValue = row.values[col.id];
                    const stringValue = cellValueToInputString(rawValue);
                    const validation = validateCellValue(rawValue, col.type);
                    const errorTooltip = validation.errorKey
                      ? uk.sourceData.validationErrors[validation.errorKey]
                      : undefined;

                    if (col.formula) {
                      return (
                        <td
                          key={col.id}
                          className="sd-td sd-cell-formula-td"
                          title={`fx: ${col.formula}`}
                        >
                          <span
                            className={`sd-cell-formula ${
                              col.type === 'number' || col.type === 'date'
                                ? 'sd-cell-input--mono'
                                : ''
                            } ${col.type === 'number' ? 'sd-cell-input--number' : ''}`}
                          >
                            {stringValue || '—'}
                          </span>
                        </td>
                      );
                    }

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
                                datasetId: dataset.id,
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
                                datasetId: dataset.id,
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
                      onClick={() =>
                        dispatch({ type: 'DELETE_ROW', datasetId: dataset.id, rowId: row.id })
                      }
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
                onClick={() => dispatch({ type: 'ADD_ROW', datasetId: dataset.id })}
              >
                <Plus size={13} />
                <span>{uk.sourceData.addRow}</span>
              </button>
            </div>
          )}
        </div>
      )}

      <ActivityHeatmapPanel dataset={evaluatedDataset} />

      {isJoinsOpen && <JoinsModal onClose={() => setIsJoinsOpen(false)} />}

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
