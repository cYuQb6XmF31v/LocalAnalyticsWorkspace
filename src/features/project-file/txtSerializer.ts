import type { CellValue, Dataset, Project } from '../../domain/models';
import { CURRENT_FORMAT_VERSION } from '../../app/projectReducer';
import { getAllProjectDatasets } from '../source-data/dataPipeline';

/**
 * Escapes a semicolon-delimited cell value using doubled quotes ("") when it contains
 * delimiters, quotes, newlines, leading/trailing spaces, or a leading '#' directive marker.
 */
export function serializeCellValue(value: CellValue | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (str === '') {
    return '';
  }

  const needsQuotes =
    str.includes(';') ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r') ||
    str.startsWith('#') ||
    str.startsWith(' ') ||
    str.endsWith(' ');

  if (!needsQuotes) {
    return str;
  }

  return `"${str.replace(/"/g, '""')}"`;
}

function serializeDatasetBody(dataset: Dataset, includeColumnIds: boolean): string[] {
  const lines: string[] = [];

  if (dataset.unknownMetadata && dataset.unknownMetadata.length > 0) {
    lines.push(...dataset.unknownMetadata);
  }

  const columnsSpec = dataset.columns.map((col) => `${col.name}:${col.type}`).join(';');
  lines.push(`# Columns: ${columnsSpec}`);

  if (includeColumnIds && dataset.columns.length > 0) {
    const columnIdsSpec = dataset.columns.map((col) => col.id).join(';');
    lines.push(`# Column-Ids: ${columnIdsSpec}`);

    const formulasMap: Record<string, string> = {};
    for (const col of dataset.columns) {
      if (col.formula && col.formula.trim()) {
        formulasMap[col.id] = col.formula.trim();
      }
    }
    if (Object.keys(formulasMap).length > 0) {
      lines.push(`# Formulas-JSON: ${JSON.stringify(formulasMap)}`);
    }
  }

  for (const row of dataset.rows) {
    const rowLine = dataset.columns
      .map((col) => serializeCellValue(col.formula ? null : row.values[col.id]))
      .join(';');
    lines.push(rowLine);
  }

  return lines;
}

/**
 * Serializes only the primary dataset to deterministic UTF-8 semicolon-delimited TXT.
 */
export function serializeDatasetOnlyTxt(dataset: Dataset): string {
  const lines: string[] = [`# Dataset: ${dataset.name}`, ...serializeDatasetBody(dataset, false)];
  return `${lines.join('\n')}\n`;
}

/**
 * Serializes the entire project (metadata, primary dataset with stable IDs, Canvas pages,
 * viewports, elements, configurations, links, and preserved unknown metadata) to TXT.
 */
export function serializeProjectTxt(project: Project): string {
  const allDatasets = getAllProjectDatasets(project);
  const hasPhase3Features =
    allDatasets.length > 1 ||
    (project.joins?.length ?? 0) > 0 ||
    (project.filters?.length ?? 0) > 0 ||
    (project.savedTemplates?.length ?? 0) > 0 ||
    allDatasets.some((ds) => ds.columns.some((c) => Boolean(c.formula))) ||
    project.canvases.some(
      (p) =>
        (p.filterIds?.length ?? 0) > 0 ||
        p.elements.some((el) => Boolean(el.datasetId) || (el.filterIds?.length ?? 0) > 0),
    );
  const formatVersion = hasPhase3Features
    ? CURRENT_FORMAT_VERSION
    : project.formatVersion || CURRENT_FORMAT_VERSION;

  const lines: string[] = [
    '# LOCAL-ANALYTICS-PROJECT',
    `# Format-Version: ${formatVersion}`,
    `# Project-Name: ${project.name}`,
  ];

  if (project.metadata.unknownMetadata && project.metadata.unknownMetadata.length > 0) {
    lines.push(...project.metadata.unknownMetadata);
  }

  for (const ds of allDatasets) {
    lines.push('');
    lines.push(`[DATASET id="${ds.id}"]`);
    lines.push(`# Name: ${ds.name}`);
    lines.push(...serializeDatasetBody(ds, true));
    lines.push('[/DATASET]');
  }

  for (const join of project.joins ?? []) {
    lines.push('');
    lines.push(`[JOIN id="${join.id}"]`);
    lines.push(`# Join-JSON: ${JSON.stringify(join)}`);
    lines.push('[/JOIN]');
  }

  for (const filter of project.filters ?? []) {
    lines.push('');
    lines.push(`[FILTER id="${filter.id}"]`);
    lines.push(`# Filter-JSON: ${JSON.stringify(filter)}`);
    lines.push('[/FILTER]');
  }

  for (const tpl of project.savedTemplates ?? []) {
    lines.push('');
    lines.push(`[TEMPLATE id="${tpl.id}"]`);
    lines.push(`# Template-JSON: ${JSON.stringify(tpl)}`);
    lines.push('[/TEMPLATE]');
  }

  for (const page of project.canvases) {
    lines.push('');
    lines.push(`[CANVAS id="${page.id}"]`);
    lines.push(`# Name: ${page.name}`);
    lines.push(`# Viewport: x=${page.viewport.x};y=${page.viewport.y};zoom=${page.viewport.zoom}`);
    if (page.filterIds && page.filterIds.length > 0) {
      lines.push(`# Filter-Ids-JSON: ${JSON.stringify(page.filterIds)}`);
    }

    if (page.unknownMetadata && page.unknownMetadata.length > 0) {
      lines.push(...page.unknownMetadata);
    }

    for (const element of page.elements) {
      lines.push(`[ITEM id="${element.id}" type="${element.type}"]`);
      lines.push(`# Position: x=${element.position.x};y=${element.position.y}`);
      lines.push(`# Size: width=${element.size.width};height=${element.size.height}`);
      if (element.datasetId) {
        lines.push(`# Dataset-Id: ${element.datasetId}`);
      }
      if (element.filterIds && element.filterIds.length > 0) {
        lines.push(`# Filter-Ids-JSON: ${JSON.stringify(element.filterIds)}`);
      }
      lines.push(`# Config-JSON: ${JSON.stringify(element.config)}`);

      if (element.links && element.links.length > 0) {
        lines.push(`# Links-JSON: ${JSON.stringify(element.links)}`);
      }
      if (element.unknownMetadata && element.unknownMetadata.length > 0) {
        lines.push(...element.unknownMetadata);
      }
      lines.push('[/ITEM]');
    }

    lines.push('[/CANVAS]');
  }

  return `${lines.join('\n')}\n`;
}
