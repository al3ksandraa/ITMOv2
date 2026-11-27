# MCP Server: tasks-lint-fix

Purpose
- Inspect and optionally fix practices/practice_04/task_planner/data/tasks.json for common data issues while preserving the public Task contract.

Tool Name
- tasks-lint-fix

Input
```
{
  "path": string,                                 // required; path to tasks.json
  "autofix": boolean = false,                    // optional; apply safe fixes
  "backup": boolean = true                       // optional; create backup when writing
}
```

Success Output
```
{
  "ok": true,
  "issues": Array<
    { "type": string, "index"?: number, [k: string]: any }
  >,
  "fixed": number,                               // number of applied field-level fixes
  "backupPath"?: string                          // present when a backup was created
}
```

Error Output
```
{ "ok": false, "error": string }
```

Detected Issue Types (examples)
- invalid_json
- not_array_root
- duplicate_id { id }
- missing_field { field }
- empty_title { index }
- bad_priority { value, fix }
- non_utc_time { field, value, fix }
- unparsable_time { field, value }
- non_boolean_done { value, fix }
- non_string_description { value, fix }

Fix Policy (when autofix=true)
- priority: any non-"low|normal|high" -> "normal"
- done: coerce via Boolean(value)
- times: if parseable but not UTC, convert to ISO 8601 UTC (Z); if not parseable, do not change
- description: if non-string, convert via String(value)
- Do not fabricate id/title; report only
- Always produce a backup file when writing

Examples
1) Diagnose only
```
tasks-lint-fix {
  "path": "practices/practice_04/task_planner/data/tasks.json",
  "autofix": false,
  "backup": true
}
```

2) Diagnose + fix
```
tasks-lint-fix {
  "path": "practices/practice_04/task_planner/data/tasks.json",
  "autofix": true,
  "backup": true
}
```
