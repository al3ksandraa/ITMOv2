const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { chromium, expect, test } = require('@playwright/test');

const app = path.resolve(__dirname, '../practices/practice_04/task_planner');
const chrome = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
  .filter(Boolean).some(root => existsSync(path.join(root, 'Google/Chrome/Application/chrome.exe')));
const channel = process.env.PLAYWRIGHT_CHANNEL || (
  process.platform === 'win32' && !existsSync(chromium.executablePath()) ? (chrome ? 'chrome' : 'msedge') : undefined
);
test.use({
  actionTimeout: 5000,
  channel,
  launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH },
  timezoneId: 'Europe/Moscow',
});

let directory;
let server;
let url;

test.beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'task-planner-form-'));
  await fs.copyFile(path.join(app, 'server.js'), path.join(directory, 'server.js'));
  await fs.cp(path.join(app, 'public'), path.join(directory, 'public'), { recursive: true });

  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  url = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['server.js'], { cwd: directory, env: { ...process.env, PORT: String(port) } });
  await expect.poll(async () => {
    const response = await fetch(`${url}/api/tasks`).catch(() => null);
    return response?.status;
  }).toBe(200);
});

test.afterEach(async () => {
  if (server?.exitCode === null && server.signalCode === null) {
    const closed = once(server, 'close');
    server.kill();
    await closed;
  }
  if (directory) await fs.rm(directory, { recursive: true, force: true, maxRetries: 3 });
  directory = undefined;
  server = undefined;
});

test('пустое название и пробелы показывают ошибку поля без создания задачи', async ({ page }) => {
  const postRequests = [];
  page.on('request', request => {
    if (request.url() === `${url}/api/tasks` && request.method() === 'POST') postRequests.push(request);
  });

  await page.goto(url);
  const title = page.getByRole('textbox', { name: 'Название' });
  const submit = page.getByRole('button', { name: 'Добавить задачу', exact: true });
  for (const value of ['', '   ']) {
    await title.fill(value);
    await submit.click();
    await expect(page.getByText('Введите название задачи', { exact: true })).toBeVisible();
    await expect(title).toBeFocused();
    await expect(title).toHaveAttribute('aria-invalid', 'true');
  }
  expect(postRequests).toHaveLength(0);
  await title.fill('Сдать лабораторную');
  await expect(page.getByText('Введите название задачи', { exact: true })).toBeHidden();
  await expect(page.getByText('Обязательное поле, до 200 символов. 18/200')).toBeVisible();
});

test('форма отправляется с клавиатуры и показывает карточку из ответа 201', async ({ page }) => {
  await page.route('**/api/tasks', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] });
    if (route.request().method() !== 'POST') return route.continue();

    await route.fulfill({
      status: 201,
      json: {
        id: '1922356800000-example',
        title: 'Проверить приложение к отчёту',
        description: 'Приложить схему и таблицу результатов',
        priority: 'high',
        deadline: '2030-12-01T15:00:00.000Z',
        done: false,
        createdAt: '2030-11-30T12:00:00.000Z',
        updatedAt: '2030-11-30T12:00:00.000Z',
      },
    });
  });
  await page.goto(url);
  await expect(page.getByText('Задач пока нет', { exact: true })).toBeVisible();

  const title = page.getByRole('textbox', { name: 'Название' });
  await title.fill('Проверить приложение к отчёту');
  await page.getByRole('textbox', { name: 'Описание' }).fill('Приложить схему и таблицу результатов');
  await page.getByLabel('Дедлайн', { exact: true }).fill('2030-12-01T18:00');
  await page.locator('#task-form').getByRole('combobox', { name: 'Приоритет' }).selectOption('high');
  await title.press('Enter');

  const card = page.getByRole('listitem').filter({ hasText: 'Проверить приложение к отчёту' });
  await expect(card).toBeVisible();
  await expect(card.getByText('Высокий приоритет')).toBeVisible();
  await expect(card.getByText('Приложить схему и таблицу результатов')).toBeVisible();
  await expect(page.getByText('Задача добавлена', { exact: true })).toBeVisible();
  await expect(title).toHaveValue('');
});

test('повторная отправка во время ожидания создаёт одну задачу в реальном API', async ({ page }) => {
  let postCount = 0;
  let releasePost;
  const pending = new Promise(resolve => { releasePost = resolve; });
  await page.route('**/api/tasks', async route => {
    if (route.request().method() === 'POST') {
      postCount += 1;
      await pending;
    }
    await route.continue();
  });
  await page.goto(url);
  const title = page.getByRole('textbox', { name: 'Название' });
  await title.fill('Сдать лабораторную');
  await page.getByLabel('Описание', { exact: true }).fill('Проверить отчёт');
  await page.getByLabel('Дедлайн', { exact: true }).fill('2030-12-01T18:00');
  const priority = page.locator('#task-form').getByRole('combobox');
  await priority.selectOption('high');
  const submit = page.getByRole('button', { name: 'Добавить задачу', exact: true });
  const button = await submit.boundingBox();

  try {
    await submit.click();
    await expect(page.getByRole('button', { name: 'Сохраняем…' })).toBeDisabled();
    await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2);
    await page.keyboard.press('Enter');
    await page.locator('#task-form').evaluate(form => form.requestSubmit());
  } finally {
    releasePost();
  }

  await expect(page.getByText('Задача добавлена', { exact: true })).toBeVisible();
  await expect(page.locator('#task-list').getByText('Сдать лабораторную', { exact: true })).toHaveCount(1);
  await expect(title).toHaveValue('');
  await expect(priority).toHaveValue('normal');
  expect(postCount).toBe(1);

  await page.reload();
  await expect(page.locator('#task-list').getByText('Сдать лабораторную', { exact: true })).toHaveCount(1);
  const stored = (await (await fetch(`${url}/api/tasks`)).json()).find(task => task.title === 'Сдать лабораторную');
  expect(stored.deadline).toBe('2030-12-01T15:00:00.000Z');
});

test('ошибка сохранения оставляет заполненную форму и даёт повторить отправку', async ({ page }) => {
  let failNextPost = true;
  await page.route('**/api/tasks', async route => {
    if (route.request().method() === 'POST' && failNextPost) {
      failNextPost = false;
      return route.fulfill({ status: 500, json: { error: 'Ошибка сохранения' } });
    }
    await route.continue();
  });
  await page.goto(url);
  const title = page.getByLabel('Название');
  const description = page.getByLabel('Описание', { exact: true });
  const deadline = page.getByLabel('Дедлайн', { exact: true });
  const priority = page.locator('#task-form').getByRole('combobox');
  const submit = page.getByRole('button', { name: 'Добавить задачу' });
  await title.fill('  Доделать конспект  ');
  await description.fill('Сверить формулы');
  await deadline.fill('2030-12-02T17:00');
  await priority.selectOption('low');
  await submit.click();
  await expect(page.getByRole('alert')).toContainText('Не удалось сохранить задачу');
  await expect(title).toHaveValue('  Доделать конспект  ');
  await expect(description).toHaveValue('Сверить формулы');
  await expect(deadline).toHaveValue('2030-12-02T17:00');
  await expect(priority).toHaveValue('low');
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.locator('#task-list').getByText('Доделать конспект', { exact: true })).toBeVisible();
});

test('загрузка, сбой списка и пустой ответ видны при повторной попытке', async ({ page }) => {
  let attempts = 0;
  let releaseLoad;
  const pending = new Promise(resolve => { releaseLoad = resolve; });
  await page.route('**/api/tasks', async route => {
    attempts += 1;
    if (attempts === 1) {
      await pending;
      return route.fulfill({ status: 500, json: { error: 'Ошибка загрузки' } });
    }
    await route.fulfill({ json: [] });
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  try {
    await expect(page.getByText('Загружаем задачи…', { exact: true })).toBeVisible();
    await expect(page.locator('#empty-state')).toBeHidden();
    await page.getByLabel('Название').fill('Черновик задачи');
  } finally {
    releaseLoad();
  }
  await expect(page.getByRole('alert')).toContainText('Не удалось загрузить задачи');
  await expect(page.locator('#empty-state')).toBeHidden();
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.getByText('Задач пока нет', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Название')).toHaveValue('Черновик задачи');
  expect(attempts).toBe(2);
});

test('успешное создание за активным фильтром подсказывает сброс', async ({ page }) => {
  await page.goto(url);
  const search = page.getByLabel('Поиск');
  await search.fill('несуществующий заголовок');
  await page.getByLabel('Название').fill('Повторить теорию');
  await page.getByRole('button', { name: 'Добавить задачу' }).click();
  await expect(page.getByText(/Задача добавлена.*Сбросить фильтры/)).toBeVisible();
  await expect(search).toHaveValue('несуществующий заголовок');
  await expect(page.locator('#task-list').getByText('Повторить теорию', { exact: true })).toBeHidden();
  await page.getByRole('region', { name: 'Задачи', exact: true }).getByRole('button', { name: 'Сбросить фильтры' }).click();
  await expect(page.locator('#task-list').getByText('Повторить теорию', { exact: true })).toBeVisible();
});

test('поздний ответ загрузки сохраняет только что добавленную задачу', async ({ page }) => {
  let releaseLoad;
  let snapshotReceived;
  const pending = new Promise(resolve => { releaseLoad = resolve; });
  const snapshot = new Promise(resolve => { snapshotReceived = resolve; });
  await page.route('**/api/tasks', async route => {
    if (route.request().method() === 'GET') {
      const oldSnapshot = await route.fetch();
      snapshotReceived();
      await pending;
      return route.fulfill({ response: oldSnapshot });
    }
    await route.continue();
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await snapshot;
  const card = page.locator('#task-list').getByText('Задача во время загрузки', { exact: true });
  const received = page.waitForResponse(response => response.url() === `${url}/api/tasks` && response.request().method() === 'GET');
  try {
    await page.getByLabel('Название').fill('Задача во время загрузки');
    await page.getByRole('button', { name: 'Добавить задачу' }).click();
    await expect(card).toBeVisible();
  } finally {
    releaseLoad();
  }
  await (await received).finished();
  await expect(page.getByText('Загружаем задачи…', { exact: true })).toBeHidden();
  await expect(page.getByText('Показано 1 из 1', { exact: true })).toBeVisible();
  await expect(card).toHaveCount(1);
});

test('мобильная карточка различает выбор и выполнение с клавиатуры', async ({ page }) => {
  await fetch(`${url}/api/tasks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Подготовить презентацию по курсовой' }),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  const done = page.getByRole('checkbox', { name: /Отметить выполненной.*Подготовить презентацию по курсовой/ });
  const select = page.getByRole('checkbox', { name: /Выбрать задачу.*Подготовить презентацию по курсовой/ });
  const title = page.getByText('Подготовить презентацию по курсовой', { exact: true });
  await expect(done).toBeVisible();
  await expect(select).toBeVisible();
  await done.focus();
  await expect(done).toBeFocused();
  await done.press('Space');
  await expect(title).toHaveCSS('text-decoration-line', 'line-through');
  await expect(select).not.toBeChecked();
  const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
  expect(widths.page).toBe(widths.viewport);
});

test('панель массового выбора учитывает видимые задачи и отображает счётчик', async ({ page }) => {
  for (const title of ['Проверить черновик', 'Согласовать план']) {
    await fetch(`${url}/api/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    });
  }
  await page.goto(url);
  await page.getByLabel('Поиск').fill('черновик');
  await page.getByRole('checkbox', { name: 'Выбрать все видимые' }).check();
  await expect(page.getByText('Выбрано: 1')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Выбрать задачу.*Проверить черновик/ })).toBeChecked();
  await page.getByRole('region', { name: 'Фильтры', exact: true }).getByRole('button', { name: 'Сбросить фильтры' }).click();
  await expect(page.getByText('Выбрано: 0')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Удалить выбранные' })).toBeDisabled();
});
