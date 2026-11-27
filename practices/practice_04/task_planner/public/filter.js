'use strict';

function boundariesOfToday(now) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const next = new Date(start);
  next.setDate(next.getDate() + 1);
  return [start, next];
}

function normalize(str) {
  return (str || '').toString().trim().toLowerCase();
}

function matchesQuery(t, q) {
  if (!q) return true;
  const title = (t.title || '').toLowerCase();
  const desc = (t.description || '').toLowerCase();
  return title.includes(q) || desc.includes(q);
}

function includeByDeadline(task, mode, now) {
  if (mode === 'all') return true;
  const d = task.deadline ? new Date(task.deadline) : null;
  if (mode === 'overdue') {
    if (task.done) return false;
    if (!d || isNaN(d)) return false;
    return d.getTime() < now.getTime();
  }
  if (mode === 'today') {
    if (!d || isNaN(d)) return false;
    const [start, next] = boundariesOfToday(now);
    return d >= start && d < next;
  }
  if (mode === 'no-deadline') {
    return task.deadline === null;
  }
  return true;
}

function filterTasks(tasks, state, now) {
  const q = normalize(state.search);
  const pri = state.priority;
  const st = state.filter;
  const dl = state.deadline || 'all';
  const nowDate = now instanceof Date ? now : new Date(now);

  let out = tasks.filter((t) => {
    if (st === 'done' && !t.done) return false;
    if (st === 'active' && t.done) return false;
    if (q && !matchesQuery(t, q)) return false;
    if (pri && pri !== 'all' && (t.priority || 'normal') !== pri) return false;
    if (!includeByDeadline(t, dl, nowDate)) return false;
    return true;
  });
  return out;
}

const TaskFilterAPI = { boundariesOfToday, includeByDeadline, filterTasks };

// Expose for browser usage without bundler
try {
  if (typeof window !== 'undefined') {
    window.TaskFilter = TaskFilterAPI;
  }
} catch (_) {}

// Export for node:test
try {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TaskFilterAPI;
  }
} catch (_) {}
