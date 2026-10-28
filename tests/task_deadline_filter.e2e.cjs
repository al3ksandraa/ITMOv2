'use strict';

// Real HTTP + browser verification; the application runs on a disposable copy.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'practices/practice_04/task_planner');
const FEATURE = path.join(ROOT, '.specify/features/task-deadline-filter');
const EVIDENCE = path.join(ROOT, 'practices/practice_05/evidence/deadline-filter');
const NOW = '2026-10-26T09:00:00.000Z'; // 12:00 Europe/Moscow
const FIXTURES = [
  { title: 'tomorrow', deadline: '2026-10-26T21:00:00.000Z' },
  { title: 'yesterday-active', deadline: '2026-10-25T20:59:59.999Z' },
  { title: 'yesterday-done', deadline: '2026-10-25T20:59:59.999Z', done: true },
  { title: 'today-future', deadline: '2026-10-26T15:00:00.000Z', priority: 'high' },
  { title: 'today-done', deadline: '2026-10-26T06:00:00.000Z', priority: 'high', done: true },
  { title: 'today-past', description: 'Needle in description', deadline: '2026-10-26T06:00:00.000Z', priority: 'high' },
  { title: 'without-deadline', deadline: null, priority: 'low' },
  { title: 'start-of-day', deadline: '2026-10-25T21:00:00.000Z' },
  { title: 'end-of-day', deadline: '2026-10-26T20:59:59.999Z' },
  { title: 'exact-now', deadline: NOW },
];
const ALL = FIXTURES.map(task => task.title);
const TODAY = ['today-future', 'today-done', 'today-past', 'start-of-day', 'end-of-day', 'exact-now'];
const SORTED = ['yesterday-active', 'yesterday-done', 'start-of-day', 'today-done', 'today-past', 'exact-now', 'today-future', 'end-of-day', 'tomorrow', 'without-deadline'];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function freePort() {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return port;
}

async function launchBrowser() {
  const options = { headless: true };
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) {
    options.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  } else if (process.env.PLAYWRIGHT_CHANNEL) {
    options.channel = process.env.PLAYWRIGHT_CHANNEL;
  } else if (!fs.existsSync(chromium.executablePath()) && process.platform === 'win32') {
    // Reuse an installed browser when the separate Playwright download is absent.
    const chrome = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
      .filter(Boolean).some(root => fs.existsSync(path.join(root, 'Google/Chrome/Application/chrome.exe')));
    options.channel = chrome ? 'chrome' : 'msedge';
  }
  return chromium.launch(options);
}

async function run() {
  const results = [];
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'task-deadline-e2e-'));
  const originalData = fs.readFileSync(path.join(APP, 'data/tasks.json'));
  let server;
  let browser;
  let base;
  let fatal;
  let browserVersion;
  let userDataUnchanged = false;
  let serverLogs = '';
  const startedAt = new Date().toISOString();
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.mkdirSync(FEATURE, { recursive: true });

  async function api(method, suffix = '', body, expectedStatus = 200) {
    const response = await fetch(`${base}/api/tasks${suffix}`, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal(response.status, expectedStatus, `${method} /api/tasks${suffix}`);
    return response.json();
  }

  async function scenario(name, expectation, check, options = {}) {
    if (process.env.E2E_CASE && !name.includes(process.env.E2E_CASE)) return;
    const context = await browser.newContext({ timezoneId: options.timezone || 'Europe/Moscow', locale: 'ru-RU', viewport: { width: 1200, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(4000);
    const errors = [];
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (new URL(request.url()).pathname.startsWith('/api/')) {
        requests.push(`${request.method()} ${new URL(request.url()).pathname}`);
      }
    });
    let facts = {};
    const titles = () => page.locator('#task-list .task .title').allTextContents();
    const mode = value => page.selectOption('#deadline-filter', value);
    const expectTitles = async want => {
      await assertEventually(async () => assert.deepEqual(await titles(), want));
      facts.titles = await titles();
    };
    try {
      await page.clock.setFixedTime(new Date(NOW));
      if (options.prepare) await options.prepare(page);
      await page.goto(base, { waitUntil: options.deferred ? 'domcontentloaded' : 'networkidle' });
      assert.deepEqual(errors, [], 'No browser JavaScript errors');
      if (!options.deferred) {
        await assertEventually(async () => assert.equal((await titles()).length, (options.initialTitles || ALL).length));
        assert.deepEqual(requests, ['GET /api/tasks'], 'One initial load');
        requests.length = 0;
      }
      const extra = await check({ page, titles, mode, expectTitles, requests });
      facts = { ...facts, ...extra };
      assert.deepEqual(errors, [], 'No browser JavaScript errors');
      if (!options.allowNetwork && !options.deferred) {
        assert.deepEqual(requests, [], 'Filtering/reset/sorting must not call the API');
      }
      facts.apiRequests = [...requests];
      if (options.screenshot) {
        const filename = `${name}.png`;
        await page.screenshot({ path: path.join(EVIDENCE, filename), fullPage: true });
        facts.screenshot = filename;
      }
      results.push({ name, expectation, status: 'PASS', timezone: options.timezone || 'Europe/Moscow', facts });
      console.log(`PASS ${name}`);
    } catch (error) {
      await page.screenshot({ path: path.join(EVIDENCE, `${name}-failure.png`), fullPage: true }).catch(() => {});
      results.push({ name, expectation, status: 'FAIL', timezone: options.timezone || 'Europe/Moscow', facts, error: error.stack });
      console.error(`FAIL ${name}: ${error.message}`);
    } finally {
      await context.close();
    }
  }

  try {
    fs.copyFileSync(path.join(APP, 'server.js'), path.join(temp, 'server.js'));
    fs.cpSync(path.join(APP, 'public'), path.join(temp, 'public'), { recursive: true });
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ['server.js'], { cwd: temp, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', data => { serverLogs += data; });
    server.stderr.on('data', data => { serverLogs += data; });
    await assertEventually(async () => {
      assert.equal(server.exitCode, null, serverLogs);
      assert.equal((await fetch(`${base}/api/tasks`)).status, 200);
    });
    for (const fixture of FIXTURES) {
      const { done, ...body } = fixture;
      const task = await api('POST', '', body, 201);
      if (done) await api('PUT', `/${task.id}`, { done: true });
    }
    browser = await launchBrowser();
    browserVersion = browser.version();

    await scenario('01-initial-load', 'Real page loads tasks without JavaScript errors; all four options are available.', async ({ page, expectTitles }) => {
      await expectTitles(ALL);
      assert.deepEqual(await page.locator('#deadline-filter option').evaluateAll(nodes => nodes.map(node => [node.value, node.textContent])), [
        ['all', 'Все'], ['overdue', 'Просроченные'], ['today', 'Сегодня'], ['no-deadline', 'Без дедлайна'],
      ]);
      assert.equal(await page.locator('#empty-state').isVisible(), false);
      return { emptyStateVisible: false };
    });
    await scenario('02-overdue', 'Only unfinished tasks strictly before now, including earlier today; exact-now excluded.', async ({ mode, expectTitles }) => {
      await mode('overdue');
      await expectTitles(['yesterday-active', 'today-past', 'start-of-day']);
    });
    await scenario('03-today-moscow', 'Local start inclusive, next midnight exclusive; completed tasks included.', async ({ mode, expectTitles }) => {
      await mode('today');
      await expectTitles(TODAY);
    }, { screenshot: true });
    await scenario('04-without-deadline', 'Only deadline === null; all restores original order.', async ({ mode, expectTitles }) => {
      await mode('no-deadline');
      await expectTitles(['without-deadline']);
      await mode('all');
      await expectTitles(ALL);
    });
    await scenario('05-filter-intersections', 'Deadline AND description search AND priority AND status.', async ({ page, mode, expectTitles }) => {
      await mode('today');
      await page.selectOption('#priority-filter', 'high');
      await page.click('#show-active');
      await page.fill('#search', '  NEEDLE  ');
      await expectTitles(['today-past']);
      await page.fill('#search', '');
      await page.click('#show-done');
      await expectTitles(['today-done']);
    });
    await scenario('06-empty-result', 'Done AND overdue is empty; message shown after list and hidden when results return.', async ({ page, mode, expectTitles }) => {
      await mode('overdue');
      await page.click('#show-done');
      await expectTitles([]);
      assert.equal(await page.locator('#empty-state').isVisible(), true);
      assert.equal(await page.locator('#empty-state').textContent(), 'Нет задач по выбранным критериям');
      assert.equal(await page.locator('#task-list + #empty-state[role="status"]').count(), 1);
      await page.screenshot({ path: path.join(EVIDENCE, '06-empty-result.png'), fullPage: true });
      await page.click('#show-all');
      await expectTitles(['yesterday-active', 'today-past', 'start-of-day']);
      assert.equal(await page.locator('#empty-state').isVisible(), false);
      await page.fill('#search', 'nothing-matches-this');
      await expectTitles([]);
      assert.equal(await page.locator('#empty-state').isVisible(), true);
    });
    await scenario('07-reset-and-sort', 'Reset restores all filters, clears selection, preserves sorted full list, no API calls.', async ({ page, mode, expectTitles }) => {
      await page.click('#sort-deadline');
      await mode('today');
      await page.selectOption('#priority-filter', 'high');
      await page.click('#show-active');
      await page.fill('#search', 'today');
      await expectTitles(['today-past', 'today-future']);
      await page.locator('.select-task').first().check();
      await page.click('#reset-filters');
      await expectTitles(SORTED);
      assert.equal(await page.locator('#search').inputValue(), '');
      assert.equal(await page.locator('#priority-filter').inputValue(), 'all');
      assert.equal(await page.locator('#deadline-filter').inputValue(), 'all');
      assert.equal(await page.locator('.select-task:checked').count(), 0);
      await page.click('#reset-filters');
      await expectTitles(SORTED);
      await mode('today');
      await expectTitles(['start-of-day', 'today-done', 'today-past', 'exact-now', 'today-future', 'end-of-day']);
    }, { screenshot: true });
    await scenario('08-today-new-york', 'Same UTC fixtures classify by New York local day, not UTC or Moscow.', async ({ mode, expectTitles }) => {
      await mode('today');
      await expectTitles(['tomorrow', 'today-future', 'today-done', 'today-past', 'end-of-day', 'exact-now']);
    }, { timezone: 'America/New_York', screenshot: true });
    await scenario('09-clock-refresh', 'Each render uses a fresh now; an exact-now task becomes overdue after time advances.', async ({ page, mode, expectTitles }) => {
      await mode('overdue');
      await expectTitles(['yesterday-active', 'today-past', 'start-of-day']);
      await page.clock.setFixedTime(new Date('2026-10-26T09:00:00.001Z'));
      await page.click('#show-active');
      await expectTitles(['yesterday-active', 'today-past', 'start-of-day', 'exact-now']);
      await page.clock.setFixedTime(new Date('2026-10-26T21:00:00.000Z'));
      await mode('today');
      await expectTitles(['tomorrow']);
    });
    await scenario('10-invalid-deadline', 'Invalid non-null deadline matches all, but neither today, overdue nor no-deadline.', async ({ page, mode, titles }) => {
      const task = await api('POST', '', { title: 'invalid-deadline', deadline: 'not-a-date' }, 201);
      try {
        await page.reload({ waitUntil: 'networkidle' });
        assert.ok((await titles()).includes('invalid-deadline'));
        for (const value of ['today', 'overdue', 'no-deadline']) {
          await mode(value);
          assert.equal((await titles()).includes('invalid-deadline'), false);
        }
        return { invalidExcludedFrom: ['today', 'overdue', 'no-deadline'] };
      } finally { await api('DELETE', `/${task.id}`); }
    }, { allowNetwork: true });
    await scenario('11-crud-local-time', 'UI create/edit/delete preserves entered local deadline as the correct UTC instant.', async ({ page, titles }) => {
      let task;
      try {
        await page.fill('#title', 'UI-created');
        await page.fill('#description', 'UI description');
        await page.fill('#deadline', '2026-10-26T12:30');
        const created = page.waitForResponse(response => response.url().endsWith('/api/tasks') && response.request().method() === 'POST');
        await page.locator('button[type="submit"]').click();
        task = await (await created).json();
        assert.equal(task.deadline, '2026-10-26T09:30:00.000Z');
        await assertEventually(async () => assert.ok((await titles()).includes('UI-created')));
        const answers = ['UI-edited', 'Changed description', '2026-10-26T13:45', 'high'];
        page.on('dialog', dialog => dialog.accept(answers.shift()));
        const updated = page.waitForResponse(response => response.request().method() === 'PUT');
        await page.locator(`li[data-id="${task.id}"] .edit`).click();
        const edited = await (await updated).json();
        assert.equal(edited.title, 'UI-edited');
        assert.equal(edited.description, 'Changed description');
        assert.equal(edited.priority, 'high');
        assert.equal(edited.deadline, '2026-10-26T10:45:00.000Z');
        const deleted = page.waitForResponse(response => response.request().method() === 'DELETE');
        await page.locator(`li[data-id="${task.id}"] .delete`).click();
        assert.equal((await deleted).status(), 200);
        await assertEventually(async () => assert.equal(await page.locator(`li[data-id="${task.id}"]`).count(), 0));
        return { createdDeadline: task.deadline, editedDeadline: edited.deadline, deleted: true };
      } finally {
        if (task && (await api('GET')).some(item => item.id === task.id)) await api('DELETE', `/${task.id}`);
      }
    }, { allowNetwork: true });
    await scenario('12-complete-and-bulk', 'Completion rerenders overdue; bulk completion and deletion use the existing sequential API.', async ({ page }) => {
      const created = [];
      try {
        for (const title of ['bulk-first', 'bulk-second']) {
          created.push(await api('POST', '', { title, deadline: '2026-10-25T12:00:00.000Z' }, 201));
        }
        await page.reload({ waitUntil: 'networkidle' });
        await page.selectOption('#deadline-filter', 'overdue');
        const single = page.waitForResponse(response => response.request().method() === 'PUT');
        // Completion immediately removes this row from the overdue view. check()
        // would re-query a checkbox which correctly no longer exists after click.
        await page.locator(`li[data-id="${created[0].id}"] .done-toggle`).click();
        assert.equal((await single).status(), 200);
        await assertEventually(async () => assert.equal(await page.locator(`li[data-id="${created[0].id}"]`).count(), 0));
        await page.click('#reset-filters');
        for (const item of created) await page.locator(`li[data-id="${item.id}"] .select-task`).check();
        await page.click('#bulk-complete');
        await assertEventually(async () => {
          const tasks = await api('GET');
          for (const item of created) assert.equal(tasks.find(task => task.id === item.id).done, true);
          for (const item of created) assert.equal(await page.locator(`li[data-id="${item.id}"] .done-toggle`).isChecked(), true);
        });
        for (const item of created) await page.locator(`li[data-id="${item.id}"] .select-task`).check();
        await page.click('#bulk-delete');
        await assertEventually(async () => {
          const tasks = await api('GET');
          for (const item of created) assert.equal(tasks.some(task => task.id === item.id), false);
          for (const item of created) assert.equal(await page.locator(`li[data-id="${item.id}"]`).count(), 0);
        });
        return { singleComplete: true, bulkComplete: 2, bulkDelete: 2 };
      } finally {
        const remaining = await api('GET');
        for (const item of created) if (remaining.some(task => task.id === item.id)) await api('DELETE', `/${item.id}`);
      }
    }, { allowNetwork: true });

    let releaseLoad;
    await scenario('13-loading-state', 'Empty message stays hidden during initial loading and user filter changes.', async ({ page }) => {
      await page.selectOption('#deadline-filter', 'today');
      assert.equal(await page.locator('#empty-state').isVisible(), false);
      releaseLoad();
      await assertEventually(async () => assert.equal(await page.locator('#task-list .task').count(), TODAY.length));
      assert.equal(await page.locator('#empty-state').isVisible(), false);
      return { hiddenWhileLoading: true };
    }, {
      deferred: true,
      prepare: page => page.route('**/api/tasks', async route => {
        await new Promise(resolve => { releaseLoad = resolve; });
        await route.continue();
      }),
    });
    await scenario('14-load-error', 'Failed initial GET is not displayed as an empty successful result, including after filter/reset.', async ({ page }) => {
      await page.selectOption('#deadline-filter', 'no-deadline');
      await page.click('#reset-filters');
      assert.equal(await page.locator('#empty-state').isVisible(), false);
      return { hiddenAfterLoadFailure: true };
    }, {
      deferred: true,
      prepare: page => page.route('**/api/tasks', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"test failure"}' })),
    });
    await scenario('16-keyboard-filter', 'The labelled deadline control is reachable by Tab; arrow/Home/End keys filter tasks without losing focus or calling the API.', async ({ page, expectTitles }) => {
      const control = page.getByRole('combobox', { name: 'Срок', exact: true });
      assert.equal(await control.count(), 1, 'The control has an accessible label');
      await page.locator('#priority-filter').focus();
      await page.keyboard.press('Tab');
      const expectFocus = async id => assert.equal(await page.evaluate(() => document.activeElement.id), id);
      await expectFocus('deadline-filter');
      await page.keyboard.press('ArrowDown');
      assert.equal(await control.inputValue(), 'overdue');
      await expectTitles(['yesterday-active', 'today-past', 'start-of-day']);
      await expectFocus('deadline-filter');
      await page.keyboard.press('ArrowDown');
      assert.equal(await control.inputValue(), 'today');
      await expectTitles(TODAY);
      await expectFocus('deadline-filter');
      await page.keyboard.press('End');
      assert.equal(await control.inputValue(), 'no-deadline');
      await expectTitles(['without-deadline']);
      await expectFocus('deadline-filter');
      await page.keyboard.press('Home');
      assert.equal(await control.inputValue(), 'all');
      await expectTitles(ALL);
      await expectFocus('deadline-filter');
      await page.keyboard.press('Tab');
      await expectFocus('reset-filters');
      await page.keyboard.press('Shift+Tab');
      await expectFocus('deadline-filter');
      return { accessibleName: 'Срок', keyboardModes: ['overdue', 'today', 'no-deadline', 'all'], focusPreserved: true, tabToResetAndBack: true };
    }, { screenshot: true });
    for (const task of await api('GET')) await api('DELETE', `/${task.id}`);
    await scenario('15-empty-storage', 'An empty successful API response displays the empty message; repeated reset remains safe.', async ({ page, expectTitles }) => {
      await expectTitles([]);
      assert.equal(await page.locator('#empty-state').isVisible(), true);
      await page.click('#reset-filters');
      await page.click('#reset-filters');
      await expectTitles([]);
      assert.equal(await page.locator('#empty-state').isVisible(), true);
      return { successfulEmptyLoad: true };
    }, { initialTitles: [] });
  } catch (error) {
    fatal = error;
    console.error(error.stack);
  } finally {
    if (browser) await browser.close().catch(error => { fatal ||= error; });
    if (server && server.exitCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
    try {
      assert.deepEqual(fs.readFileSync(path.join(APP, 'data/tasks.json')), originalData, 'User data must remain byte-for-byte unchanged');
      userDataUnchanged = true;
      // Delete only our own verified temporary directory, never the application.
      assert.equal(path.dirname(temp), os.tmpdir());
      assert.ok(path.basename(temp).startsWith('task-deadline-e2e-'));
      fs.rmSync(temp, { recursive: true, force: true });
    } catch (error) { fatal ||= error; }
    const summary = { startedAt, finishedAt: new Date().toISOString(), command: 'node tests/task_deadline_filter.e2e.cjs', platform: process.platform, node: process.version, playwright: require('playwright/package.json').version, browser: browserVersion, fixedNow: NOW, isolatedData: true, userDataUnchanged, results, fatal: fatal?.stack };
    fs.writeFileSync(path.join(EVIDENCE, 'results.json'), JSON.stringify(summary, null, 2) + '\n');
    const escape = text => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ');
    const lines = [
      '# Сквозная проверка task-deadline-filter', '',
      `Запуск: ${summary.startedAt}. Команда: \`${summary.command}\`.`,
      `Окружение: ${process.platform}, Node ${process.version}, Playwright ${summary.playwright}, Chrome/Chromium ${browserVersion || 'не запущен'}.`,
      `Фиксированное время: ${NOW}; зоны Europe/Moscow и America/New_York.`, '',
      'Проверка выполняется библиотекой Playwright напрямую, без MCP. Реальные HTTP API и браузер; временная копия server.js/public, отдельный data/tasks.json. Пользовательские данные не изменяются.', '',
      `Побайтовое сравнение пользовательского data/tasks.json до и после проверки: ${userDataUnchanged ? 'PASS' : 'FAIL'}.`, '',
      '| Сценарий | Ожидание | Результат и факты |', '|---|---|---|',
      ...results.map(result => `| ${result.name} (${result.timezone}) | ${escape(result.expectation)} | ${result.status}: ${escape(result.error || JSON.stringify(result.facts))} |`), '',
      `Итог: ${results.filter(result => result.status === 'PASS').length}/${results.length} PASS${fatal ? '; ошибка окружения/очистки: ' + escape(fatal.message) : ''}.`, '',
      'Доказательства: [машиночитаемый отчёт](../../../practices/practice_05/evidence/deadline-filter/results.json), снимки экрана в той же папке.',
      'Unit-тесты и scripts/check.sh запускаются отдельно; этот отчёт не утверждает их успешность.', '',
    ];
    fs.writeFileSync(path.join(FEATURE, 'verification.md'), lines.join('\n'), 'utf8');
  }
  const ok = !fatal && results.length > 0 && results.every(result => result.status === 'PASS');
  console.log(JSON.stringify({ ok, passed: results.filter(result => result.status === 'PASS').length, total: results.length, report: path.relative(ROOT, path.join(FEATURE, 'verification.md')) }));
  if (!ok) process.exitCode = 1;
  return { ok, results };
}

async function assertEventually(check, timeout = 4000) {
  const start = Date.now();
  while (true) {
    try { return await check(); } catch (error) {
      if (Date.now() - start >= timeout) throw error;
      await delay(25);
    }
  }
}

module.exports = { run };
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
