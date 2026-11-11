/* ─────────────────────────────────────────────────────────────
   Daily Briefing — gathers a personal, prioritized digest from every
   page and feeds the "Your Day at a Glance" popup that opens once on
   the first app launch of each day (right after the Verse of the Day).

   Architecture: a registry of small async PROVIDERS, one per page.
   Each provider reads its own page's data and returns briefing items.
   getBriefing() runs them all in parallel (failures are isolated),
   flattens, and priority-sorts the result. Adding a page later is a
   single entry in PROVIDERS.

   Item shape:
     {
       id,                       // stable-ish unique key
       page:    'Day Planner',   // source page label
       path:    '/day-planner',  // route opened on click
       icon:    '🗓',             // emoji
       accent:  '#60a5fa',       // tint
       text:    'Worship practice at 7:00 PM',
       priority: PRIORITY.today, // drives sorting + the colored chip
       sort:     420,            // optional within-bucket order (minutes)
     }
   ───────────────────────────────────────────────────────────── */

import { collection, getDocs } from 'firebase/firestore';
import { auth, db } from './firebase';
import { getValue } from './userStore';
import { calendarService } from '../services/calendarService';
import { journalService } from '../services/journalService';
import { journalReminderService } from '../services/journalReminderService';
import { prayerService } from '../services/prayerService';
import { friendsService } from '../services/friendsService';
import { songService } from '../services/songService';
import { setlistService } from '../services/setlistService';
import { studioProjectService } from '../services/studioProjectService';

/* Lower number = higher up. Also used as the chip style key. */
export const PRIORITY = {
  overdue: 0,
  today: 1,
  upcoming: 2,
  info: 3,
};
export const PRIORITY_LABEL = {
  0: 'Overdue',
  1: 'Today',
  2: 'Upcoming',
  3: 'For you',
};

/* ─── Date helpers (LOCAL time — never UTC, so an evening launch
   doesn't roll over to "tomorrow") ──────────────────────────────── */
function localDateKey(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function todayWeekday() {
  return WEEKDAYS[new Date().getDay()];
}
function minutesOfDay(d = new Date()) {
  return d.getHours() * 60 + d.getMinutes();
}
function parseHHMM(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || '');
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
function fmtTime(t) {
  const mins = parseHHMM(t);
  if (mins == null) return '';
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}
function dateOnly(iso) {
  /* Pull the YYYY-MM-DD prefix off an ISO date or timestamp. */
  return typeof iso === 'string' ? iso.slice(0, 10) : '';
}

/* Unwrap the legacy { data: { data } } service envelope → array. */
function listOf(res) {
  const v = res?.data?.data;
  return Array.isArray(v) ? v : [];
}

/* ─── Per-page providers ─────────────────────────────────────────
   Every provider is (uid, ctx) => Promise<item[]>. ctx carries the
   shared "today" values so providers don't each recompute them. */

async function dayPlannerProvider(uid, ctx) {
  const plans = (await getValue(uid, 'day-plans')) || {};
  const plan = plans[ctx.today];
  const items = [];
  const meta = { page: 'Day Planner', path: '/day-planner', icon: '🗓', accent: '#60a5fa' };

  if (!plan) {
    items.push({ ...meta, id: 'dp-empty', text: 'No plan yet — map out your day', priority: PRIORITY.info });
    return items;
  }

  const blocks = Array.isArray(plan.blocks) ? plan.blocks : [];
  const open = blocks.filter((b) => !b.done);
  const overdue = open.filter((b) => {
    const end = parseHHMM(b.end) ?? parseHHMM(b.start);
    return end != null && end < ctx.nowMin;
  });
  const upcoming = open
    .filter((b) => {
      const start = parseHHMM(b.start);
      return start != null && start >= ctx.nowMin;
    })
    .sort((a, b) => (parseHHMM(a.start) ?? 0) - (parseHHMM(b.start) ?? 0));

  if (overdue.length) {
    items.push({
      ...meta,
      id: 'dp-overdue',
      text: `${overdue.length} unfinished block${overdue.length > 1 ? 's' : ''} from earlier`,
      priority: PRIORITY.overdue,
    });
  }
  if (upcoming.length) {
    const n = upcoming[0];
    items.push({
      ...meta,
      id: 'dp-next',
      text: `Next: ${n.title || 'Untitled block'}${n.start ? ` at ${fmtTime(n.start)}` : ''}`,
      priority: PRIORITY.today,
      sort: parseHHMM(n.start) ?? 0,
    });
  }

  const openPriorities = (Array.isArray(plan.priorities) ? plan.priorities : []).filter((p) => !p.done);
  if (openPriorities.length) {
    items.push({
      ...meta,
      id: 'dp-priorities',
      text: `${openPriorities.length} top priorit${openPriorities.length > 1 ? 'ies' : 'y'} to tackle`,
      priority: PRIORITY.today,
    });
  }
  return items;
}

async function calendarProvider(uid, ctx) {
  const events = listOf(await calendarService.getAll());
  const meta = { page: 'Calendar', path: '/calendar', icon: '📅', accent: '#34d399' };
  const items = [];

  const today = events
    .filter((e) => dateOnly(e.event_date) === ctx.today)
    .sort((a, b) => (parseHHMM(a.event_time) ?? 0) - (parseHHMM(b.event_time) ?? 0));

  today.slice(0, 3).forEach((e) => {
    const mins = parseHHMM(e.event_time);
    const past = mins != null && mins < ctx.nowMin;
    items.push({
      ...meta,
      id: `cal-${e.id}`,
      text: `${e.title || 'Event'}${e.event_time ? ` at ${fmtTime(e.event_time)}` : ''}`,
      priority: past ? PRIORITY.overdue : PRIORITY.today,
      sort: mins ?? 0,
      accent: e.color || meta.accent,
    });
  });

  if (today.length === 0) {
    const next = events
      .filter((e) => dateOnly(e.event_date) > ctx.today)
      .sort((a, b) => dateOnly(a.event_date).localeCompare(dateOnly(b.event_date)))[0];
    if (next) {
      items.push({
        ...meta,
        id: `cal-next-${next.id}`,
        text: `Next up: ${next.title || 'Event'} on ${friendlyDate(next.event_date)}`,
        priority: PRIORITY.upcoming,
      });
    }
  }
  return items;
}

async function journalProvider(uid, ctx) {
  const meta = { page: 'Journal', path: '/journal', icon: '📖', accent: '#a78bfa' };
  const items = [];

  /* Reminders due today (weekday matches, time has arrived). */
  try {
    const reminders = listOf(await journalReminderService.getAll());
    reminders
      .filter((r) => Array.isArray(r.days) && r.days.includes(ctx.weekday))
      .forEach((r) => {
        const mins = parseHHMM(r.time);
        const arrived = mins == null || mins <= ctx.nowMin;
        items.push({
          ...meta,
          id: `jr-${r.id}`,
          text: `Reminder: ${r.label || 'Journal'}${r.time ? ` (${fmtTime(r.time)})` : ''}`,
          priority: arrived ? PRIORITY.today : PRIORITY.upcoming,
          sort: mins ?? 0,
        });
      });
  } catch { /* reminders are optional */ }

  /* Has the user journaled today yet? */
  try {
    const entries = listOf(await journalService.getAll());
    const wroteToday = entries.some((e) => dateOnly(e.created_at) === ctx.today);
    if (!wroteToday) {
      items.push({ ...meta, id: 'j-write', text: "Write today's journal entry", priority: PRIORITY.info });
    }
  } catch { /* ignore */ }

  /* Active memory verse to review (localStorage). */
  try {
    const verses = JSON.parse(localStorage.getItem('mh_memory_verses') || '[]');
    const active = Array.isArray(verses)
      ? verses.find((v) => v && v.active && !v.archived && !v.memorized)
      : null;
    if (active?.ref) {
      items.push({ ...meta, id: 'j-verse', text: `Review memory verse: ${active.ref}`, priority: PRIORITY.info });
    }
  } catch { /* ignore */ }

  return items;
}

async function prayerProvider(uid) {
  const prayers = listOf(await prayerService.getAll());
  const meta = { page: 'Prayers', path: '/prayers', icon: '🙏', accent: '#f472b6' };
  const items = [];

  const open = prayers.filter((p) => p.entry_type !== 'praise' && p.status !== 'answered');
  const urgent = open.filter((p) => p.is_urgent === 1 || p.is_urgent === true);
  urgent.slice(0, 2).forEach((p) => {
    items.push({ ...meta, id: `pr-urgent-${p.id}`, text: `Urgent prayer: ${p.title || 'Request'}`, priority: PRIORITY.today });
  });

  const daily = open.filter((p) => p.is_daily === 1 || p.is_daily === true);
  if (daily.length) {
    items.push({
      ...meta,
      id: 'pr-daily',
      text: `Pray over ${daily.length} daily request${daily.length > 1 ? 's' : ''}`,
      priority: PRIORITY.today,
    });
  }
  return items;
}

async function friendsProvider(uid) {
  const friends = listOf(await friendsService.getFriends());
  const meta = { page: 'Friends', path: '/friends', icon: '🤝', accent: '#fbbf24' };
  const items = [];

  friends.forEach((f) => {
    const d = daysToBirthday(f.birthday);
    if (d === 0) {
      items.push({ ...meta, id: `fr-bday-${f.id}`, text: `🎂 ${f.name || 'A friend'}'s birthday is today`, priority: PRIORITY.today });
    }
  });

  const reach = friends
    .map((f) => ({ f, r: reachOutState(f) }))
    .filter((x) => x.r === 'overdue' || x.r === 'due-today');
  reach.slice(0, 3).forEach(({ f, r }) => {
    items.push({
      ...meta,
      id: `fr-reach-${f.id}`,
      text: `Reach out to ${f.name || 'a friend'}`,
      priority: r === 'overdue' ? PRIORITY.overdue : PRIORITY.today,
    });
  });
  return items;
}

async function setlistProvider(uid, ctx) {
  const setlists = listOf(await setlistService.getAll());
  const meta = { page: 'Setlist', path: '/worship/live/setlist', icon: '🎶', accent: '#2dd4bf' };
  const upcoming = setlists
    .filter((s) => dateOnly(s.event_date) && dateOnly(s.event_date) >= ctx.today)
    .sort((a, b) => dateOnly(a.event_date).localeCompare(dateOnly(b.event_date)))[0];
  if (!upcoming) return [];
  const isToday = dateOnly(upcoming.event_date) === ctx.today;
  const count = Array.isArray(upcoming.songs) ? upcoming.songs.length : 0;
  return [{
    ...meta,
    id: `sl-${upcoming.id}`,
    text: `${isToday ? 'Today' : friendlyDate(upcoming.event_date)}: "${upcoming.name || 'Setlist'}" (${count} song${count === 1 ? '' : 's'})`,
    priority: isToday ? PRIORITY.today : PRIORITY.upcoming,
  }];
}

async function songsProvider(uid) {
  const songs = listOf(await songService.getAll());
  const inProgress = songs.filter((s) => s.status === 'idea' || s.status === 'draft');
  if (!inProgress.length) return [];
  return [{
    page: 'Songs',
    path: '/worship/songs/all',
    icon: '🎵',
    accent: '#818cf8',
    id: 'song-wip',
    text: `${inProgress.length} song${inProgress.length > 1 ? 's' : ''} in progress`,
    priority: PRIORITY.info,
  }];
}

async function studioProvider(uid) {
  const projects = listOf(await studioProjectService.getAll());
  const latest = projects
    .slice()
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0];
  if (!latest) return [];
  return [{
    page: 'Studio',
    path: '/worship/production/multitrack',
    icon: '🎚',
    accent: '#22d3ee',
    id: `studio-${latest.id}`,
    text: `Resume "${latest.name || 'Untitled'}" in Studio`,
    priority: PRIORITY.info,
  }];
}

async function writingProvider(uid) {
  /* writingDocs is a per-doc collection (hook-only store) — read it
     directly here since we're outside React. */
  const snap = await getDocs(collection(db, 'users', uid, 'writingDocs'));
  const docs = snap.docs.map((d) => d.data());
  const latest = docs
    .filter((d) => d.status !== 'archived')
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  if (!latest) return [];
  return [{
    page: 'Writing',
    path: '/writing',
    icon: '✍️',
    accent: '#60a5fa',
    id: `writing-${latest.id}`,
    text: `Resume writing: "${latest.title || 'Untitled'}"`,
    priority: PRIORITY.info,
  }];
}

async function libraryProvider(uid) {
  const board = (await getValue(uid, 'library:board')) || {};
  const notes = Array.isArray(board.notes) ? board.notes : [];
  const reading = notes.find((n) => n.type === 'book' && n.status === 'Reading' && !n.finished);
  if (!reading) return [];
  return [{
    page: 'Library',
    path: '/library',
    icon: '📚',
    accent: '#34d399',
    id: `lib-${reading.id}`,
    text: `Continue reading: "${reading.title || 'a book'}"`,
    priority: PRIORITY.info,
  }];
}

/* The registry. Each entry pairs a stable page `id` (used by the
   Settings checkboxes + the saved preference) with its provider.
   BRIEFING_PAGES below exposes the same ids + display meta to Settings. */
const PROVIDERS = [
  { id: 'dayPlanner', run: dayPlannerProvider },
  { id: 'calendar', run: calendarProvider },
  { id: 'journal', run: journalProvider },
  { id: 'prayers', run: prayerProvider },
  { id: 'friends', run: friendsProvider },
  { id: 'setlist', run: setlistProvider },
  { id: 'songs', run: songsProvider },
  { id: 'studio', run: studioProvider },
  { id: 'writing', run: writingProvider },
  { id: 'library', run: libraryProvider },
];

/* What Settings renders as checkboxes. Order = display order. */
export const BRIEFING_PAGES = [
  { id: 'dayPlanner', label: 'Day Planner', icon: '🗓' },
  { id: 'calendar', label: 'Calendar', icon: '📅' },
  { id: 'journal', label: 'Journal', icon: '📖' },
  { id: 'prayers', label: 'Prayers', icon: '🙏' },
  { id: 'friends', label: 'Friends', icon: '🤝' },
  { id: 'setlist', label: 'Setlist', icon: '🎶' },
  { id: 'songs', label: 'Songs', icon: '🎵' },
  { id: 'studio', label: 'Studio', icon: '🎚' },
  { id: 'writing', label: 'Writing', icon: '✍️' },
  { id: 'library', label: 'Library', icon: '📚' },
];

/* Firestore kv key holding the user's briefing page choices:
   { [pageId]: boolean }. A page is INCLUDED unless explicitly set to
   false, so a brand-new user gets the full briefing until they opt
   pages out in Settings. */
export const BRIEFING_PAGES_KEY = 'daily-briefing:pages';

export function isBriefingPageEnabled(prefs, id) {
  return (prefs || {})[id] !== false;
}

/* Firestore kv key holding the user's master on/off choice for the
   Daily Summary popup. Stored as a plain boolean. The popup is ON
   unless this is explicitly set to false, so existing users keep
   seeing it until they turn it off in Settings. */
export const BRIEFING_ENABLED_KEY = 'daily-briefing:enabled';

export function isBriefingEnabled(value) {
  return value !== false;
}

/* ─── Small date utilities used by a couple providers ───────────── */
function daysToBirthday(birthday) {
  if (!birthday) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthday);
  if (!m) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), Number(m[2]) - 1, Number(m[3]));
  if (next < today) next = new Date(now.getFullYear() + 1, Number(m[2]) - 1, Number(m[3]));
  return Math.round((next - today) / 86400000);
}

function reachOutState(friend) {
  const DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const FREQ_DAYS = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 };
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = startOfDay(new Date());

  let due = null;
  const days = (friend.reach_out_days || []).map((d) => DAY_INDEX[d]).filter((n) => n !== undefined);
  if (days.length) {
    const last = friend.last_contacted ? new Date(friend.last_contacted) : null;
    const start = last && !isNaN(last) ? new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1) : today;
    for (let i = 0; i < 7; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      if (days.includes(d.getDay())) { due = d; break; }
    }
  } else if (friend.last_contacted) {
    const last = new Date(friend.last_contacted);
    if (!isNaN(last)) {
      const interval = FREQ_DAYS[friend.communication_frequency] ?? 7;
      due = new Date(last.getFullYear(), last.getMonth(), last.getDate() + interval);
    }
  }
  if (!due) return 'never';
  const diff = Math.round((due - today) / 86400000);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'due-today';
  return 'upcoming';
}

function friendlyDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly(iso));
  if (!m) return iso || '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/* ─── Public API ─────────────────────────────────────────────────── */

const SHOWN_KEY = 'daily-briefing:lastShown';

/* Set to true ONLY for previewing — forces the Daily Summary to appear
   on every launch. In normal use this stays false so the summary shows
   just once per day (gated by SHOWN_KEY below). */
const FORCE_SHOW = false;

/** True if today's briefing hasn't been shown yet (and a user is in). */
export function shouldShowBriefing() {
  if (!auth?.currentUser?.uid) return false;
  if (FORCE_SHOW) return true;
  try {
    return localStorage.getItem(SHOWN_KEY) !== localDateKey();
  } catch {
    return true;
  }
}

export function markBriefingShown() {
  try {
    localStorage.setItem(SHOWN_KEY, localDateKey());
  } catch { /* private mode — it'll just show again next launch */ }
}

/** A warm, time-of-day greeting for the header. */
export function briefingGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Run every provider in parallel (isolating failures) and return a
 * single priority-sorted item list. Safe to call even when offline —
 * providers that throw simply contribute nothing.
 */
export async function getBriefing() {
  const uid = auth?.currentUser?.uid;
  if (!uid) return [];

  const ctx = {
    today: localDateKey(),
    weekday: todayWeekday(),
    nowMin: minutesOfDay(),
  };

  /* Only run providers for pages the user has left enabled in
     Settings (default: all enabled until explicitly opted out). */
  let prefs = {};
  try {
    prefs = (await getValue(uid, BRIEFING_PAGES_KEY)) || {};
  } catch { /* no prefs yet — treat as all-enabled */ }
  const active = PROVIDERS.filter((p) => isBriefingPageEnabled(prefs, p.id));

  const results = await Promise.allSettled(active.map((p) => p.run(uid, ctx)));
  const items = [];
  results.forEach((r) => {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) items.push(...r.value);
  });

  items.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return (a.sort ?? 9999) - (b.sort ?? 9999);
  });
  return items;
}
