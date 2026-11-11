/* Prayer Page Settings — shared defaults + hooks for the
   Profile → Page Settings tab on the Prayers page.

   Mirrors the structure of journalPageSettings.js so both pages
   feel the same. Each settings group lives under its own Firestore
   kv key so a write to one group only re-fires the consumers that
   care about that group.

   Groups:
     🔔 Reminders   — daily prayer-time nudge + skipped-day alert
     🎨 Display     — landing section, sort order, density, etc.
     🗂 Categories  — extra user-defined prayer categories
     🔔 Notifications — in-app bell behavior
     💾 Backup      — default export format

   The Archived sub-tab does not have its own settings — it just
   lists answered prayers. */

import { useUserStoreKey } from './userStore';

/* ── 🔔 Prayer Reminders ───────────────────────────────────
   Recurring nudge to spend time praying. Mirrors the journal-
   reminder shape so a future shared reminder service could
   handle both. */
export const DEFAULT_REMINDERS = {
  enabled:        false,
  time:           '08:00',                  // HH:MM, 24h
  days:           ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
  syncCalendar:   false,
  syncWeeks:      12,                       // 1..52
  /* When syncCalendar is on, we materialize the next N matching
     weekdays as calendar events and remember their ids here so we
     can tear them down on disable / re-create them when the
     schedule changes. */
  eventIds:       [],
};

/* Predefined choices for the "How many weeks" selector. The user
   picks one of these in PrayerPageSettings → Reminders. Clamped to
   1..52 by createReminderEvents so any custom value still behaves. */
export const SYNC_WEEK_CHOICES = [
  { value: 1,  label: '1 week'   },
  { value: 2,  label: '2 weeks'  },
  { value: 4,  label: '4 weeks'  },
  { value: 8,  label: '8 weeks'  },
  { value: 12, label: '12 weeks' },
  { value: 16, label: '16 weeks' },
  { value: 24, label: '24 weeks' },
  { value: 36, label: '36 weeks' },
  { value: 52, label: '52 weeks (1 year)' },
];

/* ── 🎨 Display & Layout ─────────────────────────────────── */
export const PRAYER_SECTIONS = [
  { id: 'urgent',       label: 'Urgent',                emoji: '🔥' },
  { id: 'daily',        label: 'Daily List',            emoji: '📆' },
  { id: 'active',       label: 'Active',                emoji: '🙏' },
  { id: 'longstanding', label: 'Long-Standing (30+ d)', emoji: '⏳' },
  { id: 'answered',     label: 'Answered Testimonies',  emoji: '🎉' },
  { id: 'praise',       label: 'Praise & Thanksgiving', emoji: '✨' },
];

export const DEFAULT_DISPLAY = {
  landingView:      'dashboard',  // 'dashboard' | 'wall' — the top-level view
                                  //   the page opens on each load
  landingSection:   'active',     // which Wall smart section to expand
                                  //   when the user opens Wall (or jumps from
                                  //   the Dashboard without picking one)
  sortOrder:        'newest',     // 'newest' | 'oldest' | 'mostUpdated'
  cardDensity:      'comfy',      // 'comfy' | 'compact'
  /* The next four control the Dashboard's optional cards. The
     Wall view used to host these as a right side panel, but the
     panel was moved into the Dashboard — these toggles still
     control whether each individual dashboard card renders. */
  showAnswerRate:   true,
  showCategoryBars: true,
  showEncouragement:true,
  /* Encouragement verse — reference + resolved bible-api text. The
     defaults match the original hardcoded Phil 4:6 so existing
     users see the same card until they pick their own. When the
     user enters a new reference, the lookup happens in
     PrayerPageSettings → Display (debounced, same pattern the
     prayer form uses) and persists both fields here. */
  encouragementRef:  'Philippians 4:6',
  encouragementText: 'Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God.',
};

/* ── 🗂 Categories ─────────────────────────────────────────
   The built-in categories live in Prayers.jsx. Users can add their
   own here — these are *appended* to the built-in list everywhere
   the user picks a category. */
export const DEFAULT_CATEGORIES = {
  custom: [],   // strings — extra category names
};

/* ── 🔔 Notification Behavior ─────────────────────────────── */
export const DEFAULT_NOTIF_PREFS = {
  longstandingAlert:      true,    // notify when a prayer has waited 30+ days
  longstandingThreshold:  30,
  urgentBadge:            true,    // surface a small badge on the page
  dailyReminderAlert:     true,    // surfaces the reminder in the bell
};

/* ── 💾 Backup & Export ──────────────────────────────────── */
export const DEFAULT_BACKUP = {
  defaultFormat:  'md',   // 'txt' | 'md' | 'json'
  includeUpdates: true,
  includeFriends: true,
};

/* ── 🔗 Integrations ─────────────────────────────────────── */
export const DEFAULT_INTEGRATIONS = {
  linkJournal:  false,   // surface a journal-entry picker on each prayer
  linkPlanner:  false,   // allow scheduling daily-list block on Day Planner
};

/* ── Hooks ──────────────────────────────────────────────── */
export function usePrayerReminders()    { return useUserStoreKey('prayer-reminders',    DEFAULT_REMINDERS);    }
export function usePrayerDisplay()      { return useUserStoreKey('prayer-display',      DEFAULT_DISPLAY);      }
export function usePrayerCategories()   { return useUserStoreKey('prayer-categories',   DEFAULT_CATEGORIES);   }
export function usePrayerNotifPrefs()   { return useUserStoreKey('prayer-notif-prefs',  DEFAULT_NOTIF_PREFS);  }
export function usePrayerBackup()       { return useUserStoreKey('prayer-backup',       DEFAULT_BACKUP);       }
export function usePrayerIntegrations() { return useUserStoreKey('prayer-integrations', DEFAULT_INTEGRATIONS); }
