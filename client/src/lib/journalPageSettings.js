/* Journal Page Settings — shared storage hooks + categorized
   prompt pool. Backs the four new sections in the Profile modal's
   "Page Settings" tab:
     1. 🔒 Lock & Privacy
     2. 📊 Dashboard Cards Visibility
     3. ✨ Prompts
     4. 🎯 Goals & Streaks

   Every setting group lives in its own Firestore kv key so writes
   stay small and the live subscription only refires the consumers
   that actually care about the change. */

import { useUserStoreKey } from './userStore';

/* ── Lock & Privacy ──────────────────────────────────────── */
export const DEFAULT_PRIVACY = {
  defaultLock:          false,   // pre-lock new entries with the global code
  defaultLockCode:      '',
  masterLock:           false,   // require code to open the Journal page
  masterLockCode:       '',
  autoLockMinutes:      0,       // 0 = off; otherwise 5 / 15 / 30
  hideLockedPreviews:   false,   // show "🔒 Locked" instead of titles in list
  hideLockedFromSearch: false,   // exclude locked entries from search results
};

/* ── Dashboard Cards Visibility ─────────────────────────── */
export const DASHBOARD_CARDS = [
  { id: 'todaysPrompt',      label: "Today's Reflection Prompt",  emoji: '✨' },
  { id: 'statsRow',          label: 'Entry Stats Row',            emoji: '📊' },
  { id: 'heatmap',           label: 'Writing Rhythm (heatmap)',   emoji: '📅' },
  { id: 'entryLength',       label: 'Entry Length Over Time',     emoji: '📏' },
  { id: 'wordCloud',         label: 'Themes & Words',             emoji: '💬' },
  { id: 'scriptureCoverage', label: 'Scripture Coverage',         emoji: '📜' },
  { id: 'onThisDay',         label: 'On This Day',                emoji: '🕰' },
  { id: 'memoryVerse',       label: 'Memory Verse',               emoji: '📝' },
];

export const DEFAULT_DASHBOARD = {
  visible: DASHBOARD_CARDS.reduce((acc, c) => { acc[c.id] = true; return acc; }, {}),
};

/* ── Prompts ────────────────────────────────────────────── */
/* Categorized prompt pool. The Page Settings tab lets the user
   toggle entire categories on/off, plus add their own custom
   prompts. randomPromptFromSettings() reads the live settings to
   build the pool. */
export const PROMPT_CATEGORIES = {
  Listening: [
    "What is God speaking to you about today?",
    "What scripture has been standing out to you lately?",
    "What word or phrase keeps surfacing in your prayers?",
    "Where have you sensed God whisper this week?",
    "What is the Holy Spirit nudging you toward right now?",
  ],
  Gratitude: [
    "What are you grateful for right now, even in difficulty?",
    "Name three small graces from the last 24 hours.",
    "Who in your life is a gift you take for granted?",
    "What ordinary moment today felt sacred?",
  ],
  'Trust & Surrender': [
    "What is one area where you need to trust God more?",
    "What is one thing you want to surrender to God today?",
    "What are you holding tightly that God is asking you to release?",
    "Where do you feel resistance to God's leading?",
  ],
  Prayer: [
    "Who has God placed on your heart to pray for?",
    "Who in your life needs intercession this week?",
    "Whose name keeps coming to mind when you pray?",
  ],
  Burdens: [
    "What is weighing on your heart today?",
    "What fear is loudest in your mind right now?",
    "Where do you feel stuck, and what would freedom look like?",
    "What grief are you carrying that you haven't named?",
  ],
  Growth: [
    "In what way is God calling you to grow this season?",
    "What sin or habit is the Spirit pressing you to confront?",
    "What virtue do you want to ask God to grow in you?",
    "Where have you grown most in the last year?",
  ],
  Presence: [
    "Where do you feel closest to God right now?",
    "What does your relationship with God feel like right now?",
    "When did you last feel God's presence powerfully?",
    "What would help you slow down and notice God this week?",
  ],
  'Answered Prayer': [
    "How has God answered a prayer recently?",
    "What is a prayer you're still waiting on?",
    "Where have you seen God provide in unexpected ways?",
  ],
  Witness: [
    "Where did you see God's hand in your life this week?",
    "Who could you encourage this week, and how?",
    "What is one bold step of obedience you've been avoiding?",
    "How is God using your story to bless someone else?",
  ],
  Lament: [
    "What honest thing have you been afraid to tell God?",
    "What would you say to God if you knew He could handle it all?",
    "What season of your life feels unfinished right now?",
  ],
  Worship: [
    "What about God's character has moved you lately?",
    "What attribute of God do you most need to lean into today?",
    "What worship song or hymn has stuck with you this week?",
  ],
};

export const ALL_PROMPT_CATEGORIES = Object.keys(PROMPT_CATEGORIES);

export const DEFAULT_PROMPTS = {
  enabled:           true,
  enabledCategories: ALL_PROMPT_CATEGORIES,
  custom:            [],   // strings — user's own prompts
};

/* Build a single prompt pool from the user's chosen categories + any
   custom prompts they added, then return one at random. Returns ''
   when the user has disabled every category and added no custom
   prompts — callers should treat empty as "skip the prompt card". */
export function randomPromptFromSettings(settings) {
  const s = settings || DEFAULT_PROMPTS;
  if (!s.enabled) return '';
  const cats = s.enabledCategories?.length ? s.enabledCategories : ALL_PROMPT_CATEGORIES;
  const pool = [];
  for (const cat of cats) {
    if (PROMPT_CATEGORIES[cat]) pool.push(...PROMPT_CATEGORIES[cat]);
  }
  if (Array.isArray(s.custom)) {
    s.custom.forEach(p => { if (p && p.trim()) pool.push(p.trim()); });
  }
  if (!pool.length) return '';
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ── Goals & Streaks ─────────────────────────────────────── */
export const DEFAULT_GOALS = {
  dailyGoal:        1,
  weeklyGoal:       5,
  vacationEnabled:  false,
  vacationStart:    '',
  vacationEnd:      '',
};

/* True when today (YYYY-MM-DD) falls within the user's vacation range
   AND vacation mode is enabled. Goals stop counting against the user
   while on vacation. */
export function isOnVacation(goals, dateISO) {
  if (!goals?.vacationEnabled) return false;
  if (!goals.vacationStart || !goals.vacationEnd) return false;
  return dateISO >= goals.vacationStart && dateISO <= goals.vacationEnd;
}

/* ── 📝 Editor Preferences ──────────────────────────────── */
export const BIBLE_TRANSLATIONS = [
  { id: 'kjv',  label: 'KJV — King James Version' },
  { id: 'web',  label: 'WEB — World English Bible' },
  { id: 'asv',  label: 'ASV — American Standard Version' },
  { id: 'bbe',  label: 'BBE — Bible in Basic English' },
  { id: 'oeb-us', label: 'OEB-US — Open English Bible' },
];
export const DEFAULT_EDITOR = {
  autoSaveDrafts:     true,
  spellCheck:         true,
  smartQuotes:        true,
  markdownShortcuts:  false,
  bibleTranslation:   'kjv',
  wordCountTarget:    0,        // 0 = no target line shown
};

/* ── 🎨 Display & Layout ────────────────────────────────── */
export const DATE_FORMATS = [
  { id: 'MMM d, yyyy',  label: 'May 27, 2026' },
  { id: 'yyyy-MM-dd',   label: '2026-05-27' },
  { id: 'd MMM yyyy',   label: '27 May 2026' },
  { id: 'EEE, MMM d',   label: 'Wed, May 27' },
];
export const DEFAULT_DISPLAY = {
  landingView:    'dashboard',  // 'dashboard' | 'lastEntry' | 'newEntry'
  sortOrder:      'newest',     // 'newest' | 'oldest' | 'longest'
  cardDensity:    'comfy',      // 'comfy' | 'compact' | 'titleOnly'
  showWordCount:  false,
  coverImageMode: 'full',       // 'full' | 'thumb' | 'off'
  dateFormat:     'MMM d, yyyy',
  bodyFont:       'sans',       // 'serif' | 'sans' | 'mono'
  bodyFontSize:   16,           // px
};

/* ── 💾 Backup & Export ─────────────────────────────────── */
export const DEFAULT_BACKUP = {
  defaultFormat:        'md',   // 'txt' | 'md' | 'json'
  includeImages:        true,   // include image URLs in exports
  autoExportWeekly:     false,  // UI-only; activates when server is available
  autoExportEmail:      '',
};

/* ── 🔔 Notification Behavior ──────────────────────────────
   In-app bell only. OS push + quiet-hours were removed because the
   bell is reliable and intentional in-page UX. */
export const DEFAULT_NOTIF_PREFS = {
  skippedDayAlert:     true,    // notify when N+ days without journaling
  skippedDayThreshold: 3,
  goalMissAlert:       false,   // notify if daily goal not hit by evening
  goalMissTime:        '20:00', // HH:MM (24h) when the nudge fires
};

/* ── 📖 Memory Verse Advanced ─────────────────────────── */
/* Default SR intervals (days from the day reviews start). The user
   can override these in Page Settings — e.g. enter "1, 2, 4, 7, 14"
   for a tighter cadence. Stored as a sorted, deduped int array. */
export const DEFAULT_SR_INTERVALS = [1, 3, 7, 14, 30];

export const DEFAULT_MV_ADVANCED = {
  trackMemorization: false,   // shows "Mark memorized" + a Memorized section
  spacedRepetition:  false,   // auto-schedules SR review events for the current verse
  srIntervals:       DEFAULT_SR_INTERVALS,   // day offsets from start
};

/* Parse a free-text intervals string ("1,3,7,14,30") into a clean
   ascending unique int array. Used by the Page Settings editor. */
export function parseSrIntervals(raw) {
  if (!raw) return [];
  const out = String(raw)
    .split(/[,\s]+/)
    .map(s => parseInt(s, 10))
    .filter(n => Number.isFinite(n) && n > 0 && n <= 365);
  return [...new Set(out)].sort((a, b) => a - b);
}

/* ── 🔗 Integrations ─────────────────────────────────── */
export const DEFAULT_INTEGRATIONS = {
  linkPrayers: false,   // entry editor surfaces a prayer-picker
};

/* ── 🎨 Themes ───────────────────────────────────────────
   Per-entry visual themes — accent color + gradient background +
   surface tint. Each theme cascades onto CSS variables on the
   entry wrapper (see Journal.css `--j-*` rules) so accents,
   backgrounds, and the SVG deco overlay all pick up the look
   without per-component changes.

   MIRRORS THE CHAT PAGE THEME CATALOG VERBATIM (see Chat.jsx
   `CHAT_THEMES`). Keeping the two lists identical means a theme
   picked in Chat reads the same way in a journal entry, and any
   new themes added to Chat just need to be appended here too. The
   matching SVG decorations live in `JournalThemeDeco` inside
   Journal.jsx — also ported 1:1 from Chat's `ThemeDecorations`. */
export const JOURNAL_THEMES = [
  {
    id: 'default', name: 'Default',
    accent: '#60a5fa', secondary: '#a78bfa',
    bg: 'radial-gradient(ellipse 1000px 700px at 20% 10%, rgba(96,165,250,0.16), transparent 60%),'
      + 'radial-gradient(ellipse 900px 600px at 80% 90%, rgba(167,139,250,0.16), transparent 60%),'
      + 'linear-gradient(180deg, #14121a 0%, #0e0c14 100%)',
    surface: 'rgba(255, 255, 255, 0.06)',
  },
  {
    id: 'ocean', name: 'Ocean',
    accent: '#22d3ee', secondary: '#3b82f6',
    bg: 'radial-gradient(ellipse 1200px 800px at 30% 0%, rgba(34,211,238,0.20), transparent 60%),'
      + 'radial-gradient(ellipse 1000px 700px at 90% 100%, rgba(59,130,246,0.22), transparent 60%),'
      + 'linear-gradient(180deg, #061523 0%, #030c18 100%)',
    surface: 'rgba(34, 211, 238, 0.06)',
  },
  {
    id: 'sunset', name: 'Sunset',
    accent: '#fb923c', secondary: '#f472b6',
    bg: 'radial-gradient(ellipse 1100px 700px at 10% 0%, rgba(251,146,60,0.22), transparent 60%),'
      + 'radial-gradient(ellipse 900px 600px at 100% 100%, rgba(244,114,182,0.20), transparent 60%),'
      + 'linear-gradient(160deg, #1f1411 0%, #1a0d10 60%, #14080c 100%)',
    surface: 'rgba(251, 146, 60, 0.06)',
  },
  {
    id: 'forest', name: 'Forest',
    accent: '#34d399', secondary: '#a3e635',
    bg: 'radial-gradient(ellipse 1100px 700px at 70% 0%, rgba(52,211,153,0.18), transparent 60%),'
      + 'radial-gradient(ellipse 1000px 600px at 10% 100%, rgba(163,230,53,0.14), transparent 60%),'
      + 'linear-gradient(180deg, #081a13 0%, #04130d 100%)',
    surface: 'rgba(52, 211, 153, 0.06)',
  },
  {
    id: 'lavender', name: 'Lavender',
    accent: '#c084fc', secondary: '#f0abfc',
    bg: 'radial-gradient(ellipse 1100px 700px at 40% 10%, rgba(192,132,252,0.22), transparent 60%),'
      + 'radial-gradient(ellipse 900px 600px at 80% 90%, rgba(240,171,252,0.16), transparent 60%),'
      + 'linear-gradient(180deg, #150f1d 0%, #0e0918 100%)',
    surface: 'rgba(192, 132, 252, 0.07)',
  },
  {
    id: 'rose', name: 'Rose',
    accent: '#fb7185', secondary: '#f9a8d4',
    bg: 'radial-gradient(ellipse 1000px 700px at 20% 0%, rgba(251,113,133,0.20), transparent 60%),'
      + 'radial-gradient(ellipse 900px 600px at 90% 100%, rgba(249,168,212,0.16), transparent 60%),'
      + 'linear-gradient(180deg, #1a0c12 0%, #14070e 100%)',
    surface: 'rgba(251, 113, 133, 0.07)',
  },
  {
    id: 'amber', name: 'Amber',
    accent: '#fbbf24', secondary: '#f97316',
    bg: 'radial-gradient(ellipse 1100px 700px at 50% 0%, rgba(251,191,36,0.20), transparent 60%),'
      + 'radial-gradient(ellipse 900px 600px at 90% 100%, rgba(249,115,22,0.20), transparent 60%),'
      + 'linear-gradient(180deg, #1c1409 0%, #160e04 100%)',
    surface: 'rgba(251, 191, 36, 0.07)',
  },
  {
    id: 'slate', name: 'Slate',
    accent: '#94a3b8', secondary: '#cbd5e1',
    bg: 'radial-gradient(ellipse 1000px 700px at 50% 0%, rgba(148,163,184,0.12), transparent 60%),'
      + 'linear-gradient(180deg, #1a1d24 0%, #12151b 100%)',
    surface: 'rgba(255, 255, 255, 0.05)',
  },
  {
    id: 'midnight', name: 'Midnight',
    accent: '#6366f1', secondary: '#8b5cf6',
    bg: 'radial-gradient(circle at 20% 20%, rgba(99,102,241,0.22), transparent 50%),'
      + 'radial-gradient(circle at 80% 80%, rgba(139,92,246,0.20), transparent 50%),'
      + 'radial-gradient(circle at 60% 30%, rgba(255,255,255,0.04), transparent 30%),'
      + 'linear-gradient(180deg, #0c0a1e 0%, #050414 100%)',
    surface: 'rgba(99, 102, 241, 0.08)',
  },
  {
    id: 'crimson', name: 'Crimson',
    accent: '#ef4444', secondary: '#dc2626',
    bg: 'radial-gradient(ellipse 1000px 700px at 30% 0%, rgba(239,68,68,0.18), transparent 60%),'
      + 'radial-gradient(ellipse 900px 600px at 90% 100%, rgba(220,38,38,0.14), transparent 60%),'
      + 'linear-gradient(180deg, #1a0808 0%, #140404 100%)',
    surface: 'rgba(239, 68, 68, 0.06)',
  },
  {
    id: 'party', name: 'Party',
    accent: '#f43f5e', secondary: '#fbbf24',
    bg: 'radial-gradient(ellipse 900px 600px at 20% 10%, rgba(244,63,94,0.22), transparent 60%),'
      + 'radial-gradient(ellipse 900px 600px at 80% 90%, rgba(251,191,36,0.20), transparent 60%),'
      + 'radial-gradient(ellipse 800px 500px at 50% 50%, rgba(168,85,247,0.16), transparent 60%),'
      + 'linear-gradient(160deg, #1a0d1a 0%, #1f0a1a 60%, #170410 100%)',
    surface: 'rgba(244, 63, 94, 0.07)',
  },
  {
    id: 'music', name: 'Music',
    accent: '#8b5cf6', secondary: '#ec4899',
    bg: 'radial-gradient(ellipse 1100px 700px at 50% 0%, rgba(139,92,246,0.22), transparent 60%),'
      + 'radial-gradient(ellipse 900px 600px at 30% 100%, rgba(236,72,153,0.18), transparent 60%),'
      + 'linear-gradient(180deg, #14091a 0%, #0a0510 100%)',
    surface: 'rgba(139, 92, 246, 0.08)',
  },
  {
    id: 'podcast', name: 'Podcast',
    accent: '#f59e0b', secondary: '#b45309',
    bg: 'radial-gradient(ellipse 1100px 700px at 50% 0%, rgba(245,158,11,0.20), transparent 60%),'
      + 'radial-gradient(ellipse 900px 600px at 50% 100%, rgba(180,83,9,0.20), transparent 60%),'
      + 'linear-gradient(180deg, #1a120a 0%, #120a04 100%)',
    surface: 'rgba(245, 158, 11, 0.07)',
  },
  {
    id: 'webdev', name: 'Website',
    accent: '#06b6d4', secondary: '#10b981',
    bg: 'radial-gradient(ellipse 1100px 700px at 30% 0%, rgba(6,182,212,0.22), transparent 60%),'
      + 'radial-gradient(ellipse 900px 600px at 80% 100%, rgba(16,185,129,0.18), transparent 60%),'
      + 'linear-gradient(180deg, #051218 0%, #020a0e 100%)',
    surface: 'rgba(6, 182, 212, 0.08)',
  },
  {
    id: 'worship', name: 'Worship',
    accent: '#fbbf24', secondary: '#7c3aed',
    bg: 'radial-gradient(ellipse 1200px 800px at 50% 0%, rgba(251,191,36,0.22), transparent 60%),'
      + 'radial-gradient(ellipse 900px 600px at 50% 100%, rgba(124,58,237,0.18), transparent 60%),'
      + 'linear-gradient(180deg, #1a1106 0%, #100916 100%)',
    surface: 'rgba(251, 191, 36, 0.07)',
  },
  {
    id: 'scripture', name: 'Scripture',
    accent: '#b91c1c', secondary: '#a16207',
    bg: 'radial-gradient(ellipse 1200px 800px at 50% 0%, rgba(161,98,7,0.20), transparent 60%),'
      + 'radial-gradient(ellipse 900px 600px at 50% 100%, rgba(146,64,14,0.16), transparent 60%),'
      + 'linear-gradient(180deg, #1d150a 0%, #150d04 100%)',
    surface: 'rgba(245, 158, 11, 0.08)',
  },
  {
    id: 'missions', name: 'Missions',
    accent: '#3b82f6', secondary: '#fbbf24',
    bg: 'radial-gradient(ellipse 1200px 800px at 50% 50%, rgba(59,130,246,0.20), transparent 60%),'
      + 'radial-gradient(ellipse 800px 500px at 80% 80%, rgba(251,191,36,0.14), transparent 60%),'
      + 'linear-gradient(180deg, #050a14 0%, #03060f 100%)',
    surface: 'rgba(59, 130, 246, 0.08)',
  },
];

export function getJournalTheme(themeId) {
  return JOURNAL_THEMES.find(t => t.id === themeId) || JOURNAL_THEMES[0];
}

/* ── Hooks ──────────────────────────────────────────────── */
export function useJournalPrivacy()           { return useUserStoreKey('journal-privacy',           DEFAULT_PRIVACY);  }
export function useJournalDashboardSettings() { return useUserStoreKey('journal-dashboard-cards',   DEFAULT_DASHBOARD); }
export function useJournalPromptSettings()    { return useUserStoreKey('journal-prompts-settings',  DEFAULT_PROMPTS);  }
export function useJournalGoals()             { return useUserStoreKey('journal-goals',             DEFAULT_GOALS);    }
export function useJournalEditor()            { return useUserStoreKey('journal-editor',            DEFAULT_EDITOR);   }
export function useJournalDisplay()           { return useUserStoreKey('journal-display',           DEFAULT_DISPLAY);  }
export function useJournalBackup()            { return useUserStoreKey('journal-backup',            DEFAULT_BACKUP);   }
export function useJournalNotifPrefs()        { return useUserStoreKey('journal-notif-prefs',       DEFAULT_NOTIF_PREFS); }
export function useJournalMvAdvanced()        { return useUserStoreKey('journal-mv-advanced',       DEFAULT_MV_ADVANCED); }
export function useJournalIntegrations()      { return useUserStoreKey('journal-integrations',      DEFAULT_INTEGRATIONS); }
/* Per-entry themes — each journal entry stores its own theme_id
   field, picked in the new/edit editor. No page-level hook needed. */
