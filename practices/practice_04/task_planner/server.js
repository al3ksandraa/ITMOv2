// Minimal HTTP server with no external deps
// Provides REST API for tasks and serves static frontend

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'tasks.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Ensure data dir and db file exist
function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, '[]\n', 'utf8');
}

function readJson(req) {
  // Reads request body as JSON with a soft 1MB limit; avoids destroying the socket
  // to allow the caller to respond with an error without racing the closed socket.
  return new Promise((resolve, reject) => {
    let body = '';
    let tooLarge = false;
    const LIMIT = 1e6; // ~1MB

    req.on('data', (chunk) => {
      if (tooLarge) return; // ignore further chunks after limit hit
      body += chunk;
      if (body.length > LIMIT) {
        tooLarge = true;
      }
    });
    req.on('end', () => {
      if (tooLarge) return reject(new Error('Payload too large'));
      if (!body) return resolve(null);
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', (err) => reject(err));
    req.on('aborted', () => reject(new Error('aborted')));
  });
}

function loadTasks() {
  ensureDb();
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data;
    return [];
  } catch {
    return [];
  }
}

function saveTasks(tasks) {
  ensureDb();
  fs.writeFileSync(DB_PATH, JSON.stringify(tasks, null, 2) + '\n', 'utf8');
}

function sendJson(res, status, data, headers = {}) {
  // Guard against double-send if an earlier handler already ended the response
  if (res.writableEnded) return true;
  const payload = JSON.stringify(data);
  if (!res.headersSent) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
      'Cache-Control': 'no-store',
      ...headers,
    });
  }
  res.end(payload);
  return true;
}

function sendText(res, status, text, headers = {}) {
  if (res.writableEnded) return true;
  if (!res.headersSent) {
    res.writeHead(status, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    });
  }
  res.end(text);
  return true;
}

function serveStatic(req, res) {
  // Only GET/HEAD
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = url.pathname;
  if (pathname === '/') pathname = '/index.html';
  const safePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!safePath.startsWith(PUBLIC_DIR)) return false;
  if (!fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) return false;
  const ext = path.extname(safePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
  };
  const type = types[ext] || 'application/octet-stream';
  const stream = fs.createReadStream(safePath);
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  if (req.method === 'HEAD') {
    res.end();
    return true; // ensure caller treats as handled
  }
  stream.pipe(res);
  return true;
}

function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (!url.pathname.startsWith('/api/')) return false;

  // CORS for local dev/experiments
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return true;
  }

  if (url.pathname === '/api/tasks' && req.method === 'GET') {
    const tasks = loadTasks();
    return sendJson(res, 200, tasks, corsHeaders);
  }

  if (url.pathname === '/api/tasks' && req.method === 'POST') {
    return readJson(req)
      .then((payload) => {
        if (!payload || typeof payload !== 'object') throw new Error('Invalid payload');
        const { title, description = '', deadline = null, priority = 'normal' } = payload;
        if (!title || typeof title !== 'string') {
          sendJson(res, 400, { error: 'title is required' }, corsHeaders);
          return;
        }
        const tasks = loadTasks();
        const now = Date.now();
        const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
        const task = {
          id,
          title: title.trim(),
          description: String(description || ''),
          priority: ['low', 'normal', 'high'].includes(priority) ? priority : 'normal',
          deadline: deadline ? String(deadline) : null, // ISO string expected
          done: false,
          createdAt: new Date(now).toISOString(),
          updatedAt: new Date(now).toISOString(),
        };
        tasks.push(task);
        saveTasks(tasks);
        sendJson(res, 201, task, corsHeaders);
      })
      .catch((e) => sendJson(res, 400, { error: e.message }, corsHeaders));
  }

  const taskIdMatch = url.pathname.match(/^\/api\/tasks\/([^\/]+)$/);
  if (taskIdMatch) {
    const id = decodeURIComponent(taskIdMatch[1]);
    if (req.method === 'PUT' || req.method === 'PATCH') {
      return readJson(req)
        .then((payload) => {
          const tasks = loadTasks();
          const idx = tasks.findIndex((t) => t.id === id);
          if (idx === -1) return sendJson(res, 404, { error: 'not found' }, corsHeaders);
          const allowed = ['title', 'description', 'deadline', 'priority', 'done'];
          for (const key of Object.keys(payload || {})) {
            if (!allowed.includes(key)) delete payload[key];
          }
          const nowIso = new Date().toISOString();
          tasks[idx] = { ...tasks[idx], ...payload, updatedAt: nowIso };
          saveTasks(tasks);
          sendJson(res, 200, tasks[idx], corsHeaders);
        })
        .catch((e) => sendJson(res, 400, { error: e.message }, corsHeaders));
    }
    if (req.method === 'DELETE') {
      const tasks = loadTasks();
      const idx = tasks.findIndex((t) => t.id === id);
      if (idx === -1) return sendJson(res, 404, { error: 'not found' }, corsHeaders);
      const [deleted] = tasks.splice(idx, 1);
      saveTasks(tasks);
      return sendJson(res, 200, deleted, corsHeaders);
    }
  }

  sendJson(res, 404, { error: 'Not found' }, corsHeaders);
  return true;
}

const server = http.createServer((req, res) => {
  if (handleApi(req, res)) return;
  if (serveStatic(req, res)) return;
  sendText(res, 404, 'Not found');
});

server.listen(PORT, () => {
  ensureDb();
  console.log(`Task planner running at http://localhost:${PORT}`);
});
