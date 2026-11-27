import './HelpPage.css';

interface HelpPageProps {
  onBackToWorkspace: () => void;
}

const DATASET_TXT_EXAMPLE = `# Dataset: Sales
# Columns: date:date;product:text;category:text;quantity:number;amount:number
2026-01-01;Laptop;Electronics;2;40000
2026-01-02;Monitor;Electronics;5;25000
2026-01-03;"USB-C Hub; 6-in-1";Accessories;10;8000`;

const PROJECT_TXT_EXAMPLE = `# LOCAL-ANALYTICS-PROJECT
# Format-Version: 2
# Project-Name: Sales Workspace

[DATASET id="main"]
# Name: Sales
# Columns: date:date;product:text;amount:number;vat:number
# Column-Ids: date;product;amount;vat
# Formulas-JSON: {"vat":"[amount]*0.2"}
2026-01-01;Laptop;40000;
[/DATASET]

[CANVAS id="overview"]
# Name: Огляд
# Viewport: x=0;y=0;zoom=1
[ITEM id="kpi-1" type="kpi"]
# Position: x=80;y=80
# Size: width=260;height=140
# Config-JSON: {"title":"Сума","valueFieldId":"amount","aggregation":"sum"}
[/ITEM]
[/CANVAS]`;

const SECTIONS = [
  { id: 'doc-model', label: 'Архітектура даних' },
  { id: 'doc-tables', label: 'Таблиці, fx та Join' },
  { id: 'doc-canvas', label: 'Canvas та віджети' },
  { id: 'doc-graph', label: 'Граф зв’язків' },
  { id: 'doc-txt', label: 'Специфікація TXT' },
  { id: 'doc-keys', label: 'Клавіші та зберігання' },
];

const HOTKEYS: Array<[string, string]> = [
  ['N / K / C', 'Створити нотатку / KPI / стовпчиковий графік'],
  ['Ctrl + D', 'Дублювати виділені елементи'],
  ['Ctrl + A', 'Виділити всі елементи на поточному аркуші'],
  ['Ctrl + Z', 'Скасувати останню дію (Undo)'],
  ['Del / Backspace', 'Видалити вибрані елементи'],
  ['G', 'Увімкнути або вимкнути прив’язку до сітки'],
  ['F / 0', 'Вмістити аркуш у вікно / скинути масштаб на 100%'],
  ['Shift + G', 'Перемкнутися між Canvas та Графом зв’язків'],
  ['Esc', 'Вийти з Графу або закрити контекстне меню'],
  ['?', 'Показати / приховати підказку клавіш на Canvas'],
  ['Ctrl + S', 'Зберегти проєкт у TXT (прямий запис або завантаження)'],
  ['Коліщатко миші', 'Панорамування в Графі зв’язків (затиснувши)'],
];

function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function HelpPage({ onBackToWorkspace }: HelpPageProps) {
  return (
    <div className="help-page">
      <div className="help-doc">
        <aside className="help-rail" aria-label="Навігація по довідці">
          <button
            type="button"
            className="btn btn--primary help-rail-back"
            onClick={onBackToWorkspace}
          >
            Назад до Workspace
          </button>

          <div className="help-rail-group">
            <span className="help-rail-title">Зміст</span>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                className="help-rail-link"
                onClick={() => jumpTo(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="help-rail-meta">
            Формат TXT: v1 / v2
            <br />
            Кодування: UTF-8 (;)
            <br />
            Обробка: 100% клієнт
          </div>
        </aside>

        <main className="help-main">
          <header className="help-hero">
            <div>
              <h1 className="help-h1">Довідник користувача та специфікація TXT</h1>
              <p className="help-lead">
                Локальний аналітичний простір поєднує таблицю первинних даних у стилі Houdini
                Geometry Spreadsheet, вільний багатовіконний Canvas із графіками й KPI та
                текстовий файл проєкту без бекенда і серверів.
              </p>
            </div>
            <div className="help-facts">
              <span><b>Джерело правди:</b> Source Data (праворуч)</span>
              <span><b>Сесія вкладки:</b> автокеш у sessionStorage</span>
              <span><b>Довгостроково:</b> експорт у .txt файл</span>
              <span><b>Приватність:</b> жодних мережевих запитів</span>
            </div>
          </header>

          {/* 1. Workspace architecture */}
          <section id="doc-model" className="help-band help-band-split">
            <div>
              <h2 className="help-h2">Як влаштований простір</h2>
              <p className="help-prose">
                Уся аналітика будується від первинної таблиці <strong>Source Data</strong>. Коли ви
                редагуєте клітинку, додаєте колонку або змінюєте формулу, усі KPI, діаграми, Pivot
                і Kanban-дошки на всіх аркушах Canvas перераховуються миттєво.
              </p>
              <p className="help-prose">
                Важливо розрізняти <strong>Source Data</strong> (редактор) і елемент{' '}
                <strong>Таблиця на Canvas</strong> (налаштовуваний вигляд лише для перегляду).
                Натискання на елемент у Навігаторі або на Canvas синхронно виділяє його та відкриває
                параметри (авто-відкриття можна вимкнути у тулбарі).
              </p>
            </div>

            <div className="help-mockup" aria-label="Схема робочого простору">
              <div className="help-mock-col help-mock-col--nav">
                <span className="help-mock-cap">Навігатор</span>
                <div className="help-mock-tree-item help-mock-tree-item--active">Огляд</div>
                <div className="help-mock-tree-item">· KPI Виторг</div>
                <div className="help-mock-tree-item">· Графік</div>
                <div className="help-mock-tree-item">Деталі (Canvas 2)</div>
              </div>
              <div className="help-mock-col help-mock-canvas">
                <div className="help-mock-widget">
                  <span className="help-mock-cap">KPI · SUM(amount)</span>
                  <div className="help-mock-kpi-num">128 400</div>
                </div>
                <div className="help-mock-widget">
                  <span className="help-mock-cap">Bar · За категорією</span>
                  <div className="help-mock-bars">
                    <span style={{ height: '48%' }} />
                    <span style={{ height: '92%', background: '#38bdf8' }} />
                    <span style={{ height: '66%', background: '#34d399' }} />
                    <span style={{ height: '34%', background: '#fbbf24' }} />
                  </div>
                </div>
              </div>
              <div className="help-mock-col help-mock-col--src">
                <span className="help-mock-cap">Source Data (Primary)</span>
                <table className="help-mock-table">
                  <thead>
                    <tr>
                      <th>date</th>
                      <th>product</th>
                      <th>amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>2026-01-01</td>
                      <td>Laptop</td>
                      <td>40000</td>
                    </tr>
                    <tr>
                      <td>2026-01-02</td>
                      <td>Monitor</td>
                      <td>25000</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* 2. Tables, formulas, Joins */}
          <section id="doc-tables" className="help-band">
            <div className="help-band-split">
              <div>
                <h2 className="help-h2">Таблиці, формули та Join</h2>
                <p className="help-prose">
                  Починайте з порожньої таблиці або імпортуйте <code>.txt</code>. Ширина колонок
                  змінюється перетягуванням межі заголовка, перейменування зберігає прив’язки за
                  стабільним <code>id</code>, а видалення зв’язаної колонки попереджає про залежні
                  графіки.
                </p>
                <ul className="help-list">
                  <li>
                    <strong>Формули (fx):</strong> обчислюються безпечним парсером без{' '}
                    <code>eval()</code>, наприклад <code>[quantity] * [price]</code> або{' '}
                    <code>IF([qty] &gt; 5, 1, 0)</code>.
                  </li>
                  <li>
                    <strong>Календар записів:</strong> підраховує кількість рядків за обраною
                    date-колонкою з перемикачем років (не створює фіктивної активності).
                  </li>
                  <li>
                    <strong>Кілька таблиць (+ Таблиця / +TXT):</strong> додаткові довідники можна
                    поєднувати через менеджер <strong>Joins</strong>.
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="help-h3" style={{ marginTop: 0 }}>
                  Доступні режими Join
                </h3>
                <div className="help-join-strip">
                  <div className="help-join-item">
                    <strong>LEFT JOIN</strong>
                    <span>Усі рядки лівої таблиці + збіги з правої (якщо пари немає — null).</span>
                  </div>
                  <div className="help-join-item">
                    <strong>INNER JOIN</strong>
                    <span>Лише рядки, для яких знайдено ключ в обох таблицях.</span>
                  </div>
                  <div className="help-join-item">
                    <strong>RIGHT JOIN</strong>
                    <span>Усі рядки правої таблиці + знайдені записи з лівої.</span>
                  </div>
                  <div className="help-join-item">
                    <strong>FULL OUTER JOIN</strong>
                    <span>Об’єднання всіх записів з лівої та правої таблиць.</span>
                  </div>
                  <div className="help-join-item">
                    <strong>LEFT ANTI JOIN</strong>
                    <span>Рядки лівої таблиці, що НЕ мають пари праворуч (аномалії/нові SKU).</span>
                  </div>
                  <div className="help-join-item">
                    <strong>RIGHT ANTI JOIN</strong>
                    <span>Рядки правої таблиці без пари ліворуч (напр. непродані залишки).</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 3. Canvas & Visualizations */}
          <section id="doc-canvas" className="help-band help-band-split">
            <div>
              <h2 className="help-h2">Canvas, панелі та візуалізації</h2>
              <p className="help-prose">
                На полотні підтримується панорамування, масштабування, прив’язка до сітки, шаблони
                (зокрема збереження власних) і <strong>одночасне відкриття 2–4 панелей Canvas</strong>{' '}
                для роботи з різними аркушами поруч.
              </p>
              <p className="help-prose">
                Для діаграм налаштовуються агрегації (<code>sum</code>, <code>avg</code>,{' '}
                <code>count</code>, <code>min</code>, <code>max</code>), багаторазові фільтри,
                сортування, Топ-N, лінія середнього <code>μ</code>, накопичувальний підсумок,
                позиція легенди (зверху/знизу/ліворуч/праворуч/кути/центр), позиція та розмір чисел
                на графіку, а для таблиць на Canvas — розмір шрифту.
              </p>
            </div>

            <table className="help-ref-table" aria-label="Типи елементів Canvas">
              <thead>
                <tr>
                  <th>Тип елемента</th>
                  <th>Призначення та ключові параметри</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>note</td>
                  <td>Текстові нотатки та пояснення з внутрішніми посиланнями на інші аркуші.</td>
                </tr>
                <tr>
                  <td>kpi</td>
                  <td>Ключова метрика (sum/avg/count/min/max) з опціональним спарклайном.</td>
                </tr>
                <tr>
                  <td>line / bar / stacked-bar</td>
                  <td>Тренди та категорійні порівняння; гнучка позиція легенди й чисел.</td>
                </tr>
                <tr>
                  <td>histogram / pie / scatter</td>
                  <td>Розподіли (кількість кошиків), частки (Pie/Donut) і кореляції X vs Y.</td>
                </tr>
                <tr>
                  <td>table-view / pivot-table</td>
                  <td>Таблиця перегляду або зведена матриця з регулюванням розміру шрифту.</td>
                </tr>
                <tr>
                  <td>kanban</td>
                  <td>Групування записів за статусом із перетягуванням карток між колонками.</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* 4. Graph View */}
          <section id="doc-graph" className="help-band help-band-split">
            <div>
              <h2 className="help-h2">Граф зв’язків (Shift + G)</h2>
              <p className="help-prose">
                Показує структуру проєкту (сторінки, елементи, внутрішні переходи) та потік даних
                Data Lineage (таблиці, формули, Joins, фільтри). Кнопка <strong>2 панелі</strong>{' '}
                відкриває два режими одночасно («Вільний граф», «Орбіта», «Дерево») з миттєвим
                синхронним підсвічуванням.
              </p>
            </div>

            <table className="help-ref-table" aria-label="Керування у Графі">
              <thead>
                <tr>
                  <th>Можливість</th>
                  <th>Як працює</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Панорамування</td>
                  <td>Перетягування ЛКМ по полотну або затиснутим коліщатком миші будь-де.</td>
                </tr>
                <tr>
                  <td>Чутливість курсора</td>
                  <td>100% — миттєво (0 мс); 1% — затримка 2.00 с; 0% — ігнорувати наведення.</td>
                </tr>
                <tr>
                  <td>Зона та приліпання</td>
                  <td>Регульований радіус захоплення зв’язків (px) і магнітне приліпання до лінії.</td>
                </tr>
                <tr>
                  <td>По рівнях об’єктів</td>
                  <td>Окремі повзунки чутливості для проєкту, аркушів, елементів, таблиць, fx, Join.</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* 5. TXT Spec */}
          <section id="doc-txt" className="help-band">
            <h2 className="help-h2">Специфікація формату TXT</h2>
            <p className="help-prose">
              Файли зберігаються в <code>UTF-8</code> із роздільником <code>;</code>. Типи
              колонок: <code>text</code>, <code>number</code> (десятковий роздільник — крапка),{' '}
              <code>date</code> (<code>YYYY-MM-DD</code>), <code>boolean</code> (
              <code>true</code>/<code>false</code>). Значення з <code>;</code> або лапками беруться
              в подвійні лапки, внутрішні лапки подвоюються (<code>""</code>). Порожній сегмент
              між <code>;</code> означає порожню клітинку.
            </p>
            <p className="help-prose">
              Під час імпорту парсер перевіряє кожен рядок і показує попередній перегляд із точними
              номерами рядків помилок: активний проєкт не змінюється до підтвердження. Імпорт лише
              таблиці відкриває вибір шаблону Canvas; імпорт повного проєкту відновлює всі дані,
              формули, Joins, фільтри та макети.
            </p>

            <div className="help-txt-cols">
              <div className="help-txt-block">
                <span className="help-txt-caption">Dataset-only TXT (імпорт таблиці)</span>
                <pre className="help-code">{DATASET_TXT_EXAMPLE}</pre>
              </div>
              <div className="help-txt-block">
                <span className="help-txt-caption">Повний проєкт (Format-Version: 1 / 2)</span>
                <pre className="help-code">{PROJECT_TXT_EXAMPLE}</pre>
              </div>
            </div>
          </section>

          {/* 6. Hotkeys & Storage */}
          <section id="doc-keys" className="help-band help-band-split">
            <div>
              <h2 className="help-h2">Збереження, сесія та гарячі клавіші</h2>
              <p className="help-prose">
                У межах відкритої вкладки зміни тимчасово кешуються в <code>sessionStorage</code>,
                щоб пережити випадкове перезавантаження. Якщо браузер обмежує сховище, застосунок
                зберігає роботу в пам’яті та попереджає про потребу експорту.
              </p>
              <p className="help-prose">
                Надійна довгострокова копія — це ваш файл <code>.txt</code>. Натискайте{' '}
                <code>Ctrl+S</code> або «Експорт TXT» перед закриттям вкладки. Жодні дані не
                відправляються на сторонні сервери.
              </p>
            </div>

            <div className="help-kbd-cols">
              {HOTKEYS.map(([key, desc]) => (
                <div key={key} className="help-kbd-row">
                  <span>{desc}</span>
                  <kbd className="help-kbd">{key}</kbd>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
