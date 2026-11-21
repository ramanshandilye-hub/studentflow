/**
 * ==========================================================================
 * StudentFlow — Smart Academic Task Manager
 * Pure Vanilla JavaScript (ES6+)
 * 
 * Architecture:
 * 1. CONSTANTS & APPLICATION STATE
 * 2. STORAGE HELPERS (Safe LocalStorage wrappers)
 * 3. UTILITY & DATE HELPERS (Date calculations, XSS escaping, ID gen)
 * 4. TOAST NOTIFICATIONS & CONFIRMATION MODAL
 * 5. CORE RENDERING ENGINE (Single render function, dynamic stats, empty states)
 * 6. EVENT HANDLERS & USER ACTIONS (Add, toggle, delete, undo, edit, filter, search, sort)
 * 7. INITIALIZATION (Theme detection, storage load, seed data, event binding)
 * ==========================================================================
 */

'use strict';

/* ==========================================================================
   1. CONSTANTS & APPLICATION STATE
   ========================================================================== */

// LocalStorage keys
const STORAGE_KEYS = {
  TASKS: 'studentflow_tasks_v2',
  OLD_TASKS: 'studentflow_tasks_v1',
  THEME: 'studentflow_theme_v1',
  USER_NAME: 'studentflow_name_v1'
};

// Titles of the original sample tasks to remove during v1 -> v2 migration
const OLD_SAMPLE_TITLES = [
  'Complete Math Problem Set #4: Derivatives & Integrals',
  'Read Biology Chapter 7: Photosynthesis and Cellular Respiration',
  'Draft English Essay Outline: Themes in Shakespeare\'s Hamlet',
  'Implement Binary Search Tree in Python',
  'Submit European History Paper Topic to Professor'
];

// Category metadata (Labels & Icons)
const CATEGORIES = {
  math: { label: 'Mathematics', icon: '📐', className: 'badge-cat-math' },
  science: { label: 'Science', icon: '🔬', className: 'badge-cat-science' },
  english: { label: 'English / Lit', icon: '📚', className: 'badge-cat-english' },
  history: { label: 'History', icon: '🏛️', className: 'badge-cat-history' },
  coding: { label: 'Coding / CS', icon: '💻', className: 'badge-cat-coding' },
  other: { label: 'Other', icon: '📝', className: 'badge-cat-other' }
};

// Priority metadata
const PRIORITIES = {
  high: { label: 'High Priority', weight: 3, className: 'badge-priority-high' },
  medium: { label: 'Medium Priority', weight: 2, className: 'badge-priority-medium' },
  low: { label: 'Low Priority', weight: 1, className: 'badge-priority-low' }
};

/**
 * Single source of truth for application state
 */
const state = {
  tasks: [],                  // Array of task objects
  filter: 'all',             // 'all' | 'pending' | 'completed'
  categoryFilter: 'all',     // 'all' | 'math' | 'science' | 'english' | 'history' | 'coding' | 'other' | 'custom:<norm>'
  quickView: null,           // null | 'overdue' | 'today' | 'week'
  searchQuery: '',           // Filter query string
  sortBy: 'newest',          // 'newest' | 'due-date' | 'priority'
  editingTaskId: null,       // ID of task currently in inline-edit mode
  lastDeletedTask: null,     // Holds task for Undo deletion: { task, index }
  undoTimerId: null,         // Timer ID for undo toast auto-dismiss
  activeToastTimerId: null   // Active toast timer
};

// DOM Element References Cache
const DOM = {
  // Theme & Header
  html: document.documentElement,
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  installAppBtn: document.getElementById('installAppBtn'),
  greetingContainer: document.querySelector('.greeting-container'),
  greetingDisplay: document.getElementById('greetingDisplay'),
  greetingText: document.getElementById('greetingText'),
  editGreetingBtn: document.getElementById('editGreetingBtn'),
  greetingEditForm: document.getElementById('greetingEditForm'),
  greetingNameInput: document.getElementById('greetingNameInput'),
  cancelGreetingBtn: document.getElementById('cancelGreetingBtn'),
  currentDateStr: document.getElementById('currentDateStr'),

  // Stats Counters
  statTotal: document.getElementById('statTotal'),
  statPending: document.getElementById('statPending'),
  statCompleted: document.getElementById('statCompleted'),
  statPercentage: document.getElementById('statPercentage'),

  // Progress Bar
  progressBarFill: document.getElementById('progressBarFill'),
  progressBarTrack: document.getElementById('progressBarTrack'),
  progressSummaryText: document.getElementById('progressSummaryText'),

  // Add Task Form
  taskForm: document.getElementById('taskForm'),
  taskTitleInput: document.getElementById('taskTitleInput'),
  taskCategorySelect: document.getElementById('taskCategorySelect'),
  customSubjectGroup: document.getElementById('customSubjectGroup'),
  taskCustomSubjectInput: document.getElementById('taskCustomSubjectInput'),
  customSubjectsDatalist: document.getElementById('customSubjectsDatalist'),
  taskPrioritySelect: document.getElementById('taskPrioritySelect'),
  taskDueDateInput: document.getElementById('taskDueDateInput'),
  titleErrorMsg: document.getElementById('titleErrorMsg'),
  titleErrorText: document.getElementById('titleErrorText'),

  // Search, Filters & Quick Views
  searchInput: document.getElementById('searchInput'),
  searchClearBtn: document.getElementById('searchClearBtn'),
  filterPills: document.querySelectorAll('.filter-pill'),
  filterCountAll: document.getElementById('filterCountAll'),
  filterCountPending: document.getElementById('filterCountPending'),
  filterCountCompleted: document.getElementById('filterCountCompleted'),
  quickChips: document.querySelectorAll('.quick-chip'),
  quickCountOverdue: document.getElementById('quickCountOverdue'),
  quickCountToday: document.getElementById('quickCountToday'),
  quickCountWeek: document.getElementById('quickCountWeek'),
  categoryFilterSelect: document.getElementById('categoryFilterSelect'),
  sortSelect: document.getElementById('sortSelect'),
  clearCompletedBtn: document.getElementById('clearCompletedBtn'),

  // Backup Controls
  exportBtn: document.getElementById('exportBtn'),
  importBtn: document.getElementById('importBtn'),
  importFileInput: document.getElementById('importFileInput'),

  // Task List & Empty State
  taskList: document.getElementById('taskList'),
  emptyState: document.getElementById('emptyState'),
  emptyStateIconWrapper: document.getElementById('emptyStateIconWrapper'),
  emptyStateHeading: document.getElementById('emptyStateHeading'),
  emptyStateMessage: document.getElementById('emptyStateMessage'),

  // Confirmation Modal
  confirmModal: document.getElementById('confirmModal'),
  modalBackdrop: document.getElementById('modalBackdrop'),
  modalCancelBtn: document.getElementById('modalCancelBtn'),
  modalConfirmBtn: document.getElementById('modalConfirmBtn'),
  modalDialogTitle: document.getElementById('modalDialogTitle'),
  modalDialogDesc: document.getElementById('modalDialogDesc'),

  // Toast Container
  toastRegion: document.getElementById('toastRegion')
};

/* ==========================================================================
   2. STORAGE HELPERS
   Safely handle read/writes with try/catch to survive private mode / quota limits
   ========================================================================== */

/**
 * Validate and sanitize a single task object against corrupted or missing properties.
 */
function sanitizeTask(item) {
  if (!item || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.title !== 'string') {
    return null;
  }
  const title = item.title.trim();
  if (!title) return null;

  const customSubject = typeof item.customSubject === 'string'
    ? item.customSubject.trim().replace(/\s+/g, ' ').slice(0, 30)
    : '';

  return {
    id: item.id,
    title: title,
    completed: Boolean(item.completed),
    priority: ['low', 'medium', 'high'].includes(item.priority) ? item.priority : 'medium',
    category: CATEGORIES[item.category] ? item.category : 'other',
    customSubject: customSubject,
    dueDate: typeof item.dueDate === 'string' ? item.dueDate : '',
    createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now()
  };
}

/**
 * Load tasks array from LocalStorage.
 * Handles automatic migration from v1 to v2 (filtering out legacy sample tasks).
 * Returns an empty array for brand-new users (starts clean).
 */
function loadTasksFromStorage() {
  try {
    const rawV2 = localStorage.getItem(STORAGE_KEYS.TASKS);
    if (rawV2 !== null) {
      const parsed = JSON.parse(rawV2);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(sanitizeTask).filter(Boolean);
    }

    // v2 does not exist yet. Check for legacy v1 to migrate
    const rawV1 = localStorage.getItem(STORAGE_KEYS.OLD_TASKS);
    if (rawV1 !== null) {
      const parsedV1 = JSON.parse(rawV1);
      let migrated = [];
      if (Array.isArray(parsedV1)) {
        migrated = parsedV1
          .filter(item => item && !OLD_SAMPLE_TITLES.includes(item.title ? item.title.trim() : ''))
          .map(sanitizeTask)
          .filter(Boolean);
      }
      localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(migrated));
      localStorage.removeItem(STORAGE_KEYS.OLD_TASKS);
      return migrated;
    }

    // New user starts completely fresh with an empty task list
    return [];
  } catch (err) {
    console.error('Failed to load tasks from localStorage:', err);
    return [];
  }
}

/**
 * Save current state.tasks array to LocalStorage.
 */
function saveTasksToStorage() {
  try {
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(state.tasks));
  } catch (err) {
    console.error('Failed to save tasks to localStorage:', err);
    showToast('Storage quota exceeded or disabled. Changes may not persist.', 'danger');
  }
}

/**
 * Read custom student name or default to 'Student'.
 */
function getUserName() {
  try {
    const name = localStorage.getItem(STORAGE_KEYS.USER_NAME);
    return (name && name.trim()) ? name.trim().slice(0, 20) : 'Student';
  } catch (err) {
    return 'Student';
  }
}

/**
 * Save custom student name to LocalStorage.
 */
function saveUserName(name) {
  try {
    const trimmed = (name && name.trim()) ? name.trim().slice(0, 20) : 'Student';
    localStorage.setItem(STORAGE_KEYS.USER_NAME, trimmed);
    return trimmed;
  } catch (err) {
    console.warn('Failed to save name:', err);
    return 'Student';
  }
}

/**
 * Load saved theme preference or default to system color scheme.
 */
function getInitialTheme() {
  try {
    const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }
  } catch (err) {
    console.warn('LocalStorage unavailable for theme check:', err);
  }

  // Fallback to system preference
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

/**
 * Save theme preference to LocalStorage.
 */
function saveThemeToStorage(theme) {
  try {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  } catch (err) {
    console.warn('Failed to save theme preference:', err);
  }
}

/* ==========================================================================
   3. UTILITY & DATE HELPERS
   ========================================================================== */

/**
 * Sanitize and escape arbitrary strings to prevent HTML injection / XSS.
 * Beginner tip: Setting textContent on a dummy DOM node and reading innerHTML
 * safely converts special characters (<, >, &, ", ') to safe HTML entities.
 */
function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Generate a unique ID for each task.
 */
function generateId() {
  return 'task_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
}

/**
 * Format today's date for header display.
 * e.g., "Saturday, Nov 21, 2026"
 */
function formatTodayDate() {
  const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  return new Intl.DateTimeFormat('en-US', options).format(new Date());
}

/**
 * Calculate dynamic greeting with user's custom name based on time of day.
 */
function getGreeting() {
  const hour = new Date().getHours();
  const name = getUserName();
  let timeGreeting = 'Good day';
  if (hour < 12) timeGreeting = 'Good morning';
  else if (hour < 17) timeGreeting = 'Good afternoon';
  else timeGreeting = 'Good evening';

  return `${timeGreeting}, ${name}!`;
}

/**
 * Format custom subject display (First letter capital, rest as user typed).
 */
function formatSubjectDisplay(name) {
  if (!name) return '';
  const trimmed = name.trim().replace(/\s+/g, ' ');
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Stable color badge class generator based on subject name string hash.
 */
function getSubjectColorClass(name) {
  if (!name) return 'badge-cat-other';
  let hash = 0;
  const normalized = name.toLowerCase().trim();
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
    hash |= 0;
  }
  const colorIdx = Math.abs(hash) % 6;
  return `badge-custom-${colorIdx}`;
}

/**
 * Calculate calendar day difference between a task's due date and today.
 */
function getTaskDiffDays(task) {
  if (!task.dueDate) return null;
  const parts = task.dueDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const [year, month, day] = parts;
  const dueDate = new Date(year, month - 1, day);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffTime = dueDate.getTime() - today.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Calculate due date relative status accurately.
 * We parse Year, Month, and Day directly from 'YYYY-MM-DD' to prevent
 * timezone conversion bugs between UTC and user's local machine.
 * 
 * Returns: { status: 'overdue' | 'today' | 'tomorrow' | 'upcoming', label, formatted }
 */
function getDueDateStatus(dueDateStr, isCompleted = false) {
  if (!dueDateStr) return null;

  const parts = dueDateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;

  const [year, month, day] = parts;
  const dueDate = new Date(year, month - 1, day);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  // Time difference in calendar days
  const diffTime = dueDate.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  // Friendly short date representation (e.g. "Nov 25")
  const formattedDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(dueDate);

  // If already completed, we show a neutral date badge rather than alarm
  if (isCompleted) {
    return {
      status: 'upcoming',
      label: `Due ${formattedDate}`,
      className: 'badge-due-upcoming'
    };
  }

  if (diffDays < 0) {
    const daysAgo = Math.abs(diffDays);
    const agoLabel = daysAgo === 1 ? '1 day overdue' : `${daysAgo} days overdue`;
    return {
      status: 'overdue',
      label: `⚠️ Overdue (${agoLabel})`,
      className: 'badge-due-overdue'
    };
  } else if (diffDays === 0) {
    return {
      status: 'today',
      label: '⏳ Due today',
      className: 'badge-due-today'
    };
  } else if (diffDays === 1) {
    return {
      status: 'tomorrow',
      label: '📅 Due tomorrow',
      className: 'badge-due-tomorrow'
    };
  } else {
    return {
      status: 'upcoming',
      label: `📅 Due ${formattedDate}`,
      className: 'badge-due-upcoming'
    };
  }
}

/* ==========================================================================
   4. TOAST NOTIFICATIONS & CONFIRMATION MODAL
   ========================================================================== */

/**
 * Display a modern toast notification with optional action button (e.g. Undo).
 * Automatically dismisses after `durationMs`.
 */
function showToast(message, type = 'info', actionConfig = null, durationMs = 5000) {
  // Clear any existing toast to keep UI uncluttered
  DOM.toastRegion.innerHTML = '';
  if (state.activeToastTimerId) {
    clearTimeout(state.activeToastTimerId);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', 'status');

  // Choose icon based on toast type
  let iconSvg = '';
  if (type === 'success') {
    iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
  } else if (type === 'danger') {
    iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
  } else {
    iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
  }

  const contentRow = document.createElement('div');
  contentRow.className = 'toast-content-row';

  const messageGroup = document.createElement('div');
  messageGroup.className = 'toast-message-group';
  messageGroup.innerHTML = `${iconSvg}<span class="toast-text">${escapeHTML(message)}</span>`;
  contentRow.appendChild(messageGroup);

  // Optional Action Button (e.g., Undo)
  if (actionConfig && typeof actionConfig.callback === 'function') {
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'toast-undo-btn';
    actionBtn.textContent = actionConfig.label || 'Undo';
    actionBtn.addEventListener('click', () => {
      clearTimeout(state.activeToastTimerId);
      dismissToast(toast);
      actionConfig.callback();
    });
    contentRow.appendChild(actionBtn);
  }

  // Toast Progress Bar (visual countdown)
  const progressBar = document.createElement('div');
  progressBar.className = 'toast-progress-bar';
  progressBar.style.transition = `transform ${durationMs}ms linear`;
  progressBar.style.transform = 'scaleX(1)';

  toast.appendChild(contentRow);
  toast.appendChild(progressBar);
  DOM.toastRegion.appendChild(toast);

  // Trigger CSS transition on next microtask
  requestAnimationFrame(() => {
    progressBar.style.transform = 'scaleX(0)';
  });

  // Schedule auto-dismiss
  state.activeToastTimerId = setTimeout(() => {
    dismissToast(toast);
  }, durationMs);
}

/**
 * Animate dismissal of toast notification.
 */
function dismissToast(toastEl) {
  if (!toastEl || !toastEl.parentNode) return;
  toastEl.classList.add('toast-hiding');
  setTimeout(() => {
    if (toastEl.parentNode) {
      toastEl.parentNode.removeChild(toastEl);
    }
  }, 200);
}

/**
 * Show confirmation modal for dangerous actions (e.g. Clearing Completed Tasks).
 */
function showConfirmModal(title, description, onConfirmCallback) {
  DOM.modalDialogTitle.textContent = title;
  DOM.modalDialogDesc.textContent = description;
  DOM.confirmModal.removeAttribute('hidden');

  // Focus the cancel button by default for safety
  DOM.modalCancelBtn.focus();

  // Temporary handlers for confirmation
  const handleConfirm = () => {
    closeConfirmModal();
    onConfirmCallback();
  };

  const handleCancel = () => {
    closeConfirmModal();
  };

  const handleKeydown = (e) => {
    if (e.key === 'Escape') {
      closeConfirmModal();
    }
  };

  function closeConfirmModal() {
    DOM.confirmModal.setAttribute('hidden', '');
    DOM.modalConfirmBtn.removeEventListener('click', handleConfirm);
    DOM.modalCancelBtn.removeEventListener('click', handleCancel);
    DOM.modalBackdrop.removeEventListener('click', handleCancel);
    document.removeEventListener('keydown', handleKeydown);
  }

  DOM.modalConfirmBtn.addEventListener('click', handleConfirm);
  DOM.modalCancelBtn.addEventListener('click', handleCancel);
  DOM.modalBackdrop.addEventListener('click', handleCancel);
  document.addEventListener('keydown', handleKeydown);
}

/* ==========================================================================
   5. CORE RENDERING ENGINE
   Single render() function driven by application state
   ========================================================================== */

/**
 * Rebuild category filter options including dynamic custom subjects from current tasks.
 */
function rebuildCategoryFilterOptions() {
  if (!DOM.categoryFilterSelect) return;
  const currentVal = state.categoryFilter;

  // Collect distinct custom subjects currently in state
  const customMap = new Map(); // normalized -> display
  state.tasks.forEach(t => {
    if (t.category === 'other' && t.customSubject) {
      const norm = t.customSubject.trim().replace(/\s+/g, ' ').toLowerCase();
      if (!customMap.has(norm)) {
        customMap.set(norm, formatSubjectDisplay(t.customSubject));
      }
    }
  });

  // If active filter is a custom subject that no longer exists in any task, reset to 'all'
  if (currentVal.startsWith('custom:')) {
    const norm = currentVal.slice(7);
    if (!customMap.has(norm)) {
      state.categoryFilter = 'all';
    }
  }

  let html = `
    <option value="all">All Subjects</option>
    <option value="math">📐 Mathematics</option>
    <option value="science">🔬 Science</option>
    <option value="english">📚 English / Lit</option>
    <option value="history">🏛️ History</option>
    <option value="coding">💻 Coding / CS</option>
    <option value="other">📝 General / Other</option>
  `;

  if (customMap.size > 0) {
    html += '<optgroup label="Your subjects">';
    Array.from(customMap.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .forEach(([norm, disp]) => {
        html += `<option value="custom:${norm}">🏷️ ${escapeHTML(disp)}</option>`;
      });
    html += '</optgroup>';
  }

  DOM.categoryFilterSelect.innerHTML = html;
  DOM.categoryFilterSelect.value = state.categoryFilter;
}

/**
 * Populate datalist with unique custom subjects previously used.
 */
function updateCustomSubjectsDatalist() {
  if (!DOM.customSubjectsDatalist) return;
  const set = new Set();
  state.tasks.forEach(t => {
    if (t.category === 'other' && t.customSubject) {
      set.add(formatSubjectDisplay(t.customSubject));
    }
  });

  DOM.customSubjectsDatalist.innerHTML = '';
  Array.from(set).sort().forEach(subj => {
    const opt = document.createElement('option');
    opt.value = subj;
    DOM.customSubjectsDatalist.appendChild(opt);
  });
}

/**
 * Main render function. Reads state, computes stats, filters, sorts,
 * and updates DOM accordingly.
 */
function render() {
  // 1. Update Header Greeting and Current Date
  DOM.greetingText.textContent = getGreeting();
  DOM.currentDateStr.textContent = formatTodayDate();

  // 2. Compute live statistics
  const totalCount = state.tasks.length;
  const completedCount = state.tasks.filter(t => t.completed).length;
  const pendingCount = totalCount - completedCount;
  const percentage = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  // 3. Update Stats Metric Cards
  DOM.statTotal.textContent = totalCount;
  DOM.statPending.textContent = pendingCount;
  DOM.statCompleted.textContent = completedCount;
  DOM.statPercentage.textContent = `${percentage}%`;

  // 4. Update Progress Bar
  DOM.progressBarFill.style.width = `${percentage}%`;
  DOM.progressBarTrack.setAttribute('aria-valuenow', percentage);
  DOM.progressSummaryText.textContent = `${completedCount} of ${totalCount} completed (${percentage}%)`;

  // 5. Update Filter Tab Counters
  DOM.filterCountAll.textContent = totalCount;
  DOM.filterCountPending.textContent = pendingCount;
  DOM.filterCountCompleted.textContent = completedCount;

  // 6. Update Quick Date Filter Counts
  // Overdue count applies ONLY to pending tasks (per requirements)
  const overdueCount = state.tasks.filter(t => !t.completed && getTaskDiffDays(t) !== null && getTaskDiffDays(t) < 0).length;
  const todayCount = state.tasks.filter(t => getTaskDiffDays(t) === 0).length;
  const weekCount = state.tasks.filter(t => {
    const d = getTaskDiffDays(t);
    return d !== null && d >= 0 && d <= 7;
  }).length;

  if (DOM.quickCountOverdue) DOM.quickCountOverdue.textContent = overdueCount;
  if (DOM.quickCountToday) DOM.quickCountToday.textContent = todayCount;
  if (DOM.quickCountWeek) DOM.quickCountWeek.textContent = weekCount;

  // Update Quick Chip Pressed & Active states
  DOM.quickChips.forEach(chip => {
    const q = chip.getAttribute('data-quick');
    const isActive = state.quickView === q;
    chip.classList.toggle('active', isActive);
    chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  // 7. Update Clear Completed Button state
  DOM.clearCompletedBtn.disabled = completedCount === 0;

  // 8. Update Filter Pills Active State
  DOM.filterPills.forEach(pill => {
    const pillFilter = pill.getAttribute('data-filter');
    const isActive = pillFilter === state.filter;
    pill.classList.toggle('active', isActive);
    pill.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  // 9. Rebuild dynamic category filter dropdown & update custom subjects datalist
  rebuildCategoryFilterOptions();
  updateCustomSubjectsDatalist();

  // 10. Filter Tasks by Status, Quick View, Category, and Search Query
  const searchLower = state.searchQuery.trim().toLowerCase();

  let filteredTasks = state.tasks.filter(task => {
    // Status filter
    if (state.filter === 'pending' && task.completed) return false;
    if (state.filter === 'completed' && !task.completed) return false;

    // Quick View filter
    if (state.quickView) {
      const diff = getTaskDiffDays(task);
      if (state.quickView === 'overdue') {
        if (task.completed || diff === null || diff >= 0) return false;
      } else if (state.quickView === 'today') {
        if (diff !== 0) return false;
      } else if (state.quickView === 'week') {
        if (diff === null || diff < 0 || diff > 7) return false;
      }
    }

    // Category filter
    if (state.categoryFilter !== 'all') {
      if (state.categoryFilter.startsWith('custom:')) {
        const normKey = state.categoryFilter.slice(7);
        const taskNorm = (task.customSubject || '').trim().replace(/\s+/g, ' ').toLowerCase();
        if (task.category !== 'other' || taskNorm !== normKey) return false;
      } else if (state.categoryFilter === 'other') {
        // "General / Other" matches tasks without a custom subject
        if (task.category !== 'other' || Boolean(task.customSubject && task.customSubject.trim())) return false;
      } else {
        if (task.category !== state.categoryFilter) return false;
      }
    }

    // Search query filter (matches title)
    if (searchLower && !task.title.toLowerCase().includes(searchLower)) return false;

    return true;
  });

  // 11. Sort Tasks
  filteredTasks.sort((a, b) => {
    if (state.sortBy === 'newest') {
      return b.createdAt - a.createdAt; // Descending timestamp
    }

    if (state.sortBy === 'due-date') {
      // Tasks with due dates come first (closest due date first)
      if (a.dueDate && b.dueDate) {
        return a.dueDate.localeCompare(b.dueDate);
      }
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      return b.createdAt - a.createdAt;
    }

    if (state.sortBy === 'priority') {
      const weightA = PRIORITIES[a.priority]?.weight || 1;
      const weightB = PRIORITIES[b.priority]?.weight || 1;
      if (weightB !== weightA) {
        return weightB - weightA; // High (3) -> Medium (2) -> Low (1)
      }
      return b.createdAt - a.createdAt;
    }

    return 0;
  });

  // 12. Render Task List or Friendly Contextual Empty State
  renderTaskList(filteredTasks, totalCount, completedCount, pendingCount);
}

/**
 * Render the filtered task list items or contextual empty state.
 */
function renderTaskList(filteredTasks, totalCount, completedCount, pendingCount) {
  // Clear existing items
  DOM.taskList.innerHTML = '';

  // If no items match, show appropriate empty state
  if (filteredTasks.length === 0) {
    DOM.emptyState.removeAttribute('hidden');
    renderEmptyState(totalCount, completedCount, pendingCount);
    return;
  }

  // Hide empty state if we have tasks to show
  DOM.emptyState.setAttribute('hidden', '');

  // Render each task item
  filteredTasks.forEach(task => {
    const li = createTaskItemElement(task);
    DOM.taskList.appendChild(li);
  });
}

/**
 * Render friendly, contextual empty state message depending on current filter / search.
 */
function renderEmptyState(totalCount, completedCount, pendingCount) {
  let iconSvg = '';
  let heading = '';
  let message = '';

  if (totalCount === 0) {
    // App is completely fresh / empty
    iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
    heading = 'No tasks yet!';
    message = 'Add your first assignment, project, or exam study plan using the form above.';
  } else if (state.searchQuery.trim() !== '') {
    // Search active but no matches
    iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
    heading = 'No matching tasks';
    message = `No assignments found matching "${escapeHTML(state.searchQuery)}". Try another search or clear the filter.`;
  } else if (state.quickView === 'overdue') {
    iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
    heading = 'No overdue tasks! 🎉';
    message = 'Awesome job! You have zero overdue assignments. Everything is right on track!';
  } else if (state.quickView === 'today') {
    iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    heading = 'No tasks due today';
    message = 'You have no assignments due today. Take a breather or plan ahead for tomorrow!';
  } else if (state.quickView === 'week') {
    iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
    heading = 'No tasks due in the next 7 days';
    message = 'Your upcoming week is completely clear of scheduled deadlines!';
  } else if (state.categoryFilter !== 'all') {
    // Category filter has no matches
    let catDisplayName = 'this subject';
    if (state.categoryFilter.startsWith('custom:')) {
      const norm = state.categoryFilter.slice(7);
      const matched = state.tasks.find(t => (t.customSubject || '').trim().replace(/\s+/g, ' ').toLowerCase() === norm);
      catDisplayName = matched ? formatSubjectDisplay(matched.customSubject) : norm;
    } else if (state.categoryFilter === 'other') {
      catDisplayName = 'General / Other';
    } else {
      catDisplayName = CATEGORIES[state.categoryFilter]?.label || 'this subject';
    }

    iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`;
    heading = `No ${escapeHTML(catDisplayName)} tasks`;
    message = `You don't have any tasks logged under ${escapeHTML(catDisplayName)} currently.`;
  } else if (state.filter === 'pending') {
    // Pending filter empty -> User finished all work!
    iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
    heading = 'All caught up! 🎉';
    message = 'Great job! You have zero pending tasks. Enjoy your free time or plan ahead!';
  } else if (state.filter === 'completed') {
    // Completed filter empty
    iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    heading = 'No completed tasks yet';
    message = 'Check off an assignment as you finish it to build momentum and see it here.';
  } else {
    // Fallback
    iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    heading = 'No tasks to display';
    message = 'Adjust your active filters above to view tasks.';
  }

  DOM.emptyStateIconWrapper.innerHTML = iconSvg;
  DOM.emptyStateHeading.textContent = heading;
  DOM.emptyStateMessage.textContent = message;
}

/**
 * Create a single task list item element with full interaction handlers.
 */
function createTaskItemElement(task) {
  const li = document.createElement('li');
  li.className = `task-item ${task.completed ? 'completed' : ''}`;
  li.dataset.taskId = task.id;

  // Check if this task is currently in inline-edit mode
  if (state.editingTaskId === task.id) {
    return createInlineEditElement(task);
  }

  // --- Normal View Mode ---

  // 1. Checkbox element (custom accessible)
  const checkboxLabel = document.createElement('label');
  checkboxLabel.className = 'task-checkbox-label';
  checkboxLabel.setAttribute('aria-label', `Mark task "${escapeHTML(task.title)}" as ${task.completed ? 'pending' : 'completed'}`);

  const checkboxInput = document.createElement('input');
  checkboxInput.type = 'checkbox';
  checkboxInput.className = 'task-checkbox-input';
  checkboxInput.checked = task.completed;
  checkboxInput.addEventListener('change', () => handleToggleTask(task.id));

  const checkboxCustom = document.createElement('div');
  checkboxCustom.className = 'checkbox-custom';
  checkboxCustom.innerHTML = `<svg class="check-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>`;

  checkboxLabel.appendChild(checkboxInput);
  checkboxLabel.appendChild(checkboxCustom);
  li.appendChild(checkboxLabel);

  // 2. Task Details Area (Title + Badges)
  const details = document.createElement('div');
  details.className = 'task-details';

  const titleSpan = document.createElement('span');
  titleSpan.className = 'task-title';
  titleSpan.textContent = task.title; // Safe textContent avoids XSS
  titleSpan.title = 'Double-click to edit this task';
  titleSpan.addEventListener('dblclick', () => handleStartEdit(task.id));
  details.appendChild(titleSpan);

  // Badges container
  const metaRow = document.createElement('div');
  metaRow.className = 'task-meta-row';

  // Category / Subject Badge
  const catBadge = document.createElement('span');
  if (task.category === 'other' && task.customSubject) {
    const dispName = formatSubjectDisplay(task.customSubject);
    const colorClass = getSubjectColorClass(task.customSubject);
    catBadge.className = `badge ${colorClass}`;
    catBadge.innerHTML = `<span class="badge-icon">🏷️</span> <span>${escapeHTML(dispName)}</span>`;
  } else if (task.category === 'other') {
    catBadge.className = 'badge badge-cat-other';
    catBadge.innerHTML = '<span class="badge-icon">📝</span> <span>General / Other</span>';
  } else {
    const catMeta = CATEGORIES[task.category] || CATEGORIES.other;
    catBadge.className = `badge ${catMeta.className}`;
    catBadge.innerHTML = `<span class="badge-icon">${catMeta.icon}</span> <span>${escapeHTML(catMeta.label)}</span>`;
  }
  metaRow.appendChild(catBadge);

  // Priority Badge
  const priMeta = PRIORITIES[task.priority] || PRIORITIES.medium;
  const priBadge = document.createElement('span');
  priBadge.className = `badge ${priMeta.className}`;
  priBadge.innerHTML = `<span class="badge-dot"></span> <span>${escapeHTML(priMeta.label)}</span>`;
  metaRow.appendChild(priBadge);

  // Due Date Badge (with Overdue / Due today / Due tomorrow status)
  const dueStatus = getDueDateStatus(task.dueDate, task.completed);
  if (dueStatus) {
    const dueBadge = document.createElement('span');
    dueBadge.className = `badge ${dueStatus.className}`;
    dueBadge.textContent = dueStatus.label;
    metaRow.appendChild(dueBadge);
  }

  details.appendChild(metaRow);
  li.appendChild(details);

  // 3. Action Buttons (Edit and Delete)
  const actions = document.createElement('div');
  actions.className = 'task-actions';

  // Edit Button
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'action-btn edit-btn';
  editBtn.setAttribute('aria-label', `Edit task: ${escapeHTML(task.title)}`);
  editBtn.title = 'Edit task';
  editBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  `;
  editBtn.addEventListener('click', () => handleStartEdit(task.id));
  actions.appendChild(editBtn);

  // Delete Button
  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'action-btn delete-btn';
  deleteBtn.setAttribute('aria-label', `Delete task: ${escapeHTML(task.title)}`);
  deleteBtn.title = 'Delete task (Undo available)';
  deleteBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      <line x1="10" y1="11" x2="10" y2="17"/>
      <line x1="14" y1="11" x2="14" y2="17"/>
    </svg>
  `;
  deleteBtn.addEventListener('click', () => handleDeleteTask(task.id));
  actions.appendChild(deleteBtn);

  li.appendChild(actions);

  return li;
}

/**
 * Create inline-edit form when a task is in editing state.
 */
function createInlineEditElement(task) {
  const li = document.createElement('li');
  li.className = 'task-item editing-task-item';
  li.dataset.taskId = task.id;

  const editContainer = document.createElement('div');
  editContainer.className = 'task-edit-container';

  // Title input
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'edit-input-field';
  titleInput.value = task.title;
  titleInput.placeholder = 'Task title cannot be empty...';
  titleInput.maxLength = 150;
  titleInput.setAttribute('aria-label', 'Edit task title');

  // Options row (Subject, Priority, Due Date)
  const optionsRow = document.createElement('div');
  optionsRow.className = 'edit-options-row';

  // Category select
  const catWrapper = document.createElement('div');
  catWrapper.className = 'select-wrapper';
  const catSelect = document.createElement('select');
  catSelect.className = 'select-input compact-select';
  Object.keys(CATEGORIES).forEach(key => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = key === 'other' ? '📝 Other (type your own)' : `${CATEGORIES[key].icon} ${CATEGORIES[key].label}`;
    if (key === task.category) opt.selected = true;
    catSelect.appendChild(opt);
  });
  catWrapper.appendChild(catSelect);
  optionsRow.appendChild(catWrapper);

  // Custom Subject input for inline edit (Visible when 'other' is selected)
  const customSubjInput = document.createElement('input');
  customSubjInput.type = 'text';
  customSubjInput.className = 'text-input compact-select edit-custom-subject-input';
  customSubjInput.placeholder = 'Type your subject, e.g. Chemistry, Civics';
  customSubjInput.maxLength = 30;
  customSubjInput.value = (task.category === 'other' && task.customSubject) ? task.customSubject : '';
  customSubjInput.setAttribute('aria-label', 'Custom subject');
  customSubjInput.hidden = task.category !== 'other';
  optionsRow.appendChild(customSubjInput);

  catSelect.addEventListener('change', () => {
    if (catSelect.value === 'other') {
      customSubjInput.hidden = false;
      customSubjInput.focus();
    } else {
      customSubjInput.hidden = true;
    }
  });

  // Priority select
  const priWrapper = document.createElement('div');
  priWrapper.className = 'select-wrapper';
  const priSelect = document.createElement('select');
  priSelect.className = 'select-input compact-select';
  ['low', 'medium', 'high'].forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p === 'low' ? '🟢 Low' : p === 'medium' ? '🟡 Medium' : '🔴 High';
    if (p === task.priority) opt.selected = true;
    priSelect.appendChild(opt);
  });
  priWrapper.appendChild(priSelect);
  optionsRow.appendChild(priWrapper);

  // Due Date input
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.className = 'text-input compact-select';
  dateInput.value = task.dueDate || '';
  optionsRow.appendChild(dateInput);

  // Actions row (Save & Cancel buttons)
  const actionsRow = document.createElement('div');
  actionsRow.className = 'edit-actions-row';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn edit-cancel-btn';
  cancelBtn.textContent = 'Cancel (Esc)';
  cancelBtn.addEventListener('click', handleCancelEdit);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn edit-save-btn';
  saveBtn.textContent = 'Save Changes (Enter)';
  saveBtn.addEventListener('click', () => {
    handleSaveEdit(task.id, titleInput.value, catSelect.value, priSelect.value, dateInput.value, customSubjInput.value);
  });

  actionsRow.appendChild(cancelBtn);
  actionsRow.appendChild(saveBtn);

  // Keyboard navigation for inline edit (Enter saves from any input, Escape cancels)
  editContainer.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
      e.preventDefault();
      handleSaveEdit(task.id, titleInput.value, catSelect.value, priSelect.value, dateInput.value, customSubjInput.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  });

  editContainer.appendChild(titleInput);
  editContainer.appendChild(optionsRow);
  editContainer.appendChild(actionsRow);
  li.appendChild(editContainer);

  // Focus and select text when mounting into DOM
  setTimeout(() => {
    titleInput.focus();
    titleInput.select();
  }, 10);

  return li;
}

/* ==========================================================================
   6. EVENT HANDLERS & USER ACTIONS
   ========================================================================== */

/**
 * Handle adding a new task from the input form.
 */
function handleAddTask(e) {
  if (e) e.preventDefault();

  const titleRaw = DOM.taskTitleInput.value;
  const title = titleRaw.trim();

  // Input Validation: Block empty or whitespace-only titles
  if (!title) {
    showFormError('Please enter a task title before adding.');
    DOM.taskTitleInput.focus();
    return;
  }

  const category = DOM.taskCategorySelect.value || 'other';
  let customSubj = '';
  if (category === 'other') {
    customSubj = (DOM.taskCustomSubjectInput.value || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    if (!customSubj) {
      showFormError('Please type your subject name');
      DOM.taskCustomSubjectInput.focus();
      return;
    }
  }

  // Clear any existing inline error
  hideFormError();

  const newTask = {
    id: generateId(),
    title: title,
    completed: false,
    priority: DOM.taskPrioritySelect.value || 'medium',
    category: category,
    customSubject: customSubj,
    dueDate: DOM.taskDueDateInput.value || '',
    createdAt: Date.now()
  };

  // Prepend new task so it's immediately visible at the top
  state.tasks.unshift(newTask);
  saveTasksToStorage();

  // Reset task title and due date, but PRESERVE chosen subject and custom subject
  DOM.taskTitleInput.value = '';
  DOM.taskDueDateInput.value = '';
  DOM.taskTitleInput.focus();

  showToast('Task added successfully! 🎯', 'success');
  render();
}

/**
 * Show inline validation error for task title input.
 */
function showFormError(message) {
  DOM.titleErrorText.textContent = message;
  DOM.titleErrorMsg.removeAttribute('hidden');
  DOM.taskTitleInput.classList.add('input-invalid');
}

/**
 * Hide inline validation error.
 */
function hideFormError() {
  DOM.titleErrorMsg.setAttribute('hidden', '');
  DOM.taskTitleInput.classList.remove('input-invalid');
}

/**
 * Handle toggling completed status of a task.
 */
function handleToggleTask(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  task.completed = !task.completed;
  saveTasksToStorage();

  const message = task.completed ? 'Task marked as completed! 🌟' : 'Task marked as pending.';
  showToast(message, 'info');
  render();
}

/**
 * Handle deleting a task, with full Undo support.
 */
function handleDeleteTask(taskId) {
  const taskIndex = state.tasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) return;

  const deletedTask = state.tasks[taskIndex];

  // Store deleted task reference in state for Undo
  state.lastDeletedTask = {
    task: deletedTask,
    originalIndex: taskIndex
  };

  // Remove from state
  state.tasks.splice(taskIndex, 1);
  saveTasksToStorage();

  // Cancel editing if deleting the currently edited task
  if (state.editingTaskId === taskId) {
    state.editingTaskId = null;
  }

  render();

  // Show Toast with active Undo button (~5 seconds)
  showToast(
    `Deleted "${deletedTask.title.slice(0, 24)}${deletedTask.title.length > 24 ? '...' : ''}"`,
    'danger',
    {
      label: 'Undo',
      callback: handleUndoDelete
    },
    5000
  );
}

/**
 * Handle restoring the last deleted task via the Undo toast button.
 */
function handleUndoDelete() {
  if (!state.lastDeletedTask) return;

  const { task, originalIndex } = state.lastDeletedTask;

  // Insert back at original index or end of array
  const insertIndex = Math.min(originalIndex, state.tasks.length);
  state.tasks.splice(insertIndex, 0, task);

  // Clear deleted state
  state.lastDeletedTask = null;

  saveTasksToStorage();
  render();
  showToast('Task restored! ↩️', 'success');
}

/**
 * Enter inline edit mode for a task.
 */
function handleStartEdit(taskId) {
  state.editingTaskId = taskId;
  render();
}

/**
 * Save inline edited changes for a task.
 */
function handleSaveEdit(taskId, newTitle, newCategory, newPriority, newDueDate, newCustomSubject) {
  const trimmedTitle = newTitle.trim();
  if (!trimmedTitle) {
    showToast('Task title cannot be empty.', 'danger');
    return;
  }

  let formattedCustomSubject = '';
  if (newCategory === 'other') {
    formattedCustomSubject = (newCustomSubject || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    if (!formattedCustomSubject) {
      showToast('Please type your subject name', 'danger');
      return;
    }
  }

  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  task.title = trimmedTitle;
  task.category = newCategory || 'other';
  task.customSubject = formattedCustomSubject;
  task.priority = newPriority || 'medium';
  task.dueDate = newDueDate || '';

  state.editingTaskId = null;
  saveTasksToStorage();
  render();
  showToast('Task updated! ✏️', 'success');
}

/**
 * Cancel inline edit mode without saving.
 */
function handleCancelEdit() {
  state.editingTaskId = null;
  render();
}

/**
 * Handle clearing all completed tasks with user confirmation.
 */
function handleClearCompleted() {
  const completedTasks = state.tasks.filter(t => t.completed);
  if (completedTasks.length === 0) return;

  const count = completedTasks.length;
  const description = `Are you sure you want to remove ${count} completed assignment${count > 1 ? 's' : ''}? This action cannot be undone.`;

  showConfirmModal('Clear Completed Tasks?', description, () => {
    state.tasks = state.tasks.filter(t => !t.completed);
    saveTasksToStorage();
    render();
    showToast(`Removed ${count} completed task${count > 1 ? 's' : ''}.`, 'info');
  });
}

/**
 * Toggle between Dark and Light color themes.
 */
function handleThemeToggle() {
  const currentTheme = DOM.html.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';

  DOM.html.setAttribute('data-theme', newTheme);
  saveThemeToStorage(newTheme);

  showToast(`Switched to ${newTheme} theme 🌓`, 'info', null, 2000);
}

/**
 * Handle search query input changes.
 */
function handleSearchInput(e) {
  state.searchQuery = e.target.value;
  DOM.searchClearBtn.hidden = state.searchQuery.length === 0;
  render();
}

/**
 * Handle clearing the search query.
 */
function handleClearSearch() {
  DOM.searchInput.value = '';
  state.searchQuery = '';
  DOM.searchClearBtn.hidden = true;
  DOM.searchInput.focus();
  render();
}

/**
 * Handle exporting all tasks to a JSON backup file.
 */
function handleExportTasks() {
  try {
    const dataStr = JSON.stringify(state.tasks, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const filename = `studentflow-backup-${y}-${m}-${d}.json`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`Exported ${state.tasks.length} task${state.tasks.length === 1 ? '' : 's'} to backup file! 📁`, 'success');
  } catch (err) {
    console.error('Export failed:', err);
    showToast('Failed to export backup.', 'danger');
  }
}

/**
 * Handle importing tasks from an uploaded JSON backup file.
 */
function handleImportTasks(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      if (!Array.isArray(parsed)) {
        showToast('Invalid backup file. JSON must contain an array of tasks.', 'danger');
        return;
      }

      const validTasks = parsed.map(sanitizeTask).filter(Boolean);
      if (validTasks.length === 0 && parsed.length > 0) {
        showToast('No valid tasks found in the backup file.', 'danger');
        return;
      }

      // Merge: skip duplicate IDs
      const existingIds = new Set(state.tasks.map(t => t.id));
      let addedCount = 0;
      validTasks.forEach(task => {
        if (!existingIds.has(task.id)) {
          state.tasks.push(task);
          existingIds.add(task.id);
          addedCount++;
        }
      });

      saveTasksToStorage();
      render();

      if (addedCount > 0) {
        showToast(`Successfully imported ${addedCount} new task${addedCount === 1 ? '' : 's'}! 📥`, 'success');
      } else {
        showToast('All tasks in the file already exist in your planner.', 'info');
      }
    } catch (err) {
      console.error('Import parse error:', err);
      showToast('Invalid JSON file format. Please upload a valid backup.', 'danger');
    } finally {
      DOM.importFileInput.value = '';
    }
  };

  reader.onerror = () => {
    showToast('Could not read the selected file.', 'danger');
    DOM.importFileInput.value = '';
  };

  reader.readAsText(file);
}

/**
 * Start editing custom student name in header.
 */
function handleStartEditGreeting() {
  DOM.greetingDisplay.hidden = true;
  DOM.greetingEditForm.hidden = false;
  DOM.greetingNameInput.value = getUserName();
  DOM.greetingNameInput.focus();
  DOM.greetingNameInput.select();
}

/**
 * Save edited student name.
 */
function handleSaveGreeting(e) {
  if (e) e.preventDefault();
  const rawName = DOM.greetingNameInput.value.trim();
  const saved = saveUserName(rawName || 'Student');

  DOM.greetingEditForm.hidden = true;
  DOM.greetingDisplay.hidden = false;
  DOM.greetingText.textContent = getGreeting();
  showToast(`Name updated to "${escapeHTML(saved)}"! 👋`, 'success');
}

/**
 * Cancel editing student name.
 */
function handleCancelGreeting() {
  DOM.greetingEditForm.hidden = true;
  DOM.greetingDisplay.hidden = false;
}

/* ==========================================================================
   7. INITIALIZATION & SEEDING
   ========================================================================== */

/**
 * Attach all application event listeners.
 */
function bindEventListeners() {
  // Theme Toggle
  DOM.themeToggleBtn.addEventListener('click', handleThemeToggle);

  // Editable Greeting
  if (DOM.editGreetingBtn) DOM.editGreetingBtn.addEventListener('click', handleStartEditGreeting);
  if (DOM.greetingText) DOM.greetingText.addEventListener('click', handleStartEditGreeting);
  if (DOM.greetingEditForm) DOM.greetingEditForm.addEventListener('submit', handleSaveGreeting);
  if (DOM.cancelGreetingBtn) DOM.cancelGreetingBtn.addEventListener('click', handleCancelGreeting);

  // Add Task Form submission
  DOM.taskForm.addEventListener('submit', handleAddTask);

  // Clear validation error when user begins typing in title input
  DOM.taskTitleInput.addEventListener('input', () => {
    if (DOM.taskTitleInput.value.trim().length > 0) {
      hideFormError();
    }
  });

  // Custom Subject visibility toggle in Add Form
  DOM.taskCategorySelect.addEventListener('change', () => {
    const isOther = DOM.taskCategorySelect.value === 'other';
    DOM.customSubjectGroup.hidden = !isOther;
    if (isOther) {
      DOM.taskCustomSubjectInput.focus();
    } else {
      hideFormError();
    }
  });

  DOM.taskCustomSubjectInput.addEventListener('input', () => {
    if (DOM.taskCustomSubjectInput.value.trim().length > 0) {
      hideFormError();
    }
  });

  // Filter Pills (All / Pending / Completed)
  DOM.filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const selectedFilter = pill.getAttribute('data-filter');
      if (selectedFilter && state.filter !== selectedFilter) {
        state.filter = selectedFilter;
        render();
      }
    });
  });

  // Quick Date Filter Chips (Overdue / Due today / Next 7 days)
  DOM.quickChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const q = chip.getAttribute('data-quick');
      state.quickView = (state.quickView === q) ? null : q;
      render();
    });
  });

  // Category Filter Dropdown
  DOM.categoryFilterSelect.addEventListener('change', (e) => {
    state.categoryFilter = e.target.value;
    render();
  });

  // Sort Dropdown
  DOM.sortSelect.addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    render();
  });

  // Search Input & Clear Button
  DOM.searchInput.addEventListener('input', handleSearchInput);
  DOM.searchClearBtn.addEventListener('click', handleClearSearch);

  // Escape key inside search input clears search
  DOM.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.searchQuery) {
      handleClearSearch();
    }
  });

  // Backup Export & Import
  if (DOM.exportBtn) DOM.exportBtn.addEventListener('click', handleExportTasks);
  if (DOM.importBtn) DOM.importBtn.addEventListener('click', () => DOM.importFileInput.click());
  if (DOM.importFileInput) DOM.importFileInput.addEventListener('change', handleImportTasks);

  // Clear Completed Button
  DOM.clearCompletedBtn.addEventListener('click', handleClearCompleted);

  // Global Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Escape in greeting edit cancels it
    if (e.key === 'Escape' && DOM.greetingEditForm && !DOM.greetingEditForm.hidden) {
      handleCancelGreeting();
      return;
    }

    // Escape in inline task edit cancels it
    if (e.key === 'Escape' && state.editingTaskId !== null) {
      handleCancelEdit();
      return;
    }

    // Ignore single key shortcuts while user is typing in inputs or text fields
    const active = document.activeElement;
    const isEditingField = active && (
      ['INPUT', 'SELECT', 'TEXTAREA'].includes(active.tagName) ||
      active.isContentEditable
    );
    if (isEditingField) return;

    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      DOM.taskTitleInput.focus();
      DOM.taskTitleInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (e.key === '/') {
      e.preventDefault();
      DOM.searchInput.focus();
      DOM.searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  // Listen to OS theme changes if user hasn't explicitly set a preference
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      try {
        const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
        if (!savedTheme) {
          DOM.html.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        }
      } catch (err) {
        // Ignore storage errors on media query change
      }
    });
  }
}

/**
 * Register Service Worker for offline capability & PWA installability.
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('StudentFlow ServiceWorker registered successfully:', reg.scope);
        })
        .catch((err) => {
          // Graceful fallback if opened via file:// protocol
          console.info('ServiceWorker skipped (requires http/https origin):', err.message);
        });
    });
  }
}

/**
 * PWA Install Prompt handling
 */
let deferredInstallPrompt = null;

function setupPWAInstallation() {
  // Listen for native install prompt event from browser
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (DOM.installAppBtn) {
      DOM.installAppBtn.hidden = false;
    }
  });

  if (DOM.installAppBtn) {
    DOM.installAppBtn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) {
        showToast('To install, use browser menu > "Install App" or "Add to Home Screen".', 'info', null, 5000);
        return;
      }

      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        showToast('Installing StudentFlow... 🚀', 'success');
      }
      deferredInstallPrompt = null;
      DOM.installAppBtn.hidden = true;
    });
  }

  // Hide install button if already installed or successfully installed
  window.addEventListener('appinstalled', () => {
    if (DOM.installAppBtn) {
      DOM.installAppBtn.hidden = true;
    }
    showToast('StudentFlow installed as Web App! 🎉', 'success', null, 4000);
  });
}

/**
 * Initialize the application on DOM ready.
 */
function init() {
  // 1. Apply Initial Theme
  const initialTheme = getInitialTheme();
  DOM.html.setAttribute('data-theme', initialTheme);

  // 2. Load Tasks (Migrates v1 without old sample tasks; starts empty for fresh users)
  state.tasks = loadTasksFromStorage();

  // 3. Bind UI Events
  bindEventListeners();

  // 4. Sync custom subject input visibility with initial select value
  if (DOM.customSubjectGroup && DOM.taskCategorySelect) {
    DOM.customSubjectGroup.hidden = DOM.taskCategorySelect.value !== 'other';
  }

  // 5. Register PWA Service Worker & Install Prompt
  registerServiceWorker();
  setupPWAInstallation();

  // 6. Initial Render
  render();

  // 7. Focus input on desktop for instant interaction
  if (window.innerWidth > 768) {
    DOM.taskTitleInput.focus();
  }
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
