# Журнал экспериментов Практики 2



- Выбранный слабый артефакт Практики 1: practices/practice_01/project_management.md (План поставки)
- Что в нём нужно улучшить: убрать шаблоны и плейсхолдеры; заполнить пустые разделы; исправить неточные ссылки и формулировки «Проверка»; согласовать даты и зависимости в диаграмме Ганта; конкретизировать раздел «Как использовали AI» и ссылку на P1-03 в prompts.md
- Как поймём, что изменение полезно: документ проходит проверку по P1-03 без замечаний; нет плейсхолдеров/пустых секций; ссылки валидны и указывают на существующие файлы; диаграмма Ганта рендерится и отражает логическую последовательность; запись об эксперименте внесена в эту таблицу; проверка воспроизводима по TRAINING_PR.diff

| Техника | Файл эксперимента | Изменённый файл Практики 1 | Конкретное изменение | Проверка | Что отклонили |
|---|---|---|---|---|---|
| Few-shot | [`few_shot/experiment.md`](few_shot/experiment.md) | `practices/practice_01/project_management.md` | Создана исправленная копия: `practices/practice_02/few_shot/project_management.md`; удалены шаблоны и плейсхолдеры; заполнен пустой раздел; исправлены ссылки и зависимости/даты диаграммы | Сверка с промптом P1-03; визуальная проверка Mermaid и валидность ссылок; отсутствие внешних фактов | Изменение оригинального файла; предположения вне TRAINING_PR.diff |
| R.C.T.F. | [`rctf/experiment.md`](rctf/experiment.md) | `practices/practice_01/project_management.md` | Создана исправленная копия: `practices/practice_02/rctf/project_management.md`; удалены шаблоны и плейсхолдеры; уточнены ссылки на артефакты проверки; выровнены даты и зависимости Ганта; заполнен раздел «Как использовали AI» | Сверка с промптом P1-03 в `practices/practice_01/prompts.md`; отсутствие пустых разделов и шаблонов; соответствие фактам TRAINING_PR.diff | Шаблон «Замените даты и задачи…»; пустой подпункт «Что проверили и исправили сами»; некорректная ссылка «analysis/product_management»; расплывчатые даты/зависимости в диаграмме |
| Chain of Verification | [`chain_of_verification/experiment.md`](chain_of_verification/experiment.md) | `practices/practice_01/project_management.md` | Создана корректная копия: `practices/practice_02/chain_of_verification/project_management.md`; удалены плейсхолдеры; заполнены пропуски; исправлены ссылки; выровнены даты и зависимости | Вопросы проверки + evidence в `chain_of_verification/experiment.md`; сверка с P1-03; соответствие TRAINING_PR.diff | Изменение оригинала; домыслы вне TRAINING_PR.diff |
| Tree of Thoughts | [`tree_of_thoughts/experiment.md`](tree_of_thoughts/experiment.md) |  |  |  |  |
| RAG | [`rag/experiment.md`](rag/experiment.md) | `practices/practice_01/project_management.md` | Создана корректная копия: `practices/practice_02/rag/project_management.md`; удалён плейсхолдер под диаграммой; актуализирована дата; заполнен пустой пункт в «Как использовали AI» | Проверка только по Chunk 1 и Chunk 2 (требования и evidence); ссылки в `rag/experiment.md` | Любые правки, не подтверждённые Chunk 1/2 |
| ReAct | [`react/experiment.md`](react/experiment.md) | `practices/practice_01/project_management.md` | Создана исправленная копия: `practices/practice_02/react/project_management.md`; удалены шаблоны/пустые пункты; уточнены ссылки; актуализированы дата и зависимости диаграммы | ReAct-лог в `react/experiment.md`; сверка с P1-03 | Изменение оригинального файла; внешние факты |

## Независимое ревью

| Замечание другой команды | Где исправили | Evidence |
|---|---|---|
| Двусмысленность |  |  |
| Непроверяемое требование |  |  |
| Пропущенный риск или источник |  |  |
