# Логика: Фильтр задач по сроку (task-deadline-filter)

Файл фиксирует правила клиентской логики в соответствии с `agreement.md` и `contracts/deadline-filter.md`. Публичный API неизменен; реализация на клиенте, без дополнительных запросов.

## Режимы и правила
- all — дедлайн не ограничивает выборку.
- overdue — deadline < now, выполнённые всегда исключаются (done=true → исключить).
- today — startOfToday <= deadline < startOfTomorrow (локальная TZ); выполненные зависят от статус-фильтра.
- no-deadline — deadline === null.

Разрешено пересечение множеств: невыполнённая задача «сегодня, но в прошлом» удовлетворяет today и overdue; фактическая выдача зависит от выбранного режима.

## Комбинация с другими фильтрами
- Итог = поиск (title/description, регистронезависимо) ∧ приоритет ∧ статус (state.filter: all|active|done) ∧ дедлайн.

## Время и TZ
- Дедлайн (ISO UTC) парсится в Date; границы вычисляются в локальной TZ.
- now вычисляется один раз на перерисовку; таймер не используется.

## Пустая выдача и сброс
- Пустая выдача: «Нет задач по выбранным критериям» в <div id="empty-state" role="status"> после #task-list; только после успешной загрузки.
- Сброс: поиск/приоритет/статус/срок → all; снять выбор задач; сортировку сохранить; без API-запросов.

## Триггеры пересчёта
- Первичная загрузка; изменение поиска/приоритета/статуса/срока; сброс; переключение сортировки; успешные CRUD и массовые действия.

## Псевдокод
```
function boundariesOfToday(now){
  const start=new Date(now); start.setHours(0,0,0,0);
  const next=new Date(start); next.setDate(next.getDate()+1);
  return [start,next];
}

function includeByDeadline(t, dl, now){
  const d = t.deadline ? new Date(t.deadline) : null;
  const [start,next] = boundariesOfToday(now);
  if (dl==='overdue') return !t.done && d && d < now;
  if (dl==='today') return d && d >= start && d < next;
  if (dl==='no-deadline') return d === null;
  return true; // 'all'
}
```
