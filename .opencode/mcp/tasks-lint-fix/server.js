#!/usr/bin/env node
// Minimal MCP-like JSON-RPC server that offers a single tool: tasks-lint-fix
// No external npm deps; Node.js 18+

import { readFile, writeFile, stat, cp } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';

// Helper: Safe JSON parse
function safeParse(jsonStr) {
  try { return { ok: true, value: JSON.parse(jsonStr) }; } catch (e) {
    return { ok: false, error: 'Invalid JSON' };
  }
}

// Helper: ISO 8601 UTC conversion if parseable
function toUtcIsoIfParseable(v) {
  if (v == null) return { ok: true, value: null, changed: false };
  if (typeof v !== 'string') return { ok: false, error: 'not_string' };
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return { ok: false, error: 'unparsable' };
  const iso = d.toISOString();
  const changed = v !== iso;
  return { ok: true, value: iso, changed };
}

// Helper: detect duplicates
function findDuplicateIds(tasks) {
  const seen = new Map();
  const dups = [];
  tasks.forEach((t, idx) => {
    const id = t?.id;
    if (typeof id !== 'string') return;
    if (seen.has(id)) dups.push({ id, first: seen.get(id), second: idx });
    else seen.set(id, idx);
  });
  return dups;
}

async function lintFix({ filePath, autofix = false, backup = true }) {
  if (typeof filePath !== 'string' || !filePath) {
    return { ok: false, error: 'Invalid input: path must be a non-empty string' };
  }
  // Resolve to absolute path from CWD
  const abs = path.resolve(process.cwd(), filePath);
  // Read file
  let content;
  try {
    const st = await stat(abs).catch(() => null);
    if (!st) return { ok: false, error: 'File not found' };
    if (st.size > 1024 * 1024) return { ok: false, error: 'Too large' };
    content = await readFile(abs, 'utf8');
  } catch (e) {
    return { ok: false, error: 'Read failed' };
  }
  const parsed = safeParse(content);
  if (!parsed.ok) return { ok: false, error: 'Invalid JSON' };
  const data = parsed.value;
  if (!Array.isArray(data)) return { ok: false, error: 'Data is not an array' };

  const issues = [];
  let fixed = 0;

  // duplicate ids
  const dups = findDuplicateIds(data);
  for (const d of dups) {
    issues.push({ type: 'duplicate_id', id: d.id, first: d.first, second: d.second });
  }

  // iterate items
  for (let i = 0; i < data.length; i++) {
    const t = data[i];
    if (t == null || typeof t !== 'object') {
      issues.push({ type: 'not_object', index: i });
      continue;
    }
    // title
    if (typeof t.title !== 'string') {
      issues.push({ type: 'missing_field', field: 'title', index: i });
    } else if (t.title.trim() === '') {
      issues.push({ type: 'empty_title', index: i });
    }
    // id
    if (typeof t.id !== 'string') {
      issues.push({ type: 'missing_field', field: 'id', index: i });
    }
    // priority
    const validPriorities = new Set(['low', 'normal', 'high']);
    if (typeof t.priority === 'undefined') {
      // optional but if missing, we can normalize to 'normal' only if autofix
      if (autofix) { t.priority = 'normal'; fixed++; issues.push({ type: 'missing_priority', index: i, fix: 'normal' }); }
    } else if (!validPriorities.has(t.priority)) {
      issues.push({ type: 'bad_priority', index: i, value: t.priority, fix: 'normal' });
      if (autofix) { t.priority = 'normal'; fixed++; }
    }
    // done
    if (typeof t.done !== 'boolean') {
      issues.push({ type: 'non_boolean_done', index: i, value: t.done, fix: Boolean(t.done) });
      if (autofix) { t.done = Boolean(t.done); fixed++; }
    }
    // description
    if (typeof t.description !== 'undefined' && typeof t.description !== 'string') {
      issues.push({ type: 'non_string_description', index: i, valueType: typeof t.description, fix: String(t.description) });
      if (autofix) { t.description = String(t.description); fixed++; }
    }
    // time fields
    for (const field of ['deadline', 'createdAt', 'updatedAt']) {
      const val = t[field];
      if (val == null) {
        if (field !== 'deadline' && autofix) {
          const iso = new Date().toISOString();
          t[field] = iso; fixed++; issues.push({ type: 'missing_time', index: i, field, fix: iso });
        }
        continue;
      }
      if (typeof val !== 'string') {
        issues.push({ type: 'non_string_time', index: i, field, valueType: typeof val });
        continue;
      }
      const conv = toUtcIsoIfParseable(val);
      if (!conv.ok) {
        issues.push({ type: 'unparsable_time', index: i, field, value: val });
      } else if (conv.changed) {
        issues.push({ type: 'non_utc_time', index: i, field, value: val, fix: conv.value });
        if (autofix) { t[field] = conv.value; fixed++; }
      }
    }
  }

  // write back when autofix
  let backupPath;
  if (autofix) {
    try {
      if (backup) {
        const ts = new Date().toISOString().replaceAll(':', '').replaceAll('-', '').replace('.', '').replace('Z', 'Z');
        backupPath = abs + '.bak-' + ts;
        await cp(abs, backupPath);
      }
      const updated = JSON.stringify(data, null, 2) + '\n';
      await writeFile(abs, updated, 'utf8');
    } catch (e) {
      return { ok: false, error: 'Write failed' };
    }
  }

  return { ok: true, issues, fixed, ...(backupPath ? { backupPath } : {}) };
}

// Simple stdio JSON-RPC-like loop for a single request per run (for demo). If your agent connects differently, adapt as needed.
async function main() {
  // Support CLI invocation: node server.js --tool tasks-lint-fix --input '{...json...}'
  const args = process.argv.slice(2);
  const toolIdx = args.indexOf('--tool');
  const inputIdx = args.indexOf('--input');
  if (toolIdx !== -1 && inputIdx !== -1) {
    const toolName = args[toolIdx + 1];
    const inputRaw = args[inputIdx + 1];
    if (toolName !== 'tasks-lint-fix') {
      console.log(JSON.stringify({ ok: false, error: 'Unknown tool' }));
      process.exit(0);
    }
    let input;
    try { input = JSON.parse(inputRaw); } catch {
      console.log(JSON.stringify({ ok: false, error: 'Invalid input JSON' }));
      process.exit(0);
    }
    const res = await lintFix({ filePath: input.path, autofix: !!input.autofix, backup: input.backup !== false });
    console.log(JSON.stringify(res));
    process.exit(0);
    return;
  }

  // Fallback: TCP server demo for agents that open a port and send a single JSON payload
  const port = process.env.MCP_PORT ? Number(process.env.MCP_PORT) : 7123;
  const server = createServer((socket) => {
    let buf = '';
    socket.on('data', (chunk) => { buf += chunk.toString('utf8'); });
    socket.on('end', async () => {
      let payload;
      try { payload = JSON.parse(buf); } catch {
        socket.end(JSON.stringify({ ok: false, error: 'Invalid input JSON' }));
        return;
      }
      if (payload.tool !== 'tasks-lint-fix') {
        socket.end(JSON.stringify({ ok: false, error: 'Unknown tool' }));
        return;
      }
      const res = await lintFix({ filePath: payload.path, autofix: !!payload.autofix, backup: payload.backup !== false });
      socket.end(JSON.stringify(res));
    });
  });
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`tasks-lint-fix MCP listening on ${port}`);
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
