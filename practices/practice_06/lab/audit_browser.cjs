// Only the owned loopback origin is reachable from this test page.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const base = new URL(process.argv[2]);
  if (base.hostname !== '127.0.0.1' || base.protocol !== 'http:') throw new Error('Loopback only');
  const candidates = [
    process.env.AUDIT_BROWSER,
    chromium.executablePath(),
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), '.cache', 'ms-playwright');
  if (fs.existsSync(cache)) {
    for (const entry of fs.readdirSync(cache).filter(name => /^chromium-\d+$/.test(name)).sort().reverse()) {
      candidates.push(path.join(cache, entry, 'chrome-linux64', 'chrome'));
      candidates.push(path.join(cache, entry, 'chrome-linux', 'chrome'));
    }
  }
  const executablePath = candidates.find(p => p && fs.existsSync(p));
  if (!executablePath) throw new Error('No installed Chromium-compatible browser');
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-proxy-server'] });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const blocked = [];
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === base.origin) return route.continue();
      blocked.push(route.request().url());
      return route.abort();
    });
    const page = await context.newPage();
    const response = await page.goto(new URL('/reviews/view', base).href, { waitUntil: 'load', timeout: 15000 });
    const evidence = await page.evaluate(() => ({ marker: document.documentElement.dataset.auditXss || null,
      html: document.documentElement.outerHTML, visibleText: document.body.innerText }));
    console.log(JSON.stringify({ browser: browser.version(), executablePath, status: response.status(),
      url: page.url(), blockedRequests: blocked, ...evidence }));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
