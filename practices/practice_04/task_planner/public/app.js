(function () {
  const API = '/api/tasks';

  const el = {
    form: document.getElementById('task-form'),
    title: document.getElementById('title'),
    description: document.getElementById('description'),
    deadline: document.getElementById('deadline'),
    priority: document.getElementById('priority'),
    list: document.getElementById('task-list'),
    tpl: document.getElementById('task-item-template'),
    sortDeadline: document.getElementById('sort-deadline'),
    showAll: document.getElementById('show-all'),
    showActive: document.getElementById('show-active'),
    showDone: document.getElementById('show-done'),
    search: document.getElementById('search'),
    priorityFilter: document.getElementById('priority-filter'),
  };

  let state = {
    tasks: [],
    filter: 'all', // all | active | done
    sort: 'none', // none | deadline
    search: '',
    priority: 'all',
  };

  function toIsoFromLocal(datetimeLocalValue) {
    if (!datetimeLocalValue) return null;
    const dt = new Date(datetimeLocalValue);
    if (isNaN(dt)) return null;
    return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString();
  }

  function toLocalInputValue(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const pad = (n) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }

  async function fetchTasks() {
    const res = await fetch(API);
    if (!res.ok) throw new Error('Failed to load');
    state.tasks = await res.json();
    render();
  }

  function render() {
    el.list.innerHTML = '';
    let tasks = [...state.tasks];
    if (state.filter === 'active') tasks = tasks.filter((t) => !t.done);
    if (state.filter === 'done') tasks = tasks.filter((t) => t.done);
    if (state.search.trim()) {
      const q = state.search.toLowerCase();
      tasks = tasks.filter((t) =>
        (t.title || '').toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)
      );
    }
    if (state.priority !== 'all') {
      tasks = tasks.filter((t) => (t.priority || 'normal') === state.priority);
    }
    if (state.sort === 'deadline') {
      tasks.sort((a, b) => {
        const da = a.deadline ? Date.parse(a.deadline) : Infinity;
        const db = b.deadline ? Date.parse(b.deadline) : Infinity;
        return da - db;
      });
    }
    const now = Date.now();
    for (const t of tasks) {
      const node = el.tpl.content.firstElementChild.cloneNode(true);
      node.dataset.id = t.id;
      if (t.done) node.classList.add('done');
      const deadlineTs = t.deadline ? Date.parse(t.deadline) : null;
      if (!t.done && deadlineTs && deadlineTs < now) node.classList.add('overdue');

      node.querySelector('.title').textContent = t.title;
      const badge = node.querySelector('.priority-badge');
      badge.textContent = t.priority || 'normal';
      if (t.priority === 'high') badge.classList.add('priority-high');
      if (t.priority === 'low') badge.classList.add('priority-low');

      const deadlineEl = node.querySelector('.deadline');
      deadlineEl.textContent = t.deadline ? `Дедлайн: ${new Date(t.deadline).toLocaleString()}` : 'Без дедлайна';
      node.querySelector('.created').textContent = `Создано: ${new Date(t.createdAt).toLocaleString()}`;
      node.querySelector('.description').textContent = t.description || '';

      const chk = node.querySelector('.done-toggle');
      chk.checked = !!t.done;
      chk.addEventListener('change', () => updateTask(t.id, { done: chk.checked }));

      node.querySelector('.delete').addEventListener('click', () => deleteTask(t.id));
      node.querySelector('.edit').addEventListener('click', () => editTask(t));

      el.list.appendChild(node);
    }
  }

  async function addTask(e) {
    e.preventDefault();
    const payload = {
      title: el.title.value.trim(),
      description: el.description.value.trim(),
      deadline: toIsoFromLocal(el.deadline.value),
      priority: el.priority.value,
    };
    if (!payload.title) return;
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const created = await res.json();
      state.tasks.push(created);
      el.form.reset();
      render();
    }
  }

  async function updateTask(id, patch) {
    const res = await fetch(`${API}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated = await res.json();
      const idx = state.tasks.findIndex((t) => t.id === id);
      if (idx !== -1) state.tasks[idx] = updated;
      render();
    }
  }

  async function deleteTask(id) {
    const res = await fetch(`${API}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) {
      const idx = state.tasks.findIndex((t) => t.id === id);
      if (idx !== -1) state.tasks.splice(idx, 1);
      render();
    }
  }

  function editTask(task) {
    const title = prompt('Название задачи:', task.title);
    if (title == null) return; // cancelled
    const description = prompt('Описание:', task.description || '');
    if (description == null) return;
    const deadlineLocal = prompt('Дедлайн (YYYY-MM-DDTHH:MM):', toLocalInputValue(task.deadline));
    if (deadlineLocal == null) return;
    const priority = prompt('Приоритет (low|normal|high):', task.priority || 'normal');
    if (priority == null) return;
    updateTask(task.id, {
      title: title.trim() || task.title,
      description: description.trim(),
      deadline: toIsoFromLocal(deadlineLocal),
      priority: ['low', 'normal', 'high'].includes(priority) ? priority : 'normal',
    });
  }

  el.form.addEventListener('submit', addTask);
  el.sortDeadline.addEventListener('click', () => {
    state.sort = state.sort === 'deadline' ? 'none' : 'deadline';
    render();
  });
  el.showAll.addEventListener('click', () => { state.filter = 'all'; render(); });
  el.showActive.addEventListener('click', () => { state.filter = 'active'; render(); });
  el.showDone.addEventListener('click', () => { state.filter = 'done'; render(); });
  el.search.addEventListener('input', () => { state.search = el.search.value.trim(); render(); });
  el.priorityFilter.addEventListener('change', () => { state.priority = el.priorityFilter.value; render(); });

  fetchTasks().catch((e) => console.error(e));
})();
