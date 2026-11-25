import type { CellValue, Dataset, Project } from '../../domain/models';
import { CURRENT_FORMAT_VERSION } from '../../app/projectReducer';

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
  }

  for (const row of dataset.rows) {
    const rowLine = dataset.columns
      .map((col) => serializeCellValue(row.values[col.id]))
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
  const lines: string[] = [
    '# LOCAL-ANALYTICS-PROJECT',
    `# Format-Version: ${project.formatVersion || CURRENT_FORMAT_VERSION}`,
    `# Project-Name: ${project.name}`,
  ];

  if (project.metadata.unknownMetadata && project.metadata.unknownMetadata.length > 0) {
    lines.push(...project.metadata.unknownMetadata);
  }

  lines.push('');
  lines.push(`[DATASET id="${project.primaryDataset.id}"]`);
  lines.push(`# Name: ${project.primaryDataset.name}`);
  lines.push(...serializeDatasetBody(project.primaryDataset, true));
  lines.push('[/DATASET]');

  for (const page of project.canvases) {
    lines.push('');
    lines.push(`[CANVAS id="${page.id}"]`);
    lines.push(`# Name: ${page.name}`);
    lines.push(`# Viewport: x=${page.viewport.x};y=${page.viewport.y};zoom=${page.viewport.zoom}`);

    if (page.unknownMetadata && page.unknownMetadata.length > 0) {
      lines.push(...page.unknownMetadata);
    }

    for (const element of page.elements) {
      lines.push(`[ITEM id="${element.id}" type="${element.type}"]`);
      lines.push(`# Position: x=${element.position.x};y=${element.position.y}`);
      lines.push(`# Size: width=${element.size.width};height=${element.size.height}`);
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
