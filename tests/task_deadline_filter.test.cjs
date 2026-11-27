'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// Импортируем чистые функции фильтрации
const {
  boundariesOfToday,
  filterTasks,
  includeByDeadline,
} = require('../practices/practice_04/task_planner/public/filter.js');

function iso(d) { return new Date(d).toISOString(); }
function makeTask({ title='t', description='', priority='normal', deadline=null, done=false }){
  return { id: Math.random().toString(36).slice(2), title, description, priority, deadline, done, createdAt: iso(Date.now()), updatedAt: iso(Date.now()) };
}

test('boundariesOfToday returns local day [start, next) with start at 00:00', () => {
  const now = new Date('2026-10-26T12:34:56.789Z');
  const [start, next] = boundariesOfToday(now);
  assert.equal(start.getHours(), 0);
  assert.equal(start.getMinutes(), 0);
  assert.equal(start.getSeconds(), 0);
  assert.equal(start.getMilliseconds(), 0);
  assert.ok(next > start);
  // next - start == ~1 day
  assert.equal((next - start), 24*60*60*1000);
});

test('includeByDeadline: overdue excludes done, strictly < now; now equals is not overdue', () => {
  const now = new Date('2026-10-26T15:00:00.000Z');
  const past = iso(new Date(now.getTime() - 1000));
  const exact = iso(now);
  const future = iso(new Date(now.getTime() + 1000));
  assert.equal(includeByDeadline(makeTask({deadline: past, done:false}), 'overdue', now), true);
  assert.equal(includeByDeadline(makeTask({deadline: past, done:true}), 'overdue', now), false);
  assert.equal(includeByDeadline(makeTask({deadline: exact, done:false}), 'overdue', now), false);
  assert.equal(includeByDeadline(makeTask({deadline: future, done:false}), 'overdue', now), false);
});

test('includeByDeadline: today includes startOfToday, excludes startOfTomorrow (local TZ)', () => {
  const now = new Date('2026-10-26T12:00:00.000Z');
  const [start, next] = boundariesOfToday(now);
  const atStart = iso(start);
  const beforeNext = iso(new Date(next.getTime()-1));
  const atNext = iso(next);
  assert.equal(includeByDeadline(makeTask({deadline: atStart}), 'today', now), true);
  assert.equal(includeByDeadline(makeTask({deadline: beforeNext}), 'today', now), true);
  assert.equal(includeByDeadline(makeTask({deadline: atNext}), 'today', now), false);
});

test('includeByDeadline: no-deadline only when deadline === null; invalid ISO is treated as not matching', () => {
  const now = new Date('2026-10-26T12:00:00.000Z');
  assert.equal(includeByDeadline(makeTask({deadline: null}), 'no-deadline', now), true);
  assert.equal(includeByDeadline(makeTask({deadline: 'not-a-date'}), 'no-deadline', now), false);
  assert.equal(includeByDeadline(makeTask({deadline: 'not-a-date'}), 'today', now), false);
  assert.equal(includeByDeadline(makeTask({deadline: 'not-a-date'}), 'overdue', now), false);
});

test('an empty non-null deadline is invalid, not a task without a deadline', () => {
  const now = new Date('2026-10-26T12:00:00.000Z');
  const task = makeTask({ deadline: '' });
  assert.equal(includeByDeadline(task, 'no-deadline', now), false);
  assert.equal(includeByDeadline(task, 'all', now), true);
});

test('filterTasks: modes all|overdue|today|no-deadline and intersections with search/priority/status', () => {
  // Явно привязываем now к локальному началу дня, чтобы todayMid > now
  const anchor = new Date('2026-10-26T12:00:00.000Z');
  const [start, next] = boundariesOfToday(anchor);
  const now = new Date(start.getTime() + 11*3600_000); // 11:00 локального дня
  const yesterday = iso(new Date(start.getTime() - 3600_000));
  const todayMid = iso(new Date(start.getTime() + 12*3600_000)); // 12:00 локального дня, > now
  const tomorrow = iso(new Date(next.getTime() + 3600_000));
  const tasks = [
    makeTask({ title:'report', priority:'high', deadline: yesterday, done:false }), // overdue
    makeTask({ title:'done-overdue', priority:'high', deadline: yesterday, done:true }), // overdue but done
    makeTask({ title:'today task', priority:'normal', deadline: todayMid, done:false }), // today
    makeTask({ title:'no dl', priority:'low', deadline: null, done:false }), // no-deadline
    makeTask({ title:'tomorrow', priority:'normal', deadline: tomorrow, done:false }), // future
  ];
  const base = { search:'', priority:'all', filter:'all', deadline:'all' };
  // all
  assert.equal(filterTasks(tasks, base, now).length, 5);
  // overdue excludes done, и не включает todayMid, так как todayMid > now
  assert.deepEqual(filterTasks(tasks, { ...base, deadline:'overdue' }, now).map(t=>t.title), ['report']);
  // today includes only within [start;next)
  assert.deepEqual(filterTasks(tasks, { ...base, deadline:'today' }, now).map(t=>t.title), ['today task']);
  // no-deadline only nulls
  assert.deepEqual(filterTasks(tasks, { ...base, deadline:'no-deadline' }, now).map(t=>t.title), ['no dl']);
  // search intersection
  assert.deepEqual(filterTasks(tasks, { ...base, search:'rep', deadline:'overdue' }, now).map(t=>t.title), ['report']);
  // priority intersection
  assert.deepEqual(filterTasks(tasks, { ...base, priority:'high', deadline:'overdue' }, now).map(t=>t.title), ['report']);
  // status active
  assert.deepEqual(filterTasks(tasks, { ...base, filter:'active', deadline:'overdue' }, now).map(t=>t.title), ['report']);
  // status done with today -> only done in today
  const doneToday = makeTask({ title:'done today', deadline: todayMid, done: true });
  const mix = [...tasks, doneToday];
  assert.deepEqual(filterTasks(mix, { ...base, filter:'done', deadline:'today' }, now).map(t=>t.title), ['done today']);
});

test('UTC date belonging to a different local day classifies by local boundaries', () => {
  const previousTZ = process.env.TZ;
  try {
    process.env.TZ = 'Europe/Moscow';
    const now = new Date('2026-10-26T09:00:00.000Z');
    assert.deepEqual(boundariesOfToday(now).map(iso), ['2026-10-25T21:00:00.000Z', '2026-10-26T21:00:00.000Z']);
    assert.equal(includeByDeadline(makeTask({ deadline: '2026-10-25T21:00:00.000Z' }), 'today', now), true);
    assert.equal(includeByDeadline(makeTask({ deadline: '2026-10-26T21:00:00.000Z' }), 'today', now), false);
  } finally {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
  }
});

test('local today spans 25 hours on the New York daylight-saving transition', () => {
  const previousTZ = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    const now = new Date('2026-11-01T12:00:00.000Z');
    assert.deepEqual(boundariesOfToday(now).map(iso), ['2026-11-01T04:00:00.000Z', '2026-11-02T05:00:00.000Z']);
    assert.equal(includeByDeadline(makeTask({ deadline: '2026-11-02T04:30:00.000Z' }), 'today', now), true);
    assert.equal(includeByDeadline(makeTask({ deadline: '2026-11-02T05:00:00.000Z' }), 'today', now), false);
  } finally {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
  }
});
