# Task Data Doctor: Report


This document records the creation and usage of the skill + MCP pair:
- Skill: Task Data Doctor
- MCP tool: tasks-lint-fix

Files Created (all under .opencode)
- .opencode/skills/task-data-doctor/SKILL.md
- .opencode/mcp/tasks-lint-fix/package.json
- .opencode/mcp/tasks-lint-fix/server.js
- .opencode/mcp/tasks-lint-fix/README.md
- .opencode/mcp/servers.json
- .opencode/hooks/after-apply-patch.sh

Purpose and Flow
- The MCP tool inspects `practices/practice_04/task_planner/data/tasks.json`, detects issues, and optionally applies safe fixes with a backup.
- The skill orchestrates: diagnose -> (optional) autofix -> run `sh scripts/check.sh`.

Demo: Successful diagnose (no issues in current data)
- Command:
```
node .opencode/mcp/tasks-lint-fix/server.js --tool tasks-lint-fix --input '{"path":"practices/practice_04/task_planner/data/tasks.json","autofix":false,"backup":true}'
```
- Output:
```
{"ok":true,"issues":[],"fixed":0}
```

Demo: Error case (missing file)
- Command:
```
node .opencode/mcp/tasks-lint-fix/server.js --tool tasks-lint-fix --input '{"path":"practices/practice_04/task_planner/data/missing.json","autofix":false}'
```
- Output:
```
{"ok":false,"error":"File not found"}
```

Check Pipeline
- Ran `bash scripts/check.sh`.
- Output excerpt:
```
[check] Running UI tests
OK: required UI elements present
[check] Node detected, starting server quick check
Task planner running at http://localhost:3100
[check] Server ready on :3100
[check] PASS

Agent Demo (end-to-end)
- Session excerpt showing agent applying rules, loading skill, invoking MCP tool, and receiving pipeline results. The agent executed after a patch (hook triggers check.sh automatically), then loaded the Task Data Doctor skill which called the MCP tool in diagnose mode:

```
[agent] Reading AGENTS.md rules
[agent] Loading skill: task-data-doctor
[agent] Invoking MCP tool: tasks-lint-fix {"path":"practices/practice_04/task_planner/data/tasks.json","autofix":false,"backup":true}
[mcp]  -> {"ok":true,"issues":[],"fixed":0}
[agent] No issues; running pipeline: sh scripts/check.sh
[check] Running UI tests
OK: required UI elements present
OK: bulk UI elements present
[check] Node detected, starting server quick check
Task planner running at http://localhost:3100
[check] Server ready on :3100
[check] PASS
[agent] Pipeline PASS; reporting summary
```
```

Checklist per README (except reflection)
- Environment: AGENTS.md present; new skill file added; MCP tool implemented; hook provided; MCP registered in .opencode/mcp/servers.json; checks run via `scripts/check.sh`.
- Skill: substantive automation policy and example invocations provided.
- MCP: useful tool implemented with real successful and error invocations captured.
- Reflection: to be written separately in `reflection.md`.

Run Notes
- To invoke via CLI: `node .opencode/mcp/tasks-lint-fix/server.js --tool tasks-lint-fix --input '{"path":"practices/practice_04/task_planner/data/tasks.json","autofix":false,"backup":true}'`
- After changes, run: `bash scripts/check.sh`.
