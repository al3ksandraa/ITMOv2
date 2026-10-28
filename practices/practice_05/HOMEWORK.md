# ДЗ 5: фильтр задач по сроку

Фича добавлена в планировщик из практики 4 через Spec Kit. UI и клиентская логика согласованы в двух отдельных спецификациях до реализации. Продолжение реализации и фактических проверок после OpenCode выполнено 27.10.2026.

**Статус: реализация и результаты проверок приняты пользователем 27.10.2026.** [Приёмка](../../.specify/features/task-deadline-filter/acceptance.md), [итог SDD](../../.specify/features/task-deadline-filter/sdd-finalization.md).

## Что сдавать 

| Критерий | Баллы | Материал | Состояние комплекта |
|---|---:|---|---|
| Другой SDD-фреймворк и сравнение с OpenSpec | 2 | [Артефакты Spec Kit](../../.specify/features/task-deadline-filter/), сравнение ниже, [итог analyze/converge](../../.specify/features/task-deadline-filter/sdd-finalization.md) | Материалы готовы |
| Две согласованные спецификации до кода | 2 | [UI](../../.specify/features/task-deadline-filter/ui-spec.md), [логика](../../.specify/features/task-deadline-filter/logic-spec.md), [до](../../.specify/features/task-deadline-filter/snapshots/before/), [первые принятые версии](../../.specify/features/task-deadline-filter/snapshots/approved/), [согласование](../../.specify/features/task-deadline-filter/agreement.md), [общий контракт](../../.specify/features/task-deadline-filter/contracts/deadline-filter.md) | Материалы готовы; исторические версии сохранены |
| Работающая реализация и сквозные проверки | 5 | [Задачи](../../.specify/features/task-deadline-filter/tasks.md), [проверка браузером](../../.specify/features/task-deadline-filter/verification.md), [доказательства](evidence/deadline-filter/), [приёмка](../../.specify/features/task-deadline-filter/acceptance.md) | Код и проверки готовы, пользователь принял результат |
| Рефлексия | 1 | Инженерные выводы ниже и существующая [личная рефлексия](reflection.md) | Личную часть о Spec Kit ещё дополняет пользователь |


## Итог analyze/converge и приёмки

- Analyze выявил 7 замечаний: 1 HIGH, 3 MEDIUM, 3 LOW; CRITICAL — 0. После разрешения пользователя устранены все I1–I4, G1, A1 и D1: [исправления и подтверждения](../../.specify/features/task-deadline-filter/analysis-resolution.md).
- Converge завершён результатом **Converged**. Проверены 9 критериев приёмки, 9 групп задач, 4 области реализации плана и 8 принципов конституции. Находки missing/partial/contradicts/unrequested — по 0. [Перечень проверенного](../../.specify/features/task-deadline-filter/sdd-finalization.md).
- Converge не добавил задач и оставил tasks.md без изменений. Повторный implement подтвердил отсутствие оставшейся работы.
- После этого пользователь явно принял реализацию и результаты: [acceptance.md](../../.specify/features/task-deadline-filter/acceptance.md). Запись о завершении добавлена отдельным документальным этапом после приёмки.
- Во время финализации документов новых тестовых прогонов не выполнялось; приведены сохранённые фактические результаты последнего прогона. Коммиты не выполнялись.

## Фактический результат проверки 27.10.2026

- Unit: **8/8 PASS**, включая строгий null и календарный день с переводом часов — [журнал](evidence/deadline-filter/unit.log).
- E2E: **16/16 PASS**, реальный браузер и HTTP API, включая клавиатуру и сохранение фокуса — [отчёт](../../.specify/features/task-deadline-filter/verification.md), [журнал запуска](evidence/deadline-filter/e2e.log).
- Обязательный `sh scripts/check.sh`: **PASS**, код завершения 0 — [журнал](evidence/deadline-filter/check.log).
- Первоначальные PNG с суффиксом `-failure` фиксируют ошибки до исправлений, а не статус итогового прогона. Актуальный результат каждого сценария — в results.json и verification.md.
- Машиночитаемые факты последнего прогона: [results.json](evidence/deadline-filter/results.json). Конституция и исторические snapshots сохранены; итог converge и пользовательская приёмка приведены выше.

## Состав комплекта сдачи

- Спецификации до обсуждения: [UI до](../../.specify/features/task-deadline-filter/snapshots/before/ui-spec.md), [логика до](../../.specify/features/task-deadline-filter/snapshots/before/logic-spec.md).
- Первые согласованные версии до реализации: [UI approved](../../.specify/features/task-deadline-filter/snapshots/approved/ui-spec.md), [логика approved](../../.specify/features/task-deadline-filter/snapshots/approved/logic-spec.md), [контракт approved](../../.specify/features/task-deadline-filter/snapshots/approved/deadline-filter.contract.md). Текущие спецификации также содержат последующие исправления analyze; исходные snapshots не переписывались.
- Актуальные договорённости и процесс: [spec](../../.specify/features/task-deadline-filter/spec.md), [контракт](../../.specify/features/task-deadline-filter/contracts/deadline-filter.md), [план](../../.specify/features/task-deadline-filter/plan.md), [конституция](../../.specify/memory/constitution.md).
- Код: [index.html](../practice_04/task_planner/public/index.html), [app.js](../practice_04/task_planner/public/app.js), [filter.js](../practice_04/task_planner/public/filter.js).
- Исполняемые проверки: [unit](../../tests/task_deadline_filter.test.cjs), [E2E](../../tests/task_deadline_filter.e2e.cjs); журналы, JSON и PNG доступны по ссылкам выше и в сценарии демо.
- Применение другого фреймворка и сравнение подтверждаются артефактами Spec Kit и архивом OpenSpec. Сквозные сценарии включают границы времени, ошибку загрузки и пустую выдачу.

Три журнала unit.log, e2e.log, check.log включены точечными исключениями в локальном `.gitignore` папки доказательств, чтобы корневое правило `*.log` не исключило их при последующей подготовке коммита. Сами журналы не пересоздавались.

## Запуск и повторение проверок

Из корня репозитория:

```sh
npm ci
npm run test:deadline
npm run test:e2e
sh scripts/check.sh
node practices/practice_04/task_planner/server.js
```

Последняя команда запускает приложение на http://localhost:3000. `check.sh` запускается в Bash с доступными Python 3, Node и curl. На этой Windows-машине системный alias `python3` не работал; обязательный runner успешно выполнен через Git Bash с функцией `python3`, вызывающей установленный Python 3.13.9 по полному пути. Сам runner не изменялся.

На Windows E2E автоматически использует установленный Google Chrome, если браузер Playwright ещё не скачан. В другой среде сначала выполните `npx playwright install chromium`. На поддерживаемом Linux при отсутствии системных библиотек используется `npx playwright install --with-deps chromium`. Возможен явный выбор установленного браузера через `PLAYWRIGHT_CHANNEL=chrome` или путь `PLAYWRIGHT_EXECUTABLE_PATH`.

Проверки запускают временную копию реального сервера и статики с отдельным `data/tasks.json`; создают данные через API и проверяют UI браузером. Текущее время фиксировано: `2026-10-26T09:00:00.000Z`; зоны — Europe/Moscow и America/New_York. Эти даты относятся к тестовым данным, а не к фактическому времени запуска. Пользовательские задачи сохраняются побайтово.

Подключение Playwright MCP не требуется для запуска этих E2E. Это прямой запуск библиотеки Playwright; тест не подменяет браузер статическим анализом файлов. Существующая настройка официального MCP сохранена. Старый `node .opencode/mcp/playwright/server.js` перенаправляет на новый E2E-скрипт и больше не выдаёт безусловный успех.

## Согласованные решения

- Задача «сегодня, но время уже прошло» попадает и в `today`, и в `overdue`, если не выполнена.
- Выполненные исключаются из `overdue`; сочетание «Выполненные» + «Просроченные» даёт пустой результат.
- «Сегодня» определяется локальным календарным днём, а не UTC-датой и не интервалом из 24 часов. Unit-тест также проверяет 25-часовой день при переводе часов в Нью-Йорке.
- Поиск, приоритет, статус и срок применяются через И. Сброс очищает фильтры и выбор, но сохраняет сортировку.
- Пустая выдача отображается только после успешной загрузки. Фоновый таймер не нужен: время пересчитывается при рендере.
- Общий контракт описывает данные и взаимодействие UI с клиентской логикой; HTTP API и модель Task не расширялись.

## Что обнаружили реальные проверки

1. Синтаксическая ошибка повторного `const now` полностью блокировала app.js; filter.js также не был подключён в HTML. Сквозная проверка сначала показала ошибку браузера, после исправления — PASS.
2. Локальный ввод `26.10.2026 12:30` в Москве сохранялся как `12:30Z` вместо `09:30Z`: смещение применялось повторно. Исправлены создание и редактирование; ранее сохранённые данные не переписывались.
3. Переключение фильтра во время загрузки или после неуспешного GET ошибочно показывало «Нет задач». Добавлен признак успешной загрузки, сценарии подтверждают исправление.
4. Пустой ненулевой deadline считался отсутствующим. Падающая unit-проверка привела к строгому сравнению с null.
5. Прежний проверяющий скрипт требовал одинаковый список до и после сброса и всегда печатал `ok: true`. Новый скрипт проверяет реальный ожидаемый результат и возвращает ненулевой код при ошибке.

## Сравнение с OpenSpec 

Сравниваются OpenSpec и SDD-процесс Spec Kit, использованные в проекте. Оба процесса допускают настройку и работу с существующим кодом.

| Аспект | OpenSpec: сброс фильтров | Spec Kit: фильтр по сроку |
|---|---|---|
| Артефакты | [proposal, design, tasks и delta spec](../../openspec/changes/archive/2026-10-25-reset-task-filters/) | [Артефакты Spec Kit: spec, UI/logic, agreement, контракт, plan и tasks](../../.specify/features/task-deadline-filter/) |
| Единица работы | Изменение текущего поведения, описанное через delta-требования | Спецификация фичи, разворачиваемая в план и задачи |
| Порядок действий | Схема зависимостей артефактов; CLI определяет готовность следующего действия | [Workflow](../../.specify/workflows/speckit/workflow.yml) specify → review → plan → review → tasks → implement |
| Механизм работы | CLI выдаёт статус, пути, шаблоны и инструкции агенту | Команды и шаблоны направляют агента; скрипты готовят файлы и проверяют предпосылки |
| Правила проекта | Контекст и правила артефактов в config; в этой работе ограничения заданы AGENTS.md | [Конституция](../../.specify/memory/constitution.md) задаёт принципы, учитываемые при планировании и анализе |
| Проверка документов | `validate` проверяет структуру и корректность delta-операций | `analyze` сопоставляет spec, plan и tasks, выявляя противоречия и пробелы |
| Согласование | Предложение и сценарии изменения, ревью человеком | Две спецификации: отдельно фиксировались правила UI и дат, затем принимался общий контракт |
| Цикл после реализации | Delta-требования объединяются с основными specs; изменение архивируется | `converge` сверяет код с требованиями и дописывает недостающие задачи для следующего `implement`; итог — Converged и приёмка |
| Что показала проверка | В архивной задаче есть результаты проверки сброса через Playwright MCP | Независимый запуск браузера нашёл ошибки, которые не выявили unit- и статические проверки |

OpenSpec организует работу вокруг изменения текущих требований и последующего обновления общей спецификации системы. SDD-процесс Spec Kit строится вокруг спецификации фичи, её преобразования в план и задачи, а затем проверки соответствия реализации этим документам.

Принципы описаны в документации: [OpenSpec Concepts](https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md), [OpenSpec Workflows](https://github.com/Fission-AI/OpenSpec/blob/main/docs/workflows.md), [Spec Kit SDD](https://github.com/github/spec-kit#spec-driven-development). Разделение UI/логики и agreement добавлено по условиям задания, а не предписано Spec Kit. В обоих случаях документы и код создаёт модель; работоспособность подтверждают тесты и приёмка человеком. Скорость инструментов по этим работам не сравнивается: объём фич различается.

