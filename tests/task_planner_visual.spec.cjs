const { expect, test } = require('./support/task-planner.cjs');

const tasksRoute = '**/api/tasks';
const timestamp = '2026-11-21T10:00:00.000Z';
const newTask = {
  id: 'visual-lab',
  title: 'Сдать лабораторную',
  description: 'Проверить отчёт перед сдачей',
  priority: 'high',
  deadline: '2026-12-01T15:00:00.000Z',
  done: false,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const tasks = [
  {
    ...newTask,
    id: 'visual-presentation',
    title: 'Подготовить презентацию по курсовой',
    description: 'Согласовать структуру и подготовить десять слайдов.',
    deadline: '2026-11-21T16:00:00.000Z',
  },
  {
    ...newTask,
    id: 'visual-seminar',
    title: 'Прочитать материалы семинара',
    description: '',
    priority: 'low',
    deadline: null,
    done: true,
  },
];

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-21T12:00:00.000Z'));
});

for (const { name, screen, viewport } of [
  { name: 'desktop', screen: 'на широком экране', viewport: { width: 1440, height: 900 } },
  { name: 'mobile', screen: 'на узком экране', viewport: { width: 390, height: 844 } },
]) {
  test(`список задач ${screen}`, async ({ page, plannerUrl }) => {
    await page.setViewportSize(viewport);
    await page.route(tasksRoute, route => route.fulfill({ json: tasks }));
    await page.goto(plannerUrl);

    const list = page.locator('#task-list');
    await expect(list.getByRole('listitem')).toHaveCount(2);
    const dueToday = list.getByRole('listitem').filter({ hasText: tasks[0].title });
    await expect(dueToday.getByText('Сегодня', { exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot(`planner-${name}.png`, { fullPage: true });
  });
}

test('загрузка списка и пустой ответ', async ({ page, plannerUrl }) => {
  let releaseList;
  const listPending = new Promise(resolve => { releaseList = resolve; });
  await page.route(tasksRoute, async route => {
    await listPending;
    await route.fulfill({ json: [] });
  });

  try {
    await page.goto(plannerUrl, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Загружаем задачи…', { exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('planner-loading.png');
  } finally {
    releaseList();
  }

  await expect(page.getByText('Задач пока нет', { exact: true })).toBeVisible();
  await expect(page).toHaveScreenshot('planner-empty.png');
});

async function fillTaskForm(page) {
  await page.getByRole('textbox', { name: 'Название' }).fill(newTask.title);
  await page.getByRole('textbox', { name: 'Описание' }).fill(newTask.description);
  await page.getByLabel('Дедлайн', { exact: true }).fill('2026-12-01T18:00');
  await page.locator('#task-form').getByRole('combobox', { name: 'Приоритет' }).selectOption('high');
}

test('сохранение и появление новой карточки', async ({ page, plannerUrl }) => {
  let releaseSave;
  const savePending = new Promise(resolve => { releaseSave = resolve; });
  await page.route(tasksRoute, async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] });
    await savePending;
    await route.fulfill({ status: 201, json: newTask });
  });

  try {
    await page.goto(plannerUrl);
    await expect(page.getByText('Задач пока нет', { exact: true })).toBeVisible();
    await fillTaskForm(page);
    await page.getByRole('button', { name: 'Добавить задачу' }).click();
    await expect(page.getByRole('button', { name: 'Сохраняем…' })).toBeDisabled();
    await expect(page).toHaveScreenshot('planner-saving.png');
  } finally {
    releaseSave();
  }

  await expect(page.getByText('Задача добавлена', { exact: true })).toBeVisible();
  await expect(page.locator('#task-list').getByText(newTask.title, { exact: true })).toBeVisible();
  await expect(page).toHaveScreenshot('planner-created.png');
});

test('ошибка сохранения рядом с заполненной формой', async ({ page, plannerUrl }) => {
  await page.route(tasksRoute, route => route.request().method() === 'GET'
    ? route.fulfill({ json: [] })
    : route.fulfill({ status: 500, json: { error: 'Ошибка сохранения' } }));
  await page.goto(plannerUrl);
  await expect(page.getByText('Задач пока нет', { exact: true })).toBeVisible();
  await fillTaskForm(page);
  await page.getByRole('button', { name: 'Добавить задачу' }).click();

  await expect(page.getByRole('alert')).toContainText('Не удалось сохранить задачу');
  await expect(page.getByRole('textbox', { name: 'Название' })).toHaveValue(newTask.title);
  await expect(page).toHaveScreenshot('planner-save-error.png');
});
