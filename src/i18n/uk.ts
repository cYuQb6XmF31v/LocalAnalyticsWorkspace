export const uk = {
  app: {
    name: 'Local Analytics Workspace',
    stageBadge: 'Етап 1 · Каркас',
    localOnlyNotice: 'Локально в браузері',
    projectPlaceholder: 'Новий проєкт',
  },
  header: {
    toggleNav: 'Перемкнути панель навігації',
    toggleSourceData: 'Перемкнути панель Source Data',
    importSoon: 'Імпорт TXT',
    exportSoon: 'Експорт TXT',
    helpSoon: 'Довідка',
    plannedHint: 'Функція буде реалізована на наступних етапах',
  },
  tabs: {
    navigator: 'Навігація',
    canvas: 'Полотно',
    sourceData: 'Source Data',
  },
  navigator: {
    title: 'Структура проєкту',
    collapse: 'Згорнути панель навігації',
    sampleProject: 'Новий проєкт',
    samplePage: 'Головна сторінка',
    placeholderTitle: 'Дерево проєкту',
    placeholderText:
      'Тут відображатимуться сторінки Canvas, їхні елементи та швидкий перехід до довідки.',
  },
  canvas: {
    title: 'Робоче полотно (Canvas)',
    toolbarPlaceholder: 'Панель елементів Canvas з’явиться на Етапі 5',
    placeholderTitle: 'Вільне робоче полотно',
    placeholderText:
      'Центральна область для розміщення нотаток, KPI-карток, графіків і табличних представлень, прив’язаних до Source Data.',
    hint: 'Всі візуалізації будуватимуться виключно на основі правої панелі даних.',
  },
  sourceData: {
    title: 'Source Data',
    badgePrimary: 'Первинне джерело',
    collapse: 'Згорнути панель Source Data',
    expand: 'Відкрити Source Data',
    resizeHandle: 'Змінити ширину панелі Source Data',
    statsPlaceholder: '0 колонок · 0 рядків',
    placeholderTitle: 'Первинна таблиця даних',
    placeholderText:
      'Редагована таблиця у стилі Geometry Spreadsheet з динамічними колонками, типами та інлайн-редагуванням буде додана на наступних етапах.',
    hint: 'Панель можна звужувати, розширювати або згортати.',
  },
} as const;
