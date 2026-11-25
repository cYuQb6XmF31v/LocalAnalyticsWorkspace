import { createStableId } from '../../domain/id';
import type { CanvasElement, CanvasPage, Dataset } from '../../domain/models';

export type CanvasTemplateId = 'blank' | 'overview' | 'trends';

export interface CanvasTemplateDefinition {
  id: CanvasTemplateId;
  title: string;
  description: string;
}

export const CANVAS_TEMPLATES: readonly CanvasTemplateDefinition[] = [
  {
    id: 'blank',
    title: 'Порожнє полотно (Blank Canvas)',
    description: 'Одна чиста сторінка для вільного додавання власних нотаток, KPI та графіків.',
  },
  {
    id: 'overview',
    title: 'Огляд (Overview)',
    description:
      'Зведення за поточною таблицею: ключові показники, стовпчиковий графік і таблиця перегляду.',
  },
  {
    id: 'trends',
    title: 'Тренди (Trends)',
    description:
      'Динаміка показників за датою або послідовністю категорій разом із підсумковим KPI і таблицею.',
  },
];

function findFirstColumns(dataset: Dataset) {
  const numericCols = dataset.columns.filter((c) => c.type === 'number');
  const dateCol = dataset.columns.find((c) => c.type === 'date') ?? null;
  const categoryCol =
    dataset.columns.find((c) => c.type === 'text' || c.type === 'boolean') ??
    dataset.columns[0] ??
    null;

  return { numericCols, dateCol, categoryCol };
}

/**
 * Generates Canvas pages for a selected generic template using stable column IDs
 * from the active primaryDataset without hardcoding any company-specific fields.
 */
export function buildPagesFromTemplate(
  templateId: CanvasTemplateId,
  dataset: Dataset,
): CanvasPage[] {
  if (templateId === 'blank') {
    return [
      {
        id: createStableId('page'),
        name: 'Головна сторінка',
        viewport: { x: 0, y: 0, zoom: 1 },
        elements: [],
      },
    ];
  }

  const { numericCols, dateCol, categoryCol } = findFirstColumns(dataset);
  const primaryNum = numericCols[0] ?? null;
  const secondaryNum = numericCols[1] ?? null;
  const allColIds = dataset.columns.map((c) => c.id);

  if (templateId === 'overview') {
    const elements: CanvasElement[] = [
      {
        id: createStableId('el'),
        type: 'note',
        position: { x: 40, y: 40 },
        size: { width: 260, height: 150 },
        config: {
          title: dataset.name,
          content: `Огляд побудовано на основі "${dataset.name}" (${dataset.columns.length} колонок, ${dataset.rows.length} рядків).`,
        },
      },
      {
        id: createStableId('el'),
        type: 'kpi',
        position: { x: 320, y: 40 },
        size: { width: 220, height: 150 },
        config: {
          title: primaryNum ? `${primaryNum.name} (сума)` : 'Кількість записів',
          valueFieldId: primaryNum ? primaryNum.id : (dataset.columns[0]?.id ?? null),
          aggregation: primaryNum ? 'sum' : 'count',
        },
      },
      {
        id: createStableId('el'),
        type: 'kpi',
        position: { x: 560, y: 40 },
        size: { width: 220, height: 150 },
        config: {
          title: secondaryNum
            ? `${secondaryNum.name} (середнє)`
            : primaryNum
              ? `${primaryNum.name} (середнє)`
              : 'Заповнених значень',
          valueFieldId: secondaryNum
            ? secondaryNum.id
            : primaryNum
              ? primaryNum.id
              : (dataset.columns[0]?.id ?? null),
          aggregation: secondaryNum || primaryNum ? 'avg' : 'count',
        },
      },
      {
        id: createStableId('el'),
        type: 'bar-chart',
        position: { x: 40, y: 215 },
        size: { width: 420, height: 270 },
        config: {
          title:
            categoryCol && primaryNum
              ? `${primaryNum.name} за ${categoryCol.name}`
              : 'Розподіл записів',
          xFieldId: categoryCol?.id ?? null,
          yFieldId: primaryNum?.id ?? categoryCol?.id ?? null,
          aggregation: primaryNum ? 'sum' : 'count',
        },
      },
      {
        id: createStableId('el'),
        type: 'table-view',
        position: { x: 480, y: 215 },
        size: { width: 440, height: 270 },
        config: {
          title: `Перегляд: ${dataset.name}`,
          columnIds: allColIds.slice(0, 6),
          maxRows: 30,
        },
      },
    ];

    return [
      {
        id: createStableId('page'),
        name: 'Огляд',
        viewport: { x: 0, y: 0, zoom: 1 },
        elements,
      },
    ];
  }

  // trends
  const xField = dateCol ?? categoryCol;
  const elements: CanvasElement[] = [
    {
      id: createStableId('el'),
      type: 'line-chart',
      position: { x: 40, y: 40 },
      size: { width: 520, height: 290 },
      config: {
        title:
          xField && primaryNum
            ? `Динаміка: ${primaryNum.name} за ${xField.name}`
            : 'Динаміка записів',
        xFieldId: xField?.id ?? null,
        yFieldId: primaryNum?.id ?? xField?.id ?? null,
        aggregation: primaryNum ? 'sum' : 'count',
      },
    },
    {
      id: createStableId('el'),
      type: 'kpi',
      position: { x: 580, y: 40 },
      size: { width: 240, height: 135 },
      config: {
        title: primaryNum ? `${primaryNum.name} (макс.)` : 'Записів у тренді',
        valueFieldId: primaryNum?.id ?? xField?.id ?? null,
        aggregation: primaryNum ? 'max' : 'count',
      },
    },
    {
      id: createStableId('el'),
      type: 'kpi',
      position: { x: 580, y: 195 },
      size: { width: 240, height: 135 },
      config: {
        title: primaryNum ? `${primaryNum.name} (мін.)` : 'Охоплення',
        valueFieldId: primaryNum?.id ?? xField?.id ?? null,
        aggregation: primaryNum ? 'min' : 'count',
      },
    },
    {
      id: createStableId('el'),
      type: 'table-view',
      position: { x: 40, y: 350 },
      size: { width: 780, height: 230 },
      config: {
        title: `Дані таблиці: ${dataset.name}`,
        columnIds: allColIds.slice(0, 6),
        maxRows: 30,
      },
    },
  ];

  return [
    {
      id: createStableId('page'),
      name: 'Тренди',
      viewport: { x: 0, y: 0, zoom: 1 },
      elements,
    },
  ];
}
