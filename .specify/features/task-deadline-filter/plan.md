# План реализации: task-deadline-filter

Источник: ui-spec.md, logic-spec.md, contracts/deadline-filter.md. Проект: Node.js, статические HTML/CSS/JS. Публичный API и модель Task не меняем; новый HTTP API не нужен.

## Цели и ограничения
- Реализовать фильтр по сроку на клиенте: селект `#deadline-filter` (all|overdue|today|no-deadline), пустая выдача `#empty-state`.
- Сохранить: публичный API, формат Task, runner, отсутствие новых зависимостей в рантайме сервиса. Playwright используется только для разработки и проверок.
- Фильтры = логическое И; overdue исключает выполненные; today по локальной TZ [startOfToday; startOfTomorrow).
- Сброс: `search = ''`; приоритет/статус/срок → `all`; сортировка сохраняется; без доп. API.
- Пересчёт now на каждую перерисовку; без таймера.

## Изменения в проекте
1) public/index.html
- В панель фильтров добавить:
  - Связанный label «Срок», в который вложен select, как у остальных фильтров.
  - `<select id="deadline-filter">`
    - `<option value="all" selected>Все</option>`
    - `<option value="overdue">Просроченные</option>`
    - `<option value="today">Сегодня</option>`
    - `<option value="no-deadline">Без дедлайна</option>`
- После `<ul id="task-list">` добавить `<div id="empty-state" role="status" hidden>Нет задач по выбранным критериям</div>`.

2) public/app.js
- Состояние:
  - `state.deadline = 'all'` (по умолчанию). Использовать `state.filter` для статуса.
- Элементы:
  - `deadlineFilter = document.getElementById('deadline-filter')`
  - `emptyState = document.getElementById('empty-state')`
- Обработчики:
  - `deadlineFilter.addEventListener('change', ...)` → `state.deadline = value; render()`.
  - В `reset-filters` дополнительно: `state.deadline='all'`, `deadlineFilter.value='all'`.
- Рендер:
  - Вычислять `now = new Date()` один раз в начале.
  - Применять фильтры в порядке: статус (`state.filter`) → поиск → приоритет → дедлайн.
  - Дедлайн-предикаты: overdue исключает `t.done`; today — `[startOfToday; startOfTomorrow)`; no-deadline — `deadline === null`.
  - Сортировку оставляем как есть; относительный порядок не нарушаем.
  - Пустая выдача: при пустом результате и успешной загрузке показывать `emptyState`, иначе скрывать.

3) public/filter.js (новый модуль для тестов логики)
- Экспортировать чистые функции без DOM:
  - `boundariesOfToday(now)` → `[startOfToday, startOfTomorrow]`
  - `includeByDeadline(task, mode, now)` → boolean
  - `filterTasks(tasks, state, now)` → применяет поиск/приоритет/статус/дедлайн по логике
- Подключение в тестах через `require`.
- Только три функции фильтрации являются чистыми: без DOM, window и сети. Отдельный адаптер экспорта публикует их в `window.TaskFilter` для браузера и `module.exports` для Node.

4) Без изменений на сервере (server.js)
- API и формат Task сохраняются.

## Тестирование
1) Unit (node:test) — tests/task_deadline_filter.test.cjs
- today границы: включение начала дня и исключение начала следующего.
- overdue: строго `< now`, исключает выполненные.
- no-deadline: только `deadline === null`.
- Пересечение today/overdue для невыполнённых «сегодня и в прошлом».
- Комбинации с поиском/приоритетом/статусом: логическое И, корректные итоги.
- Невалидный ненулевой deadline: не падаем; не попадает в today/overdue; не считается no-deadline; `all` не исключает.

2) Сквозные (Playwright, прямой запуск библиотеки)
- Наличие/подписи опций `#deadline-filter`.
- Переключение режимов меняет список ожидаемо.
- Overdue не показывает выполненные.
- Today включает задачи в локальных границах.
- No-deadline показывает только без дедлайна.
- Пустая выдача появляется/скрывается корректно.
- Сброс очищает поиск, возвращает приоритет/статус/срок в `all`, сортировку сохраняет, без лишних API.
- Клавиатура и доступное имя: переход Tab с приоритета на срок, смена режима стрелками/Home/End с проверкой выдачи и сохранения фокуса, переход к сбросу и обратно. Сценарий `16-keyboard-filter`.

## Порядок работ
1. Сначала написать проверки node:test (tests/task_deadline_filter.test.cjs), наблюдать ожидаемое падение, затем реализовать public/filter.js.
2. Добавить контрол и пустое состояние в index.html.
3. Интегрировать фильтрацию и пустую выдачу в app.js.
4. Описать и выполнить сквозные сценарии Playwright (`node tests/task_deadline_filter.e2e.cjs`). MCP-подключение не является обязательным транспортом проверки.
5. Прогнать `sh scripts/check.sh`.

## Риски и смягчение
- TZ-границы и переходы: покрыть unit-тестами граничные времена.
- Регрессии поиска/приоритета/статуса: уважать существующие селекторы и порядок фильтров.
- Пустая выдача vs ошибка загрузки: показывать сообщение только после успешной загрузки.
