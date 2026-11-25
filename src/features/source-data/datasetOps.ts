import { createStableId } from '../../domain/id';
import type {
  CellValue,
  Column,
  ColumnType,
  Dataset,
  Project,
  Row,
} from '../../domain/models';

export interface AddColumnInput {
  id?: string;
  name: string;
  type?: ColumnType;
  displayFormat?: string;
  insertAt?: number;
}

export interface ColumnReference {
  pageId: string;
  pageName: string;
  elementId: string;
  elementTitle: string;
  fieldRole: 'valueFieldId' | 'xFieldId' | 'yFieldId' | 'columnIds';
}

export function createEmptyDataset(name = 'Source Data'): Dataset {
  return {
    id: createStableId('ds'),
    name,
    columns: [],
    rows: [],
  };
}

export function addColumn(dataset: Dataset, input: AddColumnInput): Dataset {
  const trimmedName = input.name.trim();
  const columnName = trimmedName.length > 0 ? trimmedName : `Column ${dataset.columns.length + 1}`;
  const newColumn: Column = {
    id: input.id ?? createStableId('col'),
    name: columnName,
    type: input.type ?? 'text',
    ...(input.displayFormat ? { displayFormat: input.displayFormat } : {}),
  };

  const insertIndex =
    input.insertAt === undefined
      ? dataset.columns.length
      : Math.max(0, Math.min(dataset.columns.length, input.insertAt));

  const nextColumns = [
    ...dataset.columns.slice(0, insertIndex),
    newColumn,
    ...dataset.columns.slice(insertIndex),
  ];

  const nextRows: Row[] = dataset.rows.map((row) => ({
    ...row,
    values: {
      ...row.values,
      [newColumn.id]: null,
    },
  }));

  return {
    ...dataset,
    columns: nextColumns,
    rows: nextRows,
  };
}

export function renameColumn(dataset: Dataset, columnId: string, newName: string): Dataset {
  const trimmed = newName.trim();
  if (!trimmed) {
    return dataset;
  }

  let changed = false;
  const nextColumns = dataset.columns.map((col) => {
    if (col.id !== columnId) {
      return col;
    }
    if (col.name === trimmed) {
      return col;
    }
    changed = true;
    return { ...col, name: trimmed };
  });

  return changed ? { ...dataset, columns: nextColumns } : dataset;
}

export function changeColumnType(dataset: Dataset, columnId: string, newType: ColumnType): Dataset {
  let changed = false;
  const nextColumns = dataset.columns.map((col) => {
    if (col.id !== columnId) {
      return col;
    }
    if (col.type === newType) {
      return col;
    }
    changed = true;
    return { ...col, type: newType };
  });

  // Intentionally preserve raw row values so changing types never silently corrupts user data.
  return changed ? { ...dataset, columns: nextColumns } : dataset;
}

export function reorderColumn(dataset: Dataset, columnId: string, targetIndex: number): Dataset {
  const currentIndex = dataset.columns.findIndex((col) => col.id === columnId);
  if (currentIndex === -1) {
    return dataset;
  }

  const clampedTarget = Math.max(0, Math.min(dataset.columns.length - 1, targetIndex));
  if (currentIndex === clampedTarget) {
    return dataset;
  }

  const nextColumns = [...dataset.columns];
  const [moved] = nextColumns.splice(currentIndex, 1);
  nextColumns.splice(clampedTarget, 0, moved);

  return {
    ...dataset,
    columns: nextColumns,
  };
}

export function deleteColumn(dataset: Dataset, columnId: string): Dataset {
  if (!dataset.columns.some((col) => col.id === columnId)) {
    return dataset;
  }

  const nextColumns = dataset.columns.filter((col) => col.id !== columnId);
  const nextRows = dataset.rows.map((row) => {
    const { [columnId]: _removed, ...restValues } = row.values;
    return {
      ...row,
      values: restValues,
    };
  });

  return {
    ...dataset,
    columns: nextColumns,
    rows: nextRows,
  };
}

export function addRow(
  dataset: Dataset,
  initialValues?: Record<string, CellValue>,
  insertAt?: number,
): Dataset {
  const values: Record<string, CellValue> = {};
  for (const col of dataset.columns) {
    values[col.id] = initialValues && col.id in initialValues ? initialValues[col.id] : null;
  }

  const newRow: Row = {
    id: createStableId('row'),
    values,
  };

  const insertIndex =
    insertAt === undefined
      ? dataset.rows.length
      : Math.max(0, Math.min(dataset.rows.length, insertAt));

  const nextRows = [
    ...dataset.rows.slice(0, insertIndex),
    newRow,
    ...dataset.rows.slice(insertIndex),
  ];

  return {
    ...dataset,
    rows: nextRows,
  };
}

export function updateCell(
  dataset: Dataset,
  rowId: string,
  columnId: string,
  value: CellValue,
): Dataset {
  if (!dataset.columns.some((col) => col.id === columnId)) {
    return dataset;
  }

  let changed = false;
  const nextRows = dataset.rows.map((row) => {
    if (row.id !== rowId) {
      return row;
    }
    if (row.values[columnId] === value) {
      return row;
    }
    changed = true;
    return {
      ...row,
      values: {
        ...row.values,
        [columnId]: value,
      },
    };
  });

  return changed ? { ...dataset, rows: nextRows } : dataset;
}

export function deleteRow(dataset: Dataset, rowId: string): Dataset {
  const nextRows = dataset.rows.filter((row) => row.id !== rowId);
  if (nextRows.length === dataset.rows.length) {
    return dataset;
  }
  return {
    ...dataset,
    rows: nextRows,
  };
}

/**
 * Finds every Canvas element configuration that currently references a given column ID.
 * Used to warn or preserve explicit broken-reference states rather than silently remapping.
 */
export function findColumnReferences(project: Project, columnId: string): ColumnReference[] {
  const refs: ColumnReference[] = [];

  for (const page of project.canvases) {
    for (const element of page.elements) {
      if (element.type === 'kpi' && element.config.valueFieldId === columnId) {
        refs.push({
          pageId: page.id,
          pageName: page.name,
          elementId: element.id,
          elementTitle: element.config.title,
          fieldRole: 'valueFieldId',
        });
      } else if (element.type === 'line-chart' || element.type === 'bar-chart') {
        if (element.config.xFieldId === columnId) {
          refs.push({
            pageId: page.id,
            pageName: page.name,
            elementId: element.id,
            elementTitle: element.config.title,
            fieldRole: 'xFieldId',
          });
        }
        if (element.config.yFieldId === columnId) {
          refs.push({
            pageId: page.id,
            pageName: page.name,
            elementId: element.id,
            elementTitle: element.config.title,
            fieldRole: 'yFieldId',
          });
        }
      } else if (element.type === 'table-view' && element.config.columnIds.includes(columnId)) {
        refs.push({
          pageId: page.id,
          pageName: page.name,
          elementId: element.id,
          elementTitle: element.config.title,
          fieldRole: 'columnIds',
        });
      }
    }
  }

  return refs;
}
