(function () {
  const API = '/api/tasks';
  const priorityNames = { low: 'Низкий приоритет', normal: 'Обычный приоритет', high: 'Высокий приоритет' };

  const el = {
    form: document.getElementById('task-form'),
    fields: document.getElementById('task-fields'),
    title: document.getElementById('title'),
    titleCount: document.getElementById('title-count'),
    description: document.getElementById('description'),
    deadline: document.getElementById('deadline'),
    priority: document.getElementById('priority'),
    submit: document.getElementById('add-task'),
    submitLabel: document.getElementById('submit-label'),
    saveSpinner: document.getElementById('save-spinner'),
    savingStatus: document.getElementById('saving-status'),
    saveSuccess: document.getElementById('save-success'),
    saveError: document.getElementById('save-error'),
    list: document.getElementById('task-list'),
    tpl: document.getElementById('task-item-template'),
    listHeading: document.getElementById('tasks-heading'),
    listLoading: document.getElementById('list-loading'),
    listError: document.getElementById('list-error'),
    retryLoad: document.getElementById('retry-load'),
    listSummary: document.getElementById('list-summary'),
    sortDeadline: document.getElementById('sort-deadline'),
    showAll: document.getElementById('show-all'),
    showActive: document.getElementById('show-active'),
    showDone: document.getElementById('show-done'),
    search: document.getElementById('search'),
    priorityFilter: document.getElementById('priority-filter'),
    deadlineFilter: document.getElementById('deadline-filter'),
    selectVisible: document.getElementById('select-visible'),
    selectedCount: document.getElementById('selected-count'),
    bulkComplete: document.getElementById('bulk-complete'),
    bulkDelete: document.getElementById('bulk-delete'),
    emptyState: document.getElementById('empty-state'),
    emptyActions: document.getElementById('empty-actions'),
    emptyReset: document.getElementById('empty-reset'),
    emptyHelp: document.getElementById('empty-help'),
  };

  const state = {
    tasks: [],
    listStatus: 'idle',
    changesDuringLoad: null,
    saving: false,
    createdTaskId: null,
    filter: 'all',
    sort: 'none',
    search: '',
    priority: 'all',
    deadline: 'all',
  };

  function toIsoFromLocal(datetimeLocalValue) {
    if (!datetimeLocalValue) return null;
    const dt = new Date(datetimeLocalValue);
    if (isNaN(dt)) return null;
    return dt.toISOString();
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
    if (state.listStatus === 'loading') return;
    state.listStatus = 'loading';
    state.changesDuringLoad = new Map();
    render();
    try {
      const res = await fetch(API);
      if (!res.ok) throw new Error('Failed to load tasks');
      const tasks = new Map((await res.json()).map(task => [task.id, task]));
      // A delayed list response can predate changes confirmed by the server.
      for (const [id, task] of state.changesDuringLoad) {
        if (task) tasks.set(id, task);
        else tasks.delete(id);
      }
      state.tasks = [...tasks.values()];
      state.listStatus = 'ready';
    } catch {
      state.listStatus = 'error';
    } finally {
      state.changesDuringLoad = null;
      render();
    }
  }

  function renderListStatus(visibleCount) {
    const loading = state.listStatus === 'loading';
    const ready = state.listStatus === 'ready';
    const hasTasks = state.tasks.length > 0;
    el.list.setAttribute('aria-busy', String(loading));
    el.listLoading.hidden = !loading;
    el.listError.hidden = state.listStatus !== 'error';
    el.listSummary.hidden = !ready || !hasTasks;
    el.listSummary.textContent = `Показано ${visibleCount} из ${state.tasks.length}`;
    el.emptyState.hidden = !ready || visibleCount !== 0;
    if (!el.emptyState.hidden) {
      const message = hasTasks ? 'Нет задач по выбранным критериям' : 'Задач пока нет';
      if (el.emptyState.textContent !== message) el.emptyState.textContent = message;
    }
    el.emptyActions.hidden = el.emptyState.hidden || !hasTasks;
    el.emptyHelp.hidden = el.emptyState.hidden || hasTasks;
  }

  function renderSelection() {
    const visible = el.list.querySelectorAll('.select-task').length;
    const selected = el.list.querySelectorAll('.select-task:checked').length;
    el.selectVisible.disabled = visible === 0;
    el.selectVisible.checked = visible > 0 && selected === visible;
    el.selectVisible.indeterminate = selected > 0 && selected < visible;
    el.selectedCount.textContent = `Выбрано: ${selected}`;
    el.bulkComplete.disabled = selected === 0;
    el.bulkDelete.disabled = selected === 0;
  }

  function renderSaveSuccess(visibleTasks) {
    const created = state.tasks.some(task => task.id === state.createdTaskId);
    el.saveSuccess.hidden = !created;
    if (!created) return;
    const visible = visibleTasks.some(task => task.id === state.createdTaskId);
    const message = visible ? 'Задача добавлена' :
      'Задача добавлена. Чтобы увидеть её, нажмите «Сбросить фильтры».';
    if (el.saveSuccess.textContent !== message) el.saveSuccess.textContent = message;
  }

  function setPressed(button, pressed) {
    button.setAttribute('aria-pressed', String(pressed));
    button.classList.toggle('active', pressed);
  }

  function render() {
    const now = new Date();
    const tasks = window.TaskFilter.filterTasks(state.tasks, state, now);
    if (state.sort === 'deadline') {
      tasks.sort((a, b) => {
        const da = a.deadline ? Date.parse(a.deadline) : Infinity;
        const db = b.deadline ? Date.parse(b.deadline) : Infinity;
        return da - db;
      });
    }
    setPressed(el.showAll, state.filter === 'all');
    setPressed(el.showActive, state.filter === 'active');
    setPressed(el.showDone, state.filter === 'done');
    setPressed(el.sortDeadline, state.sort === 'deadline');
    renderListStatus(tasks.length);
    renderSaveSuccess(tasks);

    const cards = document.createDocumentFragment();
    for (const t of tasks) {
      const node = el.tpl.content.firstElementChild.cloneNode(true);
      node.dataset.id = t.id;
      node.classList.toggle('done', t.done);
      const overdue = window.TaskFilter.includeByDeadline(t, 'overdue', now);
      node.classList.toggle('overdue', overdue);
      node.querySelector('.overdue-badge').hidden = !overdue;
      node.querySelector('.today-badge').hidden = !window.TaskFilter.includeByDeadline(t, 'today', now);

      node.querySelector('.title').textContent = t.title;
      const badge = node.querySelector('.priority-badge');
      badge.textContent = priorityNames[t.priority] || priorityNames.normal;
      if (t.priority === 'high') badge.classList.add('priority-high');
      if (t.priority === 'low') badge.classList.add('priority-low');

      const deadlineEl = node.querySelector('.deadline');
      deadlineEl.textContent = t.deadline ? `Дедлайн: ${new Date(t.deadline).toLocaleString()}` : 'Без дедлайна';
      node.querySelector('.created').textContent = `Создано: ${new Date(t.createdAt).toLocaleString()}`;
      node.querySelector('.description').textContent = t.description || '';

      const doneToggle = node.querySelector('.done-toggle');
      doneToggle.checked = !!t.done;
      doneToggle.addEventListener('change', () => updateTask(t.id, { done: doneToggle.checked }));
      node.querySelector('.select-task').setAttribute('aria-label', `Выбрать задачу «${t.title}»`);

      node.querySelector('.delete').addEventListener('click', () => deleteTask(t.id));
      node.querySelector('.edit').addEventListener('click', () => editTask(t));
      cards.appendChild(node);
    }
    el.list.replaceChildren(cards);
    renderSelection();
  }

  function showTitleError() {
    el.title.classList.add('is-invalid');
    el.title.setAttribute('aria-invalid', 'true');
    el.title.setAttribute('aria-describedby', 'title-error title-help');
    el.title.focus();
  }

  function clearTitleError() {
    el.title.classList.remove('is-invalid');
    el.title.removeAttribute('aria-invalid');
    el.title.setAttribute('aria-describedby', 'title-help');
  }

  function setSaving(saving) {
    state.saving = saving;
    el.fields.disabled = saving;
    el.submit.disabled = saving;
    el.saveSpinner.hidden = !saving;
    el.submitLabel.textContent = saving ? 'Сохраняем…' : 'Добавить задачу';
    el.savingStatus.textContent = saving ? 'Сохраняем задачу…' : '';
  }

  async function addTask(event) {
    event.preventDefault();
    if (state.saving) return;
    const payload = {
      title: el.title.value.trim(),
      description: el.description.value.trim(),
      deadline: toIsoFromLocal(el.deadline.value),
      priority: el.priority.value,
    };
    if (!payload.title) {
      showTitleError();
      return;
    }

    clearTitleError();
    state.createdTaskId = null;
    el.saveSuccess.hidden = true;
    el.saveError.hidden = true;
    el.saveError.textContent = '';
    const hadFocus = el.form.contains(document.activeElement);
    setSaving(true);
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to save task');
      const created = await res.json();
      state.tasks.push(created);
      state.changesDuringLoad?.set(created.id, created);
      state.createdTaskId = created.id;
      el.form.reset();
      el.titleCount.textContent = '0';
      render();
    } catch {
      el.saveError.hidden = false;
      el.saveError.textContent = 'Не удалось сохранить задачу. Попробуйте ещё раз';
    } finally {
      setSaving(false);
      if (hadFocus && document.activeElement === document.body) {
        const nextFocus = state.createdTaskId ? el.title : el.submit;
        nextFocus.focus();
      }
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
      state.changesDuringLoad?.set(id, updated);
      const focused = document.activeElement;
      const restoreFocus = focused.matches('.done-toggle') && focused.closest('.task').dataset.id === id;
      render();
      if (restoreFocus) {
        const checkbox = el.list.querySelector(`.task[data-id="${CSS.escape(id)}"] .done-toggle`);
        (checkbox || el.listHeading).focus();
      }
    }
  }

  async function deleteTask(id) {
    const res = await fetch(`${API}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) {
      const idx = state.tasks.findIndex((t) => t.id === id);
      if (idx !== -1) state.tasks.splice(idx, 1);
      state.changesDuringLoad?.set(id, null);
      render();
    }
  }

  function editTask(task) {
    const title = prompt('Название задачи:', task.title);
    if (title == null) return;
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
  el.title.addEventListener('invalid', event => {
    event.preventDefault();
    showTitleError();
  });
  el.title.addEventListener('input', () => {
    el.titleCount.textContent = String(el.title.value.length);
    if (el.title.value.trim()) clearTitleError();
  });
  el.retryLoad.addEventListener('click', () => {
    el.listHeading.focus();
    fetchTasks();
  });
  el.sortDeadline.addEventListener('click', () => {
    state.sort = state.sort === 'deadline' ? 'none' : 'deadline';
    render();
  });
  el.showAll.addEventListener('click', () => { state.filter = 'all'; render(); });
  el.showActive.addEventListener('click', () => { state.filter = 'active'; render(); });
  el.showDone.addEventListener('click', () => { state.filter = 'done'; render(); });
  el.search.addEventListener('input', () => { state.search = el.search.value.trim(); render(); });
  el.priorityFilter.addEventListener('change', () => { state.priority = el.priorityFilter.value; render(); });
  el.deadlineFilter.addEventListener('change', () => { state.deadline = el.deadlineFilter.value; render(); });

  const resetBtn = document.getElementById('reset-filters');
  resetBtn.addEventListener('click', () => {
    state.search = '';
    el.search.value = '';
    state.priority = 'all';
    el.priorityFilter.value = 'all';
    state.filter = 'all';
    state.deadline = 'all';
    el.deadlineFilter.value = 'all';
    render();
  });
  el.emptyReset.addEventListener('click', () => {
    resetBtn.focus();
    resetBtn.click();
  });

  el.selectVisible.addEventListener('change', () => {
    el.list.querySelectorAll('.select-task').forEach(checkbox => { checkbox.checked = el.selectVisible.checked; });
    renderSelection();
  });
  el.list.addEventListener('change', event => {
    if (event.target.matches('.select-task')) renderSelection();
  });

  function selectedTaskIds() {
    return Array.from(el.list.querySelectorAll('.select-task:checked'), checkbox => checkbox.closest('.task').dataset.id);
  }

  el.bulkComplete.addEventListener('click', async () => {
    for (const id of selectedTaskIds()) {
      try { await updateTask(id, { done: true }); } catch { /* Continue with the remaining tasks. */ }
    }
  });

  el.bulkDelete.addEventListener('click', async () => {
    for (const id of selectedTaskIds()) {
      try { await deleteTask(id); } catch { /* Continue with the remaining tasks. */ }
    }
  });

  fetchTasks();
})();
