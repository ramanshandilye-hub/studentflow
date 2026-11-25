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
   ONESIGNAL & CLOUDFLARE WORKER CONFIGURATION
   (Fill after setup. If left as placeholders, background push is hidden
   and StudentFlow keeps using local in-app deadline reminders).
   ========================================================================== */
const ONESIGNAL_APP_ID = 'a81daae4-ec41-4b31-89c7-6b1e3364817e'; // OneSignal App ID (public, safe)
const PUSH_API_URL = 'https://studentflow-push.raman-studentflow.workers.dev'; // Cloudflare Worker URL (no trailing slash)

/**
 * Check if OneSignal & Cloudflare Worker are configured (not empty or default placeholders)
 */
function isPushConfigured() {
  if (!ONESIGNAL_APP_ID || !PUSH_API_URL) return false;
  const appIdTrim = String(ONESIGNAL_APP_ID).trim();
  const urlTrim = String(PUSH_API_URL).trim();
  if (!appIdTrim || appIdTrim === 'YOUR_ONESIGNAL_APP_ID') return false;
  if (!urlTrim || urlTrim.includes('your-subdomain') || urlTrim.includes('your-worker')) return false;
  return true;
}

/* ==========================================================================
   1. CONSTANTS & APPLICATION STATE
   ========================================================================== */

// LocalStorage keys
const STORAGE_KEYS = {
  TASKS: 'studentflow_tasks_v2',
  OLD_TASKS: 'studentflow_tasks_v1',
  THEME: 'studentflow_theme_v1',
  USER_NAME: 'studentflow_name_v1',
  SETTINGS: 'studentflow_settings_v1',
  REMINDERS: 'studentflow_reminders_v1',
  PUSH_MAP: 'studentflow_push_v1',
  PUSH_QUEUE: 'studentflow_push_queue_v1',
  NUDGE_DISMISSED: 'studentflow_nudge_dismissed_v1'
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
  // School
  math: { label: 'Mathematics', icon: '📐', className: 'badge-cat-math', group: 'School' },
  physics: { label: 'Physics', icon: '⚛️', className: 'badge-cat-physics', group: 'School' },
  chemistry: { label: 'Chemistry', icon: '🧪', className: 'badge-cat-chemistry', group: 'School' },
  biology: { label: 'Biology', icon: '🧬', className: 'badge-cat-biology', group: 'School' },
  english: { label: 'English', icon: '📚', className: 'badge-cat-english', group: 'School' },
  hindi: { label: 'Hindi', icon: '📖', className: 'badge-cat-hindi', group: 'School' },
  sst: { label: 'Social Science (SST)', icon: '🌍', className: 'badge-cat-sst', group: 'School' },
  coding: { label: 'Computer Science', icon: '💻', className: 'badge-cat-coding', group: 'School' },
  history: { label: 'History', icon: '🏛️', className: 'badge-cat-history', group: 'School' },
  science: { label: 'General Science', icon: '🔬', className: 'badge-cat-science', group: 'School' },

  // Exam prep
  reasoning: { label: 'Reasoning', icon: '🧠', className: 'badge-cat-reasoning', group: 'Exam prep' },
  quant: { label: 'Quantitative Aptitude', icon: '🔢', className: 'badge-cat-quant', group: 'Exam prep' },
  gk: { label: 'GK / Current Affairs', icon: '📰', className: 'badge-cat-gk', group: 'Exam prep' },
  mock: { label: 'Mock Test', icon: '📝', className: 'badge-cat-mock', group: 'Exam prep' },
  dpp: { label: 'DPP / Practice', icon: '🎯', className: 'badge-cat-dpp', group: 'Exam prep' },
  revision: { label: 'Revision', icon: '🔄', className: 'badge-cat-revision', group: 'Exam prep' },

  // Other
  other: { label: 'General / Other', icon: '📝', className: 'badge-cat-other', group: 'Other' }
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
  quickView: null,           // null | 'overdue' | 'today' | 'week' | 'urgent'
  bannerDismissed: false,    // Whether in-app due-soon banner was dismissed
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
  notificationToggleBtn: document.getElementById('notificationToggleBtn'),
  notificationBtnText: document.getElementById('notificationBtnText'),
  notificationStateDot: document.getElementById('notificationStateDot'),
  notificationBadge: document.getElementById('notificationBadge'),
  greetingContainer: document.querySelector('.greeting-container'),
  greetingDisplay: document.getElementById('greetingDisplay'),
  greetingPrefix: document.getElementById('greetingPrefix'),
  greetingNameDisplay: document.getElementById('greetingNameDisplay'),
  greetingNameInput: document.getElementById('greetingNameInput'),
  greetingSuffix: document.getElementById('greetingSuffix'),
  editGreetingBtn: document.getElementById('editGreetingBtn'),
  greetingHint: document.getElementById('greetingHint'),
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
  taskDueTimeInput: document.getElementById('taskDueTimeInput'),
  titleErrorMsg: document.getElementById('titleErrorMsg'),
  titleErrorText: document.getElementById('titleErrorText'),

  // First Task With Deadline Nudge Card
  firstTaskNudgeCard: document.getElementById('firstTaskNudgeCard'),
  nudgeNotifyBtn: document.getElementById('nudgeNotifyBtn'),
  nudgeDismissBtn: document.getElementById('nudgeDismissBtn'),

  // In-app Due Soon / Overdue Banner
  dueSoonBanner: document.getElementById('dueSoonBanner'),
  dueBannerTitle: document.getElementById('dueBannerTitle'),
  dueBannerMsg: document.getElementById('dueBannerMsg'),
  dueBannerFilterBtn: document.getElementById('dueBannerFilterBtn'),
  dueBannerDismissBtn: document.getElementById('dueBannerDismissBtn'),

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

  // Reminder Settings Modal
  reminderSettingsModal: document.getElementById('reminderSettingsModal'),
  reminderModalBackdrop: document.getElementById('reminderModalBackdrop'),
  reminderModalCloseBtn: document.getElementById('reminderModalCloseBtn'),
  reminderModalDoneBtn: document.getElementById('reminderModalDoneBtn'),
  pushStatusCard: document.getElementById('pushStatusCard'),
  pushStatusIndicator: document.getElementById('pushStatusIndicator'),
  pushStatusText: document.getElementById('pushStatusText'),
  iosInstallHelp: document.getElementById('iosInstallHelp'),
  reminderPermBadge: document.getElementById('reminderPermBadge'),
  reminderBlockedHelp: document.getElementById('reminderBlockedHelp'),
  reminderFallbackHint: document.getElementById('reminderFallbackHint'),
  reminderMasterToggle: document.getElementById('reminderMasterToggle'),
  reminderPresetsSection: document.getElementById('reminderPresetsSection'),
  activePresetBadge: document.getElementById('activePresetBadge'),
  presetRadioLight: document.getElementById('presetRadioLight'),
  presetRadioNormal: document.getElementById('presetRadioNormal'),
  presetRadioCareful: document.getElementById('presetRadioCareful'),
  presetCardLight: document.getElementById('presetCardLight'),
  presetCardNormal: document.getElementById('presetCardNormal'),
  presetCardCareful: document.getElementById('presetCardCareful'),
  sendTestNotificationBtn: document.getElementById('sendTestNotificationBtn'),
  sendTestBtnText: document.getElementById('sendTestBtnText'),
  reminderMoreOptions: document.getElementById('reminderMoreOptions'),
  ladderSection: document.getElementById('ladderSection'),
  reminderLadder24hToggle: document.getElementById('reminderLadder24hToggle'),
  reminderLadderLeadToggle: document.getElementById('reminderLadderLeadToggle'),
  reminderLeadTimeSelect: document.getElementById('reminderLeadTimeSelect'),
  reminderLadder1hToggle: document.getElementById('reminderLadder1hToggle'),
  reminderLadderOverdueToggle: document.getElementById('reminderLadderOverdueToggle'),
  reminderHideTitlesToggle: document.getElementById('reminderHideTitlesToggle'),
  reminderLangSelect: document.getElementById('reminderLangSelect'),
  reminderQuietHoursToggle: document.getElementById('reminderQuietHoursToggle'),
  quietHoursTimesRow: document.getElementById('quietHoursTimesRow'),
  quietHoursStartInput: document.getElementById('quietHoursStartInput'),
  quietHoursEndInput: document.getElementById('quietHoursEndInput'),

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

  let dueDate = '';
  if (typeof item.dueDate === 'string') {
    const trimmedDate = item.dueDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
      dueDate = trimmedDate;
    }
  }

  let dueTime = '';
  if (typeof item.dueTime === 'string') {
    const trimmedTime = item.dueTime.trim();
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmedTime)) {
      dueTime = trimmedTime;
    }
  }

  return {
    id: item.id,
    title: title,
    completed: Boolean(item.completed),
    priority: ['low', 'medium', 'high'].includes(item.priority) ? item.priority : 'medium',
    category: CATEGORIES[item.category] ? item.category : 'other',
    customSubject: customSubject,
    dueDate: dueDate,
    dueTime: dueTime,
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
 * Check if a custom name has been saved in LocalStorage.
 */
function hasSavedUserName() {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.USER_NAME);
    return val !== null && val.trim().length > 0;
  } catch (err) {
    return false;
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

const DEFAULT_SETTINGS = {
  enabled: false,
  preset: 'normal',
  leadTimeHours: 5,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  ladder24h: false,
  ladderLead: true,
  ladder1h: true,
  ladderOverdue: true,
  hideTitles: false,
  lang: 'en'
};

/**
 * Deduce active preset based on ladder configuration
 */
function deducePreset(ladder24h, ladderLead, leadTimeHours, ladder1h, ladderOverdue) {
  if (!ladder24h && !ladderLead && ladder1h && ladderOverdue) {
    return 'light';
  }
  if (!ladder24h && ladderLead && leadTimeHours === 5 && ladder1h && ladderOverdue) {
    return 'normal';
  }
  if (ladder24h && ladderLead && leadTimeHours === 5 && ladder1h && ladderOverdue) {
    return 'careful';
  }
  return 'custom';
}

/**
 * Check if background push notification credentials have been filled in.
 */
function isPushConfigured() {
  return Boolean(
    ONESIGNAL_APP_ID &&
    typeof ONESIGNAL_APP_ID === 'string' &&
    !ONESIGNAL_APP_ID.includes('YOUR_') &&
    ONESIGNAL_APP_ID.trim().length > 10 &&
    PUSH_API_URL &&
    typeof PUSH_API_URL === 'string' &&
    !PUSH_API_URL.includes('<subdomain>') &&
    !PUSH_API_URL.includes('your-worker') &&
    PUSH_API_URL.trim().length > 8
  );
}

/**
 * Load reminder settings from LocalStorage ('studentflow_settings_v1') with fallback.
 */
function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    const leadNum = Number(parsed.leadTimeHours);

    const ladder24h = parsed.ladder24h !== undefined ? Boolean(parsed.ladder24h) : false;
    const ladderLead = parsed.ladderLead !== undefined ? Boolean(parsed.ladderLead) : true;
    const ladder1h = parsed.ladder1h !== undefined ? Boolean(parsed.ladder1h) : true;
    const ladderOverdue = parsed.ladderOverdue !== undefined ? Boolean(parsed.ladderOverdue) : true;
    const leadTimeHours = [1, 3, 5, 12, 24].includes(leadNum) ? leadNum : 5;

    let preset = parsed.preset;
    if (!['light', 'normal', 'careful', 'custom'].includes(preset)) {
      preset = deducePreset(ladder24h, ladderLead, leadTimeHours, ladder1h, ladderOverdue);
    }

    const lang = (parsed.lang === 'hi' || parsed.lang === 'en') ? parsed.lang : 'en';

    return {
      enabled: Boolean(parsed.enabled),
      preset: preset,
      leadTimeHours: leadTimeHours,
      quietHoursEnabled: Boolean(parsed.quietHoursEnabled),
      quietHoursStart: typeof parsed.quietHoursStart === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(parsed.quietHoursStart) ? parsed.quietHoursStart : '22:00',
      quietHoursEnd: typeof parsed.quietHoursEnd === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(parsed.quietHoursEnd) ? parsed.quietHoursEnd : '08:00',
      ladder24h: ladder24h,
      ladderLead: ladderLead,
      ladder1h: ladder1h,
      ladderOverdue: ladderOverdue,
      hideTitles: Boolean(parsed.hideTitles),
      lang: lang
    };
  } catch (err) {
    console.warn('Failed to load settings:', err);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Save reminder settings to LocalStorage with try/catch.
 */
function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (err) {
    console.warn('Failed to save settings:', err);
  }
}

/**
 * Load push notification map { [taskId]: { [stage]: { messageId, sendAt } } }
 */
function loadPushMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PUSH_MAP);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    return {};
  }
}

/**
 * Save push notification map to LocalStorage ('studentflow_push_v1')
 */
function savePushMap(map) {
  try {
    localStorage.setItem(STORAGE_KEYS.PUSH_MAP, JSON.stringify(map));
  } catch (err) {
    console.warn('Failed to save push map:', err);
  }
}

/**
 * Load offline push queue from LocalStorage ('studentflow_push_queue_v1')
 */
function loadPushQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PUSH_QUEUE);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

/**
 * Save offline push queue to LocalStorage
 */
function savePushQueue(queue) {
  try {
    localStorage.setItem(STORAGE_KEYS.PUSH_QUEUE, JSON.stringify(queue));
  } catch (err) {
    console.warn('Failed to save push queue:', err);
  }
}

/**
 * Enqueue an operation to the offline push queue and trigger process
 */
function enqueuePushOperation(action, payload) {
  const queue = loadPushQueue();
  queue.push({
    action,
    payload,
    id: 'op_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    timestamp: Date.now()
  });
  savePushQueue(queue);
  if (navigator.onLine) {
    processPushQueue();
  }
}

let isProcessingQueue = false;

/**
 * Process offline push operations queue when online
 */
async function processPushQueue() {
  if (isProcessingQueue || !navigator.onLine || !isPushConfigured()) return;
  isProcessingQueue = true;

  try {
    const queue = loadPushQueue();
    if (queue.length === 0) return;

    const remainingQueue = [];

    // Group cancel operations together (up to 12 IDs per batch)
    const cancelIds = [];
    const scheduleOps = [];

    for (const item of queue) {
      if (item.action === 'cancel' && item.payload && Array.isArray(item.payload.ids)) {
        cancelIds.push(...item.payload.ids);
      } else if (item.action === 'schedule' && item.payload) {
        scheduleOps.push(item);
      }
    }

    // Process cancels in batches of 12
    if (cancelIds.length > 0) {
      const uniqueIds = Array.from(new Set(cancelIds));
      while (uniqueIds.length > 0) {
        const batch = uniqueIds.splice(0, 12);
        try {
          const res = await fetch(`${PUSH_API_URL.replace(/\/$/, '')}/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: batch })
          });
          if (!res.ok && res.status >= 500) {
            remainingQueue.push({ action: 'cancel', payload: { ids: batch } });
          }
        } catch (err) {
          remainingQueue.push({ action: 'cancel', payload: { ids: batch } });
        }
      }
    }

    // Process schedules
    for (const op of scheduleOps) {
      try {
        const res = await fetch(`${PUSH_API_URL.replace(/\/$/, '')}/schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(op.payload)
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.messageId) {
            const pushMap = loadPushMap();
            if (!pushMap[op.payload.taskId]) pushMap[op.payload.taskId] = {};
            pushMap[op.payload.taskId][op.payload.stage] = {
              messageId: data.messageId,
              sendAt: op.payload.sendAt,
              lang: op.payload.lang || 'en',
              hideTitle: Boolean(op.payload.hideTitle),
              leadHours: op.payload.leadHours || 5
            };
            savePushMap(pushMap);
          }
        } else if (res.status >= 500) {
          remainingQueue.push(op);
        }
      } catch (err) {
        remainingQueue.push(op);
      }
    }

    savePushQueue(remainingQueue);
  } finally {
    isProcessingQueue = false;
  }
}

/**
 * Detect iOS / iPadOS Safari user agent
 */
function isIosSafari() {
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Detect standalone PWA mode (installed to Home Screen)
 */
function isStandalonePwa() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

/**
 * Get active OneSignal subscription ID if user is subscribed
 */
function getOneSignalSubscriptionId() {
  if (window.OneSignal && window.OneSignal.User && window.OneSignal.User.PushSubscription) {
    const sub = window.OneSignal.User.PushSubscription;
    if (sub.optedIn && sub.id) {
      try {
        localStorage.setItem('studentflow_onesignal_sub_id_v1', sub.id);
      } catch (e) {}
      return sub.id;
    } else if (sub.optedIn === false) {
      try {
        localStorage.removeItem('studentflow_onesignal_sub_id_v1');
      } catch (e) {}
      return '';
    }
  }
  try {
    return localStorage.getItem('studentflow_onesignal_sub_id_v1') || '';
  } catch (e) {
    return '';
  }
}

/**
 * Check if background push is fully active (configured, permitted, and subscribed)
 */
function isBackgroundPushActive() {
  if (!isPushConfigured()) return false;
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  const settings = loadSettings();
  if (!settings.enabled) return false;
  return Boolean(getOneSignalSubscriptionId());
}

let oneSignalInitPromise = null;

/**
 * Lazily load OneSignal Web SDK v16 without blocking UI
 */
function loadOneSignalSDK() {
  if (!isPushConfigured()) return Promise.resolve(null);
  if (oneSignalInitPromise) return oneSignalInitPromise;

  oneSignalInitPromise = new Promise((resolve) => {
    if (window.OneSignal && typeof window.OneSignal.init === 'function') {
      resolve(window.OneSignal);
      return;
    }

    window.OneSignalDeferred = window.OneSignalDeferred || [];

    const script = document.createElement('script');
    script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
    script.defer = true;
    script.onerror = (err) => {
      console.warn('OneSignal SDK failed to load (offline or blocked):', err);
      resolve(null);
    };

    document.head.appendChild(script);

    window.OneSignalDeferred.push(async function(OneSignal) {
      try {
        const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1) || '/';
        const swPath = basePath.replace(/^\//, '') + 'sw.js';
        const swScope = basePath;

        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          serviceWorkerPath: swPath,
          serviceWorkerParam: { scope: swScope },
          allowLocalhostAsSecureOrigin: true
        });

        if (OneSignal.User && OneSignal.User.PushSubscription) {
          if (OneSignal.User.PushSubscription.optedIn && OneSignal.User.PushSubscription.id) {
            try {
              localStorage.setItem('studentflow_onesignal_sub_id_v1', OneSignal.User.PushSubscription.id);
            } catch (e) {}
          }

          OneSignal.User.PushSubscription.addEventListener('change', () => {
            const subId = OneSignal.User.PushSubscription.id;
            const optedIn = OneSignal.User.PushSubscription.optedIn;
            if (optedIn && subId) {
              try {
                localStorage.setItem('studentflow_onesignal_sub_id_v1', subId);
              } catch (e) {}
              reconcileScheduledPushes();
            } else {
              try {
                localStorage.removeItem('studentflow_onesignal_sub_id_v1');
              } catch (e) {}
            }
            syncReminderSettingsUI();
            updateNotificationButtonState();
          });
        }

        resolve(OneSignal);
      } catch (err) {
        console.warn('OneSignal init failed:', err);
        resolve(null);
      }
    });
  });

  return oneSignalInitPromise;
}

/**
 * Update visibility of the one-time nudge card after first task with a deadline
 */
function updateNudgeCardVisibility() {
  if (!DOM.firstTaskNudgeCard) return;

  let isDismissed = false;
  try {
    isDismissed = localStorage.getItem(STORAGE_KEYS.NUDGE_DISMISSED) === 'true';
  } catch (e) {}

  if (isDismissed) {
    DOM.firstTaskNudgeCard.setAttribute('hidden', '');
    return;
  }

  const settings = loadSettings();
  const hasRemindersOn = Boolean(settings.enabled && 'Notification' in window && Notification.permission === 'granted');
  if (hasRemindersOn) {
    DOM.firstTaskNudgeCard.setAttribute('hidden', '');
    return;
  }

  // Show only if user has at least one pending task with a deadline
  const hasTaskWithDeadline = state.tasks.some(t => !t.completed && t.dueDate);
  if (hasTaskWithDeadline) {
    DOM.firstTaskNudgeCard.removeAttribute('hidden');
  } else {
    DOM.firstTaskNudgeCard.setAttribute('hidden', '');
  }
}

/**
 * Reconcile background push schedules with current tasks and settings.
 * Schedules missing rungs for pending tasks with deadlines,
 * cancels obsolete schedules for completed/deleted tasks or modified deadlines.
 */
function reconcileScheduledPushes() {
  if (!isPushConfigured()) return;

  const pushMap = loadPushMap();
  const idsToCancel = [];
  let mapModified = false;

  const subscriptionId = getOneSignalSubscriptionId();
  const pushActive = isBackgroundPushActive();

  // If push is not active or no subscription ID, cancel all existing scheduled pushes
  if (!pushActive || !subscriptionId) {
    Object.keys(pushMap).forEach(taskId => {
      const stageMap = pushMap[taskId];
      if (stageMap && typeof stageMap === 'object') {
        Object.values(stageMap).forEach(info => {
          if (info && info.messageId) {
            idsToCancel.push(info.messageId);
          }
        });
      }
      delete pushMap[taskId];
      mapModified = true;
    });

    if (idsToCancel.length > 0) {
      enqueuePushOperation('cancel', { ids: idsToCancel });
    }
    if (mapModified) {
      savePushMap(pushMap);
    }
    return;
  }

  const settings = loadSettings();
  const now = Date.now();
  const currentTasksMap = new Map();
  state.tasks.forEach(t => currentTasksMap.set(t.id, t));

  // 1. Clean up tasks that are completed, deleted, or have no due date
  Object.keys(pushMap).forEach(taskId => {
    const task = currentTasksMap.get(taskId);
    if (!task || task.completed || !task.dueDate) {
      const stageMap = pushMap[taskId];
      if (stageMap && typeof stageMap === 'object') {
        Object.values(stageMap).forEach(info => {
          if (info && info.messageId) {
            idsToCancel.push(info.messageId);
          }
        });
      }
      delete pushMap[taskId];
      mapModified = true;
    }
  });

  // 2. Schedule desired rungs for active pending tasks with deadlines
  state.tasks.forEach(task => {
    if (task.completed || !task.dueDate) return;

    const deadlineStamp = getTaskDeadlineTimestamp(task.dueDate, task.dueTime);
    if (!deadlineStamp) return;

    if (!pushMap[task.id]) {
      pushMap[task.id] = {};
    }
    const currentTaskStages = pushMap[task.id];

    // Build desired schedule ladder rungs
    const rawRungs = [];

    // Rung 1: 24h before (only if deadline is > 24h away from scheduled trigger)
    if (settings.ladder24h) {
      const send24h = deadlineStamp - (24 * 60 * 60 * 1000);
      if (send24h > now + 10000) {
        rawRungs.push({ stage: '24h', timestamp: send24h });
      }
    }

    // Rung 2: Advance lead time before
    const leadHours = settings.leadTimeHours || 5;
    if (settings.ladderLead) {
      const sendLead = deadlineStamp - (leadHours * 60 * 60 * 1000);
      if (sendLead > now + 10000) {
        rawRungs.push({ stage: 'lead', timestamp: sendLead, leadHours: leadHours });
      }
    }

    // Rung 3: 1h before
    if (settings.ladder1h) {
      const send1h = deadlineStamp - (1 * 60 * 60 * 1000);
      if (send1h > now + 10000) {
        rawRungs.push({ stage: '1h', timestamp: send1h });
      }
    }

    // Rung 4: Overdue (at deadline)
    if (settings.ladderOverdue) {
      if (deadlineStamp > now + 10000) {
        rawRungs.push({ stage: 'overdue', timestamp: deadlineStamp });
      }
    }

    // De-duplicate: if custom lead time equals 24h or 1h (or equals another enabled rung),
    // do NOT schedule that rung twice. Each distinct send time per task gets one notification.
    const desiredRungs = [];
    rawRungs.forEach(candidate => {
      const isDuplicate = desiredRungs.some(r => Math.abs(r.timestamp - candidate.timestamp) < 60000);
      if (!isDuplicate) {
        desiredRungs.push(candidate);
      }
    });

    const desiredStageNames = new Set(desiredRungs.map(r => r.stage));

    // Cancel any stages previously scheduled that are no longer in desired rungs
    Object.keys(currentTaskStages).forEach(stage => {
      if (!desiredStageNames.has(stage)) {
        const info = currentTaskStages[stage];
        if (info && info.messageId) {
          idsToCancel.push(info.messageId);
        }
        delete currentTaskStages[stage];
        mapModified = true;
      }
    });

    // For each desired rung, check if already scheduled with matching timestamp and settings
    const targetLang = settings.lang || 'en';
    const targetHideTitle = Boolean(settings.hideTitles);
    const targetLeadHours = settings.leadTimeHours || 5;

    desiredRungs.forEach(rung => {
      const existing = currentTaskStages[rung.stage];
      if (existing) {
        const existingStamp = new Date(existing.sendAt).getTime();
        const timeChanged = Math.abs(existingStamp - rung.timestamp) > 2000;
        const langChanged = existing.lang && existing.lang !== targetLang;
        const hideTitleChanged = existing.hideTitle !== undefined && existing.hideTitle !== targetHideTitle;
        const leadChanged = rung.stage === 'lead' && existing.leadHours && existing.leadHours !== targetLeadHours;

        if (timeChanged || langChanged || hideTitleChanged || leadChanged) {
          if (existing.messageId) {
            idsToCancel.push(existing.messageId);
          }
          delete currentTaskStages[rung.stage];
          mapModified = true;

          const payload = {
            subscriptionId,
            taskId: task.id,
            stage: rung.stage,
            sendAt: new Date(rung.timestamp).toISOString(),
            title: task.title,
            url: `${window.location.origin}${window.location.pathname}#task-${task.id}`,
            hideTitle: targetHideTitle,
            lang: targetLang,
            leadHours: targetLeadHours
          };
          enqueuePushOperation('schedule', payload);
        }
      } else {
        // Not scheduled yet
        const payload = {
          subscriptionId,
          taskId: task.id,
          stage: rung.stage,
          sendAt: new Date(rung.timestamp).toISOString(),
          title: task.title,
          url: `${window.location.origin}${window.location.pathname}#task-${task.id}`,
          hideTitle: targetHideTitle,
          lang: targetLang,
          leadHours: targetLeadHours
        };
        enqueuePushOperation('schedule', payload);
      }
    });
  });

  if (idsToCancel.length > 0) {
    enqueuePushOperation('cancel', { ids: idsToCancel });
  }
  if (mapModified) {
    savePushMap(pushMap);
  }
}

/**
 * Load reminder notification records { [taskId]: { soon: deadlineStamp, overdue: deadlineStamp } }
 */
function loadRemindersLog() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.REMINDERS);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    return {};
  }
}

/**
 * Save reminder notification records to LocalStorage ('studentflow_reminders_v1').
 */
function saveRemindersLog(log) {
  try {
    localStorage.setItem(STORAGE_KEYS.REMINDERS, JSON.stringify(log));
  } catch (err) {
    console.warn('Failed to save reminders log:', err);
  }
}

/**
 * Reset a task's reminder log (e.g. when due date/time changes or marked pending again).
 */
function resetTaskReminderRecord(taskId) {
  const log = loadRemindersLog();
  if (log[taskId]) {
    delete log[taskId];
    saveRemindersLog(log);
  }
}

/**
 * Delete a task's reminder log when task is deleted.
 */
function deleteTaskReminderRecord(taskId) {
  resetTaskReminderRecord(taskId);
}

/**
 * Check if the given time falls within quiet hours (works across midnight).
 */
function isQuietHours(settings, now = new Date()) {
  if (!settings || !settings.quietHoursEnabled) return false;
  const startParts = (settings.quietHoursStart || '22:00').split(':').map(Number);
  const endParts = (settings.quietHoursEnd || '08:00').split(':').map(Number);
  if (startParts.length < 2 || endParts.length < 2 || startParts.some(isNaN) || endParts.some(isNaN)) {
    return false;
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startParts[0] * 60 + startParts[1];
  const endMinutes = endParts[0] * 60 + endParts[1];

  if (startMinutes < endMinutes) {
    // Same day range (e.g. 09:00 to 17:00)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else if (startMinutes > endMinutes) {
    // Across midnight range (e.g. 22:00 to 08:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
  return false;
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
 * Return formatted YYYY-MM-DD string for today's local date.
 */
function getTodayDateKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Return greeting prefix and suffix by time bracket based on local time.
 * 05:00 - 11:59: Good morning
 * 12:00 - 16:59: Good afternoon
 * 17:00 - 20:59: Good evening
 * 21:00 - 04:59: Good night
 */
function getTimeGreetingData() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return {
      prefix: 'Good morning, ',
      suffix: '! ☀️ Ready to study?'
    };
  }
  if (hour >= 12 && hour < 17) {
    return {
      prefix: 'Good afternoon, ',
      suffix: '! 📖 Keep the momentum going!'
    };
  }
  if (hour >= 17 && hour < 21) {
    return {
      prefix: 'Good evening, ',
      suffix: '! 🌙 Wrap up your assignments!'
    };
  }
  return {
    prefix: 'Good night, ',
    suffix: '! 🌌 Rest well and recharge!'
  };
}

/**
 * Calculate full dynamic greeting with user's custom name based on time of day.
 */
function getGreeting() {
  const data = getTimeGreetingData();
  const name = getUserName();
  return `${data.prefix}${name}${data.suffix}`;
}

/**
 * Update the header greeting text elements and first-visit hint.
 */
function updateGreetingDisplay() {
  const data = getTimeGreetingData();
  const currentName = getUserName();

  if (DOM.greetingPrefix) {
    DOM.greetingPrefix.textContent = data.prefix;
  }
  if (DOM.greetingNameDisplay && (!DOM.greetingNameInput || DOM.greetingNameInput.hidden)) {
    DOM.greetingNameDisplay.textContent = currentName;
  }
  if (DOM.greetingSuffix) {
    DOM.greetingSuffix.textContent = data.suffix;
  }

  // Subtle hint shown on first visit with no saved name, dismissed once saved
  if (DOM.greetingHint) {
    DOM.greetingHint.hidden = hasSavedUserName();
  }
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
 * Parse a task's dueDate ("YYYY-MM-DD") and dueTime ("HH:MM") in local time
 * without UTC conversion errors.
 * If dueTime is omitted, deadline is 23:59:59.999 of that local day.
 */
function getTaskDeadlineDate(dueDateStr, dueTimeStr) {
  if (!dueDateStr) return null;
  const dateParts = dueDateStr.split('-').map(Number);
  if (dateParts.length !== 3 || dateParts.some(isNaN)) return null;
  const [year, month, day] = dateParts;

  let hour = 23;
  let minute = 59;
  let second = 59;
  let millisecond = 999;

  if (dueTimeStr && typeof dueTimeStr === 'string') {
    const timeParts = dueTimeStr.split(':').map(Number);
    if (timeParts.length >= 2 && !isNaN(timeParts[0]) && !isNaN(timeParts[1])) {
      hour = timeParts[0];
      minute = timeParts[1];
      second = 0;
      millisecond = 0;
    }
  }

  return new Date(year, month - 1, day, hour, minute, second, millisecond);
}

function getTaskDeadlineTimestamp(dueDateStr, dueTimeStr) {
  const d = getTaskDeadlineDate(dueDateStr, dueTimeStr);
  return d ? d.getTime() : null;
}

/**
 * Format "HH:MM" 24h string into friendly local time string e.g. "6:00 PM"
 */
function formatTimeDisplay(dueTimeStr) {
  if (!dueTimeStr) return '';
  const parts = dueTimeStr.split(':').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return '';
  const hour = parts[0];
  const minute = parts[1];
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  const displayMinute = String(minute).padStart(2, '0');
  return `${displayHour}:${displayMinute} ${ampm}`;
}

/**
 * Format due date and time e.g. "Tue, 25 Nov · 6:00 PM" or "Tue, 25 Nov"
 */
function formatTaskDueDateTime(year, month, day, dueTimeStr) {
  const d = new Date(year, month - 1, day);
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(d);
  const monthName = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d);
  const dateStr = `${weekday}, ${day} ${monthName}`;
  const timeStr = formatTimeDisplay(dueTimeStr);
  return timeStr ? `${dateStr} · ${timeStr}` : dateStr;
}

/**
 * Calculate calendar day difference between a task's due date and today.
 */
function getTaskDiffDays(task) {
  if (!task.dueDate) return null;
  const parts = task.dueDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const [year, month, day] = parts;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const taskDayStart = new Date(year, month - 1, day, 0, 0, 0, 0);
  return Math.round((taskDayStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Calculate due date relative status accurately.
 * Respects local deadline. A task due today at 6:00 PM becomes overdue only after 6:00 PM.
 * 
 * Returns: { status: 'overdue' | 'today' | 'tomorrow' | 'upcoming', label, className }
 */
function getDueDateStatus(dueDateStr, dueTimeStr = '', isCompleted = false) {
  if (!dueDateStr) return null;

  const parts = dueDateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;

  const [year, month, day] = parts;
  const deadlineDate = getTaskDeadlineDate(dueDateStr, dueTimeStr);
  if (!deadlineDate) return null;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const taskDayStart = new Date(year, month - 1, day, 0, 0, 0, 0);

  // Calendar day diff: 0 = today, 1 = tomorrow, -1 = yesterday
  const diffDays = Math.round((taskDayStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
  const formattedDateTime = formatTaskDueDateTime(year, month, day, dueTimeStr);
  const formattedTime = formatTimeDisplay(dueTimeStr);

  if (isCompleted) {
    return {
      status: 'upcoming',
      label: `Due ${formattedDateTime}`,
      className: 'badge-due-upcoming'
    };
  }

  // Exact overdue check against local deadline
  const isOverdue = now.getTime() >= deadlineDate.getTime();

  if (isOverdue) {
    let overdueLabel = '⚠️ Overdue';
    if (diffDays < 0) {
      const daysAgo = Math.abs(diffDays);
      overdueLabel = daysAgo === 1 ? '⚠️ Overdue (1 day overdue)' : `⚠️ Overdue (${daysAgo} days overdue)`;
    } else if (diffDays === 0) {
      overdueLabel = formattedTime ? `⚠️ Overdue (${formattedTime})` : '⚠️ Overdue';
    }
    return {
      status: 'overdue',
      label: overdueLabel,
      className: 'badge-due-overdue'
    };
  }

  // Not overdue: today, tomorrow, or future
  if (diffDays === 0) {
    return {
      status: 'today',
      label: formattedTime ? `⏳ Due today · ${formattedTime}` : '⏳ Due today',
      className: 'badge-due-today'
    };
  } else if (diffDays === 1) {
    return {
      status: 'tomorrow',
      label: formattedTime ? `📅 Due tomorrow · ${formattedTime}` : '📅 Due tomorrow',
      className: 'badge-due-tomorrow'
    };
  } else {
    return {
      status: 'upcoming',
      label: `📅 Due ${formattedDateTime}`,
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
    <optgroup label="School">
      <option value="math">📐 Mathematics</option>
      <option value="physics">⚛️ Physics</option>
      <option value="chemistry">🧪 Chemistry</option>
      <option value="biology">🧬 Biology</option>
      <option value="english">📚 English</option>
      <option value="hindi">📖 Hindi</option>
      <option value="sst">🌍 Social Science (SST)</option>
      <option value="coding">💻 Computer Science</option>
      <option value="history">🏛️ History</option>
      <option value="science">🔬 General Science</option>
    </optgroup>
    <optgroup label="Exam prep">
      <option value="reasoning">🧠 Reasoning</option>
      <option value="quant">🔢 Quantitative Aptitude</option>
      <option value="gk">📰 GK / Current Affairs</option>
      <option value="mock">📝 Mock Test</option>
      <option value="dpp">🎯 DPP / Practice</option>
      <option value="revision">🔄 Revision</option>
    </optgroup>
    <optgroup label="Other">
      <option value="other">📝 General / Other</option>
    </optgroup>
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
  updateGreetingDisplay();
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
  const overdueCount = state.tasks.filter(t => {
    if (t.completed || !t.dueDate) return false;
    const s = getDueDateStatus(t.dueDate, t.dueTime, false);
    return s && s.status === 'overdue';
  }).length;
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
        const s = getDueDateStatus(task.dueDate, task.dueTime, task.completed);
        if (!s || s.status !== 'overdue') return false;
      } else if (state.quickView === 'today') {
        if (diff !== 0) return false;
      } else if (state.quickView === 'week') {
        if (diff === null || diff < 0 || diff > 7) return false;
      } else if (state.quickView === 'urgent') {
        if (task.completed || !task.dueDate) return false;
        const deadlineStamp = getTaskDeadlineTimestamp(task.dueDate, task.dueTime);
        if (!deadlineStamp) return false;
        const settings = loadSettings();
        const leadTimeMs = (settings.leadTimeHours || 5) * 60 * 60 * 1000;
        if (Date.now() < deadlineStamp - leadTimeMs) return false;
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
      const deadlineA = getTaskDeadlineTimestamp(a.dueDate, a.dueTime);
      const deadlineB = getTaskDeadlineTimestamp(b.dueDate, b.dueTime);
      if (deadlineA !== null && deadlineB !== null) {
        if (deadlineA !== deadlineB) return deadlineA - deadlineB;
        return b.createdAt - a.createdAt;
      }
      if (deadlineA !== null && deadlineB === null) return -1;
      if (deadlineA === null && deadlineB !== null) return 1;
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

  // 13. Update Notification Badge indicator & Due Soon Banner
  updateNotificationButtonState();
  updateDueSoonBanner();
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
  const dueStatus = getDueDateStatus(task.dueDate, task.dueTime, task.completed);
  if (dueStatus) {
    const dueBadge = document.createElement('span');
    dueBadge.className = `badge ${dueStatus.className}`;
    dueBadge.textContent = dueStatus.label;
    metaRow.appendChild(dueBadge);
  }

  details.appendChild(metaRow);
  li.appendChild(details);

  // 3. Action Buttons (Calendar, Edit and Delete)
  const actions = document.createElement('div');
  actions.className = 'task-actions';

  // Calendar (.ics) Download Button for pending tasks with a due date
  if (!task.completed && task.dueDate) {
    const calBtn = document.createElement('button');
    calBtn.type = 'button';
    calBtn.className = 'action-btn calendar-btn';
    calBtn.setAttribute('aria-label', `Add to calendar: ${escapeHTML(task.title)}`);
    calBtn.title = 'Add to calendar (.ics)';
    calBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    `;
    calBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDownloadCalendarEvent(task);
    });
    actions.appendChild(calBtn);
  }

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

  const schoolGroup = document.createElement('optgroup');
  schoolGroup.label = 'School';
  const examGroup = document.createElement('optgroup');
  examGroup.label = 'Exam prep';
  const otherGroup = document.createElement('optgroup');
  otherGroup.label = 'Other';

  Object.keys(CATEGORIES).forEach(key => {
    const meta = CATEGORIES[key];
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = key === 'other' ? '📝 Other (type your own)' : `${meta.icon} ${meta.label}`;
    if (key === task.category) opt.selected = true;

    if (meta.group === 'School') {
      schoolGroup.appendChild(opt);
    } else if (meta.group === 'Exam prep') {
      examGroup.appendChild(opt);
    } else {
      otherGroup.appendChild(opt);
    }
  });

  catSelect.appendChild(schoolGroup);
  catSelect.appendChild(examGroup);
  catSelect.appendChild(otherGroup);
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
  dateInput.className = 'text-input compact-select date-input';
  dateInput.value = task.dueDate || '';
  dateInput.setAttribute('aria-label', 'Edit due date');
  optionsRow.appendChild(dateInput);

  // Due Time input
  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.className = 'text-input compact-select time-input';
  timeInput.value = task.dueTime || '';
  timeInput.setAttribute('aria-label', 'Edit due time');
  optionsRow.appendChild(timeInput);

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
    handleSaveEdit(task.id, titleInput.value, catSelect.value, priSelect.value, dateInput.value, timeInput.value, customSubjInput.value);
  });

  actionsRow.appendChild(cancelBtn);
  actionsRow.appendChild(saveBtn);

  // Keyboard navigation for inline edit (Enter saves from any input, Escape cancels)
  editContainer.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
      e.preventDefault();
      handleSaveEdit(task.id, titleInput.value, catSelect.value, priSelect.value, dateInput.value, timeInput.value, customSubjInput.value);
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

  let dueTime = '';
  if (DOM.taskDueTimeInput && typeof DOM.taskDueTimeInput.value === 'string') {
    const trimmedTime = DOM.taskDueTimeInput.value.trim();
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmedTime)) {
      dueTime = trimmedTime;
    }
  }

  const newTask = {
    id: generateId(),
    title: title,
    completed: false,
    priority: DOM.taskPrioritySelect.value || 'medium',
    category: category,
    customSubject: customSubj,
    dueDate: DOM.taskDueDateInput.value || '',
    dueTime: dueTime,
    createdAt: Date.now()
  };

  // Prepend new task so it's immediately visible at the top
  state.tasks.unshift(newTask);
  saveTasksToStorage();

  // Reset task title and due date/time, but PRESERVE chosen subject and custom subject
  DOM.taskTitleInput.value = '';
  DOM.taskDueDateInput.value = '';
  if (DOM.taskDueTimeInput) DOM.taskDueTimeInput.value = '';
  DOM.taskTitleInput.focus();

  showToast('Task added successfully! 🎯', 'success');
  render();

  checkAndNotifyDueTasks();
  reconcileScheduledPushes();
  updateNudgeCardVisibility();
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
  if (!task.completed) {
    // Reset reminder record so user can receive advance / overdue notifications again if applicable
    resetTaskReminderRecord(task.id);
  }
  saveTasksToStorage();

  const message = task.completed ? 'Task marked as completed! 🌟' : 'Task marked as pending.';
  showToast(message, 'info');
  render();

  checkAndNotifyDueTasks();
  reconcileScheduledPushes();
  updateNudgeCardVisibility();
}

/**
 * Handle deleting a task, with full Undo support.
 */
function handleDeleteTask(taskId) {
  const taskIndex = state.tasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) return;

  const deletedTask = state.tasks[taskIndex];

  // Clean up reminder tracking record for deleted task
  deleteTaskReminderRecord(taskId);

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
  checkAndNotifyDueTasks();
  reconcileScheduledPushes();
  updateNudgeCardVisibility();

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

  // Reset reminder record to recalculate
  resetTaskReminderRecord(task.id);

  // Insert back at original index or end of array
  const insertIndex = Math.min(originalIndex, state.tasks.length);
  state.tasks.splice(insertIndex, 0, task);

  // Clear deleted state
  state.lastDeletedTask = null;

  saveTasksToStorage();
  render();
  checkAndNotifyDueTasks();
  reconcileScheduledPushes();
  updateNudgeCardVisibility();
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
function handleSaveEdit(taskId, newTitle, newCategory, newPriority, newDueDate, newDueTime, newCustomSubject) {
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

  let formattedDueTime = '';
  if (typeof newDueTime === 'string') {
    const trimmedTime = newDueTime.trim();
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmedTime)) {
      formattedDueTime = trimmedTime;
    }
  }

  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  const dateOrTimeChanged = (task.dueDate !== (newDueDate || '')) || (task.dueTime !== formattedDueTime);
  if (dateOrTimeChanged) {
    resetTaskReminderRecord(task.id);
  }

  task.title = trimmedTitle;
  task.category = newCategory || 'other';
  task.customSubject = formattedCustomSubject;
  task.priority = newPriority || 'medium';
  task.dueDate = newDueDate || '';
  task.dueTime = formattedDueTime;

  state.editingTaskId = null;
  saveTasksToStorage();
  render();
  checkAndNotifyDueTasks();
  reconcileScheduledPushes();
  updateNudgeCardVisibility();
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
    reconcileScheduledPushes();
    updateNudgeCardVisibility();
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
      reconcileScheduledPushes();
      updateNudgeCardVisibility();

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
 * Escape text according to RFC 5545 section 3.3.11.
 */
function escapeIcsText(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Format UTC Date to iCalendar ISO 8601 UTC string (YYYYMMDDTHHMMSSZ).
 */
function formatUtcIcsDateTime(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const s = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${d}T${h}${min}${s}Z`;
}

/**
 * Generate a clean URL-friendly slug from a string.
 */
function slugifyText(text) {
  return (text || 'task')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'task';
}

/**
 * Handle exporting a single task as a valid RFC 5545 .ics iCalendar file.
 */
function handleDownloadCalendarEvent(task) {
  if (!task || !task.dueDate) return;

  try {
    const slug = slugifyText(task.title);
    const filename = `studentflow-${slug}.ics`;
    const dtstamp = formatUtcIcsDateTime(new Date());

    let subjectLabel = 'General / Other';
    if (task.category === 'other' && task.customSubject) {
      subjectLabel = formatSubjectDisplay(task.customSubject);
    } else if (CATEGORIES[task.category]) {
      subjectLabel = CATEGORIES[task.category].label;
    }

    const priorityLabel = PRIORITIES[task.priority] ? PRIORITIES[task.priority].label : task.priority;
    const summary = `${task.title} (${subjectLabel})`;
    const description = `Subject: ${subjectLabel}\nPriority: ${priorityLabel}\nStatus: Pending\nManaged in StudentFlow`;

    const settings = loadSettings();
    const leadHours = settings.leadTimeHours || 5;

    let dtStartLine = '';
    let dtEndLine = '';

    if (task.dueTime) {
      const deadlineDate = getTaskDeadlineDate(task.dueDate, task.dueTime);
      if (!deadlineDate) return;
      dtStartLine = `DTSTART:${formatUtcIcsDateTime(deadlineDate)}`;
      const endDate = new Date(deadlineDate.getTime() + 30 * 60 * 1000);
      dtEndLine = `DTEND:${formatUtcIcsDateTime(endDate)}`;
    } else {
      const [y, m, d] = task.dueDate.split('-');
      const dObj = new Date(Number(y), Number(m) - 1, Number(d));
      const nextDay = new Date(dObj.getTime() + 24 * 60 * 60 * 1000);
      const nextY = nextDay.getFullYear();
      const nextM = String(nextDay.getMonth() + 1).padStart(2, '0');
      const nextD = String(nextDay.getDate()).padStart(2, '0');
      dtStartLine = `DTSTART;VALUE=DATE:${y}${m}${d}`;
      dtEndLine = `DTEND;VALUE=DATE:${nextY}${nextM}${nextD}`;
    }

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//StudentFlow//Academic Task Manager//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${task.id}@studentflow`,
      `DTSTAMP:${dtstamp}`,
      dtStartLine,
      dtEndLine,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      'BEGIN:VALARM',
      `TRIGGER:-PT${leadHours}H`,
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(`Reminder: ${task.title} is due in ${leadHours} hour${leadHours === 1 ? '' : 's'}`)}`,
      'END:VALARM',
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(`Reminder: ${task.title} is due in 1 hour`)}`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ];

    const icsContent = lines.join('\r\n') + '\r\n';
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('Calendar event downloaded. Open it to add reminders to your calendar.', 'success');
  } catch (err) {
    console.error('Failed to create calendar event:', err);
    showToast('Could not generate calendar file.', 'danger');
  }
}

let isCancellingName = false;

/**
 * Start editing custom student name in header.
 * Replaces the name text with the inline input, auto-focused and selected.
 */
function handleStartEditGreeting() {
  if (!DOM.greetingNameInput || !DOM.greetingNameDisplay) return;
  DOM.greetingNameDisplay.hidden = true;
  DOM.greetingNameInput.hidden = false;
  DOM.greetingNameInput.value = getUserName();
  DOM.greetingNameInput.focus();
  DOM.greetingNameInput.select();
}

/**
 * Save edited student name from inline input.
 * Trims value, falls back to 'Student' if empty, saves to LocalStorage, updates display.
 */
function handleSaveGreeting() {
  if (!DOM.greetingNameInput || DOM.greetingNameInput.hidden) return;
  const rawName = DOM.greetingNameInput.value.trim().replace(/\s+/g, ' ');
  const saved = saveUserName(rawName || 'Student');

  DOM.greetingNameInput.hidden = true;
  DOM.greetingNameDisplay.hidden = false;
  updateGreetingDisplay();
  showToast(`Name updated to "${escapeHTML(saved)}"! 👋`, 'success');
}

/**
 * Cancel editing student name without saving changes.
 */
function handleCancelGreeting() {
  if (!DOM.greetingNameInput || !DOM.greetingNameDisplay) return;
  DOM.greetingNameInput.hidden = true;
  DOM.greetingNameDisplay.hidden = false;
  DOM.greetingNameDisplay.textContent = getUserName();
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

  // Editable Greeting Name
  if (DOM.editGreetingBtn) {
    DOM.editGreetingBtn.addEventListener('click', handleStartEditGreeting);
  }
  if (DOM.greetingNameDisplay) {
    DOM.greetingNameDisplay.addEventListener('click', handleStartEditGreeting);
    DOM.greetingNameDisplay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleStartEditGreeting();
      }
    });
  }
  if (DOM.greetingNameInput) {
    DOM.greetingNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSaveGreeting();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        isCancellingName = true;
        handleCancelGreeting();
        setTimeout(() => {
          isCancellingName = false;
        }, 100);
      }
    });

    DOM.greetingNameInput.addEventListener('blur', () => {
      if (!isCancellingName && !DOM.greetingNameInput.hidden) {
        handleSaveGreeting();
      }
    });
  }

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
    // Escape in greeting name input cancels it
    if (e.key === 'Escape' && DOM.greetingNameInput && !DOM.greetingNameInput.hidden) {
      isCancellingName = true;
      handleCancelGreeting();
      setTimeout(() => {
        isCancellingName = false;
      }, 100);
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

    // Listen for messages dispatched by ServiceWorker (e.g. notification click focus)
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'FOCUS_TASK' && event.data.taskId) {
        handleNavigateToTask(event.data.taskId);
      }
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
 * Open Reminder Settings modal dialog.
 */
function openReminderSettingsModal() {
  if (!DOM.reminderSettingsModal) return;
  syncReminderSettingsUI();
  DOM.reminderSettingsModal.removeAttribute('hidden');
  if (DOM.reminderMasterToggle && !DOM.reminderMasterToggle.disabled) {
    DOM.reminderMasterToggle.focus();
  } else if (DOM.reminderModalCloseBtn) {
    DOM.reminderModalCloseBtn.focus();
  }
}

/**
 * Close Reminder Settings modal dialog.
 */
function closeReminderSettingsModal() {
  if (!DOM.reminderSettingsModal) return;
  DOM.reminderSettingsModal.setAttribute('hidden', '');
  if (DOM.notificationToggleBtn) {
    DOM.notificationToggleBtn.focus();
  }
}

/**
 * Generate friendly notification heading and body copy supporting English and Hinglish (Part B).
 */
function getNotificationCopy(stage, title, hideTitle = false, lang = 'en', leadHours = 5) {
  const cleanTitle = (title || 'Task').trim().replace(/\s+/g, ' ').slice(0, 80);
  const hourStr = leadHours === 24 ? '1 day' : `${leadHours} hours`;

  if (lang === 'hi') {
    if (hideTitle) {
      switch (stage) {
        case '24h':
          return {
            heading: '⏰ Kal Assignment Due Hai',
            content: 'Aapka ek task kal due hai. Aaj hi shuru kar lo!'
          };
        case 'lead':
          return {
            heading: '⏰ Assignment Due Hone Wala Hai',
            content: `Aapka ek task ${leadHours} ghante me due hai. Chalo shuru karte hain! 💪`
          };
        case '1h':
          return {
            heading: '⏳ Sirf 1 Ghanta Bacha Hai',
            content: 'Aapka ek task sirf 1 ghante me due hai. Last push! 🔥'
          };
        case 'overdue':
          return {
            heading: '⚠️ Task Ka Time Nikal Gaya',
            content: 'Aapka ek task overdue ho gaya hai. Abhi complete kar lo!'
          };
        case 'test':
          return {
            heading: '🔔 Test Notification',
            content: 'Background reminders chalu hain! Mast padhai karo 🚀'
          };
        default:
          return {
            heading: '⏰ StudentFlow Reminder',
            content: 'Aapka ek assignment due hone wala hai.'
          };
      }
    }

    switch (stage) {
      case '24h':
        return {
          heading: '⏰ Kal Due Hai',
          content: `📅 Kal "${cleanTitle}" due hai. Aaj plan bana lo.`
        };
      case 'lead':
        return {
          heading: '⏰ Due Hone Wala Hai',
          content: `⏰ "${cleanTitle}" ${leadHours} ghante me due hai. Chalo shuru karte hain! 💪`
        };
      case '1h':
        return {
          heading: '⏳ Sirf 1 Ghanta Bacha Hai',
          content: `⏳ "${cleanTitle}" sirf 1 ghante me due hai. Last push! 🔥`
        };
      case 'overdue':
        return {
          heading: '⚠️ Time Nikal Gaya',
          content: `⚠️ "${cleanTitle}" ka time nikal gaya. Abhi complete kar lo!`
        };
      case 'test':
        return {
          heading: '🔔 Test Notification',
          content: 'Background reminders chalu hain! Mast padhai karo 🚀'
        };
      default:
        return {
          heading: '⏰ StudentFlow Reminder',
          content: `⏰ "${cleanTitle}" due hone me thoda time bacha hai. Chalo shuru karte hain! 💪`
        };
    }
  }

  // English language templates
  if (hideTitle) {
    switch (stage) {
      case '24h':
        return {
          heading: '⏰ Assignment Due Tomorrow',
          content: 'You have a task due tomorrow. Plan ahead to finish strong! 📚'
        };
      case 'lead':
        return {
          heading: '⏰ Assignment Due Soon',
          content: `You have a task due in ${hourStr}. Finish it now! 💪`
        };
      case '1h':
        return {
          heading: '⏳ Due in 1 Hour',
          content: 'You have a task due in 1 hour. Time for final touches! ⏳'
        };
      case 'overdue':
        return {
          heading: '⚠️ Assignment Overdue',
          content: 'You have an overdue task. Finish it to get back on track.'
        };
      case 'test':
        return {
          heading: '🔔 Test Notification',
          content: 'Background reminders are active! Happy studying 🚀'
        };
      default:
        return {
          heading: '⏰ Assignment Reminder',
          content: 'You have a task due soon. Finish it now! 💪'
        };
    }
  }

  switch (stage) {
    case '24h':
      return {
        heading: '⏰ Due Tomorrow',
        content: `"${cleanTitle}" is due tomorrow. Plan ahead to finish strong! 📚`
      };
    case 'lead':
      return {
        heading: '⏰ Due Soon',
        content: `⏰ "${cleanTitle}" is due in ${hourStr}. Finish it now! 💪`
      };
    case '1h':
      return {
        heading: '⏳ Due in 1 Hour',
        content: `⏳ "${cleanTitle}" is due in 1 hour. Time for final touches! ⏳`
      };
    case 'overdue':
      return {
        heading: '⚠️ Assignment Overdue',
        content: `⚠️ "${cleanTitle}" is overdue. Finish it to get back on track.`
      };
    case 'test':
      return {
        heading: '🔔 Test Notification',
        content: `Background reminders are active for "${cleanTitle}"! 🚀`
      };
    default:
      return {
        heading: '⏰ Assignment Reminder',
        content: `⏰ "${cleanTitle}" is due soon. Finish it now! 💪`
      };
  }
}

/**
 * Sync Reminder Settings modal UI elements with current permission and saved settings.
 */
function syncReminderSettingsUI() {
  const settings = loadSettings();
  const pushConfigured = isPushConfigured();

  // If push is NOT configured (placeholders), hide push-specific UI elements and keep local UI
  if (DOM.pushStatusCard) DOM.pushStatusCard.hidden = !pushConfigured;
  if (DOM.ladderSection) DOM.ladderSection.hidden = !pushConfigured;
  const hideTitlesRow = document.getElementById('hideTitlesSettingRow');
  if (hideTitlesRow) hideTitlesRow.hidden = !pushConfigured;
  const privacyNote = document.querySelector('.reminder-privacy-note');
  if (privacyNote) privacyNote.hidden = !pushConfigured;
  const languageRow = document.getElementById('languageSettingRow');
  if (languageRow) languageRow.hidden = !pushConfigured;
  const presetsSection = document.getElementById('reminderPresetsSection');
  if (presetsSection) presetsSection.hidden = !pushConfigured;

  if (DOM.sendTestBtnText) {
    DOM.sendTestBtnText.textContent = pushConfigured ? 'Send test push' : 'Send test notification';
  }

  // Permission badge & blocked notice
  let perm = 'default';
  const isUnsupported = !('Notification' in window);
  if (!isUnsupported) {
    perm = Notification.permission;
  }

  if (isUnsupported) {
    if (DOM.reminderPermBadge) {
      DOM.reminderPermBadge.textContent = 'Unsupported';
      DOM.reminderPermBadge.className = 'badge perm-badge denied';
    }
    if (DOM.reminderMasterToggle) {
      DOM.reminderMasterToggle.disabled = true;
      DOM.reminderMasterToggle.checked = false;
    }
    if (DOM.reminderBlockedHelp) DOM.reminderBlockedHelp.setAttribute('hidden', '');
  } else {
    if (DOM.reminderPermBadge) {
      if (perm === 'granted') {
        DOM.reminderPermBadge.textContent = 'Allowed';
        DOM.reminderPermBadge.className = 'badge perm-badge granted';
      } else if (perm === 'denied') {
        DOM.reminderPermBadge.textContent = 'Blocked';
        DOM.reminderPermBadge.className = 'badge perm-badge denied';
      } else {
        DOM.reminderPermBadge.textContent = 'Default';
        DOM.reminderPermBadge.className = 'badge perm-badge default';
      }
    }

    if (perm === 'denied') {
      if (DOM.reminderBlockedHelp) DOM.reminderBlockedHelp.removeAttribute('hidden');
      if (DOM.reminderMasterToggle) {
        DOM.reminderMasterToggle.disabled = true;
        DOM.reminderMasterToggle.checked = false;
      }
    } else {
      if (DOM.reminderBlockedHelp) DOM.reminderBlockedHelp.setAttribute('hidden', '');
      if (DOM.reminderMasterToggle) {
        DOM.reminderMasterToggle.disabled = false;
        const isActive = pushConfigured ? isBackgroundPushActive() : (settings.enabled && perm === 'granted');
        DOM.reminderMasterToggle.checked = Boolean(settings.enabled && isActive);
      }
    }
  }

  // Push Device Status text and dot ("Reminders are ON for this device" / "Reminders are OFF for this device")
  if (DOM.pushStatusText && DOM.pushStatusIndicator) {
    if (!isUnsupported && perm === 'denied') {
      DOM.pushStatusText.textContent = 'Notifications BLOCKED by browser';
      DOM.pushStatusIndicator.className = 'push-status-dot blocked';
    } else {
      const isActive = pushConfigured ? isBackgroundPushActive() : (settings.enabled && perm === 'granted');
      if (isActive) {
        DOM.pushStatusText.textContent = 'Reminders are ON for this device';
        DOM.pushStatusIndicator.className = 'push-status-dot active';
      } else {
        DOM.pushStatusText.textContent = 'Reminders are OFF for this device';
        DOM.pushStatusIndicator.className = 'push-status-dot';
      }
    }
  }

  // iOS Safari Home Screen instruction
  const isIosNotStandalone = pushConfigured && isIosSafari() && !isStandalonePwa();
  if (DOM.iosInstallHelp) {
    if (isIosNotStandalone) {
      DOM.iosInstallHelp.removeAttribute('hidden');
    } else {
      DOM.iosInstallHelp.setAttribute('hidden', '');
    }
  }

  // Short Fallback Hint: shown ONLY when background push is unavailable
  // (permission blocked, unsupported, or iPhone not on Home Screen, or unconfigured)
  const isPushUnavailable = !pushConfigured || isUnsupported || perm === 'denied' || isIosNotStandalone;
  if (DOM.reminderFallbackHint) {
    DOM.reminderFallbackHint.hidden = !isPushUnavailable;
  }

  // Presets sync
  const currentPreset = settings.preset || deducePreset(settings.ladder24h, settings.ladderLead, settings.leadTimeHours, settings.ladder1h, settings.ladderOverdue);
  if (DOM.activePresetBadge) {
    if (currentPreset === 'light') DOM.activePresetBadge.textContent = 'Light';
    else if (currentPreset === 'careful') DOM.activePresetBadge.textContent = 'Extra careful';
    else if (currentPreset === 'custom') DOM.activePresetBadge.textContent = 'Custom';
    else DOM.activePresetBadge.textContent = 'Normal';
  }

  if (DOM.presetRadioLight) DOM.presetRadioLight.checked = (currentPreset === 'light');
  if (DOM.presetRadioNormal) DOM.presetRadioNormal.checked = (currentPreset === 'normal');
  if (DOM.presetRadioCareful) DOM.presetRadioCareful.checked = (currentPreset === 'careful');

  if (DOM.presetCardLight) DOM.presetCardLight.classList.toggle('active', currentPreset === 'light');
  if (DOM.presetCardNormal) DOM.presetCardNormal.classList.toggle('active', currentPreset === 'normal');
  if (DOM.presetCardCareful) DOM.presetCardCareful.classList.toggle('active', currentPreset === 'careful');

  // Ladder toggles
  if (DOM.reminderLadder24hToggle) {
    DOM.reminderLadder24hToggle.checked = Boolean(settings.ladder24h);
  }
  if (DOM.reminderLadderLeadToggle) {
    DOM.reminderLadderLeadToggle.checked = Boolean(settings.ladderLead);
  }
  if (DOM.reminderLadder1hToggle) {
    DOM.reminderLadder1hToggle.checked = Boolean(settings.ladder1h);
  }
  if (DOM.reminderLadderOverdueToggle) {
    DOM.reminderLadderOverdueToggle.checked = Boolean(settings.ladderOverdue);
  }
  if (DOM.reminderHideTitlesToggle) {
    DOM.reminderHideTitlesToggle.checked = Boolean(settings.hideTitles);
  }

  // Lead Time Select
  if (DOM.reminderLeadTimeSelect) {
    DOM.reminderLeadTimeSelect.value = String(settings.leadTimeHours || 5);
  }

  // Notification Language Select
  if (DOM.reminderLangSelect) {
    DOM.reminderLangSelect.value = settings.lang || 'en';
  }

  // Quiet Hours
  if (DOM.reminderQuietHoursToggle) {
    DOM.reminderQuietHoursToggle.checked = Boolean(settings.quietHoursEnabled);
  }
  if (DOM.quietHoursTimesRow) {
    DOM.quietHoursTimesRow.hidden = !settings.quietHoursEnabled;
  }
  if (DOM.quietHoursStartInput) {
    DOM.quietHoursStartInput.value = settings.quietHoursStart || '22:00';
  }
  if (DOM.quietHoursEndInput) {
    DOM.quietHoursEndInput.value = settings.quietHoursEnd || '08:00';
  }
}

/**
 * Setup Reminder Settings modal event bindings.
 */
function setupReminderSettingsModal() {
  if (!DOM.reminderSettingsModal) return;

  // Open modal from notification bell button
  if (DOM.notificationToggleBtn) {
    DOM.notificationToggleBtn.addEventListener('click', openReminderSettingsModal);
  }

  // Close modal via close button, Done button, or backdrop click
  if (DOM.reminderModalCloseBtn) {
    DOM.reminderModalCloseBtn.addEventListener('click', closeReminderSettingsModal);
  }
  if (DOM.reminderModalDoneBtn) {
    DOM.reminderModalDoneBtn.addEventListener('click', closeReminderSettingsModal);
  }
  if (DOM.reminderModalBackdrop) {
    DOM.reminderModalBackdrop.addEventListener('click', closeReminderSettingsModal);
  }

  // Escape key closes modal
  DOM.reminderSettingsModal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeReminderSettingsModal();
    }
  });

  // Preset Radios (Light, Normal, Extra careful)
  const presetRadios = document.querySelectorAll('input[name="reminderPreset"]');
  presetRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      const selected = radio.value;
      const settings = loadSettings();
      settings.preset = selected;

      if (selected === 'light') {
        settings.ladder24h = false;
        settings.ladderLead = false;
        settings.ladder1h = true;
        settings.ladderOverdue = true;
      } else if (selected === 'careful') {
        settings.ladder24h = true;
        settings.ladderLead = true;
        settings.leadTimeHours = 5;
        settings.ladder1h = true;
        settings.ladderOverdue = true;
      } else {
        // 'normal' (default)
        settings.ladder24h = false;
        settings.ladderLead = true;
        settings.leadTimeHours = 5;
        settings.ladder1h = true;
        settings.ladderOverdue = true;
      }

      saveSettings(settings);
      reconcileScheduledPushes();
      syncReminderSettingsUI();
      checkAndNotifyDueTasks();
      updateDueSoonBanner();

      const presetLabel = selected === 'light' ? 'Light' : selected === 'careful' ? 'Extra careful' : 'Normal';
      showToast(`Reminder preset switched to "${presetLabel}".`, 'info');
    });
  });

  // Master on/off toggle (Permission is requested ONLY on this click)
  if (DOM.reminderMasterToggle) {
    DOM.reminderMasterToggle.addEventListener('change', async () => {
      if (!('Notification' in window)) {
        showToast('Desktop notifications are not supported in this browser.', 'info');
        DOM.reminderMasterToggle.checked = false;
        return;
      }

      const perm = Notification.permission;
      if (perm === 'denied') {
        DOM.reminderMasterToggle.checked = false;
        showToast('Notifications are blocked by your browser settings. Please allow notifications in site permissions.', 'warning');
        return;
      }

      // Check iOS PWA requirement
      if (isPushConfigured() && isIosSafari() && !isStandalonePwa()) {
        DOM.reminderMasterToggle.checked = false;
        showToast('On iPhone, first add StudentFlow to your Home Screen (Share → Add to Home Screen), then turn on reminders.', 'info', null, 7000);
        return;
      }

      const isChecked = DOM.reminderMasterToggle.checked;

      if (isPushConfigured()) {
        try {
          const OneSignal = await loadOneSignalSDK();
          if (OneSignal && OneSignal.User && OneSignal.User.PushSubscription) {
            if (isChecked) {
              await OneSignal.User.PushSubscription.optIn();
              const subId = OneSignal.User.PushSubscription.id;
              if (Notification.permission === 'granted' && subId) {
                try {
                  localStorage.setItem('studentflow_onesignal_sub_id_v1', subId);
                } catch (e) {}
                const settings = loadSettings();
                settings.enabled = true;
                saveSettings(settings);
                reconcileScheduledPushes();
                updateNudgeCardVisibility();
                showToast('🔔 Real background push reminders enabled!', 'success');
              } else {
                DOM.reminderMasterToggle.checked = false;
                showToast('Notification permission was not granted.', 'info');
              }
            } else {
              await OneSignal.User.PushSubscription.optOut();
              try {
                localStorage.removeItem('studentflow_onesignal_sub_id_v1');
              } catch (e) {}
              const settings = loadSettings();
              settings.enabled = false;
              saveSettings(settings);
              reconcileScheduledPushes();
              showToast('🔕 Task reminders paused.', 'info');
            }
          } else {
            const settings = loadSettings();
            settings.enabled = isChecked;
            saveSettings(settings);
          }
        } catch (err) {
          console.warn('OneSignal opt-in/opt-out error:', err);
        }
        syncReminderSettingsUI();
        updateNotificationButtonState();
        return;
      }

      // Fallback local notification handling when push is not configured
      if (perm === 'default') {
        try {
          const result = await Notification.requestPermission();
          const settings = loadSettings();
          if (result === 'granted') {
            settings.enabled = true;
            saveSettings(settings);
            syncReminderSettingsUI();
            updateNotificationButtonState();
            updateNudgeCardVisibility();
            showToast('🔔 Task reminders enabled!', 'success');
            checkAndNotifyDueTasks();
          } else {
            settings.enabled = false;
            saveSettings(settings);
            syncReminderSettingsUI();
            updateNotificationButtonState();
            showToast('Notification permission was not granted.', 'info');
          }
        } catch (err) {
          console.warn('Error requesting permission:', err);
        }
        return;
      }

      const settings = loadSettings();
      settings.enabled = isChecked;
      saveSettings(settings);
      syncReminderSettingsUI();
      updateNotificationButtonState();
      updateNudgeCardVisibility();

      if (isChecked) {
        showToast('🔔 Task reminders enabled!', 'success');
        checkAndNotifyDueTasks();
      } else {
        showToast('🔕 Task reminders paused.', 'info');
      }
    });
  }

  // Handler for any manual ladder toggle change in "More options"
  const handleLadderChange = () => {
    const settings = loadSettings();
    if (DOM.reminderLadder24hToggle) settings.ladder24h = DOM.reminderLadder24hToggle.checked;
    if (DOM.reminderLadderLeadToggle) settings.ladderLead = DOM.reminderLadderLeadToggle.checked;
    if (DOM.reminderLadder1hToggle) settings.ladder1h = DOM.reminderLadder1hToggle.checked;
    if (DOM.reminderLadderOverdueToggle) settings.ladderOverdue = DOM.reminderLadderOverdueToggle.checked;
    if (DOM.reminderLeadTimeSelect) settings.leadTimeHours = Number(DOM.reminderLeadTimeSelect.value) || 5;

    // Deduce if matches preset or switches to Custom
    settings.preset = deducePreset(settings.ladder24h, settings.ladderLead, settings.leadTimeHours, settings.ladder1h, settings.ladderOverdue);

    saveSettings(settings);
    reconcileScheduledPushes();
    syncReminderSettingsUI();
    checkAndNotifyDueTasks();
    updateDueSoonBanner();
  };

  if (DOM.reminderLadder24hToggle) DOM.reminderLadder24hToggle.addEventListener('change', handleLadderChange);
  if (DOM.reminderLadderLeadToggle) DOM.reminderLadderLeadToggle.addEventListener('change', handleLadderChange);
  if (DOM.reminderLadder1hToggle) DOM.reminderLadder1hToggle.addEventListener('change', handleLadderChange);
  if (DOM.reminderLadderOverdueToggle) DOM.reminderLadderOverdueToggle.addEventListener('change', handleLadderChange);
  if (DOM.reminderLeadTimeSelect) {
    DOM.reminderLeadTimeSelect.addEventListener('change', () => {
      handleLadderChange();
      const settings = loadSettings();
      showToast(`Advance reminders set to ${settings.leadTimeHours} hour${settings.leadTimeHours === 1 ? '' : 's'} before deadline.`, 'info');
    });
  }

  // Notification language select
  if (DOM.reminderLangSelect) {
    DOM.reminderLangSelect.addEventListener('change', () => {
      const settings = loadSettings();
      settings.lang = DOM.reminderLangSelect.value === 'hi' ? 'hi' : 'en';
      saveSettings(settings);
      reconcileScheduledPushes();
      const langLabel = settings.lang === 'hi' ? 'Hinglish' : 'English';
      showToast(`Notification language set to ${langLabel}.`, 'info');
    });
  }

  // Hide task titles toggle
  if (DOM.reminderHideTitlesToggle) {
    DOM.reminderHideTitlesToggle.addEventListener('change', () => {
      const settings = loadSettings();
      settings.hideTitles = DOM.reminderHideTitlesToggle.checked;
      saveSettings(settings);
      reconcileScheduledPushes();
      showToast(settings.hideTitles ? 'Task titles hidden in notification alerts.' : 'Task titles shown in notification alerts.', 'info');
    });
  }

  // Quiet hours toggle
  if (DOM.reminderQuietHoursToggle) {
    DOM.reminderQuietHoursToggle.addEventListener('change', () => {
      const settings = loadSettings();
      settings.quietHoursEnabled = DOM.reminderQuietHoursToggle.checked;
      if (DOM.quietHoursTimesRow) {
        DOM.quietHoursTimesRow.hidden = !settings.quietHoursEnabled;
      }
      saveSettings(settings);
      checkAndNotifyDueTasks();
      showToast(settings.quietHoursEnabled ? 'Quiet hours enabled.' : 'Quiet hours turned off.', 'info');
    });
  }

  // Quiet hours start and end inputs
  const handleQuietTimesChange = () => {
    const settings = loadSettings();
    if (DOM.quietHoursStartInput && DOM.quietHoursStartInput.value) {
      settings.quietHoursStart = DOM.quietHoursStartInput.value;
    }
    if (DOM.quietHoursEndInput && DOM.quietHoursEndInput.value) {
      settings.quietHoursEnd = DOM.quietHoursEndInput.value;
    }
    saveSettings(settings);
    checkAndNotifyDueTasks();
  };

  if (DOM.quietHoursStartInput) DOM.quietHoursStartInput.addEventListener('change', handleQuietTimesChange);
  if (DOM.quietHoursEndInput) DOM.quietHoursEndInput.addEventListener('change', handleQuietTimesChange);

  // Send Test Notification / Push button
  if (DOM.sendTestNotificationBtn) {
    DOM.sendTestNotificationBtn.addEventListener('click', async () => {
      const settings = loadSettings();
      if (isPushConfigured()) {
        if (!isBackgroundPushActive()) {
          showToast('Please enable background reminders above first.', 'info');
          return;
        }

        const subId = getOneSignalSubscriptionId();
        if (!subId) {
          showToast('OneSignal subscription not ready yet. Please try again in a moment.', 'info');
          return;
        }

        DOM.sendTestNotificationBtn.disabled = true;
        const originalText = DOM.sendTestBtnText ? DOM.sendTestBtnText.textContent : 'Send test notification';
        if (DOM.sendTestBtnText) DOM.sendTestBtnText.textContent = 'Scheduling...';

        try {
          const testSendAt = new Date(Date.now() + 10000).toISOString();
          const res = await fetch(`${PUSH_API_URL.replace(/\/$/, '')}/schedule`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subscriptionId: subId,
              taskId: 'test_nudge',
              stage: 'test',
              sendAt: testSendAt,
              title: 'StudentFlow',
              url: window.location.href,
              hideTitle: Boolean(settings.hideTitles),
              lang: settings.lang || 'en',
              leadHours: settings.leadTimeHours || 5
            })
          });

          if (res.ok) {
            showToast('🚀 Test push scheduled! Lock your screen or switch apps — alert arrives in ~10 seconds.', 'success', null, 8000);
          } else {
            const data = await res.json().catch(() => ({}));
            showToast(data.error || 'Failed to schedule test push.', 'warning');
          }
        } catch (err) {
          console.warn('Test push request failed:', err);
          showToast('Could not schedule test push. Check connection.', 'danger');
        } finally {
          setTimeout(() => {
            if (DOM.sendTestNotificationBtn) DOM.sendTestNotificationBtn.disabled = false;
            if (DOM.sendTestBtnText) DOM.sendTestBtnText.textContent = originalText;
          }, 4000);
        }
        return;
      }

      // Fallback local test notification
      if (!('Notification' in window)) {
        showToast('Desktop notifications are not supported in this browser.', 'info');
        return;
      }
      if (Notification.permission === 'denied') {
        showToast('Notifications are blocked by your browser settings.', 'warning');
        return;
      }
      if (Notification.permission === 'default') {
        const result = await Notification.requestPermission();
        syncReminderSettingsUI();
        if (result !== 'granted') {
          showToast('Notification permission was not granted.', 'info');
          return;
        }
      }

      const totalCount = state.tasks.length;
      const completedCount = state.tasks.filter(t => t.completed).length;
      const targetCount = Math.min(totalCount, completedCount + 1);
      const testCopy = getNotificationCopy('test', 'StudentFlow', false, settings.lang || 'en');
      const progressSnippet = totalCount > 0
        ? `You've completed ${completedCount} of ${totalCount} tasks. Finish this one to reach ${targetCount}/${totalCount}! 💪`
        : `Start adding assignments to track your progress! 💪`;

      sendNotification(testCopy.heading, {
        body: `${testCopy.content}\n${progressSnippet}`,
        icon: './icon-192.png',
        badge: './icon-192.png',
        tag: 'studentflow-test',
        renotify: true
      });

      showToast('Test notification dispatched! 🔔', 'info');
    });
  }

  // Nudge card event listeners
  if (DOM.nudgeNotifyBtn) {
    DOM.nudgeNotifyBtn.addEventListener('click', () => {
      try {
        localStorage.setItem(STORAGE_KEYS.NUDGE_DISMISSED, 'true');
      } catch (e) {}
      if (DOM.firstTaskNudgeCard) DOM.firstTaskNudgeCard.setAttribute('hidden', '');
      openReminderSettingsModal();
    });
  }
  if (DOM.nudgeDismissBtn) {
    DOM.nudgeDismissBtn.addEventListener('click', () => {
      try {
        localStorage.setItem(STORAGE_KEYS.NUDGE_DISMISSED, 'true');
      } catch (e) {}
      if (DOM.firstTaskNudgeCard) DOM.firstTaskNudgeCard.setAttribute('hidden', '');
      showToast('Reminder suggestion dismissed.', 'info');
    });
  }

  // Awareness Banner action buttons
  if (DOM.dueBannerFilterBtn) {
    DOM.dueBannerFilterBtn.addEventListener('click', () => {
      state.quickView = state.quickView === 'urgent' ? null : 'urgent';
      render();
    });
  }
  if (DOM.dueBannerDismissBtn) {
    DOM.dueBannerDismissBtn.addEventListener('click', () => {
      state.bannerDismissed = true;
      if (DOM.dueSoonBanner) DOM.dueSoonBanner.setAttribute('hidden', '');
    });
  }
}

/**
 * Setup Desktop / System Task Due Reminders, URL Hash Deep-Linking, and Periodic 60s Check
 */
function setupNotifications() {
  if (!DOM.notificationToggleBtn) return;

  // Initialize reminder settings modal
  setupReminderSettingsModal();

  // Initial button state sync
  updateNotificationButtonState();

  // Check URL hash immediately in case app was launched with #task-<id>
  checkUrlHash();

  // Listen to hash changes (for in-page navigation or notification click navigation)
  window.addEventListener('hashchange', checkUrlHash);

  // Initial check for due tasks after small delay to let page stabilize
  setTimeout(checkAndNotifyDueTasks, 1000);

  // Periodic check every 60 seconds (per requirement)
  setInterval(checkAndNotifyDueTasks, 60 * 1000);

  // Check on tab focus / visibility change
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      updateGreetingDisplay();
      checkAndNotifyDueTasks();
      updateDueSoonBanner();
    }
  });
}

/**
 * Update the visual state and accessibility attributes of the Notification button.
 */
function updateNotificationButtonState() {
  if (!DOM.notificationToggleBtn) return;

  if (!('Notification' in window)) {
    DOM.notificationToggleBtn.classList.remove('active');
    DOM.notificationToggleBtn.classList.add('blocked');
    if (DOM.notificationStateDot) DOM.notificationStateDot.className = 'notification-state-dot state-blocked';
    DOM.notificationToggleBtn.title = 'Desktop notifications are not supported in this browser';
    DOM.notificationToggleBtn.setAttribute('aria-label', 'Desktop notifications not supported');
    if (DOM.notificationBadge) DOM.notificationBadge.hidden = true;
    return;
  }

  const permission = Notification.permission;
  const settings = loadSettings();
  const isEnabled = isPushConfigured()
    ? isBackgroundPushActive()
    : Boolean(settings.enabled && permission === 'granted');

  if (permission === 'denied') {
    DOM.notificationToggleBtn.classList.remove('active');
    DOM.notificationToggleBtn.classList.add('blocked');
    if (DOM.notificationStateDot) DOM.notificationStateDot.className = 'notification-state-dot state-blocked';
    DOM.notificationToggleBtn.title = 'Notifications blocked in browser (click for settings)';
    DOM.notificationToggleBtn.setAttribute('aria-label', 'Notifications blocked in browser. Click for settings.');
  } else if (isEnabled) {
    DOM.notificationToggleBtn.classList.remove('blocked');
    DOM.notificationToggleBtn.classList.add('active');
    if (DOM.notificationStateDot) DOM.notificationStateDot.className = 'notification-state-dot state-on';
    DOM.notificationToggleBtn.title = 'Task reminders active (click for settings)';
    DOM.notificationToggleBtn.setAttribute('aria-label', 'Task reminders active. Click for settings.');
  } else {
    DOM.notificationToggleBtn.classList.remove('active', 'blocked');
    if (DOM.notificationStateDot) DOM.notificationStateDot.className = 'notification-state-dot state-off';
    DOM.notificationToggleBtn.title = 'Task reminder settings (click to open)';
    DOM.notificationToggleBtn.setAttribute('aria-label', 'Task reminder settings');
  }

  updateNotificationBadge();
}

/**
 * Update the red notification indicator badge based on pending due / overdue tasks.
 */
function updateNotificationBadge() {
  if (!DOM.notificationBadge) return;

  const dueCount = state.tasks.filter(t => {
    if (t.completed || !t.dueDate) return false;
    const status = getDueDateStatus(t.dueDate, t.dueTime, false);
    return status && (status.status === 'today' || status.status === 'overdue');
  }).length;

  DOM.notificationBadge.hidden = dueCount === 0;
}

/**
 * Update the in-app Due Soon / Overdue banner, document title, and app badge.
 */
function updateDueSoonBanner() {
  const settings = loadSettings();
  const leadTimeMs = (settings.leadTimeHours || 5) * 60 * 60 * 1000;
  const now = Date.now();

  let dueSoonCount = 0;
  let overdueCount = 0;

  state.tasks.forEach(task => {
    if (task.completed || !task.dueDate) return;
    const deadlineStamp = getTaskDeadlineTimestamp(task.dueDate, task.dueTime);
    if (!deadlineStamp) return;

    if (now >= deadlineStamp) {
      overdueCount++;
    } else if (now >= deadlineStamp - leadTimeMs) {
      dueSoonCount++;
    }
  });

  const totalUrgent = dueSoonCount + overdueCount;

  // 1. Update Document Title: "(n) StudentFlow"
  const baseTitle = 'StudentFlow — Student Task Manager';
  document.title = totalUrgent > 0 ? `(${totalUrgent}) ${baseTitle}` : baseTitle;

  // 2. Set App Badge if supported (feature detection, silently catch errors)
  if ('setAppBadge' in navigator) {
    if (totalUrgent > 0) {
      navigator.setAppBadge(totalUrgent).catch(() => {});
    } else if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge().catch(() => {});
    }
  }

  // 3. Update Banner UI
  if (!DOM.dueSoonBanner) return;

  if (totalUrgent > 0 && !state.bannerDismissed) {
    DOM.dueSoonBanner.removeAttribute('hidden');

    const leadHours = settings.leadTimeHours || 5;
    const leadStr = leadHours === 24 ? '1 day' : `${leadHours} hours`;

    let parts = [];
    if (dueSoonCount > 0) {
      parts.push(`${dueSoonCount} task${dueSoonCount === 1 ? '' : 's'} due within ${leadStr}`);
    }
    if (overdueCount > 0) {
      parts.push(`${overdueCount} task${overdueCount === 1 ? '' : 's'} overdue`);
    }

    if (DOM.dueBannerMsg) {
      DOM.dueBannerMsg.textContent = parts.join(', plus ') + '.';
    }
    if (DOM.dueBannerTitle) {
      DOM.dueBannerTitle.textContent = overdueCount > 0 ? 'Urgent Deadlines' : 'Due Soon';
    }
    if (DOM.dueBannerFilterBtn) {
      DOM.dueBannerFilterBtn.textContent = state.quickView === 'urgent' ? 'Show All' : 'Filter Tasks';
    }
  } else {
    DOM.dueSoonBanner.setAttribute('hidden', '');
  }
}

/**
 * Check for tasks that need "due soon" or "overdue" stage notifications.
 * Runs every 60 seconds, on load, on visibility change, and after add/edit/complete.
 * Records dispatched notifications in localStorage 'studentflow_reminders_v1'
 * as { [taskId]: { soon: deadlineStamp, overdue: deadlineStamp } }.
 */
function checkAndNotifyDueTasks() {
  updateNotificationBadge();
  updateDueSoonBanner();

  // If background push is active, skip local notifications to prevent duplicate alerts
  if (isBackgroundPushActive()) {
    return;
  }

  const settings = loadSettings();

  // If notifications not supported, denied, or disabled in settings, return
  if (!('Notification' in window) || Notification.permission !== 'granted' || !settings.enabled) {
    return;
  }

  // Quiet hours check (works across midnight)
  if (isQuietHours(settings, new Date())) {
    return;
  }

  const remindersLog = loadRemindersLog();
  let logChanged = false;

  const now = Date.now();
  const leadTimeMs = (settings.leadTimeHours || 5) * 60 * 60 * 1000;

  // Compute progress for friendly notification body
  const totalCount = state.tasks.length;
  const completedCount = state.tasks.filter(t => t.completed).length;
  const targetCompleted = Math.min(totalCount, completedCount + 1);
  const progressBody = totalCount > 0
    ? `You've completed ${completedCount} of ${totalCount} tasks. Finish this one to reach ${targetCompleted}/${totalCount}! 💪`
    : `Stay focused and finish your assignments strong! 💪`;

  const pendingTasks = state.tasks.filter(t => !t.completed && t.dueDate);

  pendingTasks.forEach(task => {
    const deadlineDate = getTaskDeadlineDate(task.dueDate, task.dueTime);
    if (!deadlineDate) return;

    const deadlineStamp = deadlineDate.getTime();
    if (!remindersLog[task.id]) {
      remindersLog[task.id] = {};
    }
    const record = remindersLog[task.id];

    // Stage 1: "due soon" notification (now >= deadline - leadTime && now < deadline)
    if (now >= deadlineStamp - leadTimeMs && now < deadlineStamp) {
      if (record.soon !== deadlineStamp) {
        const remainingMs = deadlineStamp - now;
        const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
        const notifData = getNotificationCopy('lead', task.title, Boolean(settings.hideTitles), settings.lang || 'en', remainingHours);

        sendNotification(notifData.heading, {
          body: `${notifData.content}\n${progressBody}`,
          icon: './icon-192.png',
          badge: './icon-192.png',
          tag: `${task.id}_soon`,
          data: { taskId: task.id },
          renotify: true
        });

        record.soon = deadlineStamp;
        logChanged = true;
      }
    }

    // Stage 2: "overdue" notification (now >= deadline)
    if (now >= deadlineStamp) {
      if (record.overdue !== deadlineStamp) {
        const notifData = getNotificationCopy('overdue', task.title, Boolean(settings.hideTitles), settings.lang || 'en');

        sendNotification(notifData.heading, {
          body: `${notifData.content}\n${progressBody}`,
          icon: './icon-192.png',
          badge: './icon-192.png',
          tag: `${task.id}_overdue`,
          data: { taskId: task.id },
          renotify: true
        });

        record.overdue = deadlineStamp;
        logChanged = true;
      }
    }
  });

  // Prune deleted tasks from the log
  const currentTaskIds = new Set(state.tasks.map(t => t.id));
  Object.keys(remindersLog).forEach(taskId => {
    if (!currentTaskIds.has(taskId)) {
      delete remindersLog[taskId];
      logChanged = true;
    }
  });

  if (logChanged) {
    saveRemindersLog(remindersLog);
  }
}

/**
 * Send notification via active Service Worker registration (or fallback to window.Notification)
 */
function sendNotification(title, options = {}) {
  const defaultOptions = {
    icon: './icon-192.png',
    badge: './icon-192.png',
    ...options
  };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then(reg => {
        return reg.showNotification(title, defaultOptions);
      })
      .catch(() => {
        fallbackWindowNotification(title, defaultOptions);
      });
  } else {
    fallbackWindowNotification(title, defaultOptions);
  }
}

/**
 * Fallback Notification for when ServiceWorker is unavailable (e.g. file:// or pre-controller).
 */
function fallbackWindowNotification(title, options) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const notif = new Notification(title, options);
      if (options.data && options.data.taskId) {
        notif.onclick = () => {
          window.focus();
          handleNavigateToTask(options.data.taskId);
          notif.close();
        };
      }
    } catch (err) {
      console.warn('Fallback Notification error:', err);
    }
  }
}

/**
 * Inspect the current URL hash (#task-<id>) and scroll to / highlight the task.
 */
function checkUrlHash() {
  const hash = window.location.hash;
  if (hash && hash.startsWith('#task-')) {
    const taskId = hash.substring(6);
    if (taskId) {
      handleNavigateToTask(taskId);
    }
  }
}

/**
 * Smoothly navigate to a specific task, resetting filters if necessary,
 * scrolling into view, and playing a pulse highlight animation.
 */
function handleNavigateToTask(taskId) {
  if (!taskId) return;

  const task = state.tasks.find(t => t.id === taskId);
  if (!task) {
    showToast('Target task not found or was deleted.', 'info');
    return;
  }

  let stateChanged = false;

  // 1. Status Filter check
  if (state.filter === 'completed' && !task.completed) {
    state.filter = 'all';
    stateChanged = true;
  } else if (state.filter === 'pending' && task.completed) {
    state.filter = 'all';
    stateChanged = true;
  }

  // 2. Category Filter check
  if (state.categoryFilter !== 'all') {
    if (task.category === 'other' && task.customSubject) {
      const norm = task.customSubject.trim().toLowerCase();
      if (state.categoryFilter !== `custom:${norm}` && state.categoryFilter !== 'other') {
        state.categoryFilter = 'all';
        stateChanged = true;
      }
    } else if (state.categoryFilter !== task.category) {
      state.categoryFilter = 'all';
      stateChanged = true;
    }
  }

  // 3. Quick Date View check
  if (state.quickView) {
    const dueStatus = getDueDateStatus(task.dueDate, task.dueTime, task.completed);
    if (state.quickView === 'overdue' && (!dueStatus || dueStatus.status !== 'overdue')) {
      state.quickView = null;
      stateChanged = true;
    } else if (state.quickView === 'today' && (!dueStatus || dueStatus.status !== 'today')) {
      state.quickView = null;
      stateChanged = true;
    } else if (state.quickView === 'week') {
      const diff = getTaskDiffDays(task);
      if (diff === null || diff < 0 || diff > 7) {
        state.quickView = null;
        stateChanged = true;
      }
    } else if (state.quickView === 'urgent') {
      const deadlineStamp = getTaskDeadlineTimestamp(task.dueDate, task.dueTime);
      const settings = loadSettings();
      const leadTimeMs = (settings.leadTimeHours || 5) * 60 * 60 * 1000;
      if (!deadlineStamp || Date.now() < deadlineStamp - leadTimeMs) {
        state.quickView = null;
        stateChanged = true;
      }
    }
  }

  // 4. Search Query check
  if (state.searchQuery) {
    if (!task.title.toLowerCase().includes(state.searchQuery.toLowerCase())) {
      state.searchQuery = '';
      if (DOM.searchInput) DOM.searchInput.value = '';
      if (DOM.searchClearBtn) DOM.searchClearBtn.hidden = true;
      stateChanged = true;
    }
  }

  // Re-render and sync filter UI if filters changed
  if (stateChanged) {
    DOM.filterPills.forEach(pill => {
      const isActive = pill.dataset.filter === state.filter;
      pill.classList.toggle('active', isActive);
      pill.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    if (DOM.categoryFilterSelect) {
      DOM.categoryFilterSelect.value = state.categoryFilter;
    }
    if (DOM.quickChips) {
      DOM.quickChips.forEach(chip => {
        const isActive = chip.dataset.quick === state.quickView;
        chip.classList.toggle('active', isActive);
        chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    }
    render();
  }

  // 5. Scroll task into view and animate highlight
  requestAnimationFrame(() => {
    const el = DOM.taskList.querySelector(`[data-task-id="${taskId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('task-highlight-pulse');
      // Trigger browser reflow to reliably restart CSS keyframe animation
      void el.offsetWidth;
      el.classList.add('task-highlight-pulse');
      setTimeout(() => {
        el.classList.remove('task-highlight-pulse');
      }, 2600);

      showToast(`📌 Selected: ${escapeHTML(task.title)}`, 'info', null, 3000);
    }
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

  // 6. Setup Due Task Reminders & URL Hash Deep-Linking
  setupNotifications();

  // 6b. Background Push initialization & online queue handler
  if (isPushConfigured()) {
    loadOneSignalSDK();
    window.addEventListener('online', processPushQueue);
  }
  reconcileScheduledPushes();
  updateNudgeCardVisibility();

  // 7. Initial Render
  render();

  // 8. Focus input on desktop for instant interaction
  if (window.innerWidth > 768) {
    DOM.taskTitleInput.focus();
  }

  // 9. Refresh greeting every 60 seconds to reflect time-of-day changes
  setInterval(updateGreetingDisplay, 60000);
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
