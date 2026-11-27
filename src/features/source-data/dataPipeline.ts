import type {
  CellValue,
  Column,
  Dataset,
  DatasetJoin,
  FilterRule,
  Project,
  ProjectFilter,
  Row,
} from '../../domain/models';
import { evaluateDatasetFormulas } from './formulaEngine';
import { isEmptyCellValue, validateCellValue } from './typeValidation';

export function getAllProjectDatasets(project: Project): Dataset[] {
  return [project.primaryDataset, ...(project.secondaryDatasets ?? [])];
}

export function getJoinDatasetId(joinId: string): string {
  return `join:${joinId}`;
}

export function isJoinDatasetId(datasetId: string | undefined): boolean {
  return Boolean(datasetId && datasetId.startsWith('join:'));
}

export function getJoinedColumnId(joinId: string, rightColumnId: string): string {
  return `${joinId}__${rightColumnId}`;
}

/**
 * Materializes a relational Join (left, inner, right, full outer, left-anti, right-anti)
 * between two evaluated datasets.
 * Right-side columns receive deterministic IDs (`<joinId>__<colId>`) and qualified names.
 */
export function materializeJoinedDataset(
  leftRaw: Dataset,
  rightRaw: Dataset,
  join: DatasetJoin,
): Dataset {
  const left = evaluateDatasetFormulas(leftRaw);
  const right = evaluateDatasetFormulas(rightRaw);

  const rightLookup = new Map<string, Array<{ row: Row; index: number }>>();
  right.rows.forEach((rRow, index) => {
    const rawKey = rRow.values[join.rightKeyColumnId];
    if (isEmptyCellValue(rawKey)) {
      return;
    }
    const key = String(rawKey).trim();
    const bucket = rightLookup.get(key);
    if (bucket) {
      bucket.push({ row: rRow, index });
    } else {
      rightLookup.set(key, [{ row: rRow, index }]);
    }
  });

  const rightColumns: Column[] = right.columns.map((col) => ({
    ...col,
    id: getJoinedColumnId(join.id, col.id),
    name: `${right.name}.${col.name}`,
    formula: undefined,
  }));

  const mergedColumns: Column[] = [...left.columns, ...rightColumns];
  const mergedRows: Row[] = [];
  const matchedRightIndices = new Set<number>();

  const emitJoinedPair = (lRow: Row | null, rRow: Row | null, suffix: string) => {
    const values: Record<string, CellValue> = {};
    for (const lCol of left.columns) {
      values[lCol.id] = lRow ? (lRow.values[lCol.id] ?? null) : null;
    }
    for (const rCol of right.columns) {
      values[getJoinedColumnId(join.id, rCol.id)] = rRow ? (rRow.values[rCol.id] ?? null) : null;
    }
    mergedRows.push({
      id: `${lRow?.id ?? 'null'}__${rRow?.id ?? 'null'}_${suffix}`,
      values,
    });
  };

  for (const lRow of left.rows) {
    const rawKey = lRow.values[join.leftKeyColumnId];
    const key = isEmptyCellValue(rawKey) ? '' : String(rawKey).trim();
    const matches = key ? (rightLookup.get(key) ?? []) : [];

    if (matches.length === 0) {
      if (
        join.joinType === 'left' ||
        join.joinType === 'full' ||
        join.joinType === 'left-anti'
      ) {
        emitJoinedPair(lRow, null, 'unmatched_l');
      }
      continue;
    }

    matches.forEach(({ row: rRow, index: rIdx }, idx) => {
      matchedRightIndices.add(rIdx);
      if (join.joinType !== 'left-anti' && join.joinType !== 'right-anti') {
        emitJoinedPair(lRow, rRow, String(idx));
      }
    });
  }

  if (
    join.joinType === 'right' ||
    join.joinType === 'full' ||
    join.joinType === 'right-anti'
  ) {
    right.rows.forEach((rRow, rIdx) => {
      if (!matchedRightIndices.has(rIdx)) {
        emitJoinedPair(null, rRow, `unmatched_r_${rIdx}`);
      }
    });
  }

  return {
    id: getJoinDatasetId(join.id),
    name: join.name || `${left.name} ⋈ ${right.name}`,
    columns: mergedColumns,
    rows: mergedRows,
  };
}

function matchesRule(row: Row, rule: FilterRule, col: Column | undefined): boolean {
  if (!col) {
    return true;
  }
  const raw = row.values[col.id] ?? null;
  const strVal = isEmptyCellValue(raw) ? '' : String(raw).trim();

  switch (rule.operator) {
    case 'equals':
      return strVal.toLowerCase() === rule.value.trim().toLowerCase();
    case 'not-equals':
      return strVal.toLowerCase() !== rule.value.trim().toLowerCase();
    case 'contains':
      return strVal.toLowerCase().includes(rule.value.trim().toLowerCase());
    case 'in': {
      const allowed = new Set((rule.values ?? []).map((v) => v.trim().toLowerCase()));
      if (allowed.size === 0) return true;
      return allowed.has(strVal.toLowerCase());
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      if (col.type === 'number') {
        const nVal = validateCellValue(raw, 'number');
        const target = Number(rule.value);
        if (!nVal.valid || typeof nVal.parsed !== 'number' || !Number.isFinite(target)) {
          return false;
        }
        if (rule.operator === 'gt') return nVal.parsed > target;
        if (rule.operator === 'gte') return nVal.parsed >= target;
        if (rule.operator === 'lt') return nVal.parsed < target;
        return nVal.parsed <= target;
      }
      if (!strVal) return false;
      const cmp = strVal.localeCompare(rule.value.trim());
      if (rule.operator === 'gt') return cmp > 0;
      if (rule.operator === 'gte') return cmp >= 0;
      if (rule.operator === 'lt') return cmp < 0;
      return cmp <= 0;
    }
    case 'between': {
      const from = rule.value.trim();
      const to = (rule.valueTo ?? '').trim();
      if (col.type === 'number') {
        const nVal = validateCellValue(raw, 'number');
        if (!nVal.valid || typeof nVal.parsed !== 'number') return false;
        const lo = from !== '' ? Number(from) : -Infinity;
        const hi = to !== '' ? Number(to) : Infinity;
        if (!Number.isFinite(lo) && from !== '') return false;
        if (!Number.isFinite(hi) && to !== '') return false;
        return nVal.parsed >= lo && nVal.parsed <= hi;
      }
      if (!strVal) return false;
      if (from && strVal < from) return false;
      if (to && strVal > to) return false;
      return true;
    }
  }
}

export function applyProjectFilters(
  dataset: Dataset,
  allFilters: ProjectFilter[],
  activeFilterIds: string[],
): Dataset {
  if (activeFilterIds.length === 0 || allFilters.length === 0) {
    return dataset;
  }

  const activeSet = new Set(activeFilterIds);
  const filtersToApply = allFilters.filter(
    (f) => activeSet.has(f.id) && (!f.datasetId || f.datasetId === dataset.id),
  );
  if (filtersToApply.length === 0) {
    return dataset;
  }

  const colById = new Map(dataset.columns.map((c) => [c.id, c]));
  const filteredRows = dataset.rows.filter((row) =>
    filtersToApply.every((filter) =>
      filter.rules.every((rule) => matchesRule(row, rule, colById.get(rule.columnId))),
    ),
  );

  return {
    ...dataset,
    rows: filteredRows,
  };
}

/**
 * Resolves the effective Dataset for an element/view:
 * 1. Evaluates formula columns on source datasets
 * 2. Executes Join if datasetId references `join:<id>`
 * 3. Applies reusable filters cleanly without mutating underlying Source Data
 */
export function resolveEffectiveDataset(
  project: Project,
  datasetId?: string,
  filterIds?: string[],
): Dataset {
  const allDatasets = getAllProjectDatasets(project);
  let resolved: Dataset | null = null;

  if (datasetId && isJoinDatasetId(datasetId)) {
    const joinId = datasetId.slice('join:'.length);
    const join = (project.joins ?? []).find((j) => j.id === joinId);
    if (join) {
      const left = allDatasets.find((d) => d.id === join.leftDatasetId);
      const right = allDatasets.find((d) => d.id === join.rightDatasetId);
      if (left && right) {
        resolved = materializeJoinedDataset(left, right, join);
      }
    }
  }

  if (!resolved && datasetId) {
    const found = allDatasets.find((d) => d.id === datasetId);
    if (found) {
      resolved = evaluateDatasetFormulas(found);
    }
  }

  if (!resolved) {
    resolved = evaluateDatasetFormulas(project.primaryDataset);
  }

  if (filterIds && filterIds.length > 0 && project.filters && project.filters.length > 0) {
    resolved = applyProjectFilters(resolved, project.filters, filterIds);
  }

  return resolved;
}

export function listDatasetOptions(project: Project): Array<{ id: string; label: string; isJoin: boolean }> {
  const dsOpts = getAllProjectDatasets(project).map((ds, idx) => ({
    id: ds.id,
    label: idx === 0 ? `${ds.name} (основна)` : ds.name,
    isJoin: false,
  }));
  const joinOpts = (project.joins ?? []).map((j) => ({
    id: getJoinDatasetId(j.id),
    label: `⋈ ${j.name}`,
    isJoin: true,
  }));
  return [...dsOpts, ...joinOpts];
}
