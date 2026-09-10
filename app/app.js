/* ==========================================================================
 * app.js — Task Board UI Layer
 *
 * Module: M-02
 * Responsibilities:
 *   - Board, column, and card rendering
 *   - Event handling (click, drag-and-drop, keyboard)
 *   - Inline editing (create & edit)
 *   - Search & filter (300 ms debounce)
 *   - Dark mode toggle
 *   - Error banner, corruption dialog, undo snackbar
 *   - Empty states, responsive layout
 * ========================================================================== */

(function () {
  'use strict';

  /* ── DOM refs ──────────────────────────────────────────────────────── */
  const boardEl    = document.getElementById('board');
  const searchInput = document.getElementById('search-input');
  const snackbar   = document.getElementById('snackbar');
  const snackbarMsg = document.getElementById('snackbar-msg');
  const snackbarUndo = document.getElementById('snackbar-undo');
  const errorBanner = document.getElementById('error-banner');
  const errorBannerMsg = document.getElementById('error-banner-msg');
  const errorBannerClose = document.getElementById('error-banner-close');
  const corruptionOverlay = document.getElementById('corruption-overlay');
  const corruptionStartFresh = document.getElementById('corruption-start-fresh');
  const corruptionCancel = document.getElementById('corruption-cancel');
  const exportBtn  = document.getElementById('export-btn');
  const darkToggle = document.getElementById('dark-toggle');
  const htmlEl     = document.documentElement;

  /* ── State ─────────────────────────────────────────────────────────── */
  let searchTerm = '';
  let draggedTaskId = null;
  let undoTimeoutId = null;
  let storageError = false; // true when a STORAGE_FULL was returned

  /* ── Column config ─────────────────────────────────────────────────── */
  const COLUMNS = [
    { key: 'todo',        label: '待办' },
    { key: 'in-progress', label: '进行中' },
    { key: 'done',        label: '已完成' },
  ];

  const COLUMN_LABEL_MAP = Object.fromEntries(COLUMNS.map(c => [c.key, c.label]));

  /* ── Init ──────────────────────────────────────────────────────────── */
  function init() {
    const result = store.loadState();
    if (result && result.error === 'DATA_CORRUPT') {
      corruptionOverlay.classList.remove('hidden');
      return; // Wait for user action
    }

    applyDarkMode(store.getState().preferences.darkMode);
    render();
    bindEvents();
  }

  /* ── Render ────────────────────────────────────────────────────────── */
  function render() {
    const state = store.getState();
    const tasks = store.getAllTasks();

    // Filter by search term
    const filteredTasks = searchTerm
      ? tasks.filter(t => t.title.toLowerCase().includes(searchTerm.toLowerCase()))
      : tasks;

    // Group by status
    const grouped = {};
    COLUMNS.forEach(c => { grouped[c.key] = []; });
    filteredTasks.forEach(t => {
      if (grouped[t.status]) grouped[t.status].push(t);
    });

    let html = '';
    COLUMNS.forEach(col => {
      const visible = state.columnVisibility[col.key] !== false;
      const colTasks = grouped[col.key] || [];
      const count = colTasks.length;

      html += `
        <section class="column${visible ? '' : ' hidden'}" data-column="${col.key}" aria-label="${col.label}">
          <div class="column-header">
            <span>${col.label}</span>
            <span class="count-badge" data-count-col="${col.key}">${count}</span>
            <div class="column-header-right">
              <button class="column-toggle-btn" data-toggle-col="${col.key}" title="隐藏/显示列" aria-label="切换${col.label}列可见性">&bull;&bull;&bull;</button>
            </div>
          </div>
          <div class="column-body" data-drop-col="${col.key}">
            ${renderTasks(colTasks, col.key)}
          </div>
          <button class="add-card-btn" data-add-col="${col.key}" aria-label="在${col.label}列创建任务">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            添加任务
          </button>
        </section>`;
    });

    boardEl.innerHTML = html;
  }

  function renderTasks(tasks, colKey) {
    if (tasks.length === 0 && colKey === 'todo') return emptyStateHTML(true);
    if (tasks.length === 0) return emptyStateHTML(false);

    return tasks.map(task => cardHTML(task)).join('');
  }

  function emptyStateHTML(isTodo) {
    if (isTodo) {
      return `<div class="empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg>
        <p>暂无任务。创建你的第一个任务！</p>
        <button class="add-first-btn" data-add-col="todo">+ 创建任务</button>
      </div>`;
    }
    return `<div class="empty-state"><p>暂无任务</p></div>`;
  }

  function cardHTML(task) {
    const isDone = task.status === 'done';
    const priorityLabel = { high: '高', medium: '中', low: '低', none: '' };
    const priorityClass = task.priority !== 'none' ? task.priority : '';

    let dueHTML = '';
    if (task.dueDate) {
      const d = new Date(task.dueDate + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const overdue = d < today && !isDone;
      const formatted = `${d.getMonth() + 1}月${d.getDate()}日`;
      dueHTML = `<span class="due-date-badge${overdue ? ' overdue' : ''}">${formatted}</span>`;
    }

    const descTruncated = task.description
      ? `<div class="task-description">${escapeHtml(task.description)}</div>`
      : '';

    return `
      <article class="task-card${isDone ? ' done-task' : ''}" draggable="true" data-task-id="${task.id}" role="listitem" aria-label="${escapeHtml(task.title)}">
        <div class="task-card-header">
          <span class="task-title">${escapeHtml(task.title)}</span>
          <button class="task-delete-btn" data-delete-id="${task.id}" aria-label="删除任务" title="删除任务">&times;</button>
        </div>
        ${descTruncated}
        <div class="task-meta">
          ${priorityClass ? `<span class="priority-badge ${priorityClass}">${priorityLabel[task.priority]}</span>` : ''}
          ${dueHTML}
        </div>
        <div class="edit-fields">
          <input class="edit-title" value="${escapeHtml(task.title)}" maxlength="200" placeholder="任务标题">
          <textarea class="edit-desc" placeholder="描述（可选）" maxlength="5000">${escapeHtml(task.description || '')}</textarea>
          <div class="edit-actions">
            <select class="edit-priority">
              <option value="none"  ${task.priority === 'none' ? 'selected' : ''}>优先级</option>
              <option value="high"  ${task.priority === 'high' ? 'selected' : ''}>高</option>
              <option value="medium"${task.priority === 'medium' ? 'selected' : ''}>中</option>
              <option value="low"   ${task.priority === 'low' ? 'selected' : ''}>低</option>
            </select>
            <input type="date" class="edit-due" value="${task.dueDate || ''}">
            <button class="btn btn-primary save-edit-btn" data-save-id="${task.id}">保存</button>
            <button class="btn btn-secondary cancel-edit-btn">取消</button>
          </div>
        </div>
      </article>`;
  }

  /* ── Inline editor for NEW task ──────────────────────────────────────── */
  function showNewTaskEditor(colKey) {
    // Remove any existing editor first
    const existing = document.querySelector('.inline-editor');
    if (existing) existing.remove();

    const colBody = boardEl.querySelector(`.column-body[data-drop-col="${colKey}"]`);
    const emptyState = colBody.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const editor = document.createElement('div');
    editor.className = 'inline-editor';
    editor.innerHTML = `
      <input class="new-title" type="text" placeholder="任务标题" maxlength="200" aria-label="任务标题" autofocus>
      <textarea class="new-desc" placeholder="描述（可选）" maxlength="5000" aria-label="任务描述"></textarea>
      <div class="editor-actions">
        <button class="btn btn-primary confirm-new-btn">添加</button>
        <button class="btn btn-secondary cancel-new-btn">取消</button>
      </div>
    `;
    colBody.insertBefore(editor, colBody.firstChild);

    const titleInput = editor.querySelector('.new-title');
    titleInput.focus();

    // Enter confirms
    titleInput.addEventListener('keydown', function onEnter(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        confirmNewTask(colKey, editor);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        editor.remove();
        // Re-check empty state
        const tasksInCol = store.getState().tasks;
        const colTasks = Object.values(tasksInCol).filter(t => t.status === colKey);
        if (colTasks.length === 0) render();
      }
    });

    editor.querySelector('.confirm-new-btn').addEventListener('click', () => confirmNewTask(colKey, editor));
    editor.querySelector('.cancel-new-btn').addEventListener('click', () => {
      editor.remove();
      const colTasks = Object.values(store.getState().tasks).filter(t => t.status === colKey);
      if (colTasks.length === 0) render();
    });
  }

  function confirmNewTask(colKey, editor) {
    const titleInput = editor.querySelector('.new-title');
    const descInput = editor.querySelector('.new-desc');
    const title = titleInput.value.trim();

    // Remove old validation msg
    const oldMsg = editor.querySelector('.validation-msg');
    if (oldMsg) oldMsg.remove();

    if (!title) {
      const msg = document.createElement('div');
      msg.className = 'validation-msg';
      msg.textContent = '标题不能为空';
      editor.appendChild(msg);
      titleInput.focus();
      return;
    }

    const result = store.createTask({ title, description: descInput.value });
    if (result && result.error === 'STORAGE_FULL') {
      showStorageError();
      return;
    }
    editor.remove();
    render();
  }

  /* ── Inline editor for EDITING existing task ─────────────────────────── */
  function startEditTask(card) {
    card.classList.add('editing');
    card.draggable = false;

    const editTitle = card.querySelector('.edit-title');
    const saveBtn = card.querySelector('.save-edit-btn');
    const cancelBtn = card.querySelector('.cancel-edit-btn');

    editTitle.focus();
    editTitle.setSelectionRange(editTitle.value.length, editTitle.value.length);

    function saveEdit() {
      const id = card.dataset.taskId;
      const title = editTitle.value.trim();
      if (!title) {
        editTitle.focus();
        return;
      }
      const desc = card.querySelector('.edit-desc').value;
      const priority = card.querySelector('.edit-priority').value;
      const dueDate = card.querySelector('.edit-due').value || null;

      const result = store.updateTask(id, { title, description: desc, priority, dueDate });
      if (result && result.error === 'STORAGE_FULL') {
        showStorageError();
        return;
      }
      card.classList.remove('editing');
      card.draggable = true;
      render();
    }

    function cancelEdit() {
      card.classList.remove('editing');
      card.draggable = true;
      render();
    }

    saveBtn.addEventListener('click', saveEdit, { once: true });
    cancelBtn.addEventListener('click', cancelEdit, { once: true });

    // Escape cancels
    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        card.removeEventListener('keydown', keyHandler);
        cancelEdit();
      }
      if (e.key === 'Enter' && !e.shiftKey && e.target?.classList?.contains('edit-title')) {
        e.preventDefault();
        card.removeEventListener('keydown', keyHandler);
        saveEdit();
      }
    };
    card.addEventListener('keydown', keyHandler);

    // Click outside handler (blur save)
    const clickOutside = (e) => {
      if (!card.contains(e.target)) {
        document.removeEventListener('mousedown', clickOutside);
        saveEdit();
      }
    };
    // Delay to avoid immediate trigger
    setTimeout(() => document.addEventListener('mousedown', clickOutside), 0);
  }

  /* ── Delete task ────────────────────────────────────────────────────── */
  function deleteTask(id) {
    const result = store.deleteTask(id);
    if (result && result.undo) {
      render();
      showUndoSnackbar();
    }
  }

  /* ── Undo snackbar ──────────────────────────────────────────────────── */
  function showUndoSnackbar() {
    if (undoTimeoutId) clearTimeout(undoTimeoutId);
    snackbar.classList.remove('hidden');

    // Remove old listeners by cloning
    const newBtn = snackbarUndo.cloneNode(true);
    snackbarUndo.replaceWith(newBtn);

    newBtn.addEventListener('click', () => {
      store.cancelDelete();
      hideSnackbar();
      render();
    });

    undoTimeoutId = setTimeout(() => {
      hideSnackbar();
      store.confirmPermanentDelete(null); // The store's timer handles actual persist
    }, 5000);
  }

  function hideSnackbar() {
    snackbar.classList.add('hidden');
    if (undoTimeoutId) { clearTimeout(undoTimeoutId); undoTimeoutId = null; }
  }

  /* ── Storage error banner ────────────────────────────────────────────── */
  function showStorageError() {
    storageError = true;
    errorBannerMsg.textContent = '存储已满或不可用，部分更改无法保存。请释放空间或关闭隐私浏览模式。';
    errorBanner.classList.remove('hidden');
  }

  function hideStorageError() {
    storageError = false;
    errorBanner.classList.add('hidden');
  }

  /* ── Dark mode ──────────────────────────────────────────────────────── */
  function applyDarkMode(enabled) {
    htmlEl.setAttribute('data-theme', enabled ? 'dark' : 'light');
    const sun = document.getElementById('sun-icon');
    const moon = document.getElementById('moon-icon');
    if (enabled) { sun.style.display = 'none'; moon.style.display = ''; }
    else { sun.style.display = ''; moon.style.display = 'none'; }
  }

  /* ── Drag & Drop ────────────────────────────────────────────────────── */
  function initDragDrop() {
    boardEl.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.task-card');
      if (!card || card.classList.contains('editing')) { e.preventDefault(); return; }
      draggedTaskId = card.dataset.taskId;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedTaskId);
    });

    boardEl.addEventListener('dragend', (e) => {
      const card = e.target.closest('.task-card');
      if (card) card.classList.remove('dragging');
      document.querySelectorAll('.column.drag-over').forEach(el => el.classList.remove('drag-over'));
      draggedTaskId = null;
    });

    boardEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      const colBody = e.target.closest('.column-body');
      if (colBody) {
        colBody.closest('.column').classList.add('drag-over');
        e.dataTransfer.dropEffect = 'move';
      }
    });

    boardEl.addEventListener('dragleave', (e) => {
      const col = e.target.closest('.column');
      if (col && !col.contains(e.relatedTarget)) {
        col.classList.remove('drag-over');
      }
    });

    boardEl.addEventListener('drop', (e) => {
      e.preventDefault();
      document.querySelectorAll('.column.drag-over').forEach(el => el.classList.remove('drag-over'));

      const colBody = e.target.closest('.column-body');
      if (!colBody || !draggedTaskId) return;

      const col = colBody.closest('.column');
      const newStatus = col.dataset.column;
      const task = store.getTask(draggedTaskId);
      if (!task || task.status === newStatus) return;

      const result = store.updateTask(draggedTaskId, { status: newStatus });
      if (result && result.error === 'STORAGE_FULL') {
        showStorageError();
        return;
      }
      draggedTaskId = null;
      render();
    });
  }

  /* ── Touch drag helper ──────────────────────────────────────────────── */
  function initTouchDrag() {
    let touchCard = null;
    let touchClone = null;
    let touchCol = null;

    boardEl.addEventListener('touchstart', (e) => {
      const card = e.target.closest('.task-card');
      if (!card || card.classList.contains('editing')) return;
      touchCard = card;
      touchCol = card.closest('.column').dataset.column;

      touchClone = card.cloneNode(true);
      touchClone.style.position = 'fixed';
      touchClone.style.width = card.offsetWidth + 'px';
      touchClone.style.opacity = '0.7';
      touchClone.style.pointerEvents = 'none';
      touchClone.style.zIndex = '9999';
      touchClone.style.transform = 'rotate(2deg)';
      document.body.appendChild(touchClone);
      moveTouchClone(e);

      card.classList.add('dragging');
    }, { passive: true });

    function moveTouchClone(e) {
      if (!touchClone) return;
      const touch = e.touches[0];
      touchClone.style.left = (touch.clientX - touchClone.offsetWidth / 2) + 'px';
      touchClone.style.top = (touch.clientY - 40) + 'px';
    }

    boardEl.addEventListener('touchmove', (e) => {
      if (!touchClone) return;
      e.preventDefault();
      moveTouchClone(e);

      // Detect column under finger
      const touch = e.touches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      document.querySelectorAll('.column.drag-over').forEach(c => c.classList.remove('drag-over'));
      const col = el?.closest('.column');
      if (col) col.classList.add('drag-over');
    }, { passive: false });

    boardEl.addEventListener('touchend', (e) => {
      if (!touchCard || !touchClone) return;

      document.querySelectorAll('.column.drag-over').forEach(c => c.classList.remove('drag-over'));

      const touch = e.changedTouches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const targetCol = el?.closest('.column');
      const newStatus = targetCol?.dataset.column;

      touchClone.remove();
      touchClone = null;
      touchCard.classList.remove('dragging');

      if (newStatus && newStatus !== touchCol) {
        const id = touchCard.dataset.taskId;
        const result = store.updateTask(id, { status: newStatus });
        if (result && result.error === 'STORAGE_FULL') {
          showStorageError();
        }
        render();
      }

      touchCard = null;
      touchCol = null;
    });
  }

  /* ── Events ─────────────────────────────────────────────────────────── */
  function bindEvents() {
    // Board event delegation
    boardEl.addEventListener('click', (e) => {
      // Add card button
      const addBtn = e.target.closest('[data-add-col]');
      if (addBtn) {
        showNewTaskEditor(addBtn.dataset.addCol);
        return;
      }

      // Delete button
      const delBtn = e.target.closest('[data-delete-id]');
      if (delBtn) {
        deleteTask(delBtn.dataset.deleteId);
        return;
      }

      // Column toggle
      const toggleBtn = e.target.closest('[data-toggle-col]');
      if (toggleBtn) {
        const col = toggleBtn.dataset.toggleCol;
        store.toggleColumnVisibility(col);
        render();
        return;
      }
    });

    // Double-click to edit task card
    boardEl.addEventListener('dblclick', (e) => {
      const card = e.target.closest('.task-card');
      if (card && !card.classList.contains('editing') && !e.target.closest('.task-delete-btn')) {
        startEditTask(card);
      }
    });

    // Search
    let searchTimer = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        searchTerm = searchInput.value.trim();
        render();
      }, 300);
    });

    // Keyboard shortcut: 'n' to create task
    document.addEventListener('keydown', (e) => {
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey &&
          !e.target.closest('input') && !e.target.closest('textarea') &&
          !e.target.closest('select')) {
        e.preventDefault();
        // Find first visible column (todo)
        showNewTaskEditor('todo');
      }
      if (e.key === 'Escape') {
        // Close any open inline editor
        const editor = document.querySelector('.inline-editor');
        if (editor) { editor.remove(); render(); }
        // Close editing card
        const editing = document.querySelector('.task-card.editing');
        if (editing) {
          editing.classList.remove('editing');
          editing.draggable = true;
          render();
        }
      }
    });

    // Export
    exportBtn.addEventListener('click', () => {
      const json = store.exportJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `task-board-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    // Dark mode toggle
    darkToggle.addEventListener('click', () => {
      const dark = store.toggleDarkMode();
      applyDarkMode(dark);
    });

    // Error banner close
    errorBannerClose.addEventListener('click', hideStorageError);

    // Corruption dialog
    corruptionStartFresh.addEventListener('click', () => {
      store.clearAll();
      corruptionOverlay.classList.add('hidden');
      storageError = false;
      applyDarkMode(store.getState().preferences.darkMode);
      render();
    });

    corruptionCancel.addEventListener('click', () => {
      corruptionOverlay.classList.add('hidden');
    });

    // Store subscription (for external changes)
    store.subscribe(() => {
      // Only re-render if not triggered by our own render call
    });

    // Init drag & drop
    initDragDrop();
    initTouchDrag();
  }

  /* ── Utility ────────────────────────────────────────────────────────── */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ── Start ──────────────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();