# Проверка служебной настройки Spec Kit

Дата: 27.10.2026. Документ фиксирует состояние на момент подготовки к финальным analyze/converge. Их последующие результаты и приёмка сохранены в [sdd-finalization.md](sdd-finalization.md).

## Конституция

- Ранее согласованный документ из `.specify/speckit.constitution.md` перенесён в штатный `.specify/memory/constitution.md` без изменения содержимого.
- Побайтовая идентичность подтверждена SHA-256: `A5F064C1F95BD9ED9768FB49B7BFA4AA058A78D7B76C45A8E33119E8DF8DE8A7`.
- Версия 1.0.0, ратификация и последняя содержательная правка 2026-10-26 сохранены. Миграция пути не является изменением норм.
- В старом файле оставлен указатель на действующий документ; ссылки в spec.md и HANDOFF.md обновлены. Шаблоны и команды интеграции не редактировались.

## Текущая фича

Создан локальный `.specify/feature.json`:

```json
{
  "feature_directory": ".specify/features/task-deadline-filter"
}
```

Файл намеренно игнорируется штатным `.specify/.gitignore`: это состояние текущего checkout, а не общий артефакт проекта. После клонирования его можно восстановить поддерживаемым способом из корня:

```powershell
$env:SPECIFY_FEATURE_DIRECTORY = '.specify/features/task-deadline-filter'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireSpec -RequireTasks -IncludeTasks
```

Штатный скрипт сохраняет указатель из явного SPECIFY_FEATURE_DIRECTORY; переименовывать каталог или заново создавать спецификацию не требуется.

## Фактические проверки

До настройки команда завершалась с кодом 1:

```text
ERROR: Feature directory not found. Set SPECIFY_FEATURE_DIRECTORY or run the specify command to create .specify/feature.json.
```

После настройки из корня репозитория:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireSpec -RequireTasks -IncludeTasks
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .specify/scripts/powershell/check-prerequisites.ps1 -Json -PathsOnly
```

Обе команды вернули код 0. Первая вернула:

```json
{"FEATURE_DIR":"D:\\Documents\\Vibecoding\\ITMOv2\\.specify\\features\\task-deadline-filter","AVAILABLE_DOCS":["contracts/","tasks.md"]}
```

Вторая подтвердила REPO_ROOT = ITMOv2 и пути FEATURE_SPEC, IMPL_PLAN, TASKS внутри текущей фичи. Найдены непустые spec.md, plan.md, tasks.md и действующая конституция без незаполненных маркеров шаблона.

Эта проверка подтверждает определение служебных путей, а не полноту реализации. Финальная сверка требований, плана и задач выполняется отдельными этапами analyze/converge. Код приложения, scripts/check.sh, публичный контракт, данные задач и исторические snapshots не изменялись.
