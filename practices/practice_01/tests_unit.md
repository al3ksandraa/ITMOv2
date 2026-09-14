# Unit-проверки

| Требование или правило | Что проверяем изолированно | Вход | Ожидаемый результат | Evidence |
|---|---|---|---|---|
| Формирование промпта в ReviewService | Метод `review(diff)` строит строку промпта корректно | `diff = "DIFF"` | `llm.generate` вызывается с `"Review this pull request and find problems:\nDIFF"` | app/review_service.py 19-21 |
| Формат результата ReviewService | Возвращаемый словарь содержит ключ `comment` | ответ LLM: `"ok"` | `{"comment": "ok"}` | app/review_service.py 21-22 |

## Как использовали AI

- Строка в [`prompts.md`](prompts.md): P1-03.
- Что проверили и исправили сами:
