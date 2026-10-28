# Логическая спецификация (снимок): Фильтр по сроку (task-deadline-filter)

Фактический путь каталога фичи: `.specify/features/task-deadline-filter/`

Извлечено из основной спецификации на момент создания снимка; без изменений.

## Контракт и совместимость
- Публичный API неизменен; `Task.deadline` — ISO 8601 UTC или `null`.
- Только клиентская логика поверх уже загруженных данных (`GET /api/tasks`), без дополнительных сетевых запросов.
- Не добавлять зависимости в рантайм сервиса; TDD-процесс обязателен.

## Семантика дедлайн-фильтра
- Все (`all`): не ограничивает по сроку.
- Просроченные (`overdue`): `deadline < now` (сравнение по времени).
- Сегодня (`today`): `startOfToday <= deadline < endOfToday` в локальной TZ пользователя (сравнение по дате).
- Без дедлайна (`none`): `deadline === null`.

## Комбинирование условий
- Итог = пересечение: поиск (title/description, регистронезависимый) ∧ приоритет ∧ статус выполнения (если включён) ∧ дедлайн-фильтр.
- Порядок применения не влияет на корректность результата; для эффективности можно ранжировать предикаты.

## Псевдокод алгоритма
```
function applyFilters(tasks, state, now = new Date()) {
  const q = normalize(state.search);
  const pri = state.priority;
  const st = state.status; // optional
  const dl = state.deadline;

  const [startToday, endToday] = boundariesOfToday(now);

  return tasks.filter(t => {
    const d = t.deadline ? new Date(t.deadline) : null; // ISO UTC → Date

    if (q && !matchesQuery(t, q)) return false; // поиск
    if (pri && pri !== 'all' && t.priority !== pri) return false; // приоритет

    if (st === 'done' && !t.done) return false; // статус
    if (st === 'active' && t.done) return false;

    if (dl === 'overdue') {
      if (!d || !(d.getTime() < now.getTime())) return false;
    } else if (dl === 'today') {
      if (!d || !(d >= startToday && d < endToday)) return false;
    } else if (dl === 'none') {
      if (d !== null) return false;
    }

    return true;
  });
}

function boundariesOfToday(now) {
  const s = new Date(now);
  s.setHours(0,0,0,0);
  const e = new Date(s);
  e.setDate(e.getDate() + 1);
  return [s, e];
}
```

## Пустая выдача
- При пустом результате подстановки предикатов показывать сообщение «Нет задач по выбранным критериям» на клиенте.

## Сброс
- Кнопка «Сбросить фильтры» устанавливает `deadline` = `all`, очищает поиск, возвращает приоритет к значению по умолчанию, снимает выделения задач; сортировка сохраняется.

## Обновление результатов со временем
- С течением времени значение `now` меняется, поэтому задачи могут переходить между режимами («Сегодня»/«Просроченные») без сетевых запросов. Требуется периодическое обновление рендера или реакция на пользовательское действие для актуализации.
