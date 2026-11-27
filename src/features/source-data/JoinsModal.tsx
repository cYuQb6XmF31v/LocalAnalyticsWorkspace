import { useMemo, useState } from 'react';
import { GitMerge, Link2, Plus, Trash2 } from 'lucide-react';
import { useProject } from '../../app/ProjectContext';
import { CustomSelect } from '../../components/CustomSelect';
import { Modal } from '../../components/Modal';
import { createStableId } from '../../domain/id';
import type { DatasetJoin, JoinType } from '../../domain/models';
import { getAllProjectDatasets, materializeJoinedDataset } from './dataPipeline';
import './JoinsModal.css';

interface JoinsModalProps {
  onClose: () => void;
}

const JOIN_BADGE: Record<JoinType, string> = {
  left: 'LEFT ⋈',
  inner: 'INNER ⋈',
  right: 'RIGHT ⋈',
  full: 'FULL ⋈',
  'left-anti': 'L-ANTI ▷',
  'right-anti': 'R-ANTI ◁',
};

export function JoinsModal({ onClose }: JoinsModalProps) {
  const { state, dispatch } = useProject();
  const datasets = getAllProjectDatasets(state.project);
  const joins = state.project.joins ?? [];

  const [name, setName] = useState('');
  const [leftDatasetId, setLeftDatasetId] = useState(datasets[0]?.id ?? '');
  const [rightDatasetId, setRightDatasetId] = useState(datasets[1]?.id ?? datasets[0]?.id ?? '');
  const [leftKeyColumnId, setLeftKeyColumnId] = useState(datasets[0]?.columns[0]?.id ?? '');
  const [rightKeyColumnId, setRightKeyColumnId] = useState(
    (datasets[1] ?? datasets[0])?.columns[0]?.id ?? '',
  );
  const [joinType, setJoinType] = useState<JoinType>('left');

  const leftDs = datasets.find((d) => d.id === leftDatasetId) ?? datasets[0];
  const rightDs = datasets.find((d) => d.id === rightDatasetId) ?? datasets[0];

  const effectiveLeftKey = leftDs?.columns.some((c) => c.id === leftKeyColumnId)
    ? leftKeyColumnId
    : (leftDs?.columns[0]?.id ?? '');
  const effectiveRightKey = rightDs?.columns.some((c) => c.id === rightKeyColumnId)
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
      <div className="jm-root">
        <p className="jm-intro">
          Об’єднуйте поля з кількох таблиць за ключовими колонками (Left, Inner, Right, Full або Anti
          Join). Після створення об’єднане джерело можна обрати у налаштуваннях будь-якого елемента на Canvas.
        </p>

        {datasets.length < 2 && (
          <div className="jm-notice">
            Зараз у проєкті лише одна таблиця. Додайте другу таблицю через кнопку{' '}
            <strong>+ Таблиця</strong> або <strong>+TXT</strong> у правій панелі Source Data, щоб
            поєднувати різні набори даних.
          </div>
        )}

        {joins.length > 0 && (
          <div className="jm-section">
            <span className="jm-section-title">Активні з’єднання ({joins.length})</span>
            <div className="jm-list">
              {joins.map((j) => {
                const l = datasets.find((d) => d.id === j.leftDatasetId);
                const r = datasets.find((d) => d.id === j.rightDatasetId);
                const lCol = l?.columns.find((c) => c.id === j.leftKeyColumnId);
                const rCol = r?.columns.find((c) => c.id === j.rightKeyColumnId);
                return (
                  <div key={j.id} className="jm-item">
                    <div className="jm-item-main">
                      <GitMerge size={14} className="jm-item-icon" />
                      <span className="jm-item-name">{j.name}</span>
                      <span className="jm-type-badge">{j.joinType.toUpperCase()}</span>
                      <span className="jm-item-expr">
                        {l?.name ?? '?'}.{lCol?.name ?? '?'} = {r?.name ?? '?'}.{rCol?.name ?? '?'}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="sd-mini-btn sd-mini-btn--danger"
                      onClick={() => dispatch({ type: 'DELETE_JOIN', joinId: j.id })}
                      title="Видалити з’єднання"
                      aria-label={`Видалити з’єднання ${j.name}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <form className="jm-form" onSubmit={handleCreateJoin}>
          <span className="jm-section-title">Нове з’єднання</span>

          <div className="jm-top-row">
            <div className="jm-field">
              <label className="jm-label" htmlFor="join-name">
                Назва з’єднання
              </label>
              <input
                id="join-name"
                type="text"
                className="jm-input"
                placeholder="Напр.: Продажі + Довідник"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="jm-field">
              <label className="jm-label" htmlFor="join-type">
                Тип з’єднання
              </label>
              <CustomSelect
                id="join-type"
                value={joinType}
                options={[
                  { value: 'left', label: 'LEFT JOIN — усі рядки лівої таблиці' },
                  { value: 'inner', label: 'INNER JOIN — лише збіги в обох таблицях' },
                  { value: 'right', label: 'RIGHT JOIN — усі рядки правої таблиці' },
                  { value: 'full', label: 'FULL OUTER JOIN — усі рядки обох таблиць' },
                  { value: 'left-anti', label: 'LEFT ANTI JOIN — рядки лівої без пари праворуч' },
                  { value: 'right-anti', label: 'RIGHT ANTI JOIN — рядки правої без пари ліворуч' },
                ]}
                onChange={(val) => setJoinType(val as JoinType)}
              />
            </div>
          </div>

          <div className="jm-sides-grid">
            <div className="jm-side-card">
              <span className="jm-side-badge">Ліва таблиця (основна)</span>
              <div className="jm-field">
                <label className="jm-label" htmlFor="join-left-ds">
                  Таблиця
                </label>
                <CustomSelect
                  id="join-left-ds"
                  value={leftDs?.id ?? ''}
                  options={datasets.map((ds) => ({
                    value: ds.id,
                    label: `${ds.name} (${ds.rows.length} рядків)`,
                  }))}
                  onChange={(val) => setLeftDatasetId(val)}
                />
              </div>
              <div className="jm-field">
                <label className="jm-label" htmlFor="join-left-key">
                  Ключова колонка
                </label>
                <CustomSelect
                  id="join-left-key"
                  value={effectiveLeftKey}
                  options={(leftDs?.columns ?? []).map((col) => ({
                    value: col.id,
                    label: `${col.name} (${col.type})`,
                  }))}
                  onChange={(val) => setLeftKeyColumnId(val)}
                />
              </div>
            </div>

            <div className="jm-join-connector" aria-hidden="true">
              <Link2 size={14} />
              <span>{JOIN_BADGE[joinType]}</span>
            </div>

            <div className="jm-side-card">
              <span className="jm-side-badge">Права таблиця (приєднувана)</span>
              <div className="jm-field">
                <label className="jm-label" htmlFor="join-right-ds">
                  Таблиця
                </label>
                <CustomSelect
                  id="join-right-ds"
                  value={rightDs?.id ?? ''}
                  options={datasets.map((ds) => ({
                    value: ds.id,
                    label: `${ds.name} (${ds.rows.length} рядків)`,
                  }))}
                  onChange={(val) => setRightDatasetId(val)}
                />
              </div>
              <div className="jm-field">
                <label className="jm-label" htmlFor="join-right-key">
                  Ключова колонка
                </label>
                <CustomSelect
                  id="join-right-key"
                  value={effectiveRightKey}
                  options={(rightDs?.columns ?? []).map((col) => ({
                    value: col.id,
                    label: `${col.name} (${col.type})`,
                  }))}
                  onChange={(val) => setRightKeyColumnId(val)}
                />
              </div>
            </div>
          </div>

          <div className="jm-form-footer">
            <span className="jm-preview-pill">
              {previewStats
                ? `Результат: ${previewStats.columns} колонок · ${previewStats.rows} рядків`
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
      </div>
    </Modal>
  );
}
