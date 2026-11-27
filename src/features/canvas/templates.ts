import { createStableId } from '../../domain/id';
import type { CanvasElement, CanvasPage, Dataset } from '../../domain/models';

export type CanvasTemplateId =
  | 'blank'
  | 'overview'
  | 'trends'
  | 'categories'
  | 'operations'
  | 'distribution'
  | 'executive'
  | 'analytics_suite';

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
  {
    id: 'categories',
    title: 'Структура категорій (Breakdown)',
    description:
      'Кругова діаграма (Donut), складений графік та зведена таблиця для порівняння сегментів.',
  },
  {
    id: 'operations',
    title: 'Операційна дошка (Kanban + Зведена)',
    description:
      'Kanban-дошка групування за статусом/категорією, зведена матриця та перегляд таблиці.',
  },
  {
    id: 'distribution',
    title: 'Розподіл та кореляція (Stats)',
    description:
      'Гістограма частот, точкова діаграма (Scatter) та статистичні KPI (середнє і кількість).',
  },
  {
    id: 'executive',
    title: 'Мульти-сторінковий звіт (2 сторінки)',
    description:
      'Дві готові сторінки: "Загальний огляд" з KPI та графіками і "Детальний аналіз" зі зведеною таблицею.',
  },
  {
    id: 'analytics_suite',
    title: 'BI-комплекс (3 сторінки + контроль якості)',
    description:
      'Повний набір: «Зведення» з KPI, «Аналіз за категоріями» (Donut + Зведена) та «Контроль якості даних».',
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

  if (templateId === 'categories') {
    const secondCat =
      dataset.columns.find((c) => (c.type === 'text' || c.type === 'boolean') && c.id !== categoryCol?.id) ??
      categoryCol;
    const elements: CanvasElement[] = [
      {
        id: createStableId('el'),
        type: 'pie-chart',
        position: { x: 40, y: 40 },
        size: { width: 360, height: 280 },
        config: {
          title: categoryCol ? `Частка за ${categoryCol.name}` : 'Розподіл',
          categoryFieldId: categoryCol?.id ?? null,
          valueFieldId: primaryNum?.id ?? categoryCol?.id ?? null,
          aggregation: primaryNum ? 'sum' : 'count',
          isDonut: true,
        },
      },
      {
        id: createStableId('el'),
        type: 'stacked-bar',
        position: { x: 420, y: 40 },
        size: { width: 460, height: 280 },
        config: {
          title:
            categoryCol && secondCat
              ? `${categoryCol.name} × ${secondCat.name}`
              : 'Складений графік',
          xFieldId: categoryCol?.id ?? null,
          seriesFieldId: secondCat?.id ?? null,
          yFieldId: primaryNum?.id ?? categoryCol?.id ?? null,
          aggregation: primaryNum ? 'sum' : 'count',
        },
      },
      {
        id: createStableId('el'),
        type: 'pivot-table',
        position: { x: 40, y: 340 },
        size: { width: 840, height: 260 },
        config: {
          title: 'Зведена таблиця',
          rowFieldId: categoryCol?.id ?? null,
          colFieldId: secondCat && secondCat.id !== categoryCol?.id ? secondCat.id : null,
          valueFieldId: primaryNum?.id ?? categoryCol?.id ?? null,
          aggregation: primaryNum ? 'sum' : 'count',
        },
      },
    ];
    return [
      {
        id: createStableId('page'),
        name: 'Категорії',
        viewport: { x: 0, y: 0, zoom: 1 },
        elements,
      },
    ];
  }

  if (templateId === 'operations') {
    const secondCat =
      dataset.columns.find((c) => (c.type === 'text' || c.type === 'boolean') && c.id !== categoryCol?.id) ??
      categoryCol;
    const elements: CanvasElement[] = [
      {
        id: createStableId('el'),
        type: 'kanban',
        position: { x: 40, y: 40 },
        size: { width: 620, height: 340 },
        config: {
          title: categoryCol ? `Дошка: ${categoryCol.name}` : 'Kanban-дошка',
          groupByFieldId: categoryCol?.id ?? null,
          titleFieldId: secondCat?.id ?? null,
          detailFieldIds: primaryNum ? [primaryNum.id] : [],
        },
      },
      {
        id: createStableId('el'),
        type: 'kpi',
        position: { x: 680, y: 40 },
        size: { width: 220, height: 155 },
        config: {
          title: 'Всього записів',
          valueFieldId: dataset.columns[0]?.id ?? null,
          aggregation: 'count',
        },
      },
      {
        id: createStableId('el'),
        type: 'pivot-table',
        position: { x: 40, y: 400 },
        size: { width: 860, height: 250 },
        config: {
          title: 'Зведення по групах',
          rowFieldId: categoryCol?.id ?? null,
          colFieldId: null,
          valueFieldId: primaryNum?.id ?? categoryCol?.id ?? null,
          aggregation: primaryNum ? 'sum' : 'count',
        },
      },
    ];
    return [
      {
        id: createStableId('page'),
        name: 'Операції',
        viewport: { x: 0, y: 0, zoom: 1 },
        elements,
      },
    ];
  }

  if (templateId === 'distribution') {
    const elements: CanvasElement[] = [
      {
        id: createStableId('el'),
        type: 'histogram',
        position: { x: 40, y: 40 },
        size: { width: 420, height: 270 },
        config: {
          title: primaryNum ? `Розподіл: ${primaryNum.name}` : 'Гістограма',
          valueFieldId: primaryNum?.id ?? null,
          binCount: 8,
        },
      },
      {
        id: createStableId('el'),
        type: 'scatter',
        position: { x: 480, y: 40 },
        size: { width: 420, height: 270 },
        config: {
          title:
            primaryNum && secondaryNum
              ? `${primaryNum.name} vs ${secondaryNum.name}`
              : 'Точкова діаграма',
          xFieldId: primaryNum?.id ?? null,
          yFieldId: (secondaryNum ?? primaryNum)?.id ?? null,
          labelFieldId: categoryCol?.id ?? null,
        },
      },
      {
        id: createStableId('el'),
        type: 'kpi',
        position: { x: 40, y: 330 },
        size: { width: 260, height: 140 },
        config: {
          title: primaryNum ? `${primaryNum.name} (середнє)` : 'Кількість',
          valueFieldId: primaryNum?.id ?? dataset.columns[0]?.id ?? null,
          aggregation: primaryNum ? 'avg' : 'count',
        },
      },
      {
        id: createStableId('el'),
        type: 'kpi',
        position: { x: 320, y: 330 },
        size: { width: 260, height: 140 },
        config: {
          title: 'Записів у вибірці',
          valueFieldId: dataset.columns[0]?.id ?? null,
          aggregation: 'count',
        },
      },
    ];
    return [
      {
        id: createStableId('page'),
        name: 'Розподіл',
        viewport: { x: 0, y: 0, zoom: 1 },
        elements,
      },
    ];
  }

  if (templateId === 'executive') {
    const xField = dateCol ?? categoryCol;
    const secondCat =
      dataset.columns.find((c) => (c.type === 'text' || c.type === 'boolean') && c.id !== categoryCol?.id) ??
      categoryCol;
    return [
      {
        id: createStableId('page'),
        name: 'Загальний огляд',
        viewport: { x: 0, y: 0, zoom: 1 },
        elements: [
          {
            id: createStableId('el'),
            type: 'kpi',
            position: { x: 40, y: 40 },
            size: { width: 240, height: 145 },
            config: {
              title: primaryNum ? `${primaryNum.name} (сума)` : 'Всього записів',
              valueFieldId: primaryNum?.id ?? dataset.columns[0]?.id ?? null,
              aggregation: primaryNum ? 'sum' : 'count',
              showSparkline: true,
              sparklineOrderFieldId: dateCol?.id ?? null,
            },
          },
          {
            id: createStableId('el'),
            type: 'kpi',
            position: { x: 300, y: 40 },
            size: { width: 240, height: 145 },
            config: {
              title: secondaryNum ? `${secondaryNum.name} (сума)` : 'Кількість записів',
              valueFieldId: secondaryNum?.id ?? dataset.columns[0]?.id ?? null,
              aggregation: secondaryNum ? 'sum' : 'count',
            },
          },
          {
            id: createStableId('el'),
            type: 'line-chart',
            position: { x: 40, y: 205 },
            size: { width: 500, height: 270 },
            config: {
              title: xField && primaryNum ? `Динаміка: ${primaryNum.name}` : 'Тренд',
              xFieldId: xField?.id ?? null,
              yFieldId: primaryNum?.id ?? xField?.id ?? null,
              aggregation: primaryNum ? 'sum' : 'count',
            },
          },
          {
            id: createStableId('el'),
            type: 'pie-chart',
            position: { x: 560, y: 40 },
            size: { width: 340, height: 435 },
            config: {
              title: categoryCol ? `Частка за ${categoryCol.name}` : 'Структура',
              categoryFieldId: categoryCol?.id ?? null,
              valueFieldId: primaryNum?.id ?? categoryCol?.id ?? null,
              aggregation: primaryNum ? 'sum' : 'count',
              isDonut: true,
            },
          },
        ],
      },
      {
        id: createStableId('page'),
        name: 'Детальний аналіз',
        viewport: { x: 0, y: 0, zoom: 1 },
        elements: [
          {
            id: createStableId('el'),
            type: 'pivot-table',
            position: { x: 40, y: 40 },
            size: { width: 860, height: 260 },
            config: {
              title: 'Зведена таблиця',
              rowFieldId: categoryCol?.id ?? null,
              colFieldId: secondCat && secondCat.id !== categoryCol?.id ? secondCat.id : null,
              valueFieldId: primaryNum?.id ?? categoryCol?.id ?? null,
              aggregation: primaryNum ? 'sum' : 'count',
            },
          },
          {
            id: createStableId('el'),
            type: 'table-view',
            position: { x: 40, y: 320 },
            size: { width: 860, height: 260 },
            config: {
              title: `Первинні записи: ${dataset.name}`,
              columnIds: allColIds.slice(0, 7),
              maxRows: 50,
            },
          },
        ],
      },
    ];
  }

  if (templateId === 'analytics_suite') {
    const overviewPage = buildPagesFromTemplate('overview', dataset)[0];
    overviewPage.name = 'Зведення';
    const categoriesPage = buildPagesFromTemplate('categories', dataset)[0];
    categoriesPage.name = 'Аналіз категорій';
    const qualityPage: CanvasPage = {
      id: createStableId('page'),
      name: 'Контроль якості даних',
      viewport: { x: 0, y: 0, zoom: 1 },
      elements: [
        {
          id: createStableId('el'),
          type: 'note',
          position: { x: 40, y: 40 },
          size: { width: 320, height: 150 },
          config: {
            title: 'Контроль якості Source Data',
            content: `Таблиця "${dataset.name}": ${dataset.columns.length} колонок, ${dataset.rows.length} записів. Перевірте розподіл значень та повноту таблиці нижче.`,
          },
        },
        {
          id: createStableId('el'),
          type: 'kpi',
          position: { x: 380, y: 40 },
          size: { width: 220, height: 150 },
          config: {
            title: 'Усього записів',
            valueFieldId: dataset.columns[0]?.id ?? null,
            aggregation: 'count',
          },
        },
        {
          id: createStableId('el'),
          type: 'histogram',
          position: { x: 40, y: 215 },
          size: { width: 420, height: 270 },
          config: {
            title: primaryNum ? `Розподіл: ${primaryNum.name}` : 'Частотний розподіл',
            valueFieldId: primaryNum?.id ?? null,
            binCount: 8,
          },
        },
        {
          id: createStableId('el'),
          type: 'table-view',
          position: { x: 480, y: 215 },
          size: { width: 460, height: 270 },
          config: {
            title: 'Повний зріз рядків',
            columnIds: allColIds.slice(0, 8),
            maxRows: 50,
          },
        },
      ],
    };
    return [overviewPage, categoriesPage, qualityPage];
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
