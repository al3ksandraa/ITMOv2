# Style Guide: Поиск и Фильтрация (Фича 1)

Следующие правила обязательны при работе над клиентским поиском и фильтром по приоритету.

1. Проверяй поведение через публичный интерфейс
- Пиши тесты на уровне UI/поведения (статическая проверка наличия #search и #priority-filter, e2e сценарии ввода/выбора) вместо тестов внутренних функций.

2. Фильтрация — на клиенте, без новых API
- Не добавляй серверные эндпоинты или параметры к существующим. Работай с уже загруженным списком из GET /api/tasks.

3. Условия фильтрации и поиска
- Поиск по подстроке в title и description, регистронезависимо, без повторных запросов к API на каждый ввод. Значение поиска обрезай (trim). Приоритет фильтруется строго по значениям: all|low|normal|high.

4. Производительность и UX
- Не рефетчить список задач при каждом вводе. Обновляй DOM минимально: переотрисовывай список на основе состояния. Не блокируй ввод.

5. Совместимость и доступность
- Сохраняй селекторы #search и #priority-filter (они проверяются тестами). Не ломай существующие кнопки фильтров по статусу.

Пример (хороший):

```js
// В обработчиках:
el.search.addEventListener('input', () => {
  state.search = el.search.value.trim();
  render();
});

el.priorityFilter.addEventListener('change', () => {
  state.priority = el.priorityFilter.value; // one of all|low|normal|high
  render();
});

// В render():
let tasks = [...state.tasks];
if (state.search) {
  const q = state.search.toLowerCase();
  tasks = tasks.filter(t =>
    (t.title || '').toLowerCase().includes(q) ||
    (t.description || '').toLowerCase().includes(q)
  );
}
if (state.priority !== 'all') {
  tasks = tasks.filter(t => (t.priority || 'normal') === state.priority);
}
```

## Применение в коде

1) Проверяй поведение через публичный интерфейс
- Файл tests/check_ui_search_filter.py: проверяет наличие UI-элементов `#search` и `#priority-filter` в `public/index.html`.
- E2E через Playwright MCP: ввод текста в `#search`, выбор значения `#priority-filter`, подсчёт элементов `#task-list .task` без моков внутренних функций.

2) Фильтрация — на клиенте, без новых API
- Файл public/app.js, функция `fetchTasks()` (строки около 48–53): однократная загрузка списка через `GET /api/tasks`.
- Нет новых эндпоинтов на сервере: реализация выполнена целиком на клиенте в `render()`.

3) Условия фильтрации и поиска
- Файл public/app.js, обработчик ввода (строка около 176): `state.search = el.search.value.trim();` — обрезка пробелов.
- Файл public/app.js, поиск (строки около 60–65): `const q = state.search.toLowerCase();` и фильтр по `title/description` в нижнем регистре.
- Файл public/app.js, фильтр приоритета (строки около 66–68): сравнение строгим равенством с `state.priority` (одно из `all|low|normal|high`).

4) Производительность и UX
- Файл public/app.js: обработчики `input/change` вызывают только `render()` — без повторного `fetch` на каждый ввод; `fetchTasks()` вызывается один раз при инициализации (конец файла).
- Функция `render()` пересобирает список задач на основе состояния, без лишних сетевых операций.

5) Совместимость и доступность
- Файл public/index.html: присутствуют элементы `#search` и `#priority-filter` в отдельной панели управления.
- Файл tests/check_ui_search_filter.py: тест фиксирует обязательность этих селекторов.
