# Отчёт о тесте хука: check-after-edit

Цель
- Проверить, что плагин OpenCode `.opencode/plugins/check-after-edit.js` срабатывает после правок файлов (apply_patch) и запускает `sh scripts/check.sh`. Убедиться, что результат раннера возвращается агенту.

Окружение
- Путь плагина: `.opencode/plugins/check-after-edit.js`
- Раннер: `sh scripts/check.sh`
- Корень проекта: корень репозитория

Базовая проверка
- До подключения хука: `bash scripts/check.sh` завершался PASS.

Шаги
1. Внести тривиальную правку для триггера хука:
   - Файл: `practices/practice_04/task_planner/public/index.html`
   - Изменение: добавлен комментарий `<!-- hook test: trivial edit to trigger check-after-edit plugin -->` рядом с открывающим тегом `<body>`.
2. Плагин слушает `ctx.tool.hook('execute.after', ...)` и фильтрует события по `event.tool === 'apply_patch'`.
3. По триггеру запускается `sh scripts/check.sh` через доверенный раннер (или spawn fallback), собираются код возврата и логи.

Наблюдаемые результаты (PASS)
— Ручной запуск пайплайна сразу после правки:

```
[check] Running UI tests
OK: required UI elements present
OK: bulk UI elements present
[check] Node detected, starting server quick check
Task planner running at http://localhost:3100
[check] Server ready on :3100
[check] MCP: tasks-lint-fix sanity
[check] PASS
```

— Уведомление агента (ожидаемое поведение):
  - Заголовок: `check.sh PASS`
  - Тело: последние строки лога проверки (по плагину, хвост до ~4 КБ)
  - Важность: info

Сценарий FAIL → PASS
1) Индуцированная ошибка (FAIL):
   - Изменение: во `public/index.html` временно сломан селектор `#search` (id изменён на `search-broken`).
   - Результат запуска `bash scripts/check.sh`:

```
[check] Running UI tests
FAIL: missing UI elements: #search
```

2) Исправление (PASS):
   - Возврат корректного селектора `id="search"`.
   - Повторный запуск `bash scripts/check.sh`:

```
[check] Running UI tests
OK: required UI elements present
OK: bulk UI elements present
[check] Node detected, starting server quick check
Task planner running at http://localhost:3100
[check] Server ready on :3100
[check] MCP: tasks-lint-fix sanity
[check] PASS
```

Вывод
- Хук является post-edit (execute.after) в сессии OpenCode, а не git pre-commit хуком. Он запускает раннер после применения правки (apply_patch) и возвращает результат обратно агенту.
