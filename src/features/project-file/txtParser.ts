import { createStableId } from '../../domain/id';
import type {
  CanvasElement,
  CanvasElementConfig,
  CanvasElementType,
  CanvasPage,
  CellValue,
  Column,
  ColumnType,
  Dataset,
  ElementLink,
  Position,
  Project,
  Row,
  Size,
  Viewport,
} from '../../domain/models';
import { CURRENT_FORMAT_VERSION } from '../../app/projectReducer';
import {
  isColumnType,
  isEmptyCellValue,
  validateCellValue,
} from '../source-data/typeValidation';

export interface TxtIssue {
  line: number;
  message: string;
}

export interface ParsedDatasetImport {
  kind: 'dataset';
  dataset: Dataset;
  errors: TxtIssue[];
  warnings: TxtIssue[];
}

export interface ParsedProjectImport {
  kind: 'project';
  project: Project;
  errors: TxtIssue[];
  warnings: TxtIssue[];
}

export type ParsedTxtResult = ParsedDatasetImport | ParsedProjectImport;

const VALID_ELEMENT_TYPES: readonly CanvasElementType[] = [
  'note',
  'kpi',
  'line-chart',
  'bar-chart',
  'table-view',
  'kanban',
  'histogram',
  'pie-chart',
  'stacked-bar',
  'scatter',
  'pivot-table',
];

interface ParsedRecord {
  startLine: number;
  fields: string[];
}

/**
 * Parses a semicolon-delimited string slice (from a known start line offset) into records,
 * supporting RFC-style double-quoted fields, doubled quote escapes (""), and multiline values.
 */
function parseDelimitedRecords(
  lines: string[],
  startIndex: number,
  endIndexExclusive: number,
  stopAtTagOrDirective: boolean,
): {
  records: ParsedRecord[];
  directives: Array<{ line: number; text: string }>;
  nextIndex: number;
  errors: TxtIssue[];
} {
  const records: ParsedRecord[] = [];
  const directives: Array<{ line: number; text: string }> = [];
  const errors: TxtIssue[] = [];

  let i = startIndex;
  while (i < endIndexExclusive) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (trimmed === '') {
      i += 1;
      continue;
    }

    if (stopAtTagOrDirective && (trimmed.startsWith('[') || trimmed.startsWith('[/')) ) {
      break;
    }

    if (trimmed.startsWith('#')) {
      directives.push({ line: i + 1, text: trimmed });
      i += 1;
      continue;
    }

    // Consume one complete record (possibly spanning multiple lines if inside quotes)
    const recordStartLine = i + 1;
    const fields: string[] = [];
    let currentField = '';
    let inQuotes = false;
    let justClosedQuote = false;
    let cursorLine = i;

    lineLoop: while (cursorLine < endIndexExclusive) {
      const lineText = lines[cursorLine];

      for (let c = 0; c < lineText.length; c += 1) {
        const ch = lineText[c];

        if (inQuotes) {
          if (ch === '"') {
            if (c + 1 < lineText.length && lineText[c + 1] === '"') {
              currentField += '"';
              c += 1;
            } else {
              inQuotes = false;
              justClosedQuote = true;
            }
          } else {
            currentField += ch;
          }
        } else if (ch === '"') {
          if (currentField.length === 0 && !justClosedQuote) {
            inQuotes = true;
          } else {
            errors.push({
              line: cursorLine + 1,
              message: 'Неочікувані лапки всередині незалапкованого поля.',
            });
            currentField += ch;
          }
        } else if (ch === ';') {
          fields.push(currentField);
          currentField = '';
          justClosedQuote = false;
        } else {
          if (justClosedQuote && ch !== ' ' && ch !== '\t') {
            errors.push({
              line: cursorLine + 1,
              message: 'Зайві символи після закриття лапок у полі.',
            });
          }
          currentField += ch;
        }
      }

      if (inQuotes) {
        // Multiline quoted field continues on next line
        currentField += '\n';
        cursorLine += 1;
        continue lineLoop;
      }

      break lineLoop;
    }

    if (inQuotes) {
      errors.push({
        line: recordStartLine,
        message: 'Незакриті лапки в рядку даних.',
      });
      i = cursorLine;
      break;
    }

    fields.push(currentField);
    records.push({ startLine: recordStartLine, fields });
    i = cursorLine + 1;
  }

  return { records, directives, nextIndex: i, errors };
}

function parseColumnsDeclaration(
  line: number,
  rawSpec: string,
  rawIdsSpec?: string,
  allowEmpty = false,
): { columns: Column[]; errors: TxtIssue[] } {
  const errors: TxtIssue[] = [];
  const parts = rawSpec.split(';').map((p) => p.trim());
  const idParts = rawIdsSpec ? rawIdsSpec.split(';').map((p) => p.trim()) : null;

  if (parts.length === 0 || (parts.length === 1 && parts[0] === '')) {
    if (!allowEmpty) {
      errors.push({
        line,
        message: 'Оголошення # Columns: не може бути порожнім.',
      });
    }
    return { columns: [], errors };
  }

  if (idParts && idParts.length !== parts.length) {
    errors.push({
      line,
      message: `Кількість ID у # Column-Ids (${idParts.length}) не збігається з кількістю колонок (${parts.length}).`,
    });
  }

  const columns: Column[] = [];
  const usedIds = new Set<string>();

  for (let idx = 0; idx < parts.length; idx += 1) {
    const item = parts[idx];
    if (!item) {
      errors.push({
        line,
        message: `Порожній опис колонки на позиції ${idx + 1}.`,
      });
      continue;
    }

    const colonIdx = item.lastIndexOf(':');
    let colName = item;
    let colType: ColumnType = 'text';

    if (colonIdx !== -1) {
      colName = item.slice(0, colonIdx).trim();
      const rawType = item.slice(colonIdx + 1).trim();
      if (!rawType) {
        errors.push({
          line,
          message: `Порожній тип колонки для "${colName || `#${idx + 1}`}".`,
        });
      } else if (!isColumnType(rawType)) {
        errors.push({
          line,
          message: `Непідтримуваний тип колонки "${rawType}" для "${colName}". Дозволені: text, number, date, boolean.`,
        });
      } else {
        colType = rawType;
      }
    }

    if (!colName) {
      errors.push({
        line,
        message: `Відсутня назва колонки на позиції ${idx + 1}.`,
      });
      colName = `Column ${idx + 1}`;
    }

    let colId = idParts && idParts[idx] ? idParts[idx] : createStableId('col');
    if (usedIds.has(colId)) {
      errors.push({
        line,
        message: `Дублікат ID колонки "${colId}".`,
      });
      colId = createStableId('col');
    }
    usedIds.add(colId);

    columns.push({
      id: colId,
      name: colName,
      type: colType,
    });
  }

  return { columns, errors };
}

function buildRowsFromRecords(
  columns: Column[],
  records: ParsedRecord[],
  errors: TxtIssue[],
  warnings: TxtIssue[],
): Row[] {
  const rows: Row[] = [];

  for (const rec of records) {
    if (rec.fields.length !== columns.length) {
      errors.push({
        line: rec.startLine,
        message: `Очікувалось ${columns.length} полів, але знайдено ${rec.fields.length}.`,
      });
      continue;
    }

    const values: Record<string, CellValue> = {};
    for (let c = 0; c < columns.length; c += 1) {
      const col = columns[c];
      const rawField = rec.fields[c];
      const cellValue: CellValue = rawField === '' ? null : rawField;
      values[col.id] = cellValue;

      if (!isEmptyCellValue(cellValue) && col.type !== 'text') {
        const validation = validateCellValue(cellValue, col.type);
        if (!validation.valid) {
          warnings.push({
            line: rec.startLine,
            message: `Значення "${rawField}" у колонці "${col.name}" не відповідає типу ${col.type}.`,
          });
        }
      }
    }

    rows.push({
      id: createStableId('row'),
      values,
    });
  }

  return rows;
}

function parseKeyValuePairs(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const segment of raw.split(';')) {
    const eqIndex = segment.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }
    const key = segment.slice(0, eqIndex).trim();
    const val = segment.slice(eqIndex + 1).trim();
    if (key) {
      result[key] = val;
    }
  }
  return result;
}

function parseNumberStrict(value: string | undefined): number | null {
  if (value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTagAttributes(line: string, expectedTag: string): { id?: string; type?: string } | null {
  const regex = new RegExp(`^\\[${expectedTag}(?:\\s+(.*))?\\]$`);
  const match = regex.exec(line.trim());
  if (!match) {
    return null;
  }
  const attrsRaw = match[1] ?? '';
  const attrs: { id?: string; type?: string } = {};
  const attrRegex = /(\w+)="([^"]*)"/g;
  let attrMatch: RegExpExecArray | null = attrRegex.exec(attrsRaw);
  while (attrMatch !== null) {
    if (attrMatch[1] === 'id') {
      attrs.id = attrMatch[2];
    } else if (attrMatch[1] === 'type') {
      attrs.type = attrMatch[2];
    }
    attrMatch = attrRegex.exec(attrsRaw);
  }
  return attrs;
}

function resolveFieldReference(
  rawRef: unknown,
  columns: Column[],
): string | null {
  if (typeof rawRef !== 'string' || rawRef.trim() === '') {
    return null;
  }
  const byId = columns.find((col) => col.id === rawRef);
  if (byId) {
    return byId.id;
  }
  const byName = columns.find((col) => col.name === rawRef);
  return byName ? byName.id : rawRef;
}

function parseAgg(rawAgg: unknown, fallback: 'sum' | 'count' = 'sum') {
  return rawAgg === 'sum' ||
    rawAgg === 'avg' ||
    rawAgg === 'count' ||
    rawAgg === 'min' ||
    rawAgg === 'max'
    ? rawAgg
    : fallback;
}

function normalizeElementConfig(
  elementType: CanvasElementType,
  rawConfig: Record<string, unknown>,
  columns: Column[],
): CanvasElementConfig {
  const title = typeof rawConfig.title === 'string' ? rawConfig.title : '';

  if (elementType === 'note') {
    return {
      title: title || 'Нотатка',
      content: typeof rawConfig.content === 'string' ? rawConfig.content : '',
    };
  }

  if (elementType === 'kpi') {
    const rawField = rawConfig.valueFieldId ?? rawConfig.valueField;
    const rawSpark = rawConfig.sparklineOrderFieldId;
    return {
      title: title || 'KPI',
      valueFieldId: resolveFieldReference(rawField, columns),
      aggregation: parseAgg(rawConfig.aggregation, 'count'),
      ...(typeof rawConfig.showSparkline === 'boolean'
        ? { showSparkline: rawConfig.showSparkline }
        : {}),
      ...(rawSpark !== undefined
        ? { sparklineOrderFieldId: resolveFieldReference(rawSpark, columns) }
        : {}),
    };
  }

  if (elementType === 'line-chart' || elementType === 'bar-chart') {
    const rawX = rawConfig.xFieldId ?? rawConfig.xField;
    const rawY = rawConfig.yFieldId ?? rawConfig.yField;
    return {
      title: title || (elementType === 'line-chart' ? 'Лінійний графік' : 'Стовпчиковий графік'),
      xFieldId: resolveFieldReference(rawX, columns),
      yFieldId: resolveFieldReference(rawY, columns),
      aggregation: parseAgg(rawConfig.aggregation, 'sum'),
    };
  }

  if (elementType === 'kanban') {
    const rawDetails = Array.isArray(rawConfig.detailFieldIds) ? rawConfig.detailFieldIds : [];
    return {
      title: title || 'Kanban',
      groupByFieldId: resolveFieldReference(rawConfig.groupByFieldId, columns),
      titleFieldId: resolveFieldReference(rawConfig.titleFieldId, columns),
      detailFieldIds: rawDetails
        .map((item) => resolveFieldReference(item, columns))
        .filter((id): id is string => id !== null),
    };
  }

  if (elementType === 'histogram') {
    const rawBins =
      typeof rawConfig.binCount === 'number' && Number.isFinite(rawConfig.binCount)
        ? Math.max(2, Math.min(30, Math.floor(rawConfig.binCount)))
        : 8;
    return {
      title: title || 'Гістограма',
      valueFieldId: resolveFieldReference(rawConfig.valueFieldId, columns),
      binCount: rawBins,
    };
  }

  if (elementType === 'pie-chart') {
    return {
      title: title || 'Кругова діаграма',
      categoryFieldId: resolveFieldReference(rawConfig.categoryFieldId, columns),
      valueFieldId: resolveFieldReference(rawConfig.valueFieldId, columns),
      aggregation: parseAgg(rawConfig.aggregation, 'count'),
      isDonut: Boolean(rawConfig.isDonut),
    };
  }

  if (elementType === 'stacked-bar') {
    return {
      title: title || 'Складений графік',
      xFieldId: resolveFieldReference(rawConfig.xFieldId, columns),
      seriesFieldId: resolveFieldReference(rawConfig.seriesFieldId, columns),
      yFieldId: resolveFieldReference(rawConfig.yFieldId, columns),
      aggregation: parseAgg(rawConfig.aggregation, 'sum'),
    };
  }

  if (elementType === 'scatter') {
    return {
      title: title || 'Точкова діаграма',
      xFieldId: resolveFieldReference(rawConfig.xFieldId, columns),
      yFieldId: resolveFieldReference(rawConfig.yFieldId, columns),
      labelFieldId: resolveFieldReference(rawConfig.labelFieldId, columns),
    };
  }

  if (elementType === 'pivot-table') {
    return {
      title: title || 'Зведена таблиця',
      rowFieldId: resolveFieldReference(rawConfig.rowFieldId, columns),
      colFieldId: resolveFieldReference(rawConfig.colFieldId, columns),
      valueFieldId: resolveFieldReference(rawConfig.valueFieldId, columns),
      aggregation: parseAgg(rawConfig.aggregation, 'sum'),
    };
  }

  const rawCols = Array.isArray(rawConfig.columnIds)
    ? rawConfig.columnIds
    : Array.isArray(rawConfig.columns)
      ? rawConfig.columns
      : [];
  const columnIds = rawCols
    .map((item) => resolveFieldReference(item, columns))
    .filter((id): id is string => id !== null);

  const maxRows =
    typeof rawConfig.maxRows === 'number' && Number.isFinite(rawConfig.maxRows) && rawConfig.maxRows > 0
      ? Math.floor(rawConfig.maxRows)
      : undefined;

  return {
    title: title || 'Таблиця',
    columnIds,
    ...(maxRows !== undefined ? { maxRows } : {}),
  };
}

function parseDatasetOnlyTxt(lines: string[], defaultName: string): ParsedDatasetImport {
  const errors: TxtIssue[] = [];
  const warnings: TxtIssue[] = [];

  const parsed = parseDelimitedRecords(lines, 0, lines.length, false);
  errors.push(...parsed.errors);

  let datasetName = defaultName;
  let columnsLine: { line: number; value: string } | null = null;
  let columnIdsLine: string | undefined;

  for (const dir of parsed.directives) {
    if (dir.text.startsWith('# Dataset:')) {
      const candidate = dir.text.slice('# Dataset:'.length).trim();
      if (candidate) {
        datasetName = candidate;
      }
    } else if (dir.text.startsWith('# Columns:')) {
      columnsLine = { line: dir.line, value: dir.text.slice('# Columns:'.length).trim() };
    } else if (dir.text.startsWith('# Column-Ids:')) {
      columnIdsLine = dir.text.slice('# Column-Ids:'.length).trim();
    } else {
      warnings.push({
        line: dir.line,
        message: `Невідома директива "${dir.text}" проігнорована при імпорті таблиці.`,
      });
    }
  }

  if (!columnsLine) {
    errors.push({
      line: 1,
      message: 'Відсутній обов’язковий рядок # Columns: з описом колонок.',
    });
    return {
      kind: 'dataset',
      dataset: {
        id: createStableId('ds'),
        name: datasetName,
        columns: [],
        rows: [],
      },
      errors,
      warnings,
    };
  }

  const colResult = parseColumnsDeclaration(columnsLine.line, columnsLine.value, columnIdsLine);
  errors.push(...colResult.errors);

  const rows =
    colResult.columns.length > 0
      ? buildRowsFromRecords(colResult.columns, parsed.records, errors, warnings)
      : [];

  return {
    kind: 'dataset',
    dataset: {
      id: createStableId('ds'),
      name: datasetName,
      columns: colResult.columns,
      rows,
    },
    errors,
    warnings,
  };
}

function parseFullProjectTxt(lines: string[]): ParsedProjectImport {
  const errors: TxtIssue[] = [];
  const warnings: TxtIssue[] = [];

  let projectName = 'Імпортований проєкт';
  let formatVersion = CURRENT_FORMAT_VERSION;
  let sawFormatVersion = false;
  const projectUnknownMetadata: string[] = [];

  let dataset: Dataset | null = null;
  const canvases: CanvasPage[] = [];

  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    const lineNum = i + 1;

    if (trimmed === '') {
      i += 1;
      continue;
    }

    if (trimmed.startsWith('#')) {
      if (trimmed === '# LOCAL-ANALYTICS-PROJECT') {
        i += 1;
        continue;
      }
      if (trimmed.startsWith('# Format-Version:')) {
        const rawVer = trimmed.slice('# Format-Version:'.length).trim();
        const ver = Number(rawVer);
        sawFormatVersion = true;
        if (!Number.isInteger(ver) || ver !== CURRENT_FORMAT_VERSION) {
          errors.push({
            line: lineNum,
            message: `Непідтримувана версія формату "${rawVer}". Очікується Format-Version: ${CURRENT_FORMAT_VERSION}.`,
          });
        } else {
          formatVersion = ver;
        }
      } else if (trimmed.startsWith('# Project-Name:')) {
        const candidate = trimmed.slice('# Project-Name:'.length).trim();
        if (candidate) {
          projectName = candidate;
        }
      } else {
        projectUnknownMetadata.push(trimmed);
        warnings.push({
          line: lineNum,
          message: `Збережено невідомі метадані проєкту: ${trimmed}`,
        });
      }
      i += 1;
      continue;
    }

    if (trimmed.startsWith('[DATASET')) {
      if (dataset !== null) {
        errors.push({
          line: lineNum,
          message: 'У версії формату 1 підтримується лише одна секція [DATASET].',
        });
      }
      const attrs = parseTagAttributes(trimmed, 'DATASET');
      if (!attrs) {
        errors.push({
          line: lineNum,
          message: `Некоректний заголовок секції [DATASET]: ${trimmed}`,
        });
        i += 1;
        continue;
      }

      const dsId = attrs.id || createStableId('ds');
      let dsName = 'Source Data';
      let columnsLine: { line: number; value: string } | null = null;
      let columnIdsLine: string | undefined;
      const dsUnknownMetadata: string[] = [];

      const bodyResult = parseDelimitedRecords(lines, i + 1, lines.length, true);
      errors.push(...bodyResult.errors);

      for (const dir of bodyResult.directives) {
        if (dir.text.startsWith('# Name:')) {
          const candidate = dir.text.slice('# Name:'.length).trim();
          if (candidate) {
            dsName = candidate;
          }
        } else if (dir.text.startsWith('# Columns:')) {
          columnsLine = { line: dir.line, value: dir.text.slice('# Columns:'.length).trim() };
        } else if (dir.text.startsWith('# Column-Ids:')) {
          columnIdsLine = dir.text.slice('# Column-Ids:'.length).trim();
        } else {
          dsUnknownMetadata.push(dir.text);
          warnings.push({
            line: dir.line,
            message: `Збережено невідомі метадані датасету: ${dir.text}`,
          });
        }
      }

      i = bodyResult.nextIndex;
      if (i >= lines.length || lines[i].trim() !== '[/DATASET]') {
        errors.push({
          line: lineNum,
          message: 'Секція [DATASET] не має закриваючого тегу [/DATASET].',
        });
      } else {
        i += 1;
      }

      let columns: Column[] = [];
      if (!columnsLine) {
        errors.push({
          line: lineNum,
          message: 'У секції [DATASET] відсутній рядок # Columns:.',
        });
      } else {
        const colRes = parseColumnsDeclaration(
          columnsLine.line,
          columnsLine.value,
          columnIdsLine,
          true,
        );
        errors.push(...colRes.errors);
        columns = colRes.columns;
      }

      if (columns.length === 0 && bodyResult.records.length > 0) {
        errors.push({
          line: bodyResult.records[0].startLine,
          message: 'Знайдено рядки даних при порожньому оголошенні # Columns:.',
        });
      }

      const rows =
        columns.length > 0
          ? buildRowsFromRecords(columns, bodyResult.records, errors, warnings)
          : [];

      dataset = {
        id: dsId,
        name: dsName,
        columns,
        rows,
        ...(dsUnknownMetadata.length > 0 ? { unknownMetadata: dsUnknownMetadata } : {}),
      };
      continue;
    }

    if (trimmed.startsWith('[CANVAS')) {
      const attrs = parseTagAttributes(trimmed, 'CANVAS');
      if (!attrs) {
        errors.push({
          line: lineNum,
          message: `Некоректний заголовок секції [CANVAS]: ${trimmed}`,
        });
        i += 1;
        continue;
      }

      const pageId = attrs.id || createStableId('page');
      let pageName = `Сторінка ${canvases.length + 1}`;
      let viewport: Viewport = { x: 0, y: 0, zoom: 1 };
      const elements: CanvasElement[] = [];
      const pageUnknownMetadata: string[] = [];

      i += 1;
      let closedCanvas = false;
      while (i < lines.length) {
        const cTrimmed = lines[i].trim();
        const cLineNum = i + 1;

        if (cTrimmed === '') {
          i += 1;
          continue;
        }
        if (cTrimmed === '[/CANVAS]') {
          closedCanvas = true;
          i += 1;
          break;
        }
        if (cTrimmed.startsWith('#')) {
          if (cTrimmed.startsWith('# Name:')) {
            const candidate = cTrimmed.slice('# Name:'.length).trim();
            if (candidate) {
              pageName = candidate;
            }
          } else if (cTrimmed.startsWith('# Viewport:')) {
            const kv = parseKeyValuePairs(cTrimmed.slice('# Viewport:'.length));
            const x = parseNumberStrict(kv.x);
            const y = parseNumberStrict(kv.y);
            const zoom = parseNumberStrict(kv.zoom);
            if (x === null || y === null || zoom === null || zoom <= 0) {
              errors.push({
                line: cLineNum,
                message: 'Некоректний формат # Viewport: (очікується x=...;y=...;zoom=...).',
              });
            } else {
              viewport = { x, y, zoom };
            }
          } else {
            pageUnknownMetadata.push(cTrimmed);
            warnings.push({
              line: cLineNum,
              message: `Збережено невідомі метадані сторінки: ${cTrimmed}`,
            });
          }
          i += 1;
          continue;
        }

        if (cTrimmed.startsWith('[ITEM')) {
          const itemAttrs = parseTagAttributes(cTrimmed, 'ITEM');
          if (!itemAttrs || !itemAttrs.type) {
            errors.push({
              line: cLineNum,
              message: `Некоректний заголовок [ITEM]: ${cTrimmed}`,
            });
            i += 1;
            continue;
          }

          const rawType = itemAttrs.type;
          const isKnownType = (VALID_ELEMENT_TYPES as readonly string[]).includes(rawType);
          if (!isKnownType) {
            errors.push({
              line: cLineNum,
              message: `Непідтримуваний тип елемента Canvas "${rawType}".`,
            });
          }

          const itemId = itemAttrs.id || createStableId('el');
          let position: Position = { x: 0, y: 0 };
          let size: Size = { width: 280, height: 180 };
          let rawConfig: Record<string, unknown> = {};
          let links: ElementLink[] | undefined;
          const itemUnknownMetadata: string[] = [];

          i += 1;
          let closedItem = false;
          while (i < lines.length) {
            const iTrimmed = lines[i].trim();
            const iLineNum = i + 1;

            if (iTrimmed === '') {
              i += 1;
              continue;
            }
            if (iTrimmed === '[/ITEM]') {
              closedItem = true;
              i += 1;
              break;
            }
            if (iTrimmed.startsWith('# Position:')) {
              const kv = parseKeyValuePairs(iTrimmed.slice('# Position:'.length));
              const x = parseNumberStrict(kv.x);
              const y = parseNumberStrict(kv.y);
              if (x === null || y === null) {
                errors.push({
                  line: iLineNum,
                  message: 'Некоректний формат # Position: (очікується x=...;y=...).',
                });
              } else {
                position = { x, y };
              }
            } else if (iTrimmed.startsWith('# Size:')) {
              const kv = parseKeyValuePairs(iTrimmed.slice('# Size:'.length));
              const width = parseNumberStrict(kv.width);
              const height = parseNumberStrict(kv.height);
              if (width === null || height === null || width <= 0 || height <= 0) {
                errors.push({
                  line: iLineNum,
                  message: 'Некоректний формат # Size: (очікується width=...;height=...).',
                });
              } else {
                size = { width, height };
              }
            } else if (iTrimmed.startsWith('# Config-JSON:')) {
              const jsonText = iTrimmed.slice('# Config-JSON:'.length).trim();
              try {
                const parsedJson = JSON.parse(jsonText) as unknown;
                if (!parsedJson || typeof parsedJson !== 'object' || Array.isArray(parsedJson)) {
                  errors.push({
                    line: iLineNum,
                    message: 'Значення # Config-JSON: має бути JSON-об’єктом.',
                  });
                } else {
                  rawConfig = parsedJson as Record<string, unknown>;
                }
              } catch {
                errors.push({
                  line: iLineNum,
                  message: 'Невалідний JSON у директиві # Config-JSON:.',
                });
              }
            } else if (iTrimmed.startsWith('# Links-JSON:')) {
              const jsonText = iTrimmed.slice('# Links-JSON:'.length).trim();
              try {
                const parsedLinks = JSON.parse(jsonText) as unknown;
                if (Array.isArray(parsedLinks)) {
                  links = parsedLinks as ElementLink[];
                } else {
                  errors.push({
                    line: iLineNum,
                    message: 'Значення # Links-JSON: має бути JSON-масивом.',
                  });
                }
              } catch {
                errors.push({
                  line: iLineNum,
                  message: 'Невалідний JSON у директиві # Links-JSON:.',
                });
              }
            } else if (iTrimmed.startsWith('#')) {
              itemUnknownMetadata.push(iTrimmed);
              warnings.push({
                line: iLineNum,
                message: `Збережено невідомі метадані елемента: ${iTrimmed}`,
              });
            } else {
              errors.push({
                line: iLineNum,
                message: `Неочікуваний рядок всередині [ITEM]: ${iTrimmed}`,
              });
            }
            i += 1;
          }

          if (!closedItem) {
            errors.push({
              line: cLineNum,
              message: 'Секція [ITEM] не має закриваючого тегу [/ITEM].',
            });
          }

          if (isKnownType) {
            const elType = rawType as CanvasElementType;
            const columnsForResolve = dataset?.columns ?? [];
            const config = normalizeElementConfig(elType, rawConfig, columnsForResolve);
            elements.push({
              id: itemId,
              type: elType,
              position,
              size,
              config,
              ...(links ? { links } : {}),
              ...(itemUnknownMetadata.length > 0
                ? { unknownMetadata: itemUnknownMetadata }
                : {}),
            } as CanvasElement);
          }
          continue;
        }

        errors.push({
          line: cLineNum,
          message: `Неочікуваний рядок всередині [CANVAS]: ${cTrimmed}`,
        });
        i += 1;
      }

      if (!closedCanvas) {
        errors.push({
          line: lineNum,
          message: 'Секція [CANVAS] не має закриваючого тегу [/CANVAS].',
        });
      }

      canvases.push({
        id: pageId,
        name: pageName,
        viewport,
        elements,
        ...(pageUnknownMetadata.length > 0 ? { unknownMetadata: pageUnknownMetadata } : {}),
      });
      continue;
    }

    errors.push({
      line: lineNum,
      message: `Неочікуваний вміст поза секціями проєкту: ${trimmed}`,
    });
    i += 1;
  }

  if (!sawFormatVersion) {
    errors.push({
      line: 1,
      message: 'Відсутній обов’язковий заголовок # Format-Version:.',
    });
  }

  if (!dataset) {
    errors.push({
      line: 1,
      message: 'У файлі проєкту відсутня секція [DATASET].',
    });
  }

  if (canvases.length === 0) {
    canvases.push({
      id: createStableId('page'),
      name: 'Головна сторінка',
      viewport: { x: 0, y: 0, zoom: 1 },
      elements: [],
    });
  }

  const now = new Date().toISOString();
  const project: Project = {
    id: createStableId('proj'),
    name: projectName,
    formatVersion,
    primaryDataset: dataset ?? {
      id: createStableId('ds'),
      name: 'Source Data',
      columns: [],
      rows: [],
    },
    canvases,
    metadata: {
      createdAt: now,
      updatedAt: now,
      ...(projectUnknownMetadata.length > 0 ? { unknownMetadata: projectUnknownMetadata } : {}),
    },
  };

  return {
    kind: 'project',
    project,
    errors,
    warnings,
  };
}

/**
 * Parses a UTF-8 TXT string (auto-detecting full-project vs dataset-only format)
 * without mutating current application state.
 */
export function parseTxtContent(content: string, fallbackDatasetName = 'Source Data'): ParsedTxtResult {
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  const isFullProject = lines.some((line) => {
    const trimmed = line.trim();
    return trimmed === '# LOCAL-ANALYTICS-PROJECT' || trimmed.startsWith('[DATASET');
  });

  return isFullProject
    ? parseFullProjectTxt(lines)
    : parseDatasetOnlyTxt(lines, fallbackDatasetName);
}
