#!/usr/bin/env python3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / 'practices' / 'practice_04' / 'task_planner' / 'public' / 'index.html'

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
    if missing:
        print('FAIL: missing UI elements:', ', '.join(missing))
        return 1
    print('OK: required UI elements present')
    return 0

if __name__ == '__main__':
    sys.exit(main())
