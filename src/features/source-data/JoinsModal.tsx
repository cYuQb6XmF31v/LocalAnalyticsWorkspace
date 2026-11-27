import { useMemo, useState } from 'react';
import { GitMerge, Plus, Trash2 } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { createStableId } from '../../domain/id';
import type { DatasetJoin, JoinType } from '../../domain/models';
import { useProject } from '../../app/ProjectContext';
import { getAllProjectDatasets, materializeJoinedDataset } from './dataPipeline';

interface JoinsModalProps {
  onClose: () => void;
}

export function JoinsModal({ onClose }: JoinsModalProps) {
  const { state, dispatch } = useProject();
  const datasets = getAllProjectDatasets(state.project);
  const joins = state.project.joins ?? [];

  const [name, setName] = useState('');
  const [leftDatasetId, setLeftDatasetId] = useState(datasets[0]?.id ?? '');
  const [rightDatasetId, setRightDatasetId] = useState(datasets[1]?.id ?? datasets[0]?.id ?? '');
  const [leftKeyColumnId, setLeftKeyColumnId] = useState(
    datasets[0]?.columns[0]?.id ?? '',
  );
  const [rightKeyColumnId, setRightKeyColumnId] = useState(
    (datasets[1] ?? datasets[0])?.columns[0]?.id ?? '',
  );
  const [joinType, setJoinType] = useState<JoinType>('left');

  const leftDs = datasets.find((d) => d.id === leftDatasetId) ?? datasets[0];
  const rightDs = datasets.find((d) => d.id === rightDatasetId) ?? datasets[0];

  const effectiveLeftKey =
    leftDs?.columns.some((c) => c.id === leftKeyColumnId)
      ? leftKeyColumnId
      : (leftDs?.columns[0]?.id ?? '');
  const effectiveRightKey =
    rightDs?.columns.some((c) => c.id === rightKeyColumnId)
      ? rightKeyColumnId
      : (rightDs?.columns[0]?.id ?? '');

  const previewStats = useMemo(() => {
    if (!leftDs || !rightDs || !effectiveLeftKey || !effectiveRightKey) {
      return null;
    }
    const mat = materializeJoinedDataset(leftDs, rightDs, {
      id: 'preview',
      name: 'Preview',
      leftDatasetId: leftDs.id,
      rightDatasetId: rightDs.id,
      leftKeyColumnId: effectiveLeftKey,
      rightKeyColumnId: effectiveRightKey,
      joinType,
    });
    return {
      columns: mat.columns.length,
      rows: mat.rows.length,
    };
  }, [leftDs, rightDs, effectiveLeftKey, effectiveRightKey, joinType]);

  const handleCreateJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leftDs || !rightDs || !effectiveLeftKey || !effectiveRightKey) {
      return;
    }
    const newJoin: DatasetJoin = {
      id: createStableId('join'),
      name: name.trim() || `${leftDs.name} ⋈ ${rightDs.name}`,
      leftDatasetId: leftDs.id,
      rightDatasetId: rightDs.id,
      leftKeyColumnId: effectiveLeftKey,
      rightKeyColumnId: effectiveRightKey,
      joinType,
    };
    dispatch({ type: 'ADD_JOIN', join: newJoin });
    setName('');
  };

  return (
    <Modal
      title="З’єднання таблиць (Joins)"
      onClose={onClose}
      footer={
        <button type="button" className="btn btn--secondary" onClick={onClose}>
          Готово
        </button>
      }
    >
      <p className="placeholder-text">
        Об’єднуйте поля з кількох таблиць за ключовими колонками (Left або Inner Join). Після
        створення об’єднане джерело можна обрати у будь-якому графіку, KPI чи таблиці на Canvas.
      </p>

      {datasets.length < 2 && (
        <div className="heatmap-setup">
          Зараз у проєкті лише одна таблиця. Додайте другу таблицю через кнопку «+ Таблиця» у
          правій панелі Source Data (або імпортуйте ще одну таблицю), щоб поєднати різні набори даних.
        </div>
      )}

      {joins.length > 0 && (
        <div className="config-field">
          <span className="config-label">Активні з’єднання ({joins.length})</span>
          <div className="config-links-list">
            {joins.map((j) => {
              const l = datasets.find((d) => d.id === j.leftDatasetId);
              const r = datasets.find((d) => d.id === j.rightDatasetId);
              const lCol = l?.columns.find((c) => c.id === j.leftKeyColumnId);
              const rCol = r?.columns.find((c) => c.id === j.rightKeyColumnId);
              return (
                <div key={j.id} className="config-link-item" style={{ padding: '6px 10px' }}>
                  <span>
                    <GitMerge size={12} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                    <strong>{j.name}</strong>{' '}
                    <span className="mono-chip" style={{ marginLeft: 6 }}>
                      {j.joinType.toUpperCase()}
                    </span>{' '}
                    <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>
                      {l?.name ?? '?'}.{lCol?.name ?? '?'} = {r?.name ?? '?'}.{rCol?.name ?? '?'}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="sd-mini-btn sd-mini-btn--danger"
                    onClick={() => dispatch({ type: 'DELETE_JOIN', joinId: j.id })}
                    title="Видалити з’єднання"
                    aria-label={`Видалити з’єднання ${j.name}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <form className="config-field" onSubmit={handleCreateJoin} style={{ gap: '10px' }}>
        <span className="config-label">Створити нове з’єднання</span>

        <div className="import-meta-grid">
          <div className="config-field">
            <label className="config-label" htmlFor="join-name">
              Назва з’єднання
            </label>
            <input
              id="join-name"
              type="text"
              className="config-input"
              placeholder="Напр.: Продажі + Довідник"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="config-field">
            <label className="config-label" htmlFor="join-type">
              Тип з’єднання
            </label>
            <select
              id="join-type"
              className="config-select"
              value={joinType}
              onChange={(e) => setJoinType(e.target.value as JoinType)}
            >
              <option value="left">LEFT JOIN (усі рядки лівої таблиці)</option>
              <option value="inner">INNER JOIN (лише збіги)</option>
            </select>
          </div>
        </div>

        <div className="import-meta-grid">
          <div className="config-field">
            <label className="config-label" htmlFor="join-left-ds">
              Ліва таблиця (основна)
            </label>
            <select
              id="join-left-ds"
              className="config-select"
              value={leftDs?.id ?? ''}
              onChange={(e) => setLeftDatasetId(e.target.value)}
            >
              {datasets.map((ds) => (
                <option key={ds.id} value={ds.id}>
                  {ds.name} ({ds.rows.length} рядків)
                </option>
              ))}
            </select>
          </div>

          <div className="config-field">
            <label className="config-label" htmlFor="join-left-key">
              Ключова колонка зліва
            </label>
            <select
              id="join-left-key"
              className="config-select"
              value={effectiveLeftKey}
              onChange={(e) => setLeftKeyColumnId(e.target.value)}
            >
              {(leftDs?.columns ?? []).map((col) => (
                <option key={col.id} value={col.id}>
                  {col.name} ({col.type})
                </option>
              ))}
            </select>
          </div>

          <div className="config-field">
            <label className="config-label" htmlFor="join-right-ds">
              Права таблиця (приєднувана)
            </label>
            <select
              id="join-right-ds"
              className="config-select"
              value={rightDs?.id ?? ''}
              onChange={(e) => setRightDatasetId(e.target.value)}
            >
              {datasets.map((ds) => (
                <option key={ds.id} value={ds.id}>
                  {ds.name} ({ds.rows.length} рядків)
                </option>
              ))}
            </select>
          </div>

          <div className="config-field">
            <label className="config-label" htmlFor="join-right-key">
              Ключова колонка справа
            </label>
            <select
              id="join-right-key"
              className="config-select"
              value={effectiveRightKey}
              onChange={(e) => setRightKeyColumnId(e.target.value)}
            >
              {(rightDs?.columns ?? []).map((col) => (
                <option key={col.id} value={col.id}>
                  {col.name} ({col.type})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span className="placeholder-hint">
            {previewStats
              ? `Результат з’єднання: ${previewStats.columns} колонок · ${previewStats.rows} рядків`
              : 'Оберіть таблиці та ключові колонки'}
          </span>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={!effectiveLeftKey || !effectiveRightKey}
          >
            <Plus size={14} />
            <span>Додати Join</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
