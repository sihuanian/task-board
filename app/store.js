/* ==========================================================================
 * store.js — Task Board Data Persistence Layer
 *
 * Module: M-01
 * Responsibilities:
 *   - Task CRUD (create, read, update, delete)
 *   - localStorage serialization with versioned schema
 *   - Error recovery (quota exceeded, data corruption)
 *   - In-column sort (priority → due-date → createdAt)
 *   - Column visibility + user preferences
 *   - Observer pattern (subscribe for reactive re-render)
 * ========================================================================== */

const STORAGE_KEY = 'task-board-state';
const CURRENT_VERSION = 1;

/* ── Helpers ────────────────────────────────────────────────────────────── */

function uuid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
}

function nowISO() {
  return new Date().toISOString();
}

/* ── Sort comparator (used in getAllTasks) ─────────────────────────────── */

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2, none: 3 };

function taskSorter(a, b) {
  // 1) Priority
  const pa = PRIORITY_ORDER[a.priority] ?? 3;
  const pb = PRIORITY_ORDER[b.priority] ?? 3;
  if (pa !== pb) return pa - pb;
  // 2) dueDate (null = end)
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
  if (a.dueDate) return -1;
  if (b.dueDate) return 1;
  // 3) createdAt (newest first)
  return b.createdAt.localeCompare(a.createdAt);
}

/* ── Default state ─────────────────────────────────────────────────────── */

function defaultState() {
  return {
    version: CURRENT_VERSION,
    tasks: {},
    columnVisibility: { todo: true, 'in-progress': true, done: true },
    preferences: { darkMode: false },
  };
}

/* ── Internal state ────────────────────────────────────────────────────── */

let _state = defaultState();
let _listeners = [];
let _undoTimer = null;          // setTimeout id for permanent delete
let _deletedTask = null;        // { task, status, position } for undo

/* ── Persistence ───────────────────────────────────────────────────────── */

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
    return true;
  } catch (e) {
    if (e instanceof DOMException && (
      e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    )) {
      return { error: 'STORAGE_FULL' };
    }
    if (e instanceof DOMException && e.name === 'SecurityError') {
      return { error: 'STORAGE_FULL' };
    }
    throw e;
  }
}

function notify() {
  _listeners.forEach(fn => { try { fn(); } catch (_) { /* swallow */ } });
}

/* ── Public API ────────────────────────────────────────────────────────── */

const store = {
  /* ── Load ──────────────────────────────────────────────────────────── */
  loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      _state = defaultState();
      return _state;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      return { error: 'DATA_CORRUPT', raw };
    }

    if (typeof parsed !== 'object' || parsed === null) {
      return { error: 'DATA_CORRUPT', raw };
    }

    if (parsed.version > CURRENT_VERSION) {
      return { error: 'DATA_CORRUPT' };
    }

    // Migration (v0 → v1): none needed yet; future versions extend this
    if (parsed.version < CURRENT_VERSION) {
      parsed = migrate(parsed, parsed.version, CURRENT_VERSION);
    }

    _state = parsed;
    return _state;
  },

  /* ── Read ──────────────────────────────────────────────────────────── */
  getState() {
    return _state;
  },

  getAllTasks() {
    const tasks = Object.values(_state.tasks);
    tasks.sort(taskSorter);
    return tasks;
  },

  getTask(id) {
    return _state.tasks[id];
  },

  /* ── Create ────────────────────────────────────────────────────────── */
  createTask({ title, description, priority, dueDate } = {}) {
    if (!title || title.trim().length === 0) {
      return { error: 'VALIDATION', message: 'Title is required' };
    }
    const task = {
      id: uuid(),
      title: title.trim(),
      description: (description || '').trim(),
      status: 'todo',
      priority: priority || 'none',
      dueDate: dueDate || null,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    _state.tasks[task.id] = task;
    const result = persist();
    if (result && result.error) return result;
    notify();
    return task;
  },

  /* ── Update ────────────────────────────────────────────────────────── */
  updateTask(id, patch) {
    const task = _state.tasks[id];
    if (!task) return { error: 'NOT_FOUND' };

    if ('title' in patch) {
      const t = (patch.title || '').trim();
      if (t.length === 0) return { error: 'VALIDATION', message: 'Title is required' };
      task.title = t;
    }
    if ('description' in patch) task.description = (patch.description || '').trim();
    if ('status' in patch) task.status = patch.status;
    if ('priority' in patch) task.priority = patch.priority;
    if ('dueDate' in patch) task.dueDate = patch.dueDate || null;

    task.updatedAt = nowISO();
    const result = persist();
    if (result && result.error) return result;
    notify();
    return task;
  },

  /* ── Delete with undo ──────────────────────────────────────────────── */
  deleteTask(id) {
    const task = _state.tasks[id];
    if (!task) return;

    // Clear any pending permanent delete
    if (_undoTimer) {
      clearTimeout(_undoTimer);
      _undoTimer = null;
    }

    // Save for possible undo
    _deletedTask = { task: { ...task }, id };

    // Remove from state but do NOT persist yet
    delete _state.tasks[id];
    notify();

    // After 5 s, make it permanent
    _undoTimer = setTimeout(() => {
      _deletedTask = null;
      _undoTimer = null;
      persist(); // permanent: actually write to localStorage
      notify();
    }, 5000);

    return { undo: true };
  },

  /* ── Undo delete ───────────────────────────────────────────────────── */
  cancelDelete() {
    if (!_deletedTask) return;
    if (_undoTimer) {
      clearTimeout(_undoTimer);
      _undoTimer = null;
    }
    _state.tasks[_deletedTask.id] = _deletedTask.task;
    _deletedTask = null;
    persist();
    notify();
  },

  confirmPermanentDelete(id) {
    // Force-permanent (for "Recently Deleted" clear etc.)
    if (_deletedTask && _deletedTask.id === id) {
      if (_undoTimer) {
        clearTimeout(_undoTimer);
        _undoTimer = null;
      }
      _deletedTask = null;
    }
    delete _state.tasks[id];
    persist();
    notify();
  },

  /* ── Column visibility ─────────────────────────────────────────────── */
  setColumnVisibility(col, visible) {
    _state.columnVisibility[col] = visible;
    persist();
    notify();
  },

  toggleColumnVisibility(col) {
    _state.columnVisibility[col] = !_state.columnVisibility[col];
    persist();
    notify();
    return _state.columnVisibility[col];
  },

  /* ── Preferences ───────────────────────────────────────────────────── */
  toggleDarkMode() {
    _state.preferences.darkMode = !_state.preferences.darkMode;
    persist();
    notify();
    return _state.preferences.darkMode;
  },

  setDarkMode(val) {
    _state.preferences.darkMode = !!val;
    persist();
    notify();
  },

  /* ── Export ────────────────────────────────────────────────────────── */
  exportJSON() {
    return JSON.stringify(_state, null, 2);
  },

  /* ── Clear all (for "Start Fresh") ─────────────────────────────────── */
  clearAll() {
    _state = defaultState();
    localStorage.removeItem(STORAGE_KEY);
    notify();
    return _state;
  },

  /* ── Subscribe ─────────────────────────────────────────────────────── */
  subscribe(fn) {
    _listeners.push(fn);
    return () => {
      _listeners = _listeners.filter(l => l !== fn);
    };
  },
};

/* ── Migration ──────────────────────────────────────────────────────────── */

function migrate(parsed, fromVersion, toVersion) {
  let state = { ...parsed };
  for (let v = fromVersion; v < toVersion; v++) {
    state = migrators[v](state);
  }
  state.version = toVersion;
  return state;
}

const migrators = {
  // Version 0 → 1: initial schema, no migration needed
  // 1: (state) => { ...state, newField: 'default' },
};

/* ── Expose globally ───────────────────────────────────────────────────── */
window.store = store;