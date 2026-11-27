const { existsSync } = require('node:fs');
const path = require('node:path');
const { defineConfig } = require('@playwright/test');

const browserCache = path.resolve(__dirname, '../.cache/playwright-visual-browsers');
if (existsSync(browserCache)) process.env.PLAYWRIGHT_BROWSERS_PATH ??= browserCache;

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: 'task_planner_visual.spec.cjs',
  outputDir: path.resolve(__dirname, '../.cache/task-planner-visual-results'),
  reporter: [
    ['list'],
    ['html', { outputFolder: path.resolve(__dirname, '../.cache/task-planner-visual-report'), open: 'never' }],
  ],
  updateSnapshots: 'none',
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      threshold: 0.1,
      maxDiffPixels: 0,
    },
  },
  use: {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    colorScheme: 'light',
    reducedMotion: 'reduce',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
