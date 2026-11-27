#!/usr/bin/env python3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / 'practices' / 'practice_04' / 'task_planner' / 'public' / 'index.html'
APPJS = ROOT / 'practices' / 'practice_04' / 'task_planner' / 'public' / 'app.js'

def main() -> int:
    if not INDEX.exists():
        print(f"ERROR: index.html not found at {INDEX}")
        return 2
    html = INDEX.read_text(encoding='utf-8')
    missing = []
    if '#search' not in html and 'id="search"' not in html:
        missing.append('#search')
    if '#priority-filter' not in html and 'id="priority-filter"' not in html:
        missing.append('#priority-filter')
    # New requirement: reset filters button
    if '#reset-filters' not in html and 'id="reset-filters"' not in html:
        missing.append('#reset-filters')
    if missing:
        print('FAIL: missing UI elements:', ', '.join(missing))
        return 1

    # Additional static checks for reset handler presence and behavior constraints
    if not APPJS.exists():
        print(f"WARN: app.js not found at {APPJS}; skipping behavior static checks")
        print('OK: required UI elements present')
        return 0
    js = APPJS.read_text(encoding='utf-8')

    # Presence of handler wiring and behavioral checks by simple heuristics
    if 'document.getElementById(\'reset-filters\')' not in js and 'getElementById("reset-filters")' not in js:
        print('FAIL: reset handler wiring missing in app.js: getElementById("reset-filters")')
        return 1
    if ('addEventListener(\'click\'' not in js) and ('addEventListener("click"' not in js):
        print('FAIL: reset handler click listener missing in app.js')
        return 1

    # Extract handler block heuristically
    start = js.find("resetBtn.addEventListener('click'")
    if start == -1:
        start = js.find('resetBtn.addEventListener("click"')
    block = ''
    if start != -1:
        end = js.find('});', start)
        if end != -1:
            block = js[start:end]

    # Basic expectations inside handler
    expectations = [
        "state.search = ''",
        "el.search.value = ''",
        "state.priority = 'all'",
        "el.priorityFilter.value = 'all'",
        "state.filter = 'all'",
    ]
    missing_beh = [e for e in expectations if e not in block]
    if missing_beh:
        print('FAIL: reset handler missing assignments:', ', '.join(missing_beh))
        return 1

    # No network calls and no data mutation in handler; sort must not be assigned
    forbidden = []
    if 'fetch(' in block:
        forbidden.append('fetch(')
    if 'state.tasks' in block:
        forbidden.append('state.tasks')
    if 'state.sort' in block and '=' in block.split('state.sort', 1)[1]:
        forbidden.append('state.sort =')
    if forbidden:
        print('FAIL: reset handler contains forbidden operations:', ', '.join(forbidden))
        return 1

    print('OK: required UI elements present')
    return 0

if __name__ == '__main__':
    sys.exit(main())
