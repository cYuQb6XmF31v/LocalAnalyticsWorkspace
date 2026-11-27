import { useState } from 'react';
import { Filter, Plus, Trash2 } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { createStableId } from '../../domain/id';
import type { FilterOperator, FilterRule, ProjectFilter } from '../../domain/models';
import { useProject } from '../../app/ProjectContext';
import { getAllProjectDatasets } from '../source-data/dataPipeline';

interface FiltersModalProps {
  pageId: string;
  onClose: () => void;
}

const OPERATORS: readonly { value: FilterOperator; label: string }[] = [
  { value: 'equals', label: 'Дорівнює (=)' },
  { value: 'not-equals', label: 'Не дорівнює (≠)' },
  { value: 'contains', label: 'Містить текст' },
  { value: 'gt', label: 'Більше (>)' },
  { value: 'gte', label: 'Не менше (≥)' },
  { value: 'lt', label: 'Менше (<)' },
  { value: 'lte', label: 'Не більше (≤)' },
  { value: 'between', label: 'Діапазон (від .. до)' },
  { value: 'in', label: 'Список значень (через кому)' },
];

export function FiltersModal({ pageId, onClose }: FiltersModalProps) {
  const { state, dispatch } = useProject();
  const datasets = getAllProjectDatasets(state.project);
  const filters = state.project.filters ?? [];
  const activePage = state.project.canvases.find((p) => p.id === pageId);
  const pageFilterIds = activePage?.filterIds ?? [];

  const [name, setName] = useState('');
  const [datasetId, setDatasetId] = useState(state.project.primaryDataset.id);
  const targetDs = datasets.find((d) => d.id === datasetId) ?? state.project.primaryDataset;
  const [columnId, setColumnId] = useState(targetDs.columns[0]?.id ?? '');
  const [operator, setOperator] = useState<FilterOperator>('equals');
  const [value, setValue] = useState('');
  const [valueTo, setValueTo] = useState('');

  const effectiveColId =
    targetDs.columns.some((c) => c.id === columnId)
      ? columnId
      : (targetDs.columns[0]?.id ?? '');

  const handleAddFilter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveColId) {
      return;
    }
    const rule: FilterRule = {
      id: createStableId('rule'),
      columnId: effectiveColId,
      operator,
      value: value.trim(),
      ...(operator === 'between' ? { valueTo: valueTo.trim() } : {}),
      ...(operator === 'in'
        ? {
            values: value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          }
        : {}),
    };
    const colName = targetDs.columns.find((c) => c.id === effectiveColId)?.name ?? '';
    const newFilter: ProjectFilter = {
      id: createStableId('flt'),
      name: name.trim() || `${colName}: ${value.trim() || operator}`,
      datasetId: targetDs.id,
      rules: [rule],
    };
    dispatch({ type: 'ADD_FILTER', filter: newFilter });
    dispatch({
      type: 'SET_PAGE_FILTERS',
      pageId,
      filterIds: [...pageFilterIds, newFilter.id],
    });
    setName('');
    setValue('');
    setValueTo('');
  };

  const togglePageFilter = (filterId: string, enabled: boolean) => {
    const next = enabled
      ? Array.from(new Set([...pageFilterIds, filterId]))
      : pageFilterIds.filter((id) => id !== filterId);
    dispatch({ type: 'SET_PAGE_FILTERS', pageId, filterIds: next });
  };

  return (
    <Modal
      title="Багаторазові фільтри (Reusable Filters)"
      onClose={onClose}
      footer={
        <button type="button" className="btn btn--secondary" onClick={onClose}>
          Закрити
        </button>
      }
    >
      <p className="placeholder-text">
        Фільтри не змінюють вихідну таблицю Source Data. Активуйте фільтр для всієї поточної
        сторінки Canvas або підключайте його точково в налаштуваннях окремих графіків та KPI.
      </p>

      {filters.length > 0 && (
        <div className="config-field">
          <span className="config-label">
            Збережені фільтри проєкту (чекбокс = активний на сторінці «{activePage?.name}»)
          </span>
          <div className="config-links-list">
            {filters.map((flt) => {
              const isPageActive = pageFilterIds.includes(flt.id);
              const ds = datasets.find((d) => d.id === flt.datasetId) ?? state.project.primaryDataset;
              const ruleSummary = flt.rules
                .map((r) => {
                  const col = ds.columns.find((c) => c.id === r.columnId);
                  if (r.operator === 'between') {
                    return `${col?.name ?? '?'}: ${r.value || '…'}..${r.valueTo || '…'}`;
                  }
                  if (r.operator === 'in') {
                    return `${col?.name ?? '?'} ∈ [${(r.values ?? []).join(', ')}]`;
                  }
                  return `${col?.name ?? '?'} ${r.operator} "${r.value}"`;
                })
                .join(' AND ');

              return (
                <div key={flt.id} className="config-link-item" style={{ padding: '6px 10px' }}>
                  <label className="config-check-row" style={{ flex: 1, minWidth: 0 }}>
                    <input
                      type="checkbox"
                      checked={isPageActive}
                      onChange={(e) => togglePageFilter(flt.id, e.target.checked)}
                    />
                    <Filter size={12} />
                    <strong>{flt.name}</strong>
                    <span className="mono-chip" style={{ marginLeft: 4 }}>
                      {ruleSummary}
                    </span>
                  </label>
                  <button
                    type="button"
                    className="sd-mini-btn sd-mini-btn--danger"
                    onClick={() => dispatch({ type: 'DELETE_FILTER', filterId: flt.id })}
                    title="Видалити фільтр"
                    aria-label={`Видалити фільтр ${flt.name}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <form className="config-field" onSubmit={handleAddFilter} style={{ gap: '10px' }}>
        <span className="config-label">Новий збережений фільтр</span>

        <div className="import-meta-grid">
          <div className="config-field">
            <label className="config-label" htmlFor="flt-name">
              Назва фільтра
            </label>
            <input
              id="flt-name"
              type="text"
              className="config-input"
              placeholder="Напр.: 1 квартал / Київ"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {datasets.length > 1 && (
            <div className="config-field">
              <label className="config-label" htmlFor="flt-ds">
                Таблиця
              </label>
              <select
                id="flt-ds"
                className="config-select"
                value={targetDs.id}
                onChange={(e) => setDatasetId(e.target.value)}
              >
                {datasets.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="config-field">
            <label className="config-label" htmlFor="flt-col">
              Колонка
            </label>
            <select
              id="flt-col"
              className="config-select"
              value={effectiveColId}
              onChange={(e) => setColumnId(e.target.value)}
            >
              {targetDs.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.type})
                </option>
              ))}
            </select>
          </div>

          <div className="config-field">
            <label className="config-label" htmlFor="flt-op">
              Умова
            </label>
            <select
              id="flt-op"
              className="config-select"
              value={operator}
              onChange={(e) => setOperator(e.target.value as FilterOperator)}
            >
              {OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
          </div>

          <div className="config-field">
            <label className="config-label" htmlFor="flt-val">
              {operator === 'between'
                ? 'Від'
                : operator === 'in'
                  ? 'Значення через кому'
                  : 'Значення'}
            </label>
            <input
              id="flt-val"
              type="text"
              className="config-input"
              placeholder={operator === 'in' ? 'Київ, Львів' : 'Значення або YYYY-MM-DD'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>

          {operator === 'between' && (
            <div className="config-field">
              <label className="config-label" htmlFor="flt-val-to">
                До
              </label>
              <input
                id="flt-val-to"
                type="text"
                className="config-input"
                placeholder="YYYY-MM-DD або число"
                value={valueTo}
                onChange={(e) => setValueTo(e.target.value)}
              />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn btn--primary" disabled={!effectiveColId}>
            <Plus size={14} />
            <span>Створити та активувати на сторінці</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
