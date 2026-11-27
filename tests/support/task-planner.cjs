const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { expect, test: base } = require('@playwright/test');

const app = path.resolve(__dirname, '../../practices/practice_04/task_planner');

async function findPort() {
  const probe = net.createServer().listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return port;
}

const test = base.extend({
  plannerUrl: async ({}, use) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'task-planner-test-'));
    let server;
    try {
      await fs.copyFile(path.join(app, 'server.js'), path.join(directory, 'server.js'));
      await fs.cp(path.join(app, 'public'), path.join(directory, 'public'), { recursive: true });
      const port = await findPort();
      const url = `http://127.0.0.1:${port}`;
      server = spawn(process.execPath, ['server.js'], {
        cwd: directory,
        env: { ...process.env, PORT: String(port) },
      });
      await expect.poll(async () => {
        const response = await fetch(`${url}/api/tasks`).catch(() => null);
        return response?.status;
      }).toBe(200);
      await use(url);
    } finally {
      if (server?.exitCode === null && server.signalCode === null) {
        const closed = once(server, 'close');
        server.kill();
        await closed;
      }
      await fs.rm(directory, { recursive: true, force: true, maxRetries: 3 });
    }
  },
});

module.exports = { expect, test };
