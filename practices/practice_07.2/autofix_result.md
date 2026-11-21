# Результаты дополнительного задания практики 7.2

В n8n настроено автоматическое исправление GitHub Issues с меткой `bug`. Тестовый репозиторий — [al3ksandraa/n8n-review-practice](https://github.com/al3ksandraa/n8n-review-practice).

## Сценарий

После классификации Workflow 1 передаёт номер, заголовок и описание Issue в `Auto-fix Bug`. Модель читает `calculator.py` и тесты, формирует исправление, а n8n записывает его в ветку `auto-fix/issue-<номер>` и открывает PR. Отдельный вызов модели проверяет diff опубликованного коммита. n8n сливает PR в `main`, когда ревью допускает слияние, CI прошёл на том же коммите и GitHub подтвердил возможность слияния. [Workflow 1](workflows/issues.json) · [Auto-fix Bug](workflows/auto-fix-bug.json)

## Результаты проверки

В отладочном прогоне CI прошёл, а AI-ревью вернуло `approve` с тремя замечаниями уровня `minor`. PR оставили открытым для проверки сценария до слияния. [PR №26](https://github.com/al3ksandraa/n8n-review-practice/pull/26) · [Прогон CI](https://github.com/al3ksandraa/n8n-review-practice/actions/runs/44742840192)

В итоговом прогоне 21 ноября 2026 года новый багрепорт о вызове `divide("6", "3")` получил метку `bug`. Исправление попало в ветку `auto-fix/issue-27`. AI-ревью вернуло `approve` с двумя замечаниями уровня `minor`, а `Autofix CI` успешно выполнил все шесть тестов. n8n смёржил PR №28 в `main` коммитом `0aa83f6`, и GitHub закрыл Issue №27 по `Fixes #27`. [Issue №27](https://github.com/al3ksandraa/n8n-review-practice/issues/27) · [PR №28](https://github.com/al3ksandraa/n8n-review-practice/pull/28) · [Прогон CI](https://github.com/al3ksandraa/n8n-review-practice/actions/runs/44900188333)
