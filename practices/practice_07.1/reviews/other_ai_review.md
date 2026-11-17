## AI Review — other

# Code review: `calculator.py`

## 🔴 Критичные

### 1. `sum` перекрывает встроенную функцию и ломает `average`

```python
def average(values):
    return sum(values) / len(values)

def sum(a, b):
    return a + b
```

`average` ищет имя `sum` в глобальной области модуля во время вызова, а не во время определения. К моменту вызова там уже лежит ваша `sum(a, b)`. Поэтому `average` падает при любом входе:

```python
>>> average([1, 2, 3])
TypeError: sum() missing 1 required positional argument: 'b'
```

Кроме того, `from calculator import *` подменит встроенную `sum` у всех, кто так импортирует модуль.

**Исправление:** переименовать функцию.

```python
def add(a, b):
    return a + b
```

### 2. Регрессия: из `divide` удалена проверка деления на ноль

```diff
-    if b == 0:
-        raise ValueError("Division by zero")
```

Это изменение публичного контракта. Раньше функция бросала `ValueError`, теперь бросает `ZeroDivisionError`. Вызывающий код вида `except ValueError:` перестанет перехватывать ошибку, и она дойдёт до верхнего уровня. Тесты на `pytest.raises(ValueError)` тоже упадут.

**Исправление:** вернуть проверку. Если смена типа исключения сделана намеренно, её нужно оформить как breaking change и обновить вызывающий код и тесты.

```python
def divide(a, b):
    if b == 0:
        raise ValueError("Division by zero")
    return a / b
```

## 🟠 Баги

### 3. `average` не обрабатывает пустую коллекцию и итераторы

- `average([])` бросает `ZeroDivisionError` с непонятным для вызывающего сообщением.
- `average(x for x in data)` бросает `TypeError`, потому что у генератора нет `len()`.

**Исправление:**

```python
def average(values):
    values = list(values)
    if not values:
        raise ValueError("average() of empty sequence")
    return sum(values) / len(values)
```

Другой вариант: использовать `statistics.fmean` (Python 3.8+). Эта функция уже корректно работает с итераторами и бросает `StatisticsError` (подкласс `ValueError`) на пустом входе.

```python
from statistics import fmean

def average(values):
    return fmean(values)
```

## 🟡 Best practices

### 4. PEP 8: перед `def sum` нужны две пустые строки

Сейчас там одна пустая строка, flake8 выдаст E302.

### 5. Нет type hints и docstring

Для небольшого модуля это не обязательно, но так контракт явный, включая исключения:

```python
from collections.abc import Iterable

def average(values: Iterable[float]) -> float:
    """Return the arithmetic mean. Raises ValueError on empty input."""
```

## Безопасность и производительность

Проблем нет. `sum`/`len` работают за O(n), это оптимально. Вариант с `list(values)` делает одну дополнительную копию, что приемлемо для обычных объёмов.

## Итоговая версия

```python
from collections.abc import Iterable


def divide(a: float, b: float) -> float:
    if b == 0:
        raise ValueError("Division by zero")
    return a / b


def average(values: Iterable[float]) -> float:
    values = list(values)
    if not values:
        raise ValueError("average() of empty sequence")
    return sum(values) / len(values)


def add(a: float, b: float) -> float:
    return a + b
```

**Рекомендую добавить тесты:** `divide(1, 0)` бросает `ValueError`, `average([1, 2, 3]) == 2`, `average([])` бросает `ValueError`, `average(iter([2, 4])) == 3`. Первый и второй тесты сразу поймали бы обе критичные проблемы из этого diff.