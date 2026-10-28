# Сквозная проверка task-deadline-filter

Запуск: 2026-10-27T13:08:20.670Z. Команда: `node tests/task_deadline_filter.e2e.cjs`.
Окружение: win32, Node v24.21.0, Playwright 1.64.1, Chrome/Chromium 156.0.8078.48.
Фиксированное время: 2026-10-26T09:00:00.000Z; зоны Europe/Moscow и America/New_York.

Проверка выполняется библиотекой Playwright напрямую, без MCP. Реальные HTTP API и браузер; временная копия server.js/public, отдельный data/tasks.json. Пользовательские данные не изменяются.

Побайтовое сравнение пользовательского data/tasks.json до и после проверки: PASS.

| Сценарий | Ожидание | Результат и факты |
|---|---|---|
| 01-initial-load (Europe/Moscow) | Real page loads tasks without JavaScript errors; all four options are available. | PASS: {"titles":["tomorrow","yesterday-active","yesterday-done","today-future","today-done","today-past","without-deadline","start-of-day","end-of-day","exact-now"],"emptyStateVisible":false,"apiRequests":[]} |
| 02-overdue (Europe/Moscow) | Only unfinished tasks strictly before now, including earlier today; exact-now excluded. | PASS: {"titles":["yesterday-active","today-past","start-of-day"],"apiRequests":[]} |
| 03-today-moscow (Europe/Moscow) | Local start inclusive, next midnight exclusive; completed tasks included. | PASS: {"titles":["today-future","today-done","today-past","start-of-day","end-of-day","exact-now"],"apiRequests":[],"screenshot":"03-today-moscow.png"} |
| 04-without-deadline (Europe/Moscow) | Only deadline === null; all restores original order. | PASS: {"titles":["tomorrow","yesterday-active","yesterday-done","today-future","today-done","today-past","without-deadline","start-of-day","end-of-day","exact-now"],"apiRequests":[]} |
| 05-filter-intersections (Europe/Moscow) | Deadline AND description search AND priority AND status. | PASS: {"titles":["today-done"],"apiRequests":[]} |
| 06-empty-result (Europe/Moscow) | Done AND overdue is empty; message shown after list and hidden when results return. | PASS: {"titles":[],"apiRequests":[]} |
| 07-reset-and-sort (Europe/Moscow) | Reset restores all filters, clears selection, preserves sorted full list, no API calls. | PASS: {"titles":["start-of-day","today-done","today-past","exact-now","today-future","end-of-day"],"apiRequests":[],"screenshot":"07-reset-and-sort.png"} |
| 08-today-new-york (America/New_York) | Same UTC fixtures classify by New York local day, not UTC or Moscow. | PASS: {"titles":["tomorrow","today-future","today-done","today-past","end-of-day","exact-now"],"apiRequests":[],"screenshot":"08-today-new-york.png"} |
| 09-clock-refresh (Europe/Moscow) | Each render uses a fresh now; an exact-now task becomes overdue after time advances. | PASS: {"titles":["tomorrow"],"apiRequests":[]} |
| 10-invalid-deadline (Europe/Moscow) | Invalid non-null deadline matches all, but neither today, overdue nor no-deadline. | PASS: {"invalidExcludedFrom":["today","overdue","no-deadline"],"apiRequests":["GET /api/tasks"]} |
| 11-crud-local-time (Europe/Moscow) | UI create/edit/delete preserves entered local deadline as the correct UTC instant. | PASS: {"createdDeadline":"2026-10-26T09:30:00.000Z","editedDeadline":"2026-10-26T10:45:00.000Z","deleted":true,"apiRequests":["POST /api/tasks","PUT /api/tasks/1793106522636-p24if2","DELETE /api/tasks/1793106522636-p24if2"]} |
| 12-complete-and-bulk (Europe/Moscow) | Completion rerenders overdue; bulk completion and deletion use the existing sequential API. | PASS: {"singleComplete":true,"bulkComplete":2,"bulkDelete":2,"apiRequests":["GET /api/tasks","PUT /api/tasks/1793106524218-elvfl0","PUT /api/tasks/1793106524218-elvfl0","PUT /api/tasks/1793106524223-jwbtqw","DELETE /api/tasks/1793106524218-elvfl0","DELETE /api/tasks/1793106524223-jwbtqw"]} |
| 13-loading-state (Europe/Moscow) | Empty message stays hidden during initial loading and user filter changes. | PASS: {"hiddenWhileLoading":true,"apiRequests":["GET /api/tasks"]} |
| 14-load-error (Europe/Moscow) | Failed initial GET is not displayed as an empty successful result, including after filter/reset. | PASS: {"hiddenAfterLoadFailure":true,"apiRequests":["GET /api/tasks"]} |
| 16-keyboard-filter (Europe/Moscow) | The labelled deadline control is reachable by Tab; arrow/Home/End keys filter tasks without losing focus or calling the API. | PASS: {"titles":["tomorrow","yesterday-active","yesterday-done","today-future","today-done","today-past","without-deadline","start-of-day","end-of-day","exact-now"],"accessibleName":"Срок","keyboardModes":["overdue","today","no-deadline","all"],"focusPreserved":true,"tabToResetAndBack":true,"apiRequests":[],"screenshot":"16-keyboard-filter.png"} |
| 15-empty-storage (Europe/Moscow) | An empty successful API response displays the empty message; repeated reset remains safe. | PASS: {"titles":[],"successfulEmptyLoad":true,"apiRequests":[]} |

Итог: 16/16 PASS.

Доказательства: [машиночитаемый отчёт](../../../practices/practice_05/evidence/deadline-filter/results.json), снимки экрана в той же папке.
Unit-тесты и scripts/check.sh запускаются отдельно; этот отчёт не утверждает их успешность.
