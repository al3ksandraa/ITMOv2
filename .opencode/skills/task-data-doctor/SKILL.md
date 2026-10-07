# Skill: Task Data Doctor

Purpose
- Diagnose and optionally fix data issues in practices/practice_04/task_planner/data/tasks.json using the MCP tool `tasks-lint-fix`.
- After fixes (if any), trigger the project's check pipeline via `sh scripts/check.sh` and summarize results back to the user.

Scope
- Non-destructive by default. Only fixes when explicitly requested or when the scenario policy below calls for `autofix=true`.
- Only adjusts safe fields without changing the public Task contract:
  - priority: non-enum -> "normal"
  - done: coerced to boolean
  - deadline/createdAt/updatedAt: if parseable as date but not UTC, convert to ISO 8601 UTC (Z). If unparsable, report issue without changing
  - description: if non-string and safely stringifiable, convert to String(value); otherwise report issue
  - id/title: never auto-fill missing or empty values; report issues only

Default Target File
- practices/practice_04/task_planner/data/tasks.json

Inputs
- Optional parameters may override defaults: `path`, `autofix`.

Operational Policy
1) Run MCP tool `tasks-lint-fix` with `{ path, autofix:false, backup:true }`.
2) If no issues are found, run `sh scripts/check.sh` and return the logs.
3) If issues exist, re-run `tasks-lint-fix` with `{ autofix:true }` to apply safe fixes; backup must remain `true`.
4) After applying fixes, run `sh scripts/check.sh` and provide a concise summary:
   - number of issues detected vs fixed
   - backup file path (if any)
   - final test status

Safety Rules
- Do not attempt to fix invalid JSON or non-array roots; abort and return tool error.
- Always create a backup when `autofix=true`.
- Respect the Task schema; do not introduce new fields or remove required ones.

Example Invocation (diagnose only)
```
MCP: tasks-lint-fix {
  "path": "practices/practice_04/task_planner/data/tasks.json",
  "autofix": false,
  "backup": true
}
```

Example Invocation (diagnose -> autofix -> check)
```
1) MCP: tasks-lint-fix { "path":"practices/practice_04/task_planner/data/tasks.json", "autofix": false, "backup": true }
2) If issues found -> MCP: tasks-lint-fix { "path":"practices/practice_04/task_planner/data/tasks.json", "autofix": true, "backup": true }
3) Run: sh scripts/check.sh
```

Outputs
- Structured summary including: issues (by type), fixed count, backup path, and check.sh outcome.
