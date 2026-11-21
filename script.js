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
  TASKS: 'studentflow_tasks_v1',
  THEME: 'studentflow_theme_v1'
};

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
  categoryFilter: 'all',     // 'all' | 'math' | 'science' | 'english' | 'history' | 'coding' | 'other'
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
  greetingText: document.getElementById('greetingText'),
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
  taskPrioritySelect: document.getElementById('taskPrioritySelect'),
  taskDueDateInput: document.getElementById('taskDueDateInput'),
  titleErrorMsg: document.getElementById('titleErrorMsg'),
  titleErrorText: document.getElementById('titleErrorText'),

  // Search & Filters
  searchInput: document.getElementById('searchInput'),
  searchClearBtn: document.getElementById('searchClearBtn'),
  filterPills: document.querySelectorAll('.filter-pill'),
  filterCountAll: document.getElementById('filterCountAll'),
  filterCountPending: document.getElementById('filterCountPending'),
  filterCountCompleted: document.getElementById('filterCountCompleted'),
  categoryFilterSelect: document.getElementById('categoryFilterSelect'),
  sortSelect: document.getElementById('sortSelect'),
  clearCompletedBtn: document.getElementById('clearCompletedBtn'),

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
 * Load tasks array from LocalStorage.
 * Returns null if key does not exist (allows first-time seeding).
 * Sanitizes and validates each task object against corrupted data.
 */
function loadTasksFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TASKS);
    if (raw === null) return null; // First-time user signal
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Sanitize each task object to guarantee data integrity
    return parsed
      .filter(item => item && typeof item === 'object' && typeof item.id === 'string' && typeof item.title === 'string')
      .map(item => ({
        id: item.id,
        title: item.title.trim(),
        completed: Boolean(item.completed),
        priority: ['low', 'medium', 'high'].includes(item.priority) ? item.priority : 'medium',
        category: CATEGORIES[item.category] ? item.category : 'other',
        dueDate: typeof item.dueDate === 'string' ? item.dueDate : '',
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now()
      }));
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
 * Calculate dynamic greeting based on current time of day.
 */
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning, Student! ☀️ Ready to study?';
  if (hour < 17) return 'Good afternoon, Student! 📖 Keep the momentum going!';
  return 'Good evening, Student! 🌙 Wrap up your assignments!';
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

  // 6. Update Clear Completed Button state
  DOM.clearCompletedBtn.disabled = completedCount === 0;

  // 7. Update Filter Pills Active State
  DOM.filterPills.forEach(pill => {
    const pillFilter = pill.getAttribute('data-filter');
    const isActive = pillFilter === state.filter;
    pill.classList.toggle('active', isActive);
    pill.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  // 8. Filter Tasks by Status, Category, and Search Query
  const searchLower = state.searchQuery.trim().toLowerCase();

  let filteredTasks = state.tasks.filter(task => {
    // Status filter
    if (state.filter === 'pending' && task.completed) return false;
    if (state.filter === 'completed' && !task.completed) return false;

    // Category filter
    if (state.categoryFilter !== 'all' && task.category !== state.categoryFilter) return false;

    // Search query filter (matches title)
    if (searchLower && !task.title.toLowerCase().includes(searchLower)) return false;

    return true;
  });

  // 9. Sort Tasks
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

  // 10. Render Task List or Friendly Contextual Empty State
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
  } else if (state.categoryFilter !== 'all') {
    // Category filter has no matches
    const catLabel = CATEGORIES[state.categoryFilter]?.label || 'this subject';
    iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`;
    heading = `No ${catLabel} tasks`;
    message = `You don't have any tasks logged under ${catLabel} currently.`;
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

  // Category Badge
  const catMeta = CATEGORIES[task.category] || CATEGORIES.other;
  const catBadge = document.createElement('span');
  catBadge.className = `badge ${catMeta.className}`;
  catBadge.innerHTML = `<span class="badge-icon">${catMeta.icon}</span> <span>${escapeHTML(catMeta.label)}</span>`;
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
    opt.textContent = `${CATEGORIES[key].icon} ${CATEGORIES[key].label}`;
    if (key === task.category) opt.selected = true;
    catSelect.appendChild(opt);
  });
  catWrapper.appendChild(catSelect);
  optionsRow.appendChild(catWrapper);

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
    handleSaveEdit(task.id, titleInput.value, catSelect.value, priSelect.value, dateInput.value);
  });

  actionsRow.appendChild(cancelBtn);
  actionsRow.appendChild(saveBtn);

  // Keyboard navigation for inline edit (Enter saves from any input, Escape cancels)
  editContainer.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
      e.preventDefault();
      handleSaveEdit(task.id, titleInput.value, catSelect.value, priSelect.value, dateInput.value);
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

  // Clear any existing inline error
  hideFormError();

  const newTask = {
    id: generateId(),
    title: title,
    completed: false,
    priority: DOM.taskPrioritySelect.value || 'medium',
    category: DOM.taskCategorySelect.value || 'other',
    dueDate: DOM.taskDueDateInput.value || '',
    createdAt: Date.now()
  };

  // Prepend new task so it's immediately visible at the top
  state.tasks.unshift(newTask);
  saveTasksToStorage();

  // Reset form inputs (preserve category for speed if desired, or reset cleanly)
  DOM.taskTitleInput.value = '';
  DOM.taskDueDateInput.value = '';
  // Return focus to input for smooth rapid typing
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
function handleSaveEdit(taskId, newTitle, newCategory, newPriority, newDueDate) {
  const trimmedTitle = newTitle.trim();
  if (!trimmedTitle) {
    showToast('Task title cannot be empty.', 'danger');
    return;
  }

  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  task.title = trimmedTitle;
  task.category = newCategory || 'other';
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

/* ==========================================================================
   7. INITIALIZATION & SEEDING
   ========================================================================== */

/**
 * High-quality starter tasks for first-time visitors.
 * Demonstrates all categories, priorities, due dates, and completed states.
 */
function getSampleTasks() {
  const now = new Date();
  const formatISO = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const todayStr = formatISO(now);
  const tomorrowStr = formatISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const yesterdayStr = formatISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const futureStr = formatISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3));

  return [
    {
      id: generateId(),
      title: 'Complete Math Problem Set #4: Derivatives & Integrals',
      completed: false,
      priority: 'high',
      category: 'math',
      dueDate: todayStr,
      createdAt: Date.now() - 3600000 * 3
    },
    {
      id: generateId(),
      title: 'Read Biology Chapter 7: Photosynthesis and Cellular Respiration',
      completed: false,
      priority: 'medium',
      category: 'science',
      dueDate: tomorrowStr,
      createdAt: Date.now() - 3600000 * 2
    },
    {
      id: generateId(),
      title: 'Draft English Essay Outline: Themes in Shakespeare\'s Hamlet',
      completed: false,
      priority: 'high',
      category: 'english',
      dueDate: yesterdayStr, // Shows Overdue badge
      createdAt: Date.now() - 3600000 * 24
    },
    {
      id: generateId(),
      title: 'Implement Binary Search Tree in Python',
      completed: false,
      priority: 'low',
      category: 'coding',
      dueDate: futureStr,
      createdAt: Date.now() - 3600000
    },
    {
      id: generateId(),
      title: 'Submit European History Paper Topic to Professor',
      completed: true,
      priority: 'low',
      category: 'history',
      dueDate: todayStr,
      createdAt: Date.now() - 3600000 * 48
    }
  ];
}

/**
 * Attach all application event listeners.
 */
function bindEventListeners() {
  // Theme Toggle
  DOM.themeToggleBtn.addEventListener('click', handleThemeToggle);

  // Add Task Form submission
  DOM.taskForm.addEventListener('submit', handleAddTask);

  // Clear validation error when user begins typing in title input
  DOM.taskTitleInput.addEventListener('input', () => {
    if (DOM.taskTitleInput.value.trim().length > 0) {
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

  // Clear Completed Button
  DOM.clearCompletedBtn.addEventListener('click', handleClearCompleted);

  // Global Keyboard shortcuts: Escape to cancel inline edit
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.editingTaskId !== null) {
      handleCancelEdit();
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

  // 2. Load Tasks or Seed Initial Tasks
  const storedTasks = loadTasksFromStorage();
  if (storedTasks === null) {
    // First time opening app: Provide realistic sample student tasks
    state.tasks = getSampleTasks();
    saveTasksToStorage();
  } else {
    state.tasks = storedTasks;
  }

  // 3. Bind UI Events
  bindEventListeners();

  // 4. Register PWA Service Worker & Install Prompt
  registerServiceWorker();
  setupPWAInstallation();

  // 5. Initial Render
  render();

  // 6. Focus input on desktop for instant interaction
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
