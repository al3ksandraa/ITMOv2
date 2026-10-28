# Базовая проверка Mini Shop

Дата: 28.10.2026, Europe/Moscow. Ревизия: `0c8a9c1567e334a00502a2d83bd3d9997b2b2687`.

Это подготовка и исходный прогон, без атак и исправлений. Доказательства будущих атак следует сохранять отдельно в `evidence/before/`, повторных проверок — в `evidence/after/`.

**Актуальный результат:** прогон 28.10.2026 в 10:28 МСК завершился успешно: **16 из 16 тестов, `OK`, exit code 0**. В том числе прошла проверка символьной ссылки.

## Окружение и ограничения

Проверены `Get-Command` для `python`, `python3`, `py`, `make`, `bash`, `wsl`, `opencode`; найден Git Bash `D:\Git\bin\bash.exe`. `make` и `opencode` не обнаружены в PATH данной рабочей сессии. Наличие Git Bash не предоставляет `make` автоматически. `wsl --list --quiet` в ограниченной среде вернул `Wsl/EnumerateDistros/Service/E_ACCESSDENIED`; это не доказывает отсутствие установленного дистрибутива.

`py -0p` в ограниченной среде показал Python 3.13 из Microsoft Store, но `py -3 -c ...` и `python3 --version` не смогли запустить процесс. В расширенном контексте `py -3` ссылался на отсутствующий `C:\Users\ASUS\AppData\Local\Programs\Python\Python313\python.exe`. Поэтому использован прямой путь к существующему Store-интерпретатору. Дополнительное ПО не устанавливалось.

Рабочий интерпретатор:

```powershell
$runtime = 'C:\Program Files\WindowsApps\PythonSoftwareFoundation.Python.3.13_3.13.2544.0_x64__qbz5n2kfra8p0\python3.13.exe'
& $runtime -B -c "import sys, platform, sqlite3; print('Python:', sys.version); print('Executable:', sys.executable); print('Platform:', platform.platform()); print('SQLite:', sqlite3.sqlite_version)"
```

Результат: Python **3.13.9**, Windows 11 `10.0.26100`, SQLite **3.50.4**. Для Python и запуска сервера использован расширенный доступ исполнения; это не означает запуск от имени администратора Windows. Режим разработчика включён пользователем; значение `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock\AllowDevelopmentWithoutDevLicense=1` подтверждено чтением реестра. Агент системные настройки не менял.

Применимые `AGENTS.md` искались через `rg --files --hidden -g AGENTS.md -g '!node_modules' -g '!.git'`, `git ls-files '*AGENTS.md'` и явную проверку родительских каталогов и пути до `lab/`. Такие файлы не обнаружены.

## Исходные тесты

Последний прогон выполнен **28.10.2026, 10:28:14–10:28:16 МСК**, установленным Python 3.13.9 с расширенным доступом исполнения. В дочерний процесс переданы `NO_PROXY=127.0.0.1,localhost` и `PYTHONDONTWRITEBYTECODE=1`. Рабочий каталог — `practices/practice_06/lab/`. Команда набора тестов:

```powershell
$env:NO_PROXY = '127.0.0.1,localhost'
$env:PYTHONDONTWRITEBYTECODE = '1'
& $runtime -X utf8 -B -m unittest -v
```

Для записи результата использован `subprocess.run` с объединением stdout и stderr в UTF-8 лог. Фактическая команда дочернего процесса, время, версии и значение реестра записаны в [unittest-developer-mode.json](unittest-developer-mode.json), полный вывод — в [unittest-developer-mode.log](unittest-developer-mode.log).

Результат:

```text
test_symlink_cannot_escape_exercise (test_service.SandboxTest.test_symlink_cannot_escape_exercise) ... ok
...
Ran 16 tests in 0.831s

OK
```

**16 тестов, все успешны, exit code 0; ошибок, падений и пропусков нет.** Тест symlink создал ссылку и проверил отклонение чтения и удаления за физической границей sandbox, а также сохранность внешнего контрольного файла. Исходный код и тесты не менялись. Успешный функциональный набор не подтверждает отсутствие гипотез угроз из `THREAT_MODEL.md`.

Команды Makefile на этом этапе не выполнялись из-за отсутствия `make`. Прямой `unittest` запускает тот же набор лабораторных тестов; он не заменяет будущую проверку корневого `make test`, включающего другие практики.

## Запуск сервера

Рабочий каталог: `practices/practice_06/lab/`. Сначала проверена возможность привязать сокет к выбранному порту без обращения к чужому сервису:

```powershell
& $runtime -X utf8 -B -c "import socket; s=socket.socket(); s.bind(('127.0.0.1',8066)); print(s.getsockname()[1]); s.close()"
```

Порт `8066` был свободен. Затем сервер запущен скрытым фоновым процессом:

```powershell
$labDir = (Resolve-Path -LiteralPath '.').Path
$evidenceDir = (Resolve-Path -LiteralPath '../evidence/baseline').Path
$process = Start-Process -FilePath $runtime -ArgumentList @('-X','utf8','-B','service.py','--port','8066') -WorkingDirectory $labDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $evidenceDir 'server.stdout.log') -RedirectStandardError (Join-Path $evidenceDir 'server.stderr.log') -PassThru
```

Результат: PID `13240`, запуск **28.10.2026, 10:14:41 МСК**. Стандартный вывод:

```text
Local exercise: http://127.0.0.1:8066
Disposable fixture files: C:\Users\ASUS\AppData\Local\Temp\itmo-practice-06-54mmlg_e
```

Проверка сокета `Get-NetTCPConnection -State Listen -LocalPort 8066` внутри ограниченной среды получила отказ CIM. В расширенном контексте проверка выполнена: единственный слушатель — `127.0.0.1:8066`, владелец PID `13240`. Результат сохранён в `listener.json`. Перед отправкой smoke-запросов принадлежность порта проверена.

Сервер оставлен работающим. PID и путь временного каталога относятся только к этому запуску. Для последующих запусков доступен обычный запуск в терминале с корректным Python и остановка через Ctrl+C: `main()` закрывает сервер, БД и временный каталог. При принудительном завершении процесса прохождение этого `finally` не гарантируется.

## Обычные HTTP-запросы

Из отдельного процесса Python использован `urllib.request.build_opener(ProxyHandler({}))`, чтобы запросы напрямую попадали на loopback. Выполнены только:

| Запрос | Код | Тело |
|---|---|---|
| `GET http://127.0.0.1:8066/health` | 200 | `{"status":"ok"}` |
| `GET http://127.0.0.1:8066/products` | 200 | `{"chair":5000,"lamp":1500}` |

Для обоих ответов проверены код и точное JSON-содержимое. Время проверки: **28.10.2026, 10:15:22 МСК**. Ответы сохранены в `smoke.json`. Запросы не создавали заказы и отзывы. Поставляемые тесты использовали собственные экземпляры Shop и временные каталоги.

## Целостность исходников

До исполнения записаны SHA-256 `service.py`, `sandbox.py`, `test_service.py`, `test_http.py` в `source-hashes.json`. После создания модели и после успешного прогона с режимом разработчика хеши проверены повторно: все четыре файла совпадают с исходными. `-B` предотвращает создание новых файлов байткода во время запуска.

`REPORT_01.md`, `REPORT_02.md`, системные промпты и Makefile оставлены в исходном состоянии. Результаты этой фазы не подтверждают ни одну из атак; они фиксируют исходные условия следующего этапа.
