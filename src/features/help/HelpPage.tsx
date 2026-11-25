import { ArrowLeft, ShieldCheck } from 'lucide-react';
import './HelpPage.css';

interface HelpPageProps {
  onBackToWorkspace: () => void;
}

const DATASET_SAMPLE = `# Dataset: ExampleItems
# Columns: date:date;item:text;category:text;quantity:number;total:number;verified:boolean
2026-01-01;Item A;Group 1;2;120.5;true
2026-01-02;"Item; ""B""";Group 2;5;;false`;

const PROJECT_SAMPLE = `# LOCAL-ANALYTICS-PROJECT
# Format-Version: 1
# Project-Name: Sample Workspace

[DATASET id="ds_main"]
# Name: ExampleItems
# Columns: date:date;item:text;total:number
# Column-Ids: col_date;col_item;col_total
2026-01-01;Item A;120.5
[/DATASET]

[CANVAS id="page_overview"]
# Name: Огляд
# Viewport: x=0;y=0;zoom=1
[ITEM id="el_kpi_1" type="kpi"]
# Position: x=80;y=80
# Size: width=240;height=140
# Config-JSON: {"title":"Сума total","valueFieldId":"col_total","aggregation":"sum"}
[/ITEM]
[/CANVAS]`;

export function HelpPage({ onBackToWorkspace }: HelpPageProps) {
  return (
    <div className="help-page">
      <div className="help-container">
        <div className="help-topbar">
          <div>
            <h1 className="help-title">Довідка — Local Analytics Workspace</h1>
            <p className="placeholder-hint">
              Повністю локальний статичний застосунок для роботи з даними та візуалізації без сервера.
            </p>
          </div>
          <button type="button" className="btn btn--primary" onClick={onBackToWorkspace}>
            <ArrowLeft size={14} />
            <span>Повернутися до Canvas</span>
          </button>
        </div>

        <section className="help-section">
          <h2>1. Приватність і локальна робота</h2>
          <p>
            <ShieldCheck size={14} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
            Усі обчислення, парсинг TXT, редагування таблиці та побудова графіків відбуваються
            виключно у вашому браузері. Застосунок не використовує серверний API, базу даних,
            акаунти або телеметрію та не надсилає ваші дані на жодні сторонні сервери.
          </p>
        </section>

        <section className="help-section">
          <h2>2. Створення проєкту та редагування Source Data з нуля</h2>
          <ul>
            <li>
              <strong>Source Data (права панель)</strong> — єдине первинне джерело даних. Усі KPI,
              графіки та табличні представлення на Canvas будуються безпосередньо на її основі.
            </li>
            <li>
              Ви можете почати з порожньої таблиці без зовнішнього редактора: натисніть{' '}
              <code>+ Колонка</code>, вкажіть назву та тип, потім додавайте рядки кнопкою{' '}
              <code>+ Рядок</code> і редагуйте клітинки прямо в таблиці.
            </li>
            <li>
              Кожна колонка має стабільний внутрішній ID: перейменування або перестановка колонки
              стрілками не ламає графіки та KPI. Якщо видалити колонку, на яку посилається
              елемент Canvas, елемент покаже попередження і дозволить обрати нове поле.
            </li>
          </ul>
        </section>

        <section className="help-section">
          <h2>3. Відмінність між Source Data та елементом «Таблиця» на Canvas</h2>
          <p>
            Права панель <strong>Source Data</strong> — це основний редактор первинних даних.
            Елемент <strong>Таблиця</strong> на Canvas — це лише налаштовуване представлення для
            перегляду обраних колонок (read-only). Редагування в Source Data миттєво оновлює всі
            залежні KPI, графіки й табличні перегляди.
          </p>
        </section>

        <section className="help-section">
          <h2>4. Формат TXT (імпорт таблиці та повного проєкту)</h2>
          <ul>
            <li>Кодування: UTF-8, роздільник полів: крапка з комою (<code>;</code>).</li>
            <li>
              Підтримувані типи колонок у <code># Columns:</code>: <code>text</code> (за
              замовчуванням), <code>number</code>, <code>date</code>, <code>boolean</code>.
            </li>
            <li>
              Числа записуйте з крапкою (<code>120.5</code>), дати — у форматі ISO{' '}
              <code>YYYY-MM-DD</code>, логічні значення — <code>true</code> або <code>false</code>.
            </li>
            <li>
              Порожнє поле між роздільниками означає порожню клітинку. Якщо значення містить{' '}
              <code>;</code>, перенос рядка, лапки або починається з <code>#</code>, візьміть його
              у подвійні лапки, а внутрішні лапки подвоюйте (<code>&quot;&quot;</code>).
            </li>
            <li>
              Кожен рядок даних повинен мати точну кількість полів, оголошену в{' '}
              <code># Columns:</code>. Перед заміною даних застосунок показує прев’ю та перелік
              помилок із номерами рядків.
            </li>
          </ul>

          <p>
            <strong>Приклад файлу лише з таблицею (Dataset-only):</strong> після імпорту відкриється
            вибір шаблону Canvas.
          </p>
          <pre className="help-code">{DATASET_SAMPLE}</pre>

          <p>
            <strong>Приклад повного проєкту (Full-project, формат за замовчуванням при експорті):</strong>{' '}
            зберігає дані, сторінки Canvas, viewport, позиції, розміри та налаштування елементів.
          </p>
          <pre className="help-code">{PROJECT_SAMPLE}</pre>
        </section>

        <section className="help-section">
          <h2>5. Робота з Canvas і шаблонами</h2>
          <ul>
            <li>
              Кнопка <strong>Шаблони</strong> дозволяє швидко створити сторінки за універсальними
              макетами (<em>Порожнє полотно</em>, <em>Огляд</em>, <em>Тренди</em>) на основі ваших
              наявних колонок.
            </li>
            <li>
              Панель інструментів Canvas додає нотатки, KPI (<code>sum</code>, <code>avg</code>,{' '}
              <code>count</code>, <code>min</code>, <code>max</code>, опціональний sparkline),
              лінійні, стовпчикові, складені, кругові (pie/donut), точкові (scatter) графіки,
              гістограми, зведені таблиці (Pivot), інтерактивну Kanban-дошку та табличні
              представлення.
            </li>
            <li>
              Перетягуйте елементи за верхню шапку, змінюйте розмір за рамку виділення, додавайте
              внутрішні посилання на інші сторінки/елементи через іконку шестірні та досліджуйте
              структуру у <strong>Графі зв’язків</strong> або за датами у{' '}
              <strong>Календарі записів (Activity Heatmap)</strong>. Дерево проєкту зліва
              синхронізоване з виділенням на Canvas.
            </li>
          </ul>
        </section>

        <section className="help-section">
          <h2>6. Тимчасове відновлення сесії та експорт перед закриттям</h2>
          <p>
            Поточна робота автоматично кешується в <code>sessionStorage</code>, щоб не втратити
            дані при випадковому перезавантаженні тієї ж вкладки. Це тимчасове сховище: після
            закриття вкладки або перевищення ліміту пам’яті дані можуть зникнути. Надійна
            довготривала копія — це експортований <strong>TXT-файл проєкту</strong> (звертайте
            увагу на індикатор «Незбережені зміни» у верхній панелі).
          </p>
        </section>
      </div>
    </div>
  );
}
